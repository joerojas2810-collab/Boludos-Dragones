import { z } from "zod";
import { isFairTrade, isPieceKey } from "../game/market";
import { RARITY_IDS } from "../game/rarity";
import { SLOTS, WEAPON_TYPES } from "../game/weapons";

// ---- name / PIN ----
export const NAME_MIN = 3;
export const NAME_MAX = 16;

// lower-case, no accents, spaces -> "_": the unique, case-insensitive key.
export const nameKeyOf = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

export const nameSchema = z
  .string()
  .transform((s) => s.normalize("NFC").trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(NAME_MIN)
      .max(NAME_MAX)
      .regex(/^[\p{Script=Latin}0-9 _]+$/u)
      .refine((s) => /^[a-z0-9_]+$/.test(nameKeyOf(s))),
  );
export const pinSchema = z.string().regex(/^\d{4}$/);

export const uuidSchema = z.uuid();
export const seedSchema = z.number().int().min(0).max(4294967295);

// ---- request bodies (strict: unknown keys are rejected) ----
export const credsBody = z.strictObject({ name: nameSchema, pin: pinSchema });
export const registerBody = z.strictObject({
  name: nameSchema,
  pin: pinSchema,
  houseCode: z.string().min(1).max(64),
});
export const resetPinBody = z.strictObject({ name: nameSchema });

export const pullBody = z.strictObject({
  banner: z.enum(["character", "weapon"]),
  count: z.union([z.literal(1), z.literal(10)]),
  idempotencyKey: uuidSchema,
});
export const equipBody = z.strictObject({
  characterId: z.string().min(1).max(100),
  weaponId: z.string().min(1).max(100).nullable(),
  slot: z.enum(SLOTS).optional(), // only for unequip (equip derives it from the piece)
});
export const spendFragmentsBody = z.strictObject({
  characterId: z.string().min(1).max(100),
});
export const runStartBody = z.strictObject({
  classId: z.enum(["caballero", "mago", "picaro", "clerigo"]),
  characterId: z.string().min(1).max(100).nullable(),
  rank: z.enum(RARITY_IDS).default("f"),
  ascension: z.number().int().min(0).max(5).default(0),
  tower: z.enum(["nivelado", "coleccion"]).optional(),
});

export const runActionSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("act"),
    a: z.enum(["attack1", "attack2", "attack3", "defend"]),
    target: z.number().int().min(0).max(2).optional(),
  }),
  z.strictObject({ t: z.literal("auto") }),
  z.strictObject({ t: z.literal("fin") }),
  z.strictObject({ t: z.literal("quit") }),
]);
export const runSubmitBody = z.strictObject({
  runId: uuidSchema,
  actions: z.array(runActionSchema).max(8000),
  claimed: z
    .strictObject({
      coins: z.number().int().min(0).max(1e9),
      maxFloor: z.number().int().min(0).max(1e6),
    })
    .optional(),
  engineVersion: z.number().int().min(1).max(1000).optional(),
});
export const dailyBody = z.strictObject({
  banner: z.enum(["character", "weapon"]),
});

// ---- market ----
const pieceKey = z.string().max(60);
export const marketOfferBody = z
  .strictObject({
    kind: z.enum(["character", "weapon"]),
    give: pieceKey,
    want: pieceKey.nullable(),
    coins: z.number().int().min(-100000).max(100000).default(0),
  })
  .refine(
    (b) =>
      isPieceKey(b.kind, b.give) &&
      (b.want === null || (isPieceKey(b.kind, b.want) && b.want !== b.give)) &&
      isFairTrade(b.give, b.want, b.coins),
  );
export const marketIdBody = z.strictObject({ offerId: uuidSchema });

// ---- forge ----
const element = z.enum(["agua", "fuego", "viento", "tierra", "rayo"]);
const itemType = z.enum(WEAPON_TYPES);
const rank = z.enum(RARITY_IDS);
export const forgeBody = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("craft"), type: itemType, element, rank }),
  z.strictObject({
    op: z.literal("combineParts"),
    type: itemType,
    rank,
    core: element,
  }),
  z.strictObject({
    op: z.literal("combinePieces"),
    ids: z.array(z.string().min(1).max(60)).min(2).max(8),
    element,
  }),
  z.strictObject({
    op: z.literal("refine"),
    spend: z.record(z.string().max(40), z.number().int().min(1).max(9)),
    toType: itemType,
    rank,
  }),
  z.strictObject({ op: z.literal("dismantle"), id: z.string().min(1).max(60) }),
  // shortcuts (bulk): the server plans them itself, nothing from the client is trusted
  z.strictObject({ op: z.literal("mergeAll"), rank }),
  z.strictObject({
    op: z.literal("chain"),
    maxRank: rank,
    refine: z.boolean(),
  }),
  z.strictObject({ op: z.literal("refineAll"), rank }),
  z.strictObject({
    op: z.literal("dismantleLow"),
    maxRank: rank,
    maxStars: z.number().int().min(0).max(5),
  }),
  z.strictObject({ op: z.literal("craftMax"), type: itemType, element, rank }),
]);
