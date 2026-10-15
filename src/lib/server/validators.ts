import { z } from "zod";
import { isFairTrade, isPieceKey } from "../game/market";
import { RARITY_IDS } from "../game/rarity";
import { ROUTE_IDS } from "../game/levels";
import { SLOTS } from "../game/weapons";
import { ELEMENTS } from "../game/elements";
import { CLASS_IDS } from "../game/characters";
import { SKILL_IDS } from "../game/skills";

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
// Two equipped skills. Shape only: unknown ids, other-class, duplicate and locked skills are
// rejected by the services with loadoutError (a useful Spanish message), against server-side mastery.
export const loadoutSchema = z.tuple([z.string().max(40), z.string().max(40)]);
// Weekly tower only (dungeon levels use levelStartBody).
export const runStartBody = z.strictObject({
  classId: z.enum(["caballero", "mago", "picaro", "clerigo", "berserker"]),
  characterId: z.string().min(1).max(100).nullable(),
  tower: z.enum(["nivelado", "coleccion"]),
  element: z.enum(ELEMENTS).optional(),
  loadout: loadoutSchema.optional(), // omitted: the server uses the saved selection
});
export const levelStartBody = z.strictObject({
  characterId: z.string().min(1).max(100),
  route: z.enum(ROUTE_IDS),
  difficulty: z.enum(RARITY_IDS),
  level: z.number().int().min(0).max(3),
  ascension: z.number().int().min(0).max(5),
  loadout: loadoutSchema.optional(),
});
// Saves a skill selection: per owned hero (collection) or per class (nivelado).
export const loadoutSaveBody = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("coleccion"), key: z.string().min(1).max(60), loadout: loadoutSchema }),
  z.strictObject({ mode: z.literal("nivelado"), classId: z.enum(CLASS_IDS), loadout: loadoutSchema }),
]);
const heroMaterial = z.strictObject({ id: z.string().min(1).max(100), n: z.number().int().min(1).max(51) });
export const fuseHeroesBody = z.strictObject({
  baseId: z.string().min(1).max(100),
  materials: z.array(heroMaterial).min(1).max(9),
  keep: z.enum(["base", "existing"]).optional(),
});
export const starUpHeroBody = z.strictObject({
  baseId: z.string().min(1).max(100),
  materials: z.array(heroMaterial).min(1).max(9),
});
export const swapCopyBody = z.strictObject({
  heroId: z.string().min(1).max(100),
  index: z.number().int().min(0).max(49),
});
export const tutorialBody = z.strictObject({ step: z.number().int().min(0).max(7) });
export const runActionSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("act"),
    a: z.enum(["attack1", "defend", ...SKILL_IDS]),
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
// Dungeon level: fights won. Status, EXP and loot are derived on the server (no replay);
// pace and caps keep scripts honest.
export const levelFinishBody = z.strictObject({
  runId: uuidSchema,
  wins: z.number().int().min(0).max(20),
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
  materials: z.array(heroMaterial).min(1).max(9),
  keep: z.enum(["base", "existing"]).optional(),
});
export const starUpPieceBody = z.strictObject({
  baseId: z.string().min(1).max(100),
  materials: z.array(heroMaterial).min(1).max(9),
});
export const swapRollBody = z.strictObject({
  pieceId: z.string().min(1).max(100),
  index: z.number().int().min(0).max(49),
});
export const upgradeBody = z.strictObject({
  pieceId: z.string().min(1).max(100),
  useDado: z.boolean(),
});

// ---- tower expedition (docs/torre/03) ----
// Shape only: the reducer decides legality. `mode` stays a free string here so an unknown value gets the
// recovery-friendly invalid_mode error from the service instead of a generic 400.
const expBase = { actionId: z.string().min(1).max(64), expectedRevision: z.number().int().min(0).max(10_000_000) };
const id = z.string().min(1).max(40);
const slot = z.number().int().min(0).max(5);
const expAction = z.discriminatedUnion("type", [
  z.strictObject({ ...expBase, type: z.literal("begin") }),
  z.strictObject({ ...expBase, type: z.literal("set_loadout"), loadout: z.array(z.string().max(40)).max(4) }),
  z.strictObject({ ...expBase, type: z.literal("choose_route"), optionId: id }),
  z.strictObject({ ...expBase, type: z.literal("combat_action"), a: id, target: z.number().int().min(0).max(8).optional() }),
  z.strictObject({ ...expBase, type: z.literal("combat_auto") }),
  z.strictObject({ ...expBase, type: z.literal("choose_relic"), offerId: id, optionId: id, replaceSlot: slot.optional() }),
  z.strictObject({ ...expBase, type: z.literal("decline_relic"), offerId: id }),
  z.strictObject({ ...expBase, type: z.literal("buy"), itemId: id, replaceSlot: slot.optional() }),
  z.strictObject({ ...expBase, type: z.literal("choose_event"), optionId: z.enum(["a", "b"]), relicId: id.optional(), replaceSlot: slot.optional() }),
  z.strictObject({ ...expBase, type: z.literal("choose_rest"), optionId: z.enum(["heal", "fragments"]) }),
  z.strictObject({ ...expBase, type: z.literal("choose_sanctuary"), optionId: z.enum(["heal", "upgrade", "fragments"]), relicId: id.optional() }),
  z.strictObject({ ...expBase, type: z.literal("continue") }),
  z.strictObject({ ...expBase, type: z.literal("suspend") }),
  z.strictObject({ ...expBase, type: z.literal("retire") }),
]);
export const expeditionStartBody = z.strictObject({
  mode: z.string().max(32),
  characterId: z.string().min(1).max(100).optional(),
  classId: z.string().max(20).optional(),
  element: z.string().max(20).optional(),
  loadout: loadoutSchema.optional(),
});
export const expeditionActBody = z.strictObject({
  mode: z.string().max(32),
  actions: z.array(expAction).min(1).max(256),
});
