// View model + transport contract of the room UI. The UI only talks to a
// RoomClient: a real one (fetch + Supabase Realtime) or the scripted fake used
// by /sala/demo. Game rules stay in lib/game/room.ts.
import type { AwardResult } from "../game/awards";
import type { ClassId } from "../game/characters";
import type { Element } from "../game/elements";
import type { RarityId } from "../game/rarity";
import type { RunAction } from "../game/replay";
import type { FightNode, Run } from "../game/run";
import type { CoopView } from "../rooms/api";
import type { TraitId } from "../game/traits";
import type {
  Bet,
  BetOutcome,
  BetPrediction,
  DoorKind,
  FightOutcome,
  InterfereKind,
  Phase,
  RoomError,
  RoomMode,
  VoidReason,
} from "../game/room";

export type EmoteId = "laugh" | "fire" | "skull" | "clap" | "clown" | "luck";

export interface HeroSummary {
  name: string;
  classId: ClassId;
  element: Element;
  rarity: RarityId;
  stars: number;
  traits: TraitId[];
}

export interface PlayerView {
  id: string;
  name: string;
  hero: HeroSummary | null;
  heroId: string | null;
  chips: number;
  lives: number;
  eliminated: boolean;
  present: boolean;
  ready: boolean;
  isHost: boolean;
  activeFromFloor: number;
  roundMaxFloor: number;
  nightMaxFloor: number;
  doorChosen: boolean;
  door: DoorKind | null; // null until the door is public (betting onwards)
  outcome: FightOutcome | "skipped" | null;
  fights: boolean; // has an open/locked/settled battle this floor
}

export interface BattleView {
  fighter: string;
  bets: Bet[]; // public: who bet what on this fighter
  status: "open" | "locked" | "settled";
  outcome: BetOutcome | null;
  voidReason: VoidReason | null;
  interferedByMe: InterfereKind | null;
  interfered: boolean; // visible to the target, the author and (reveal) everybody
  interferenceFrom: string | null; // only at reveal
  interferenceKind: InterfereKind | null; // only at reveal
}

export type Award = AwardResult;

/** Floor vote shown during `reveal` of a vote floor. */
export interface VoteInfo {
  floor: number;
  title: string;
  question: string;
  open: boolean; // you can still vote
  yes: number;
  no: number;
  mine: boolean | null;
  result: { opened: boolean; delta: number } | null;
}

export interface RoomView {
  code: string;
  me: string;
  mode: RoomMode;
  rank: RarityId; // dungeon rank of the night (enemy difficulty)
  turnSeconds: number;
  phase: Phase;
  phaseSeq: number;
  round: number;
  floor: number;
  deadline: number; // ms on the CLIENT clock (Date.now()); 0 = none
  seed: number | null;
  hostId: string;
  players: PlayerView[];
  battles: Record<string, BattleView>;
  awards: Award[] | null; // night_summary
  /** My interfere price; absent = flat ROOM_K.interfereCost (real server is still flat). */
  interfereCost?: number;
  vote?: VoteInfo | null;
  coop?: CoopView | null; // coop boss: shared bar (coop_boss and the summary)
  connection: "online" | "reconnecting";
}

export interface TurnInfo {
  fighter: string;
  n: number;
  actor: "p" | "e";
  kind: "hit" | "crit" | "miss";
  dmg: number;
  pHp: number;
  eHp: number;
}

export type RoomEvent =
  | { type: "turn"; msg: TurnInfo }
  | { type: "emote"; from: string; id: EmoteId }
  | { type: "closed" }
  | { type: "kicked" };

export type Res<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: RoomError | string };

/** Authoritative Run at the start of the current floor (GET /run). */
export interface FloorRun {
  run: Run;
  floor: number;
  seed: number;
  door: DoorKind | null;
  enemyBoost: InterfereKind | null; // only while fighting, only for the target
}

export interface RoomClient {
  readonly kind: "fake" | "remote";
  getView(): RoomView | null;
  subscribe(cb: (v: RoomView | null) => void): () => void;
  onEvent(cb: (e: RoomEvent) => void): () => void;
  hero(heroId: string): Promise<Res>;
  ready(ready: boolean): Promise<Res>;
  setMode(mode: RoomMode): Promise<Res>;
  setRank(rank: RarityId): Promise<Res>;
  setTurnSeconds(seconds: number): Promise<Res>;
  startRound(): Promise<Res>;
  advance(phaseSeq: number): Promise<Res>;
  door(floor: number, door: DoorKind): Promise<Res>;
  getRun(): Promise<Res<{ floorRun: FloorRun }>>;
  // The server replays `actions` from the floor-start Run and decides the outcome.
  submit(
    floor: number,
    actions: RunAction[],
  ): Promise<Res<{ outcome: FightOutcome | null; eliminated: boolean }>>;
  bet(fighter: string, prediction: BetPrediction, stake: number): Promise<Res>;
  interfere(fighter: string, kind: InterfereKind): Promise<Res>;
  vote(floor: number, yes: boolean): Promise<Res>;
  kick(target: string): Promise<Res>;
  transferHost(to: string): Promise<Res>;
  endNight(): Promise<Res>;
  startCoop(): Promise<Res>;
  /** Coop boss: your fresh hero Run and the boss fight to play. */
  getCoop(): Promise<Res<{ run: Run; node: FightNode }>>;
  /** The fight so far; the server replays it and keeps the damage. */
  coopSubmit(
    actions: RunAction[],
  ): Promise<Res<{ damage: number; finished: boolean }>>;
  close(): Promise<Res>;
  leave(): Promise<Res>;
  turn(msg: Omit<TurnInfo, "fighter">): void;
  emote(id: EmoteId): void;
  dispose(): void;
}
