// Room state machine (pure). No React, no Supabase, no randomness: the server
// supplies seeds and clocks. SQL (0005_rooms_flow.sql) enforces the same
// transition graph and the same chip rules; this module is the reference model
// and what FakeRoomStore / the API use to decide the NEXT state.
// `[K]` constants live here so one night of play can retune everything.

import { isDungeonRank } from "./dungeons";
import type { RarityId } from "./rarity";

export const ROOM_K = {
  floorsPerRound: 10,
  maxRounds: 5,
  coopMinRound: 4, // host sees "Jefe final" after this round
  bossEvery: 5,
  roundOffsetPerRound: 3, // [K] difficulty offset: 3 * (round - 1)
  lives: 3,
  maxPlayers: 7,
  minPlayersToStart: 2,
  initialChips: 100,
  minBet: 10,
  interfereCost: 30,
  interfereComp: 15, // paid to the target when it wins anyway
  catchUpDiscount: 10, // [K] interfere is this much cheaper for the player last in chips
  catchUpMinGap: 50, // [K] ...only if they trail the leader by at least this many chips
  catchUpMinPlayers: 3, // [K] ...and at least this many players are in the room
  maxAwardsPerPlayer: 2, // [K] night awards: cap per player (2-player rooms still get a few)
  roundCapMs: 25 * 60_000,
  nightCapMs: 135 * 60_000,
  setupMs: 30_000,
  introMs: 3_000,
  doorsMs: 15_000,
  bettingMs: 15_000,
  fightCapMs: 90_000,
  bossExtraMs: 30_000,
  revealMs: 10_000,
  voteFloors: [3, 7], // [K] floors (non-boss) that end with a shared-risk vote
  voteExtraMs: 8_000, // [K] extra reveal time on a vote floor
  voteShowMs: 3_000, // [K] result stays visible this long before the floor ends
  voteChips: 25, // [K] chips per present player at stake (before player scaling)
  voteScalePerMissing: 0.1, // [K] +10% per missing player below maxPlayers (2 players = x1.5)
  roundEndMs: 180_000,
  coopMs: 300_000,
  absentAfterMs: 10_000,
  hostTransferAfterMs: 60_000,
  missedTurnsToFlee: 2,
} as const;

/** Coop final boss is phase 2: keep false until the engine supports it. */
export const COOP_BOSS_ENABLED = false;

export const PHASES = [
  "lobby",
  "round_setup",
  "floor_intro",
  "doors",
  "betting",
  "fighting",
  "reveal",
  "round_end",
  "coop_boss",
  "night_summary",
  "closed",
] as const;
export type Phase = (typeof PHASES)[number];

export type RoomMode = "nivelado" | "completo";
export type DoorKind =
  "easy" | "hard" | "boss" | "chest" | "merchant" | "rest" | "event";
export const FIGHT_DOORS: readonly DoorKind[] = ["easy", "hard", "boss"];
export const isFightDoor = (d: DoorKind | null) =>
  d !== null && FIGHT_DOORS.includes(d);
export type FightOutcome = "won" | "lost" | "fled" | "timeout";
export type BetPrediction = "win" | "lose";
export type BetOutcome = "win" | "lose" | "void";
export type VoidReason = "fled" | "no_fight" | "room_closed";
export type InterfereKind = "stronger_enemy" | "adverse_element";
/** hero id meaning "server picks a random Común from the round seed". */
export const DEFAULT_HERO = "seed_default";

export interface Bet {
  bettor: string;
  prediction: BetPrediction;
  stake: number;
}
export interface Interference {
  from: string;
  kind: InterfereKind;
  cost: number;
}
export interface Battle {
  key: string;
  fighter: string;
  bets: Bet[];
  interference: Interference | null;
  status: "open" | "locked" | "settled";
  outcome: BetOutcome | null;
  voidReason: VoidReason | null;
}
export interface RoomPlayer {
  id: string;
  joinedAt: number;
  left: boolean;
  present: boolean;
  absentSince: number | null;
  chips: number;
  lives: number;
  eliminated: boolean;
  heroId: string | null;
  ready: boolean;
  activeFromFloor: number; // 0 = whole round; late joiners play from here
  roundMaxFloor: number;
  nightMaxFloor: number; // effective floor (with round offset), wins only
  door: DoorKind | null;
  outcome: FightOutcome | "skipped" | null;
  missedTurns: number;
}
/** Chip accounting: sum(chips)+open stakes = issued - interfereSpent + comp - dust. */
export interface ChipTotals {
  issued: number;
  interfereSpent: number;
  comp: number;
  dust: number;
}
export interface RoomState {
  phase: Phase;
  phaseSeq: number;
  round: number;
  floor: number;
  deadline: number; // ms epoch; 0 = no deadline
  mode: RoomMode;
  rank: RarityId; // dungeon rank of the night: enemy difficulty only (see run.ts depthOf)
  turnSeconds: number;
  hostId: string;
  players: RoomPlayer[];
  battles: Record<string, Battle>; // by fighter id, current floor
  roundSeed: number | null;
  roundStartedAt: number;
  nightStartedAt: number;
  totals: ChipTotals;
}

