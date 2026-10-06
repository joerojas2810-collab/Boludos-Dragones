import { z } from "zod";
import { isPieceKey } from "../game/market";
import { UPGRADES, type UpgradeId } from "../game/progression";
import { SKILL_IDS, type SkillId } from "../game/skills";
import { RELIC_IDS } from "../game/relics";

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
});
export const spendFragmentsBody = z.strictObject({
  characterId: z.string().min(1).max(100),
});
export const runStartBody = z.strictObject({
  classId: z.enum(["caballero", "mago", "picaro", "clerigo"]),
  characterId: z.string().min(1).max(100).nullable(),
});

const id = (max: number) => z.string().min(1).max(max);
export const runActionSchema = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("door"), i: z.number().int().min(0).max(2) }),
  z.strictObject({
    t: z.literal("act"),
    a: z.enum(["attack1", "attack2", "attack3", "defend", "flee"]),
    target: z.number().int().min(0).max(2).optional(),
  }),
  z.strictObject({ t: z.literal("auto") }),
  z.strictObject({
    t: z.literal("skill"),
    id: z.enum(SKILL_IDS as [SkillId, ...SkillId[]]),
  }),
  z.strictObject({ t: z.literal("fin") }),
  z.strictObject({
    t: z.literal("pick"),
    id: z.enum(Object.keys(UPGRADES) as [UpgradeId, ...UpgradeId[]]),
  }),
  z.strictObject({
    t: z.literal("relic"),
    id: z.enum(
      RELIC_IDS as [
        (typeof RELIC_IDS)[number],
        ...(typeof RELIC_IDS)[number][],
      ],
    ),
  }),
  z.strictObject({ t: z.literal("buy"), id: id(20) }),
  z.strictObject({ t: z.literal("event"), i: z.number().int().min(0).max(5) }),
  z.strictObject({ t: z.literal("leave") }),
]);
export const runSubmitBody = z.strictObject({
  runId: uuidSchema,
  actions: z.array(runActionSchema).max(6000),
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
  })
  .refine(
    (b) =>
      isPieceKey(b.kind, b.give) &&
      (b.want === null || (isPieceKey(b.kind, b.want) && b.want !== b.give)),
  );
export const marketIdBody = z.strictObject({ offerId: uuidSchema });
