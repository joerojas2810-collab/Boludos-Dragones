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
// Weekly tower only (dungeon levels use levelStartBody).
export const runStartBody = z.strictObject({
  classId: z.enum(["caballero", "mago", "picaro", "clerigo"]),
  characterId: z.string().min(1).max(100).nullable(),
  tower: z.enum(["nivelado", "coleccion"]),
});
export const levelStartBody = z.strictObject({
  characterId: z.string().min(1).max(100),
  rank: z.enum(RARITY_IDS),
  level: z.number().int().min(0).max(11),
  ascension: z.number().int().min(0).max(5),
});
export const burnBody = z.strictObject({
  kind: z.enum(["hero", "piece"]),
  id: z.string().min(1).max(100),
});
export const burnManyBody = z.strictObject({
  kind: z.enum(["hero", "piece"]),
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
});
export const fuseHeroesBody = z.strictObject({
  baseId: z.string().min(1).max(100),
  materialIds: z.array(z.string().min(1).max(100)).min(2).max(9),
});
export const tutorialBody = z.strictObject({ step: z.number().int().min(0).max(7) });
export const skillBody = z.strictObject({
  characterId: z.string().min(1).max(100),
  skillId: z.string().min(1).max(30),
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
// Dungeon level: only the action log. Status, EXP and loot are decided by the replay.
export const levelFinishBody = z.strictObject({
  runId: uuidSchema,
  actions: z.array(runActionSchema).max(3000),
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
export const ascendBody = z.strictObject({
  baseId: z.string().min(1).max(100),
  materialIds: z.array(z.string().min(1).max(100)).min(2).max(5),
});
export const upgradeBody = z.strictObject({
  pieceId: z.string().min(1).max(100),
  useDado: z.boolean(),
});
