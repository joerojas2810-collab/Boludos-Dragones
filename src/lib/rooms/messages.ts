// zod schemas for every client -> server request and every Realtime message of
// the room flow. All strict (unknown keys rejected) and size-bounded.
import { z } from "zod";
import { RARITY_IDS } from "../game/rarity";
import { runActionSchema } from "../server/validators";

export const MSG_VERSION = 1;
export const REALTIME_MAX_BYTES = 200;
export const EMOTE_MIN_GAP_MS = 2_000;
export const EMOTE_IDS = [
  "laugh",
  "fire",
  "skull",
  "clap",
  "clown",
  "luck",
] as const;

const uuid = z.uuid();
const v = z.literal(MSG_VERSION);
const base = { v, room: uuid };
const floor = z.number().int().min(1).max(10);
const seq = z.number().int().min(0).max(1e9);
const ms = z.number().int().min(0).max(1e13);

export const phaseEnum = z.enum([
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
]);
export const doorKindEnum = z.enum([
  "easy",
  "hard",
  "boss",
  "chest",
  "merchant",
  "rest",
  "event",
]);
export const roomModeEnum = z.enum(["nivelado", "completo"]);
export const roomRankEnum = z.enum(RARITY_IDS);
export const predictionEnum = z.enum(["win", "lose"]);
export const interfereKindEnum = z.enum(["stronger_enemy", "adverse_element"]);
export const roomCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{4}$/)
  .transform((s) => s.toUpperCase());

// ---- client -> server (POST /api/rooms/**), all carry v and room except create/join
export const createRoomMsg = z.strictObject({
  v,
  type: z.literal("create"),
  mode: roomModeEnum.optional(),
  rank: roomRankEnum.optional(),
  turnSeconds: z.number().int().min(10).max(120).optional(),
});
export const joinRoomMsg = z.strictObject({
  v,
  type: z.literal("join"),
  code: roomCodeSchema,
});

const m = <T extends string>(type: T) => ({ ...base, type: z.literal(type) });
export const clientMsg = z.discriminatedUnion("type", [
  z.strictObject(m("leave")),
  z.strictObject({ ...m("start_round") }),
  z.strictObject({ ...m("advance"), phaseSeq: seq }),
  z.strictObject({ ...m("door"), floor, door: doorKindEnum }),
  // outcome is NOT sent: the server replays `actions` to decide it.
  z.strictObject({
    ...m("submit"),
    floor,
    actions: z.array(runActionSchema).max(6000),
    engineVersion: z.number().int().min(1).max(1000).optional(),
  }),
  z.strictObject({
    ...m("bet"),
    fighter: uuid,
    prediction: predictionEnum,
    stake: z.number().int().min(10).max(1_000_000),
  }),
  z.strictObject({ ...m("interfere"), fighter: uuid, kind: interfereKindEnum }),
  z.strictObject({ ...m("hero"), heroId: z.string().min(1).max(100) }),
  z.strictObject({ ...m("ready"), ready: z.boolean() }),
  z.strictObject({ ...m("set_mode"), mode: roomModeEnum }),
  z.strictObject({ ...m("set_rank"), rank: roomRankEnum }),
  z.strictObject({
    ...m("set_turn_seconds"),
    seconds: z.number().int().min(10).max(120),
  }),
  z.strictObject({ ...m("kick"), target: uuid }),
  z.strictObject({ ...m("transfer_host"), to: uuid }),
  z.strictObject({ ...m("close") }),
  z.strictObject({ ...m("end_night") }),
  z.strictObject({ ...m("start_coop") }),
  z.strictObject({ ...m("heartbeat"), present: z.boolean() }),
  // ephemeral extras served through the snapshot (no Realtime session needed)
  z.strictObject({
    ...m("live"),
    n: z.number().int().min(0).max(500),
    actor: z.enum(["p", "e"]),
    kind: z.enum(["hit", "crit", "miss"]),
    dmg: z.number().int().min(0).max(1e6),
    pHp: z.number().int().min(0).max(1e6),
    eHp: z.number().int().min(0).max(1e6),
  }),
  z.strictObject({ ...m("emote"), id: z.enum(EMOTE_IDS) }),
  z.strictObject({ ...m("vote"), floor, yes: z.boolean() }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

// ---- Realtime (broadcast/presence) messages, <= 200 bytes, versioned and sequenced
const rt = <T extends string>(type: T) => ({
  ...base,
  seq,
  type: z.literal(type),
});
export const phaseMsg = z.strictObject({
  ...rt("phase"),
  phase: phaseEnum,
  phaseSeq: seq,
  deadlineMs: ms,
  round: z.number().int().min(0).max(5),
  floor: z.number().int().min(0).max(10),
});
export const turnMsg = z.strictObject({
  ...rt("turn"),
  fighter: uuid,
  n: z.number().int().min(0).max(500),
  actor: z.enum(["p", "e"]),
  kind: z.enum(["hit", "crit", "miss"]),
  dmg: z.number().int().min(0).max(1e6),
  pHp: z.number().int().min(0).max(1e6),
  eHp: z.number().int().min(0).max(1e6),
});
export const emoteMsg = z.strictObject({
  ...rt("emote"),
  from: uuid,
  id: z.enum(EMOTE_IDS),
});
export const presenceMsg = z.strictObject({
  ...rt("presence"),
  player: uuid,
  ready: z.boolean(),
  hero: z.string().max(100).nullable(),
  state: z.enum(["online", "away"]),
});
export const realtimeMsg = z.discriminatedUnion("type", [
  phaseMsg,
  turnMsg,
  emoteMsg,
  presenceMsg,
]);
export type RealtimeMsg = z.infer<typeof realtimeMsg>;

const bytes = (x: unknown) =>
  new TextEncoder().encode(JSON.stringify(x)).length;

/** Validates an inbound Realtime payload: size, shape, version. null = drop it. */
export function parseRealtime(raw: unknown): RealtimeMsg | null {
  if (bytes(raw) > REALTIME_MAX_BYTES) return null;
  const r = realtimeMsg.safeParse(raw);
  return r.success ? r.data : null;
}

/** Per-client emote throttle: 1 per 2 s. */
export const canEmote = (lastAt: number | null, now: number) =>
  lastAt === null || now - lastAt >= EMOTE_MIN_GAP_MS;

/** 0..1 s deterministic jitter so clients do not all call /advance at once. */
export function advanceJitterMs(playerId: string): number {
  let h = 0;
  for (const c of playerId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 1000;
}
