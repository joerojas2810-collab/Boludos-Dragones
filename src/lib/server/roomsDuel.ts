// Room duels, server side. The pure reducer (game/room.ts) decides phases, bets
// and payouts; game/duelRoom.ts runs the alternating-turn loop on the shared engine
// (the server replays every action: authoritative); this file loads
// the state, applies one transition inside an optimistic transaction and saves
// state + chip deltas + phase move in ONE store call. Errors are RpcError(code)
// so the caller's `guarded` maps them to HTTP like every other room error.
import { sideToMove } from "../game/duel";
import { niveladoHero } from "../game/niveladoHero";
import {
  applyMove,
  chipDeltas,
  duelMissions,
  decideByHp,
  extractDuelDb,
  liveIsStale,
  newLive,
  replayLive,
  resolveTurn,
  sideOf,
  type DuelLive,
  type TurnResult,
} from "../game/duelRoom";
import type { Character } from "../game/characters";
import { projectTurns, TURN_CAP, TURN_WARN, type Action, type Combatant } from "../game/combat";
import { heroKey, masteryOf } from "../game/loadout";
import { loadoutError, sanitizeLoadout, type Loadout } from "../game/skills";
import {
  advance as modelAdvance,
  autoPairs,
  chooseDuelPick,
  closeRoom as modelClose,
  DEFAULT_DUEL_PICK_FOR,
  DEFAULT_HERO,
  leaveRoom as modelLeave,
  placeDuelBet,
  reportDuel,
  startDuels,
  visibleBets,
  type BetPrediction,
  type DuelEnd,
  type DuelMatch,
  type DuelMode,
  type DuelPick,
  type RoomState,
} from "../game/room";
import { RpcError } from "./rpc";
import { heroForRound } from "./roomRun";
import type { RoomDeps } from "./roomsStore";

const err = (code: string): never => {
  throw new RpcError(code);
};
export const isDuelPhase = (s: RoomState) => s.phase.startsWith("duel_");

interface Out {
  s: RoomState;
  live?: Record<string, DuelLive>;
}

/**
 * Read -> compute -> save with a version check; retries on a concurrent write.
 * `fn` returns the next state (null = nothing to save) and may keep `live` as is.
 */
async function duelTx<T>(
  d: RoomDeps,
  room: string,
  fn: (s: RoomState, live: Record<string, DuelLive>) => Promise<(Out & { value: T }) | null>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // duel row first: a write between the two reads makes the save conflict (safe)
    const row = await d.store.loadDuel(room);
    const s = await d.store.loadState(room);
    if (!s) return err("room_not_found");
    const live = row?.db.live ?? {};
    const out = await fn(s, live);
    if (!out) return null;
    const next = out.s;
    const phaseMoved = next.phase !== s.phase;
    try {
      await d.store.saveDuel(
        room,
        row?.version ?? 0,
        extractDuelDb(next, out.live ?? live),
        {
          deltas: chipDeltas(s, next),
          missions: duelMissions(s, next),
          phase: phaseMoved
            ? { to: next.phase, expectedSeq: s.phaseSeq, deadlineMs: next.deadline, resetReady: true }
            : undefined,
        },
      );
    } catch (e) {
      if (e instanceof RpcError && e.message === "conflict") continue;
      throw e;
    }
    return out.value;
  }
  return err("conflict");
}

const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> =>
  r.ok ? (r as Extract<T, { ok: true }>) : err((r as unknown as { error: string }).error);

// ------------------------------------------------------------------ lobby side
export async function duelStartService(
  d: RoomDeps,
  host: string,
  room: string,
  mode: DuelMode,
  pairs?: [string, string][],
) {
  await duelTx(d, room, async (s) => {
    const r = must(startDuels(s, host, d.now(), mode, pairs ?? autoPairs(s)));
    return { s: r.state, live: {}, value: true };
  });
}

export async function duelPickService(
  d: RoomDeps,
  player: string,
  room: string,
  pick: DuelPick,
) {
  if ("classId" in pick) {
    // balanced: nivelado rules, all four skills of the class are candidates
    if (pick.loadout && loadoutError(pick.classId, pick.loadout, null)) err("invalid_args");
  } else if (pick.heroId !== DEFAULT_HERO) {
    const { profile } = await d.loadProfile(player);
    const hero = profile.characters.find((c) => c.id === pick.heroId);
    if (!hero) err("hero_not_owned");
    // collection: skills 3 and 4 need the class mastery of this account
    else if (pick.loadout && loadoutError(hero.classId, pick.loadout, masteryOf(profile, hero.classId)))
      err("invalid_args");
  }
  await duelTx(d, room, async (s) => ({
    s: must(chooseDuelPick(s, player, pick)).state,
    value: true,
  }));
}

