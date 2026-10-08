// Data-access boundary of the room service. Real impl: roomsSupabase.ts (RPCs +
// service-role reads). Tests: roomsFake.ts (in-memory, rules from game/room.ts).
// Methods throw RpcError(code) with the contract error codes.
import type {
  InterfereKind,
  BetPrediction,
  DoorKind,
  FightOutcome,
  Phase,
  RoomMode,
  RoomState,
} from "../game/room";
import type { RarityId } from "../game/rarity";
import type { Climb } from "../game/floorFights";
import type { Profile } from "../game/profile";
import type { SummaryRes } from "../rooms/api";

export interface FloorRow {
  round: number;
  floor: number;
  playerId: string;
  doorKind: DoorKind | null;
  status: "picked" | "fought" | "skipped" | "timeout";
  outcome: FightOutcome | null;
  actions: unknown; // server-side only; `{ base: Climb }` before a submit
  runAfter: Climb | null;
}

export interface CoopRow {
  playerId: string;
  damage: number;
  finished: boolean;
  paid: boolean;
}

export interface AdvanceArgs {
  room: string;
  expectedSeq: number;
  toPhase: Phase;
  deadlineMs: number; // 0 = none
  nowMs: number;
  early: boolean;
  round: number;
  floor: number;
  seed: number | null;
  fighters: { player: string; door_kind: string; fight_seed: number }[] | null;
  keepFighters: string[] | null; // betting -> fighting
}

export interface RoomMeta {
  code: string;
  names: Record<string, string>;
}

export interface RoomStore {
  limit(key: string, max: number, windowSec: number): Promise<void>;
  audit(
    actor: string | null,
    event: string,
    detail?: Record<string, unknown>,
  ): Promise<void>;

  createRoom(
    player: string,
    code: string,
  ): Promise<{ roomId: string; code: string; expiresAt: string }>;
  joinRoom(
    player: string,
    code: string,
  ): Promise<
    | { ok: true; roomId: string; code: string; hostId: string }
    | { ok: false; error: string }
  >;
  leaveRoom(player: string, room: string): Promise<void>;
  closeRoom(player: string, room: string): Promise<void>;
  kick(host: string, room: string, target: string): Promise<void>;
  transferHost(host: string, room: string, to: string): Promise<void>;
  setMode(player: string, room: string, mode: RoomMode): Promise<void>;
  setRank(player: string, room: string, rank: RarityId): Promise<void>;
  setTurnSeconds(player: string, room: string, secs: number): Promise<void>;
  chooseHero(player: string, room: string, heroKey: string): Promise<void>;
  setReady(player: string, room: string, ready: boolean): Promise<void>;
  startRound(
    player: string,
    room: string,
    seed: number,
    nowMs: number,
  ): Promise<void>;
  advance(a: AdvanceArgs): Promise<{ advanced: boolean; reason?: string }>;
  chooseDoor(
    player: string,
    room: string,
    floor: number,
    door: DoorKind,
  ): Promise<{ door: DoorKind; replayed: boolean }>;
  submitFloorResult(a: {
    player: string;
    room: string;
    floor: number;
    outcome: FightOutcome;
    actions: unknown;
    runAfter: Climb;
    eliminated: boolean;
  }): Promise<{ outcome: FightOutcome; replayed: boolean }>;
  placeBet(
    room: string,
    bettor: string,
    battleKey: string,
    prediction: BetPrediction,
    stake: number,
  ): Promise<{ chips: number }>;
  placeInterference(
    room: string,
    from: string,
    battleKey: string,
    kind: InterfereKind,
  ): Promise<{ chips: number }>;
  castVote(
    player: string,
    room: string,
    floor: number,
    yes: boolean,
  ): Promise<void>;
  /** TS tallied and decided; SQL applies `delta` once to every present member. */
  resolveVote(
    room: string,
    round: number,
    floor: number,
    opened: boolean,
    delta: number,
  ): Promise<{ opened: boolean; delta: number }>;
  loadVote(
    room: string,
    round: number,
    floor: number,
  ): Promise<{
    votes: Record<string, boolean>;
    result: { opened: boolean; delta: number } | null;
  }>;
  markPresence(player: string, room: string, present: boolean): Promise<void>;
  sweepPresence(room: string, nowMs: number): Promise<void>;
  nightSummary(room: string): Promise<SummaryRes>;

  // reads (service role only)
  loadState(room: string): Promise<RoomState | null>;
  loadMeta(room: string): Promise<RoomMeta>;
  floorRows(room: string, round: number, player: string): Promise<FloorRow[]>;
  /** Writes server-only columns of an EXISTING floor row (no-op if missing). */
  saveFloorRun(
    room: string,
    round: number,
    floor: number,
    player: string,
    patch: { actions?: unknown; runAfter?: Climb },
  ): Promise<void>;
  interferenceOn(
    room: string,
    battleKey: string,
  ): Promise<InterfereKind | null>;
  /** Coop boss: best replayed damage per player (room_coop). */
  loadCoop(room: string): Promise<CoopRow[]>;
  /** Pays the prizes once per player (coop_pay); only after the boss phase. */
  payCoop(
    room: string,
    rows: {
      player: string;
      coins: number;
      chips: number;
      dados: number;
    }[],
  ): Promise<void>;
  /** Keeps the better of the stored and the new damage. */
  saveCoop(
    room: string,
    player: string,
    row: { damage: number; finished: boolean; actions: unknown },
  ): Promise<void>;
}

export interface RoomDeps {
  store: RoomStore;
  broadcast(room: string, events: Record<string, unknown>[]): Promise<void>;
  loadProfile(player: string): Promise<{ profile: Profile; name: string }>;
  randomSeed(): number; // uint32 from crypto
  randomCode(): string; // 4 letters A-Z from crypto
  now(): number;
}
