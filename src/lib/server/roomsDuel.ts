// Room duels, server side. The pure reducer (game/room.ts) decides phases, bets
// and payouts; game/duelRoom.ts runs the secret-pick turn loop; this file loads
// the state, applies one transition inside an optimistic transaction and saves
// state + chip deltas + phase move in ONE store call. Errors are RpcError(code)
// so the caller's `guarded` maps them to HTTP like every other room error.
import { balancedHero, canAct, type Duel } from "../game/duel";
import {
  chipDeltas,
  duelMissions,
  decideByHp,
  extractDuelDb,
  newLive,
  replayLive,
  resolveTurn,
  sideOf,
  type DuelLive,
} from "../game/duelRoom";
import type { Character } from "../game/characters";
import type { Action } from "../game/combat";
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
  if ("heroId" in pick && pick.heroId !== DEFAULT_HERO) {
    const { profile } = await d.loadProfile(player);
    if (!profile.characters.some((c) => c.id === pick.heroId)) err("hero_not_owned");
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

/** Resolves every open turn that is ready; reports the duels that ended. */
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
    // several turns can be overdue (absent players): resolve until it waits again
    for (let i = 0; i < 80; i++) {
      const r = resolveTurn(out[m.key], now, s.turnSeconds * 1000, here(st, m));
      if (!r) break;
      out[m.key] = r.live;
      changed = true;
      if (r.over) {
        const w = r.over.winner === null ? null : r.over.winner === "a" ? m.a : m.b;
        st = finish(st, m, w, r.over.end);
        break;
      }
    }
  }
  return { s: st, live: out, changed };
}

/** Lazy clock: called by every snapshot/advance during `duel_fight`. */
export async function duelTick(d: RoomDeps, room: string) {
  await duelTx(d, room, async (s, live) => {
    const t = tickState(s, live, d.now());
    return t.changed ? { s: t.s, live: t.live, value: true } : null;
  });
}

export async function duelMoveService(
  d: RoomDeps,
  player: string,
  room: string,
  key: string,
  action: Action,
) {
  await duelTx(d, room, async (s, live) => {
    if (s.phase !== "duel_fight") return err("wrong_phase");
    const m = s.duels.find((x) => x.key === key);
    const side = m ? sideOf(m, player) : null;
    if (!m || !side) return err("battle_not_found");
    const lv = live[key];
    if (!lv || m.reported || m.status === "settled") return err("wrong_phase");
    if (lv.pending[side] !== undefined) return null; // first pick of the turn stands
    const { duel } = replayLive(lv);
    if (!canAct(duel[side], action)) return err("invalid_args");
    const next = { ...live, [key]: { ...lv, pending: { ...lv.pending, [side]: action } } };
    const t = tickState(s, next, d.now());
    return { s: t.s, live: t.live, value: true };
  });
}

// ---------------------------------------------------------------- phase moves
async function duelHeroOf(
  d: RoomDeps,
  s: RoomState,
  id: string,
  seed: number,
): Promise<Character> {
  const pick = s.players.find((p) => p.id === id)?.duelPick ?? DEFAULT_DUEL_PICK_FOR(s.duelMode);
  if ("classId" in pick) return balancedHero(pick.classId, pick.element);
  const { profile } = await d.loadProfile(id);
  return heroForRound(profile, pick.heroId, "completo", seed, id);
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
          const o = decideByHp(replayLive(live[m.key]).duel);
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
      for (const m of next.duels) {
        if (m.status === "settled") continue;
        const seed = d.randomSeed();
        live[m.key] = newLive(
          seed,
          { a: await duelHeroOf(d, next, m.a, seed), b: await duelHeroOf(d, next, m.b, seed) },
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
  /** Only while the fight is on / after it: public state of the duel. */
  fight: {
    turn: number;
    deadlineMs: number;
    hp: { a: number; b: number };
    maxHp: { a: number; b: number };
    cooldown: { a: number; b: number }; // Ataque 2
    cooldown3: { a: number; b: number }; // class skill
    picked: { a: boolean; b: boolean };
    heroes: { a: Pick<Character, "name" | "classId" | "element" | "skill">; b: Pick<Character, "name" | "classId" | "element" | "skill"> };
    log: string[];
    last: { a: Action | null; b: Action | null } | null; // revealed picks of the last turn
  } | null;
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
): Promise<DuelView | null> {
  if (s.duels.length === 0) return null;
  const row = isDuelPhase(s) ? await d.store.loadDuel(room) : null;
  const live = row?.db.live ?? {};
  const matches = s.duels.map((m): DuelMatchView => {
    const lv = live[m.key];
    let fight: DuelMatchView["fight"] = null;
    if (lv) {
      const du: Duel = replayLive(lv).duel;
      const last = lv.history[lv.history.length - 1];
      const hero = (c: Character) => ({
        name: c.name,
        classId: c.classId,
        element: c.element,
        skill: c.skill,
      });
      fight = {
        turn: du.turn,
        deadlineMs: lv.deadline,
        hp: { a: du.a.hp, b: du.b.hp },
        maxHp: { a: du.a.char.stats.hp, b: du.b.char.stats.hp },
        cooldown: { a: du.a.cooldown, b: du.b.cooldown },
        cooldown3: { a: du.a.cooldown3 ?? 0, b: du.b.cooldown3 ?? 0 },
        picked: { a: lv.pending.a !== undefined, b: lv.pending.b !== undefined },
        heroes: { a: hero(lv.heroes.a), b: hero(lv.heroes.b) },
        log: du.log.slice(-8),
        last: last ? { a: last[0], b: last[1] } : null,
      };
    }
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