export type RoomError =
  | "wrong_phase"
  | "forbidden"
  | "not_member"
  | "room_full"
  | "room_closed"
  | "not_enough_players"
  | "invalid_args"
  | "door_locked"
  | "not_active"
  | "battle_not_found"
  | "self_bet"
  | "self_interfere"
  | "stake_too_low"
  | "insufficient_chips"
  | "duplicate_bet"
  | "already_interfered"
  | "seed_required"
  | "coop_disabled"
  | "max_rounds";

export type Effect =
  | { type: "phase"; phase: Phase; phaseSeq: number; deadline: number }
  | { type: "battles_opened"; keys: string[] }
  | { type: "battles_locked"; keys: string[] }
  | {
      type: "battle_settled";
      key: string;
      outcome: BetOutcome;
      voidReason: VoidReason | null;
    }
  | { type: "host_changed"; hostId: string };

export type Result =
  | {
      ok: true;
      state: RoomState;
      effects: Effect[];
      advanced?: boolean;
      reason?: string;
    }
  | { ok: false; error: RoomError };

// ------------------------------------------------------------------ helpers
const clone = (s: RoomState): RoomState => structuredClone(s);
const fail = (error: RoomError): Result => ({ ok: false, error });
const done = (state: RoomState, effects: Effect[] = []): Result => ({
  ok: true,
  state,
  effects,
});

export const hasVote = (floor: number) =>
  (ROOM_K.voteFloors as readonly number[]).includes(floor) &&
  !isBossFloor(floor);
/** Reveal length: longer on vote floors so everybody can tap. */
export const revealMsFor = (floor: number) =>
  ROOM_K.revealMs + (hasVote(floor) ? ROOM_K.voteExtraMs : 0);

export const isBossFloor = (floor: number) =>
  floor > 0 && floor % ROOM_K.bossEvery === 0;
export const difficultyOffset = (round: number) =>
  ROOM_K.roundOffsetPerRound * Math.max(0, round - 1);
export const effectiveFloor = (round: number, floor: number) =>
  floor + difficultyOffset(round);
export const battleKey = (round: number, floor: number, fighter: string) =>
  `r${round}f${floor}:${fighter}`;

export const FLOOR_PHASES: readonly Phase[] = [
  "floor_intro",
  "doors",
  "betting",
  "fighting",
  "reveal",
];

const byId = (s: RoomState, id: string) => s.players.find((p) => p.id === id);
const member = (s: RoomState, id: string) => {
  const p = byId(s, id);
  return p && !p.left ? p : undefined;
};
/** Plays this floor: member, alive in the round, not a late joiner for this floor. */
export const isActive = (s: RoomState, p: RoomPlayer) =>
  !p.left && !p.eliminated && s.floor >= p.activeFromFloor;
export const canPlay = (s: RoomState, p: RoomPlayer) =>
  isActive(s, p) && p.present;
const members = (s: RoomState) => s.players.filter((p) => !p.left);
const presentMembers = (s: RoomState) => members(s).filter((p) => p.present);
const fighters = (s: RoomState) =>
  s.players.filter((p) => p.outcome !== "skipped" && s.battles[p.id]);

const FLOOR_PLAY: readonly Phase[] = ["round_setup", "lobby", "round_end"];

// ----------------------------------------------------- permission matrix
export type Action =
  | "set_mode"
  | "set_rank"
  | "set_turn_seconds"
  | "start_round"
  | "kick"
  | "transfer_host"
  | "close"
  | "end_night"
  | "start_coop"
  | "choose_hero"
  | "ready"
  | "choose_door"
  | "bet"
  | "interfere"
  | "report_outcome";