export async function duelBetService(
  d: RoomDeps,
  player: string,
  room: string,
  key: string,
  prediction: BetPrediction,
  stake: number,
) {
  await duelTx(d, room, async (s) => ({
    s: must(placeDuelBet(s, player, key, prediction, stake)).state,
    value: true,
  }));
}

// ------------------------------------------------------------------ the fight
const here = (s: RoomState, m: DuelMatch) => {
  const ok = (id: string) => {
    const p = s.players.find((x) => x.id === id);
    return !!p && !p.left && p.present;
  };
  return { a: ok(m.a), b: ok(m.b) };
};

/** Applies a finished duel to the room state (winner id or null). */
function finish(s: RoomState, m: DuelMatch, winner: string | null, end: DuelEnd): RoomState {
  // either duelist may file the verdict; one of them can already be gone
  const r = reportDuel(s, m.a, m.key, winner, end);
  return must(r.ok ? r : reportDuel(s, m.b, m.key, winner, end)).state;
}

/** Settles a finished turn result into the room state (winner id or null). */
function report(st: RoomState, m: DuelMatch, r: TurnResult): RoomState {
  const o = r.over;
  if (!o) return st;
  return finish(st, m, o.winner === null ? null : o.winner === "a" ? m.a : m.b, o.end);
}

/**
 * Resolves every overdue/absent turn (Defender fallback) and reports the duels that ended.
 * A duel started on another engine version is voided as "no_fight" (never replayed).
 */
function tickState(
  s: RoomState,
  live: Record<string, DuelLive>,
  now: number,
): { s: RoomState; live: Record<string, DuelLive>; changed: boolean } {
  if (s.phase !== "duel_fight") return { s, live, changed: false };
  let st = s;
  const out = { ...live };
  let changed = false;
  for (const m of s.duels) {
    const lv = out[m.key];
    if (!lv || m.reported || m.status === "settled") continue;
    if (liveIsStale(lv)) {
      st = finish(st, m, null, "no_fight");
      changed = true;
      continue;
    }
    // several turns can be overdue (absent players): resolve until it waits again
    for (let i = 0; i < 12; i++) {
      const r = resolveTurn(out[m.key], now, s.turnSeconds * 1000, here(st, m));
      if (!r) break;
      out[m.key] = r.live;
      changed = true;
      if (r.over) {
        st = report(st, m, r);
        break;
      }
    }
  }
  return { s: st, live: out, changed };
}

/** Cheap check on data the caller already loaded: is a turn ready or overdue? */
export function duelNeedsTick(
  s: RoomState,
  live: Record<string, DuelLive>,
  now: number,
): boolean {
  return tickState(s, live, now).changed;
}

/** Lazy clock: resolves ready/overdue turns during `duel_fight`. True if it wrote. */
export async function duelTick(d: RoomDeps, room: string): Promise<boolean> {
  const r = await duelTx(d, room, async (s, live) => {
    const t = tickState(s, live, d.now());
    return t.changed ? { s: t.s, live: t.live, value: true } : null;
  });
  return r === true;
}

/**
 * The acting duelist's decision. `n` (optional) = decisions the client had seen: a stale click
 * (the turn already moved on, e.g. after a timeout fallback) is a harmless no-op.
 */
export async function duelMoveService(
  d: RoomDeps,
  player: string,
  room: string,
  key: string,
  action: Action,
  n?: number,
) {
  await duelTx(d, room, async (s, live) => {
    if (s.phase !== "duel_fight") return err("wrong_phase");
    const m = s.duels.find((x) => x.key === key);
    const side = m ? sideOf(m, player) : null;
    if (!m || !side) return err("battle_not_found");
    const lv = live[key];
    if (!lv || m.reported || m.status === "settled") return err("wrong_phase");
    if (liveIsStale(lv)) return err("engine_outdated");
    if (n !== undefined && n !== lv.history.length) return null;
    const r = applyMove(lv, side, action, d.now(), s.turnSeconds * 1000);
    if (r === "not_turn") return null;
    if (r === "illegal") return err("invalid_args");
    const next = { ...live, [key]: r.live };
    const st = report(s, m, r);
    const t = tickState(st, next, d.now());
    return { s: t.s, live: t.live, value: true };
  });
}

// ---------------------------------------------------------------- phase moves
/**
 * The duelist as the fight log names them (the player, not the class) plus the two skills they
 * take in. Balanced: all four skills are candidates; collection: mastery of the account decides.
 */
