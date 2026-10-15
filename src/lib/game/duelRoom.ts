// Server-side bookkeeping of room duels (pure): the persisted shape (DuelDb), how
// it overlays a RoomState, chip deltas, and the alternating-turn loop on top of
// duel.ts (shared engine). The room reducer (room.ts) owns phases/bets/payouts; this
// file owns what the reducer cannot know: heroes, loadouts and the action log.
import type { Character } from "./characters";
import { actionError, step, type Action, type Battle } from "./combat";
import {
  duelStatus,
  FALLBACK_ACTION,
  replayDuel,
  sanitize,
  sideToMove,
  type DuelSetup,
  type DuelSide,
} from "./duel";
import type { Rng } from "./rng";
import type { Loadout } from "./skills";
import { ENGINE_VERSION } from "./stage";
import {
  ROOM_K,
  settlePool,
  type DuelEnd,
  type DuelMatch,
  type DuelMode,
  type DuelPick,
  type RoomState,
} from "./room";

/** One resolved decision: the side is whoever was awaiting; `auto` = timeout/absence fallback. */
export interface DuelMove {
  side: DuelSide;
  act: Action;
  auto?: true;
}

/**
 * One running duel: everything needed to replay it from the seed. Progress, resource,
 * cooldowns and the rest of the battle state are derived by replaying `history` with the
 * engine of version `v`; a stale `v` is never replayed (rejected, see `liveIsStale`).
 */
export interface DuelLive {
  v: number; // ENGINE_VERSION at creation
  seed: number;
  heroes: { a: Character; b: Character };
  loadouts: { a: Loadout; b: Loadout };
  history: DuelMove[]; // resolved decisions, in order
  deadline: number; // ms epoch of the open turn (30 s per decision)
  missed: { a: number; b: number }; // consecutive own turns without an answer
}

/** What `room_duel.state` holds. */
export interface DuelDb {
  duels: DuelMatch[];
  mode: DuelMode;
  round: number;
  from: "lobby" | "round_end";
  picks: Record<string, DuelPick>;
  wins: Record<string, number>;
  live: Record<string, DuelLive>;
}


/** RoomState as the room reducer sees it, with the duel part filled in. */
export function overlayDuel(s: RoomState, db: DuelDb | null): RoomState {
  if (!db) return s;
  return {
    ...s,
    duels: db.duels,
    duelMode: db.mode,
    duelRound: db.round,
    duelFrom: db.from,
    players: s.players.map((p) => ({
      ...p,
      duelPick: db.picks[p.id] ?? null,
      duelWins: db.wins[p.id] ?? 0,
    })),
  };
}

export function extractDuelDb(
  s: RoomState,
  live: Record<string, DuelLive>,
): DuelDb {
  const picks: Record<string, DuelPick> = {};
  const wins: Record<string, number> = {};
  for (const p of s.players) {
    if (p.duelPick) picks[p.id] = p.duelPick;
    if (p.duelWins) wins[p.id] = p.duelWins;
  }
  const keys = new Set(s.duels.map((m) => m.key));
  return {
    duels: s.duels,
    mode: s.duelMode,
    round: s.duelRound,
    from: s.duelFrom,
    picks,
    wins,
    // logs of past duel rounds are dropped once a new round replaces the matches
    live: Object.fromEntries(Object.entries(live).filter(([k]) => keys.has(k))),
  };
}

/** Chip moves between two states of the same room (stakes, payouts, prizes, refunds). */
export function chipDeltas(
  prev: RoomState,
  next: RoomState,
): { player: string; delta: number; reason: "duel_stake" | "duel_payout" }[] {
  const out: { player: string; delta: number; reason: "duel_stake" | "duel_payout" }[] = [];
  for (const p of next.players) {
    const before = prev.players.find((q) => q.id === p.id)?.chips ?? p.chips;
    const delta = p.chips - before;
    if (delta !== 0)
      out.push({ player: p.id, delta, reason: delta < 0 ? "duel_stake" : "duel_payout" });
  }
  return out;
}

/** Mission progress earned by the duels that settled between two states. */
export function duelMissions(
  prev: RoomState,
  next: RoomState,
): { player: string; key: "duel_win" | "bet_win" }[] {
  const was = new Set(prev.duels.filter((m) => m.status === "settled").map((m) => m.key));
  const out: { player: string; key: "duel_win" | "bet_win" }[] = [];
  for (const m of next.duels) {
    if (m.status !== "settled" || was.has(m.key)) continue;
    if (m.winner) out.push({ player: m.winner, key: "duel_win" });
    if (m.outcome)
      for (const po of settlePool(m.bets, m.outcome).payouts)
        if (po.payout > po.stake) out.push({ player: po.bettor, key: "bet_win" });
  }
  return out;
}