type Role = "host" | "member" | "active" | "fighter";
const PERMS: Record<Action, { phases: readonly Phase[]; role: Role }> = {
  set_mode: { phases: ["lobby"], role: "host" },
  set_rank: { phases: ["lobby"], role: "host" },
  set_turn_seconds: { phases: ["lobby", "round_end"], role: "host" },
  start_round: { phases: ["lobby", "round_end"], role: "host" },
  kick: { phases: PHASES.filter((p) => p !== "closed"), role: "host" },
  transfer_host: { phases: PHASES.filter((p) => p !== "closed"), role: "host" },
  close: { phases: PHASES.filter((p) => p !== "closed"), role: "host" },
  end_night: { phases: ["round_end"], role: "host" },
  start_coop: { phases: ["round_end"], role: "host" },
  choose_hero: { phases: FLOOR_PLAY, role: "member" },
  ready: { phases: ["round_setup", "betting", "round_end"], role: "member" },
  choose_door: { phases: ["doors"], role: "active" },
  bet: { phases: ["betting"], role: "member" },
  interfere: { phases: ["betting"], role: "member" },
  report_outcome: { phases: ["fighting"], role: "fighter" },
};

/** Table-driven guard: who may do what, per phase. Eliminated players stay "member". */
export function can(s: RoomState, id: string, action: Action): boolean {
  const rule = PERMS[action];
  if (!rule.phases.includes(s.phase)) return false;
  const p = member(s, id);
  if (!p) return false;
  switch (rule.role) {
    case "host":
      return s.hostId === id;
    case "member":
      return true;
    case "active":
      return canPlay(s, p);
    case "fighter":
      return !!s.battles[id] && p.outcome === null;
  }
}
function guard(s: RoomState, id: string, action: Action): Result | null {
  if (s.phase === "closed") return fail("room_closed");
  if (!member(s, id)) return fail("not_member");
  if (!PERMS[action].phases.includes(s.phase)) return fail("wrong_phase");
  return can(s, id, action)
    ? null
    : fail(PERMS[action].role === "host" ? "forbidden" : "not_active");
}

// ------------------------------------------------------------- construction
function newPlayer(id: string, now: number, s?: RoomState): RoomPlayer {
  const inFloor = !!s && FLOOR_PHASES.includes(s.phase);
  return {
    id,
    joinedAt: now,
    left: false,
    present: true,
    absentSince: null,
    chips: ROOM_K.initialChips,
    lives: ROOM_K.lives,
    eliminated: false,
    heroId: null,
    ready: false,
    activeFromFloor: inFloor && s ? s.floor + 1 : 0,
    roundMaxFloor: 0,
    nightMaxFloor: 0,
    door: null,
    outcome: null,
    missedTurns: 0,
  };
}

export function createRoomState(
  hostId: string,
  now: number,
  opts: { mode?: RoomMode; rank?: RarityId; turnSeconds?: number } = {},
): RoomState {
  return {
    phase: "lobby",
    phaseSeq: 0,
    round: 0,
    floor: 0,
    deadline: 0,
    mode: opts.mode ?? "nivelado",
    rank: opts.rank ?? "f",
    turnSeconds: opts.turnSeconds ?? 30,
    hostId,
    players: [newPlayer(hostId, now)],
    battles: {},
    roundSeed: null,
    roundStartedAt: 0,
    nightStartedAt: 0,
    totals: {
      issued: ROOM_K.initialChips,
      interfereSpent: 0,
      comp: 0,
      dust: 0,
    },
  };
}

// -------------------------------------------------------- chips: pure helpers
export interface Payout {
  bettor: string;
  stake: number;
  payout: number;
}
/**
 * 1:1 pool split. Winners (bets matching `outcome`) get their stake back plus a
 * pro-rata share of the losers' stakes (floor; the remainder is `dust`, out of
 * circulation, same as SQL). `void`, or a side without bets, refunds everyone.
 */
export function settlePool(
  bets: readonly Bet[],
  outcome: BetOutcome,
): { payouts: Payout[]; voided: boolean; dust: number } {
  const sum = (f: (b: Bet) => boolean) =>
    bets.filter(f).reduce((a, b) => a + b.stake, 0);
  const win = outcome === "void" ? 0 : sum((b) => b.prediction === outcome);
  const lose = outcome === "void" ? 0 : sum((b) => b.prediction !== outcome);
  const voided = win === 0 || lose === 0;
  let paid = 0;
  const payouts = bets.map((b) => {
    const payout = voided
      ? b.stake
      : b.prediction === outcome
        ? b.stake + Math.floor((b.stake * lose) / win)
        : 0;
    paid += payout;
    return { bettor: b.bettor, stake: b.stake, payout };
  });
  const total = bets.reduce((a, b) => a + b.stake, 0);
  return { payouts, voided, dust: total - paid };
}

/** Bet rules shared by UI (disable button) and server. Returns an error or null. */
export function validateBet(
  stake: number,
  held: number,
  isSelf: boolean,
): RoomError | null {
  if (isSelf) return "self_bet";
  if (!Number.isInteger(stake) || stake < ROOM_K.minBet) return "stake_too_low";
  if (stake > held) return "insufficient_chips";
  return null;
}