async function duelFighterOf(
  d: RoomDeps,
  s: RoomState,
  id: string,
  seed: number,
  names: Record<string, string>,
): Promise<{ hero: Character; loadout: Loadout }> {
  const pick = s.players.find((p) => p.id === id)?.duelPick ?? DEFAULT_DUEL_PICK_FOR(s.duelMode);
  if ("classId" in pick) {
    const hero = niveladoHero(pick.classId, pick.element);
    return {
      hero: { ...hero, name: names[id] ?? hero.name },
      loadout: sanitizeLoadout(pick.classId, pick.loadout, null),
    };
  }
  const { profile } = await d.loadProfile(id);
  const hero = heroForRound(profile, pick.heroId, "completo", seed, id);
  const named = { ...hero, name: names[id] ?? hero.name };
  if (pick.heroId === DEFAULT_HERO) // a seeded Común: it has no saved skills, only the unlocked ones
    return { hero: named, loadout: sanitizeLoadout(hero.classId, pick.loadout, 0) };
  return {
    hero: named,
    loadout: sanitizeLoadout(
      hero.classId,
      pick.loadout ?? profile.loadouts?.[heroKey(hero)],
      masteryOf(profile, hero.classId),
    ),
  };
}

export type DuelAdvance = { advanced: boolean; reason?: string };

/** Phase advance for the duel phases (the generic path only knows floor phases). */
export async function duelAdvanceService(
  d: RoomDeps,
  room: string,
  phaseSeq: number,
): Promise<DuelAdvance> {
  let res: DuelAdvance = { advanced: false, reason: "not_due" };
  await duelTx(d, room, async (s0, live0) => {
    const now = d.now();
    if (s0.phaseSeq !== phaseSeq) {
      res = { advanced: false, reason: "stale" };
      return null;
    }
    let s = s0;
    let live = live0;
    if (s.phase === "duel_fight") {
      const t = tickState(s, live, now);
      s = t.s;
      live = t.live;
      // the cap: whoever has more hp left wins, the rest is a draw
      if (now >= s.deadline)
        for (const m of s.duels) {
          if (m.reported || m.status === "settled" || !live[m.key]) continue;
          const o = liveIsStale(live[m.key])
            ? { winner: null, end: "no_fight" as const }
            : decideByHp(replayLive(live[m.key]).battle);
          s = finish(s, m, o.winner === null ? null : o.winner === "a" ? m.a : m.b, o.end);
        }
    }
    const a = modelAdvance(s, now, phaseSeq);
    if (!a.ok) return err(a.error);
    if (!a.advanced) {
      res = { advanced: false, reason: a.reason };
      return s !== s0 || live !== live0 ? { s, live, value: true } : null;
    }
    const next = a.state;
    if (next.phase === "duel_fight") {
      live = { ...live };
      const { names } = await d.store.loadMeta(room);
      for (const m of next.duels) {
        if (m.status === "settled") continue;
        const seed = d.randomSeed();
        const fa = await duelFighterOf(d, next, m.a, seed, names);
        const fb = await duelFighterOf(d, next, m.b, seed, names);
        live[m.key] = newLive(
          seed,
          { a: fa.hero, b: fb.hero },
          { a: fa.loadout, b: fb.loadout },
          now,
          next.turnSeconds * 1000,
        );
      }
    }
    res = { advanced: true };
    return { s: next, live, value: true };
  });
  return res;
}

// -------------------------------------------------- leave / kick / close hooks
/** Run BEFORE the SQL leave/kick/close: settles the duel side of the departure. */
export async function duelOnDeparture(
  d: RoomDeps,
  room: string,
  who: string,
  kind: "leave" | "close",
) {
  await duelTx(d, room, async (s) => {
    if (!isDuelPhase(s) || s.duels.length === 0) return null;
    const r =
      kind === "close" ? must(modelClose(s, who, d.now())) : must(modelLeave(s, who, d.now()));
    // phase/host moves belong to the SQL call that follows
    return {
      s: { ...r.state, phase: s.phase, phaseSeq: s.phaseSeq, deadline: s.deadline, hostId: s.hostId },
      value: true,
    };
  });
}