// ------------------------------------------------------------ turn loop
export const sideOf = (m: DuelMatch, id: string): DuelSide | null =>
  m.a === id ? "a" : m.b === id ? "b" : null;

export const liveIsStale = (live: DuelLive): boolean => live.v !== ENGINE_VERSION;

const setupOf = (live: DuelLive): DuelSetup => ({
  seed: live.seed,
  heroes: live.heroes,
  loadouts: live.loadouts,
});

/** Rebuilds the battle (and the rng at that point) from the log. Throws on a stale engine. */
export function replayLive(live: DuelLive): { battle: Battle; rng: Rng } {
  if (liveIsStale(live)) throw new Error("engine_outdated");
  return replayDuel(setupOf(live), live.history.map((m) => m.act));
}

export const newLive = (
  seed: number,
  heroes: DuelLive["heroes"],
  loadouts: DuelLive["loadouts"],
  now: number,
  turnMs: number,
): DuelLive => ({
  v: ENGINE_VERSION,
  seed,
  heroes,
  loadouts,
  history: [],
  deadline: now + turnMs,
  missed: { a: 0, b: 0 },
});

export interface TurnEnd {
  winner: DuelSide | null;
  end: DuelEnd;
}

/** Higher hp fraction wins; equal = draw. Used when the duel hits the cap (turn cap or room clock). */
export function decideByHp(b: Battle): TurnEnd {
  const fa = Math.max(0, b.player.hp) / b.player.char.stats.hp;
  const fb = Math.max(0, b.enemies[0].hp) / b.enemies[0].char.stats.hp;
  return { winner: fa === fb ? null : fa > fb ? "a" : "b", end: fa === fb ? "draw" : "time" };
}

/** Verdict of a battle that is not ongoing, or of a side that fled (2 missed turns in a row). */
function verdict(b: Battle, missed: { a: number; b: number }): TurnEnd | null {
  const st = duelStatus(b);
  if (st === "a" || st === "b") return { winner: st, end: "ko" };
  if (st === "draw")
    return b.player.hp <= 0 && b.enemies[0].hp <= 0 ? { winner: null, end: "draw" } : decideByHp(b);
  const fa = missed.a >= ROOM_K.missedTurnsToFlee;
  const fb = missed.b >= ROOM_K.missedTurnsToFlee;
  if (fa || fb) return { winner: fa && fb ? null : fa ? "b" : "a", end: fa && fb ? "draw" : "forfeit" };
  return null;
}

export interface TurnResult {
  live: DuelLive;
  battle: Battle;
  over: TurnEnd | null;
}

/**
 * Plays one decision for the side to move: `act` when legal, otherwise the Defender fallback
 * (timeout, absence or an illegal action). A real answer clears that side's missed counter;
 * a fallback adds one. Opens the next 30 s turn.
 */
function play(
  live: DuelLive,
  { battle, rng }: { battle: Battle; rng: Rng },
  act: Action | null,
  now: number,
  turnMs: number,
): TurnResult {
  const side = sideToMove(battle)!;
  const legal = act !== null && sanitize(battle, act) === act;
  const move: DuelMove = legal ? { side, act } : { side, act: FALLBACK_ACTION, auto: true };
  const after = step(battle, move.act, rng);
  const missed = { ...live.missed, [side]: legal ? 0 : live.missed[side] + 1 };
  const next: DuelLive = {
    ...live,
    history: [...live.history, move],
    deadline: now + turnMs,
    missed,
  };
  return { live: next, battle: after, over: verdict(after, missed) };
}

/** A real answer from `side`; "not_turn" / "illegal" leave the duel untouched. */
export function applyMove(
  live: DuelLive,
  side: DuelSide,
  act: Action,
  now: number,
  turnMs: number,
): TurnResult | "not_turn" | "illegal" {
  const rep = replayLive(live);
  if (sideToMove(rep.battle) !== side) return "not_turn";
  if (actionError(rep.battle, act) !== null) return "illegal";
  return play(live, rep, act, now, turnMs);
}

/**
 * Timeout/absence: when the side to move is absent or the 30 s are up, Defender is played for
 * them (same validation as any move) and the turn passes. Null while the turn still waits.
 */
export function resolveTurn(
  live: DuelLive,
  now: number,
  turnMs: number,
  here: { a: boolean; b: boolean },
): TurnResult | null {
  const rep = replayLive(live);
  const side = sideToMove(rep.battle);
  if (!side || (here[side] && now < live.deadline)) return null;
  return play(live, rep, null, now, turnMs);
}