/**
 * Interfere price: cheaper for whoever is last in chips (modest catch-up help).
 * The reducer/fake apply it; the SQL `interfere_cost` is still a flat 30
 * (pending migration, see docs/SALAS.md).
 */
export function interfereCostFor(
  chipsById: Readonly<Record<string, number>>,
  id: string,
): number {
  const all = Object.values(chipsById);
  const mine = chipsById[id];
  if (mine === undefined || all.length < ROOM_K.catchUpMinPlayers)
    return ROOM_K.interfereCost;
  const isLast =
    all.every((c) => c >= mine) && all.filter((c) => c === mine).length === 1;
  const gap = Math.max(...all) - mine;
  return isLast && gap >= ROOM_K.catchUpMinGap
    ? ROOM_K.interfereCost - ROOM_K.catchUpDiscount
    : ROOM_K.interfereCost;
}

/** Interference side effects on settlement. */
export function interferenceSettlement(
  outcome: BetOutcome,
  reason: VoidReason | null,
  cost: number = ROOM_K.interfereCost,
): { compToTarget: number; refundToSource: number } {
  if (outcome === "win")
    return { compToTarget: ROOM_K.interfereComp, refundToSource: 0 };
  const refundable = outcome === "void" && reason !== "fled" && reason !== null;
  return {
    compToTarget: 0,
    refundToSource: refundable ? cost : 0,
  };
}

/** Outcome of a fight -> bet outcome (timeout counts as lose; fled/skipped void). */
export function toBetOutcome(o: FightOutcome | "skipped"): {
  outcome: BetOutcome;
  reason: VoidReason | null;
} {
  switch (o) {
    case "won":
      return { outcome: "win", reason: null };
    case "lost":
    case "timeout":
      return { outcome: "lose", reason: null };
    case "fled":
      return { outcome: "void", reason: "fled" };
    case "skipped":
      return { outcome: "void", reason: "no_fight" };
  }
}

function settleBattleIn(
  n: RoomState,
  b: Battle,
  outcome: BetOutcome,
  reason: VoidReason | null,
  effects: Effect[],
) {
  if (b.status === "settled") return;
  const { payouts, dust } = settlePool(b.bets, outcome);
  for (const po of payouts) {
    const p = byId(n, po.bettor);
    if (p) p.chips += po.payout;
  }
  n.totals.dust += dust;
  const it = interferenceSettlement(outcome, reason, b.interference?.cost);
  if (b.interference) {
    const target = byId(n, b.fighter);
    if (target && it.compToTarget) {
      target.chips += it.compToTarget;
      n.totals.comp += it.compToTarget;
    }
    const src = byId(n, b.interference.from);
    if (src && it.refundToSource) {
      src.chips += it.refundToSource;
      n.totals.interfereSpent -= it.refundToSource;
    }
  }
  b.status = "settled";
  b.outcome = outcome;
  b.voidReason = outcome === "void" ? (reason ?? "no_fight") : null;
  effects.push({
    type: "battle_settled",
    key: b.key,
    outcome: b.outcome,
    voidReason: b.voidReason,
  });
}

// ------------------------------------------------------------------ ranking
export interface RankRow {
  id: string;
  chips: number;
  maxFloor: number;
  roundMaxFloor: number;
}
const rows = (s: RoomState): RankRow[] =>
  members(s)
    .concat(s.players.filter((p) => p.left))
    .map((p) => ({
      id: p.id,
      chips: p.chips,
      maxFloor: p.nightMaxFloor,
      roundMaxFloor: p.roundMaxFloor,
    }));
const idCmp = (a: RankRow, b: RankRow) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
/** Night ranking: chips desc, tie -> max floor desc, then id (stable). */
export const rankByChips = (s: RoomState) =>
  rows(s).sort(
    (a, b) => b.chips - a.chips || b.maxFloor - a.maxFloor || idCmp(a, b),
  );
/** Floor ranking: max floor desc (round-local when `round` true), tie -> chips. */
export const rankByFloor = (s: RoomState, round = false) =>
  rows(s).sort(
    (a, b) =>
      (round ? b.roundMaxFloor - a.roundMaxFloor : b.maxFloor - a.maxFloor) ||
      b.chips - a.chips ||
      idCmp(a, b),
  );