// ---------------------------------------------------------------------- view
export interface DuelMatchView {
  key: string;
  a: string;
  b: string;
  reported: boolean;
  status: DuelMatch["status"];
  winner: string | null;
  end: DuelEnd | null;
  outcome: DuelMatch["outcome"];
  bets: { bettor: string; prediction: BetPrediction; stake: number }[];
  /** Only while the fight is on / after it. Everything is public: there are no secret picks. */
  fight: DuelFight | null;
}
type Hero = Pick<Character, "name" | "classId" | "element">;
type Pair<T> = { a: T; b: T };
/** Public state of a duel, replayed from the action log (engine `Battle`, side a = player). */
export interface DuelFight {
  n: number; // decisions resolved (clients echo it with a move to ignore stale clicks)
  turn: number; // turns resolved by both sides; capped at `turnCap`
  turnCap: number;
  warn: boolean; // close to the cap
  toMove: "a" | "b" | null;
  deadlineMs: number;
  hp: Pair<number>;
  maxHp: Pair<number>;
  shield: Pair<number>;
  res: Pair<number>; // class resource 0..3
  cds: Pair<Record<string, number>>;
  loadouts: Pair<[string, string]>;
  progress: Pair<number>;
  defending: Pair<boolean>;
  statuses: Pair<{ id: string; stacks: number }[]>;
  queue: { side: "a" | "b"; certain: boolean }[]; // next turns (projection, only the first is certain)
  heroes: Pair<Hero>;
  log: string[];
  last: { side: "a" | "b"; action: Action; auto: boolean } | null;
  events: { seq: number; type: string; actor: "a" | "b" | null; target?: "a" | "b" | null; skillId?: string; value?: number; detail?: string }[];
}
export interface DuelView {
  mode: DuelMode;
  round: number;
  picked: string[];
  matches: DuelMatchView[];
}

export async function duelViewOf(
  d: RoomDeps,
  s: RoomState,
  room: string,
  viewer: string,
  row?: { db: { live: Record<string, DuelLive> } } | null,
): Promise<DuelView | null> {
  if (s.duels.length === 0) return null;
  const loaded = row !== undefined ? row : isDuelPhase(s) ? await d.store.loadDuel(room) : null;
  const live = loaded?.db.live ?? {};
  const matches = s.duels.map((m): DuelMatchView => {
    const lv = live[m.key];
    const fight = lv && !liveIsStale(lv) ? fightOf(lv) : null;
    return {
      key: m.key,
      a: m.a,
      b: m.b,
      reported: m.reported,
      status: m.status,
      winner: m.winner,
      end: m.end,
      outcome: m.outcome,
      bets: visibleBets(
        s.phase === "duel_reveal" ? "reveal" : s.phase,
        { bets: m.bets, fighter: "", status: m.status },
        viewer,
      ),
      fight,
    };
  });
  return {
    mode: s.duelMode,
    round: s.duelRound,
    picked: s.players.filter((p) => p.duelPick !== null).map((p) => p.id),
    matches,
  };
}

const sideId = (id: number | undefined): "a" | "b" | null => (id === 0 ? "a" : id === 1 ? "b" : null);

function fightOf(lv: DuelLive): DuelFight {
  const { battle: bt } = replayLive(lv);
  const [pa, pb] = [bt.player, bt.enemies[0]];
  const both = <T,>(f: (c: Combatant) => T): Pair<T> => ({ a: f(pa), b: f(pb) });
  const hero = (c: Combatant): Hero => ({ name: c.char.name, classId: c.char.classId, element: c.char.element });
  const last = lv.history[lv.history.length - 1];
  return {
    n: lv.history.length,
    turn: Math.min(bt.turn, TURN_CAP),
    turnCap: TURN_CAP,
    warn: bt.turn >= TURN_WARN,
    toMove: sideToMove(bt),
    deadlineMs: lv.deadline,
    hp: both((c) => Math.max(0, Math.round(c.hp))),
    maxHp: both((c) => c.char.stats.hp),
    shield: both((c) => Math.max(0, Math.round(c.shield ?? 0))),
    res: both((c) => c.res ?? 0),
    cds: both((c) => Object.fromEntries(Object.entries(c.cds ?? {}).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>),
    loadouts: both((c) => [...(c.loadout ?? [])] as [string, string]),
    progress: both((c) => Math.round(c.progress)),
    defending: both((c) => c.defending),
    statuses: both((c) => (c.statuses ?? []).map((x) => ({ id: x.id, stacks: x.stacks }))),
    queue: projectTurns(bt, 6).flatMap((t) => {
      const side = sideId(t.id);
      return side ? [{ side, certain: t.certain }] : [];
    }),
    heroes: both(hero),
    log: bt.log.slice(-8),
    last: last
      ? { side: last.side, action: last.act, auto: !!last.auto }
      : null,
    events: bt.cev.slice(-30).map((e) => ({
      seq: e.seq,
      type: e.type,
      actor: sideId(e.actor),
      target: sideId(e.target),
      skillId: e.skillId,
      value: e.value,
      detail: e.detail,
    })),
  };
}
