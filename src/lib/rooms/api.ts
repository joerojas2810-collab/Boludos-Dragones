// Contract of the room HTTP API + the Realtime events the SERVER publishes.
// Requests reuse messages.ts (clientMsg / createRoomMsg / joinRoomMsg).
// Both sides import this file: keep it stable (see docs/API_SALAS.md).
import { z } from "zod";
import type { Climb } from "../game/floorFights";
import type { FightSpec } from "../game/stage";
import {
  doorKindEnum,
  phaseMsg,
  REALTIME_MAX_BYTES,
  interfereKindEnum,
  MSG_VERSION,
  phaseEnum,
  roomModeEnum,
  roomRankEnum,
} from "./messages";

export {
  clientMsg,
  createRoomMsg,
  joinRoomMsg,
  type ClientMsg,
} from "./messages";

const uuid = z.uuid();
const int = z.number().int();

/** Paths. `{id}` = room uuid. `{type}` = ClientMsg["type"] except create/join. */
export const ROOM_ROUTES = {
  create: "/api/rooms", // POST
  join: "/api/rooms/join", // POST
  snapshot: (id: string) => `/api/rooms/${id}`, // GET
  run: (id: string) => `/api/rooms/${id}/run`, // GET
  summary: (id: string) => `/api/rooms/${id}/summary`, // GET
  action: (id: string, type: string) => `/api/rooms/${id}/${type}`, // POST
} as const;


// ---------------------------------------------------------------- shared views
export const phaseView = z.object({
  phase: phaseEnum,
  phaseSeq: int,
  round: int,
  floor: int,
  deadlineMs: int, // 0 = no deadline
  hostId: uuid,
  mode: roomModeEnum,
  rank: roomRankEnum,
  turnSeconds: int,
  serverNowMs: int, // for clock skew
});
export type PhaseView = z.infer<typeof phaseView>;

export const playerView = z.object({
  id: uuid,
  name: z.string(),
  chips: int,
  present: z.boolean(),
  ready: z.boolean(),
  eliminated: z.boolean(),
  activeFromFloor: int,
  heroKey: z.string().nullable(),
  door: doorKindEnum.nullable(), // current floor, once picked
  outcome: z.enum(["won", "lost", "fled", "timeout", "skipped"]).nullable(),
  roundMaxFloor: int,
  nightMaxFloor: int,
});
export type PlayerView = z.infer<typeof playerView>;

export const battleView = z.object({
  key: z.string(),
  fighter: uuid,
  status: z.enum(["open", "locked", "settled"]),
  outcome: z.enum(["win", "lose", "void"]).nullable(),
  interfered: z.boolean(), // WHO interfered stays secret until reveal
  interferedBy: uuid.nullable(), // only during reveal
  interferedKind: interfereKindEnum.nullable(), // only during reveal (hostile or aid)
  bets: z.array(
    z.object({
      bettor: uuid,
      prediction: z.enum(["win", "lose"]),
      stake: int,
    }),
  ), // filtered per viewer by visibleBets()
});
export type BattleView = z.infer<typeof battleView>;

/** Floor vote (shared-risk event). `open`: you may still vote; `result` once resolved. */
export const voteView = z.object({
  floor: int,
  title: z.string(),
  question: z.string(),
  open: z.boolean(),
  yes: int,
  no: int,
  mine: z.boolean().nullable(),
  result: z.object({ opened: z.boolean(), delta: int }).nullable(),
});
export type VoteView = z.infer<typeof voteView>;

/** Coop boss: shared bar and what each player has dealt (server-replayed). */
export const coopView = z.object({
  pool: int, // shared bar size (scales with players)
  total: int, // damage dealt so far, capped at pool
  won: z.boolean(),
  mvp: uuid.nullable(),
  bossName: z.string(),
  players: z.array(z.object({ id: uuid, damage: int, finished: z.boolean() })),
  /** What each player with damage earns (paid once when the boss phase ends). */
  prizes: z.array(
    z.object({
      id: uuid,
      coins: int,
      chips: int,
      dados: int,
      mvp: z.boolean(),
    }),
  ),
});
export type CoopView = z.infer<typeof coopView>;

/** 1v1 duels: matches, bets (filtered) and, once the fight starts, the public state. */
const duelHero = z.object({
  name: z.string(),
  classId: z.string(),
  element: z.string(),
  skill: z.string().optional(),
});
const duelAction = z.enum(["attack1", "attack2", "attack3", "defend"]);
const ab = <T extends z.ZodType>(t: T) => z.object({ a: t, b: t });
export const duelView = z.object({
  mode: z.enum(["balanceado", "real"]),
  round: int,
  picked: z.array(uuid), // duelists that already chose (not WHAT they chose)
  matches: z.array(
    z.object({
      key: z.string(),
      a: uuid,
      b: uuid,
      reported: z.boolean(), // the server's verdict is in (the fight is over)
      status: z.enum(["open", "locked", "settled"]),
      winner: uuid.nullable(),
      end: z.enum(["ko", "time", "forfeit", "draw", "no_fight"]).nullable(),
      outcome: z.enum(["win", "lose", "void"]).nullable(),
      bets: z.array(
        z.object({ bettor: uuid, prediction: z.enum(["win", "lose"]), stake: int }),
      ),
      fight: z
        .object({
          turn: int,
          deadlineMs: int,
          hp: ab(int),
          maxHp: ab(int),
          cooldown: ab(int),
          cooldown3: ab(int),
          picked: ab(z.boolean()),
          heroes: ab(duelHero),
          log: z.array(z.string()),
          last: z.object({ a: duelAction.nullable(), b: duelAction.nullable() }).nullable(),
        })
        .nullable(),
    }),
  ),
});
export type DuelView = z.infer<typeof duelView>;