// ------------------------------------------------------------ simple actions
export function joinRoom(s: RoomState, id: string, now: number): Result {
  if (s.phase === "closed") return fail("room_closed");
  const n = clone(s);
  const p = byId(n, id);
  if (p && !p.left) {
    p.present = true;
    p.absentSince = null;
    return done(n);
  }
  if (members(n).length >= ROOM_K.maxPlayers) return fail("room_full");
  const inFloor = FLOOR_PHASES.includes(n.phase);
  if (p) {
    // reconnect after leaving: chips/eliminated state kept, plays from next floor
    p.left = false;
    p.present = true;
    p.absentSince = null;
    p.activeFromFloor = inFloor ? n.floor + 1 : p.activeFromFloor;
    p.door = null;
    p.outcome = null;
  } else {
    n.players.push(newPlayer(id, now, n));
    n.totals.issued += ROOM_K.initialChips;
  }
  return done(n);
}

function voidFighter(n: RoomState, id: string, effects: Effect[]) {
  const b = n.battles[id];
  const p = byId(n, id);
  if (!b || !p) return;
  if (n.phase === "betting") {
    p.outcome = "skipped";
    settleBattleIn(n, b, "void", "no_fight", effects);
  } else if (n.phase === "fighting" && p.outcome === null) {
    p.outcome = "fled"; // left mid-fight: void bets, no life lost
  }
}

function transferHostIn(n: RoomState, effects: Effect[]) {
  const next =
    presentMembers(n).sort((a, b) => a.joinedAt - b.joinedAt)[0] ??
    members(n).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (next && next.id !== n.hostId) {
    n.hostId = next.id;
    effects.push({ type: "host_changed", hostId: next.id });
  }
}

function closeIn(n: RoomState, now: number, effects: Effect[]) {
  for (const b of Object.values(n.battles))
    settleBattleIn(n, b, "void", "room_closed", effects);
  setPhase(n, "closed", 0, effects, now);
}

export function leaveRoom(s: RoomState, id: string, now: number): Result {
  if (!member(s, id)) return fail("not_member");
  const n = clone(s);
  const effects: Effect[] = [];
  const p = byId(n, id)!;
  p.left = true;
  p.present = false;
  p.ready = false;
  voidFighter(n, id, effects);
  if (members(n).length === 0) {
    closeIn(n, now, effects);
  } else if (n.hostId === id) {
    transferHostIn(n, effects);
  }
  return done(n, effects);
}

export function kickPlayer(
  s: RoomState,
  host: string,
  target: string,
  now: number,
): Result {
  const g = guard(s, host, "kick");
  if (g) return g;
  if (host === target) return fail("invalid_args");
  if (!member(s, target)) return fail("not_member");
  return leaveRoom(s, target, now);
}

export function transferHost(s: RoomState, host: string, to: string): Result {
  const g = guard(s, host, "transfer_host");
  if (g) return g;
  if (!member(s, to) || to === host) return fail("not_member");
  const n = clone(s);
  n.hostId = to;
  return done(n, [{ type: "host_changed", hostId: to }]);
}

export function closeRoom(s: RoomState, host: string, now: number): Result {
  const g = guard(s, host, "close");
  if (g) return g;
  const n = clone(s);
  const effects: Effect[] = [];
  closeIn(n, now, effects);
  return done(n, effects);
}

export function setPresence(
  s: RoomState,
  id: string,
  present: boolean,
  now: number,
): Result {
  if (!member(s, id)) return fail("not_member");
  const n = clone(s);
  const p = byId(n, id)!;
  if (p.present && !present) p.absentSince = now;
  if (present) p.absentSince = null;
  p.present = present;
  return done(n);
}

export function setMode(s: RoomState, host: string, mode: RoomMode): Result {
  const g = guard(s, host, "set_mode");
  if (g) return g;
  const n = clone(s);
  n.mode = mode;
  return done(n);
}

export function setRank(s: RoomState, host: string, rank: RarityId): Result {
  const g = guard(s, host, "set_rank");
  if (g) return g;
  if (!isDungeonRank(rank)) return fail("invalid_args");
  const n = clone(s);
  n.rank = rank;
  return done(n);
}

export function setTurnSeconds(
  s: RoomState,
  host: string,
  secs: number,
): Result {
  const g = guard(s, host, "set_turn_seconds");
  if (g) return g;
  if (!Number.isInteger(secs) || secs < 10 || secs > 120)
    return fail("invalid_args");
  const n = clone(s);
  n.turnSeconds = secs;
  return done(n);
}

export function chooseHero(s: RoomState, id: string, heroId: string): Result {
  const g = guard(s, id, "choose_hero");
  if (g) return g;
  const n = clone(s);
  byId(n, id)!.heroId = heroId;
  return done(n);
}

