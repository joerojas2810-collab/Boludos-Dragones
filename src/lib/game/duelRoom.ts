// Server-side bookkeeping of room duels (pure): the persisted shape (DuelDb), how
// it overlays a RoomState, chip deltas, and the secret-pick turn loop on top of
// duel.ts. The room reducer (room.ts) owns phases/bets/payouts; this file owns
// what the reducer cannot know: the heroes, the picks and the replay log.
import type { Character } from "./characters";
import type { Action } from "./combat";
import { DUEL_MAX_TURN, duelRound, startDuel, type Duel, type DuelSide } from "./duel";
import { createRng, type Rng } from "./rng";
import {
  ROOM_K,
  settlePool,
  type DuelEnd,
  type DuelMatch,
  type DuelMode,
  type DuelPick,
  type RoomState,
} from "./room";

/** One running duel: everything needed to replay it from the seed. */
export interface DuelLive {
  seed: number;
  heroes: { a: Character; b: Character };
  history: [Action | null, Action | null][]; // resolved rounds (null = no answer)
  pending: { a?: Action; b?: Action }; // secret picks of the open turn
  deadline: number; // ms epoch of the open turn
  missed: { a: number; b: number }; // consecutive turns without an answer
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

/** Rebuilds the duel (and the rng at that point) from the log. */
export function replayLive(live: DuelLive): { duel: Duel; rng: Rng } {
  const rng = createRng(live.seed);
  let duel = startDuel(live.heroes.a, live.heroes.b);
  for (const [pa, pb] of live.history) duel = duelRound(duel, pa, pb, rng);
  return { duel, rng };
}

export const newLive = (
  seed: number,
  heroes: DuelLive["heroes"],
  now: number,
  turnMs: number,
): DuelLive => ({
  seed,
  heroes,
  history: [],
  pending: {},
  deadline: now + turnMs,
  missed: { a: 0, b: 0 },
});

export interface TurnEnd {
  winner: DuelSide | null;
  end: DuelEnd;
}

/** Higher hp fraction wins; equal = draw. Used when the duel hits the room cap. */
export function decideByHp(d: Duel): TurnEnd {
  const fa = d.a.hp / d.a.char.stats.hp;
  const fb = d.b.hp / d.b.char.stats.hp;
  return { winner: fa === fb ? null : fa > fb ? "a" : "b", end: fa === fb ? "draw" : "time" };
}

/**
 * Resolves the open turn when both sides answered or time is up; an absent
 * player never holds the turn. A side with `missedTurnsToFlee` unanswered turns
 * in a row forfeits. Returns null while the turn is still waiting.
 */
export function resolveTurn(
  live: DuelLive,
  now: number,
  turnMs: number,
  here: { a: boolean; b: boolean },
): { live: DuelLive; duel: Duel; over: TurnEnd | null } | null {
  const ready = (x: DuelSide) => live.pending[x] !== undefined || !here[x];
  if (!(ready("a") && ready("b")) && now < live.deadline) return null;
  const { duel: before, rng } = replayLive(live);
  if (before.status !== "ongoing") return null;
  const pa = live.pending.a ?? null;
  const pb = live.pending.b ?? null;
  const duel = duelRound(before, pa, pb, rng);
  const missed = {
    a: pa === null ? live.missed.a + 1 : 0,
    b: pb === null ? live.missed.b + 1 : 0,
  };
  const next: DuelLive = {
    ...live,
    history: [...live.history, [pa, pb]],
    pending: {},
    deadline: now + turnMs,
    missed,
  };
  let over: TurnEnd | null = null;
  if (duel.status !== "ongoing")
    over = {
      winner: duel.status === "draw" ? null : duel.status,
      end: duel.status === "draw" ? "draw" : duel.turn > DUEL_MAX_TURN ? "time" : "ko",
    };
  else {
    const fa = missed.a >= ROOM_K.missedTurnsToFlee;
    const fb = missed.b >= ROOM_K.missedTurnsToFlee;
    if (fa || fb)
      over = { winner: fa && fb ? null : fa ? "b" : "a", end: fa && fb ? "draw" : "forfeit" };
  }
  return { live: next, duel, over };
}