export const roomSnapshot = z.object({
  roomId: uuid,
  code: z.string(),
  you: uuid,
  state: phaseView,
  players: z.array(playerView),
  battles: z.array(battleView),
  rankChips: z.array(uuid), // player ids, best first
  rankFloor: z.array(uuid),
  /** Last reported fight turn per fighter (best effort, in-memory). */
  live: z.array(
    z.object({
      fighter: uuid,
      n: int,
      actor: z.enum(["p", "e"]),
      kind: z.enum(["hit", "crit", "miss"]),
      dmg: int,
      pHp: int,
      eHp: int,
    }),
  ),
  emotes: z.array(z.object({ from: uuid, id: z.string(), at: int })),
  vote: voteView.nullable().optional(),
  coop: coopView.nullable().optional(),
  duel: duelView.nullable().optional(),
});
export type RoomSnapshot = z.infer<typeof roomSnapshot>;

// ---------------------------------------------------------------- responses
export const createRoomRes = z.object({
  roomId: uuid,
  code: z.string().length(4),
  expiresAt: z.string(),
  state: phaseView,
});

export const joinRoomRes = z.object({
  roomId: uuid,
  code: z.string(),
  hostId: uuid,
});

/** Default response of every POST /api/rooms/{id}/{type}: the new state. */
export const actionRes = z.object({ ok: z.literal(true), state: phaseView });

export const advanceRes = z.object({
  advanced: z.boolean(),
  reason: z.enum(["stale", "not_due", "manual_phase"]).optional(),
  state: phaseView,
});
export type AdvanceRes = z.infer<typeof advanceRes>;

export const submitRes = actionRes.extend({
  outcome: z.enum(["won", "lost", "fled", "timeout"]).nullable(), // null: non-fight floor saved
  replayed: z.boolean(),
  eliminated: z.boolean(),
});
export type SubmitRes = z.infer<typeof submitRes>;

/**
 * GET /run: the server's authoritative Run at the START of the current floor
 * (relic offers / pending picks already resolved or auto-resolved). The client
 * plays this floor from here and submits ONLY the floor's actions (see doc).
 * `enemyBoost` is only sent to the fighter during `fighting`.
 */
export interface RunView {
  run: Climb;
  floor: number;
  seed: number; // round seed (= run.seed)
  doors: { kind: z.infer<typeof doorKindEnum> }[];
  door: z.infer<typeof doorKindEnum> | null; // door you picked
  enemyBoost: z.infer<typeof interfereKindEnum> | null;
  engineVersion: number;
  /** Only during coop_boss: your fresh hero Run and the boss fight to play. */
  coop?: { node: FightSpec };
}

export const summaryRes = z.object({
  phase: phaseEnum,
  round: int,
  players: z.array(
    z.object({
      player_id: uuid,
      name: z.string(),
      chips: int,
      max_floor: int,
      wins: int,
      losses: int,
      bet_net: int,
      interferences: int,
      duel_wins: int.optional(), // from the duel state, not the SQL summary
    }),
  ),
  awards: z.object({
    gafe: uuid.nullable(),
    apostador: uuid.nullable(),
    saboteador: uuid.nullable(),
  }),
});
export type SummaryRes = z.infer<typeof summaryRes>;

// ---------------------------------------------------------------- Realtime
/**
 * Channel: `room:<roomId>` (private). The SERVER publishes through the REST
 * broadcast API (service role); event name == payload.type. Clients subscribe
 * with { config: { private: true } } and validate with parseServerEvent().
 * Clients may SEND only `turn` and `emote` (members only, informational).
 * seq of server events = phaseSeq (order inside a phase: phase, rank, settle).
 */
export const roomTopic = (roomId: string) => `room:${roomId}`;

const baseEv = { v: z.literal(MSG_VERSION), room: uuid, seq: int };
export const rankEv = z.strictObject({
  ...baseEv,
  type: z.literal("rank"),
  by: z.enum(["chips", "floor"]),
  r: z.array(z.string().length(8)).max(7), // first 8 chars of player uuids, best first
});
export const settleEv = z.strictObject({
  ...baseEv,
  type: z.literal("settle"),
  fighter: uuid,
  out: z.enum(["win", "lose", "void"]),
});

const serverEv = z.discriminatedUnion("type", [phaseMsg, rankEv, settleEv]);
export type ServerEvent = z.infer<typeof serverEv>;
/** Validates an inbound server event (size, shape, version). null = drop. */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (new TextEncoder().encode(JSON.stringify(raw)).length > REALTIME_MAX_BYTES)
    return null;
  const r = serverEv.safeParse(raw);
  return r.success ? r.data : null;
}