export function setReady(s: RoomState, id: string, ready = true): Result {
  const g = guard(s, id, "ready");
  if (g) return g;
  const n = clone(s);
  byId(n, id)!.ready = ready;
  return done(n);
}

export function chooseDoor(s: RoomState, id: string, door: DoorKind): Result {
  const g = guard(s, id, "choose_door");
  if (g) return g;
  const boss = isBossFloor(s.floor);
  if ((door === "boss") !== boss) return fail("invalid_args");
  const p = byId(s, id)!;
  if (p.door === door) return done(s); // idempotent: returns what is stored
  if (p.door !== null) return fail("door_locked");
  const n = clone(s);
  byId(n, id)!.door = door;
  return done(n);
}

/** Starts the pending round (lobby or round_end). `seed` comes from the server. */
export function startRound(
  s: RoomState,
  host: string,
  now: number,
  seed: number,
): Result {
  const g = guard(s, host, "start_round");
  if (g) return g;
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    return fail("invalid_args");
  if (presentMembers(s).length < ROOM_K.minPlayersToStart)
    return fail("not_enough_players");
  if (s.round > 0 && nightOver(s, now)) return fail("max_rounds");
  const n = clone(s);
  enterRoundSetup(n, now, seed, []);
  return done(n, [phaseEffect(n)]);
}

// --------------------------------------------------------------- bets
export function placeBet(
  s: RoomState,
  bettor: string,
  fighter: string,
  prediction: BetPrediction,
  stake: number,
): Result {
  const g = guard(s, bettor, "bet");
  if (g) return g;
  const b = s.battles[fighter];
  if (!b || b.status !== "open") return fail("battle_not_found");
  const p = byId(s, bettor)!;
  if (!p.present) return fail("not_member");
  const err = validateBet(stake, p.chips, bettor === fighter);
  if (err) return fail(err);
  if (b.bets.some((x) => x.bettor === bettor)) return fail("duplicate_bet");
  const n = clone(s);
  byId(n, bettor)!.chips -= stake;
  n.battles[fighter].bets.push({ bettor, prediction, stake });
  return done(n);
}

export function placeInterference(
  s: RoomState,
  from: string,
  fighter: string,
  kind: InterfereKind,
): Result {
  const g = guard(s, from, "interfere");
  if (g) return g;
  const b = s.battles[fighter];
  if (!b || b.status !== "open") return fail("battle_not_found");
  if (from === fighter) return fail("self_interfere");
  const p = byId(s, from)!;
  if (!p.present) return fail("not_member");
  const cost = interfereCostFor(
    Object.fromEntries(members(s).map((m) => [m.id, m.chips])),
    from,
  );
  if (p.chips < cost) return fail("insufficient_chips");
  if (b.interference) return fail("already_interfered");
  const n = clone(s);
  byId(n, from)!.chips -= cost;
  n.totals.interfereSpent += cost;
  n.battles[fighter].interference = { from, kind, cost };
  return done(n);
}

// --------------------------------------------------------------- fighting
/** Server-verified outcome (never the client's word). First report wins. */
export function reportOutcome(
  s: RoomState,
  id: string,
  outcome: FightOutcome,
): Result {
  const g = guard(s, id, "report_outcome");
  if (g) return g;
  const n = clone(s);
  byId(n, id)!.outcome = outcome;
  return done(n);
}

/** A turn timed out (Defender applied). Two in a row = flee (no coin/life cost). */
export function missTurn(s: RoomState, id: string): Result {
  if (s.phase !== "fighting") return fail("wrong_phase");
  const p = byId(s, id);
  if (!p || p.left || !s.battles[id]) return fail("not_active");
  if (p.outcome !== null) return done(s);
  const n = clone(s);
  const q = byId(n, id)!;
  q.missedTurns += 1;
  if (q.missedTurns >= ROOM_K.missedTurnsToFlee) q.outcome = "fled";
  return done(n);
}
export function turnPlayed(s: RoomState, id: string): Result {
  const p = byId(s, id);
  if (!p) return fail("not_member");
  if (p.missedTurns === 0) return done(s);
  const n = clone(s);
  byId(n, id)!.missedTurns = 0;
  return done(n);
}

// ------------------------------------------------------------ phase engine
function setPhase(
  n: RoomState,
  phase: Phase,
  ms: number,
  effects: Effect[],
  now: number,
) {
  n.phase = phase;
  n.phaseSeq += 1;
  n.deadline = ms > 0 ? now + ms : 0;
  effects.push(phaseEffect(n));
}
const phaseEffect = (n: RoomState): Effect => ({
  type: "phase",
  phase: n.phase,
  phaseSeq: n.phaseSeq,
  deadline: n.deadline,
});

function enterRoundSetup(
  n: RoomState,
  now: number,
  seed: number,
  effects: Effect[],
) {
  if (n.round === 0) n.nightStartedAt = now;
  n.round += 1;
  n.floor = 0;
  n.roundSeed = seed;
  n.roundStartedAt = now;
  n.battles = {};
  for (const p of n.players) {
    p.lives = ROOM_K.lives;
    p.eliminated = false;
    p.activeFromFloor = 0;
    p.roundMaxFloor = 0;
    p.door = null;
    p.outcome = null;
    p.missedTurns = 0;
    p.ready = false;
  }
  setPhase(n, "round_setup", ROOM_K.setupMs, effects, now);
}

function enterFloor(
  n: RoomState,
  floor: number,
  now: number,
  effects: Effect[],
) {
  n.floor = floor;
  n.battles = {};
  for (const p of n.players) {
    p.door = null;
    p.outcome = null;
    p.missedTurns = 0;
    p.ready = false;
  }
  setPhase(n, "floor_intro", ROOM_K.introMs, effects, now);
}

/** Everything the current phase was waiting for has happened. */
export function phaseDone(s: RoomState): boolean {
  const present = presentMembers(s);
  switch (s.phase) {
    case "round_setup":
      return present.length > 0 && present.every((p) => p.heroId !== null);
    case "doors":
      return present
        .filter((p) => isActive(s, p))
        .every((p) => p.door !== null);
    case "betting":
      return present.length > 0 && present.every((p) => p.ready);
    case "fighting":
      return fighters(s).every((p) => p.outcome !== null);
    case "round_end":
      return present.length > 0 && present.every((p) => p.ready);
    default:
      return false;
  }
}

export function roundOver(s: RoomState, now: number): boolean {
  const alive = presentMembers(s).filter((p) => !p.eliminated);
  return (
    s.floor >= ROOM_K.floorsPerRound ||
    alive.length === 0 ||
    now - s.roundStartedAt >= ROOM_K.roundCapMs
  );
}

export function nightOver(s: RoomState, now: number): boolean {
  return (
    s.round >= ROOM_K.maxRounds || now - s.nightStartedAt >= ROOM_K.nightCapMs
  );
}

function housekeeping(n: RoomState, now: number, effects: Effect[]) {
  const host = byId(n, n.hostId);
  if (
    host &&
    (host.left ||
      (!host.present &&
        host.absentSince !== null &&
        now - host.absentSince >= ROOM_K.hostTransferAfterMs))
  ) {
    transferHostIn(n, effects);
  }
}

function resolveFloor(n: RoomState, now: number, effects: Effect[]) {
  for (const p of n.players) {
    const b = n.battles[p.id];
    if (!b) continue;
    if (p.outcome === null) p.outcome = "timeout";
    if (p.outcome === "won") {
      p.roundMaxFloor = Math.max(p.roundMaxFloor, n.floor);
      p.nightMaxFloor = Math.max(
        p.nightMaxFloor,
        effectiveFloor(n.round, n.floor),
      );
    } else if (p.outcome === "lost" || p.outcome === "timeout") {
      p.lives -= 1;
      if (p.lives <= 0) p.eliminated = true;
    }
    const bo = toBetOutcome(p.outcome);
    settleBattleIn(n, b, bo.outcome, bo.reason, effects);
  }
  setPhase(n, "reveal", revealMsFor(n.floor), effects, now);
}

/**
 * Idempotent phase reducer. `phaseSeq` is the value the caller saw; if the
 * state already moved on, nothing changes (advanced:false, reason:'stale').
 * `opts.seed` is only needed when the move starts a new round.
 */
export function advance(
  s: RoomState,
  now: number,
  phaseSeq: number,
  opts: { seed?: number } = {},
): Result {
  const stale = (reason: string): Result => ({
    ok: true,
    state: s,
    effects: [],
    advanced: false,
    reason,
  });
  if (s.phase === "closed") return fail("room_closed");
  if (phaseSeq !== s.phaseSeq) return stale("stale");
  if (s.phase === "lobby" || s.phase === "night_summary")
    return stale("manual_phase");
  if (!(now >= s.deadline || phaseDone(s))) return stale("not_due");

  const n = clone(s);
  const effects: Effect[] = [];
  housekeeping(n, now, effects);
  switch (n.phase) {
    case "round_setup": {
      enterFloor(n, 1, now, effects);
      break;
    }
    case "floor_intro":
      if (isBossFloor(n.floor))
        for (const p of n.players) if (canPlay(n, p)) p.door = "boss";
      setPhase(n, "doors", ROOM_K.doorsMs, effects, now);
      break;
    case "doors": {
      const boss = isBossFloor(n.floor);
      const keys: string[] = [];
      for (const p of n.players) {
        if (!canPlay(n, p)) continue;
        p.door ??= boss ? "boss" : "easy"; // default door = first fight
        if (!isFightDoor(p.door)) continue;
        const key = battleKey(n.round, n.floor, p.id);
        n.battles[p.id] = {
          key,
          fighter: p.id,
          bets: [],
          interference: null,
          status: "open",
          outcome: null,
          voidReason: null,
        };
        keys.push(key);
      }
      for (const p of n.players) p.ready = false;
      if (keys.length === 0)
        setPhase(n, "reveal", revealMsFor(n.floor), effects, now);
      else {
        effects.push({ type: "battles_opened", keys });
        setPhase(n, "betting", ROOM_K.bettingMs, effects, now);
      }
      break;
    }
    case "betting": {
      // Fighters who dropped before the fight: no fight, everything refunded.
      for (const p of n.players) {
        const b = n.battles[p.id];
        if (b && (p.left || !p.present)) {
          p.outcome = "skipped";
          settleBattleIn(n, b, "void", "no_fight", effects);
        }
      }
      const open = Object.values(n.battles).filter((b) => b.status === "open");
      if (open.length === 0) {
        setPhase(n, "reveal", revealMsFor(n.floor), effects, now);
        break;
      }
      for (const b of open) b.status = "locked";
      effects.push({ type: "battles_locked", keys: open.map((b) => b.key) });
      const extra = isBossFloor(n.floor) ? ROOM_K.bossExtraMs : 0;
      setPhase(n, "fighting", ROOM_K.fightCapMs + extra, effects, now);
      break;
    }
    case "fighting":
      resolveFloor(n, now, effects);
      break;
    case "reveal":
      if (roundOver(n, now)) {
        for (const p of n.players) p.ready = false;
        setPhase(n, "round_end", ROOM_K.roundEndMs, effects, now);
      } else {
        enterFloor(n, n.floor + 1, now, effects);
      }
      break;
    case "round_end":
      if (nightOver(n, now)) {
        setPhase(n, "night_summary", 0, effects, now);
      } else {
        if (opts.seed === undefined) return fail("seed_required");
        enterRoundSetup(n, now, opts.seed, effects);
      }
      break;
    case "coop_boss":
      setPhase(n, "night_summary", 0, effects, now);
      break;
    default:
      return stale("manual_phase");
  }
  return { ok: true, state: n, effects, advanced: true };
}

/** Host: skip the remaining rounds and jump to the summary. */
export function endNight(s: RoomState, host: string, now: number): Result {
  const g = guard(s, host, "end_night");
  if (g) return g;
  const n = clone(s);
  const effects: Effect[] = [];
  setPhase(n, "night_summary", 0, effects, now);
  return done(n, effects);
}

/** Host: final coop boss. Phase 2: refused while COOP_BOSS_ENABLED is false. */
export function startCoop(s: RoomState, host: string, now: number): Result {
  const g = guard(s, host, "start_coop");
  if (g) return g;
  if (!COOP_BOSS_ENABLED) return fail("coop_disabled");
  if (s.round < ROOM_K.coopMinRound) return fail("wrong_phase");
  const n = clone(s);
  const effects: Effect[] = [];
  setPhase(n, "coop_boss", ROOM_K.coopMs, effects, now);
  return done(n, effects);
}

/** Chip invariant: held + escrowed (open stakes) must equal the accounted supply. */
export function chipSupply(s: RoomState): { held: number; expected: number } {
  const held = s.players.reduce((a, p) => a + p.chips, 0);
  const escrow = Object.values(s.battles)
    .filter((b) => b.status !== "settled")
    .reduce((a, b) => a + b.bets.reduce((x, y) => x + y.stake, 0), 0);
  const { issued, interfereSpent, comp, dust } = s.totals;
  return {
    held: held + escrow,
    expected: issued - interfereSpent + comp - dust,
  };
}

/**
 * Bets a viewer may see (snapshot rule): once the battle is locked/settled or at
 * reveal everybody sees them; while still open (betting) only the viewer's own
 * bets and, for the fighter, every bet placed against them.
 */
export function visibleBets(
  phase: Phase,
  b: Pick<Battle, "bets" | "fighter" | "status">,
  viewer: string,
): Bet[] {
  if (phase === "reveal" || b.status !== "open") return b.bets;
  return b.bets.filter((x) => x.bettor === viewer || b.fighter === viewer);
}
