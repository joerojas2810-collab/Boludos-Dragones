// Ascender (docs/FORJA_V9.md): a base piece + materials of the SAME rank (any type, any element, not
// worn) + coins -> the base piece one rank up (same type, element and name; 0 stars, +0, new roll).
// Same table as hero fusion. Pure over the Profile; the server runs the same code and persists it.
import { rollPiece } from "./gear";
import { HERO_FUSION } from "./heroFusion";
import { grantPiece, type Profile } from "./profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { weaponKey } from "./weapons";

// total counts the base too.
export const ASCEND: Partial<Record<RarityId, { total: number; coins: number }>> = Object.fromEntries(
  Object.entries(HERO_FUSION).map(([r, v]) => [r, { total: v!.ratio, coins: v!.coins }]),
);

export const nextRank = (r: RarityId): RarityId | null => RARITY_IDS[RARITY_IDS.indexOf(r) + 1] ?? null;

export type AscendResult =
  | { ok: true; profile: Profile; message: string; coins: number; newId: string }
  | { ok: false; error: string };
const fail = (error: string): AscendResult => ({ ok: false, error });

export function ascendPiece(
  p: Profile,
  baseId: string,
  materialIds: string[],
  rng: Rng = createRng(hashSeed(5, p.coins, p.weapons.length, p.runsPlayed)),
): AscendResult {
  const base = p.weapons.find((w) => w.id === baseId);
  if (!base) return fail("Esa pieza no es tuya.");
  const rule = ASCEND[base.rarity];
  const next = nextRank(base.rarity);
  if (!rule || !next) return fail("Ese rango ya no se puede ascender.");
  const ids = Array.from(new Set(materialIds));
  if (ids.length !== materialIds.length || ids.includes(baseId))
    return fail("Las piezas de material deben ser distintas entre sí y de la base.");
  if (ids.length !== rule.total - 1)
    return fail(`Necesitas la pieza base y ${rule.total - 1} más del mismo rango.`);
  const mats = ids.map((id) => p.weapons.find((w) => w.id === id));
  if (mats.some((m) => !m)) return fail("Una de las piezas no es tuya.");
  if (mats.some((m) => m!.rarity !== base.rarity)) return fail("Todas las piezas deben ser del mismo rango.");
  const worn = new Set(Object.values(p.equipped));
  if (mats.some((m) => (m!.plus ?? 0) > 0)) return fail("Una pieza con +N no puede usarse de material.");
  if (ids.some((id) => worn.has(id))) return fail("Una de las piezas de material está equipada.");
  if (p.coins < rule.coins) return fail(`Te faltan ${rule.coins - p.coins} monedas.`);

  const newId = weaponKey(base.type, base.element, next);
  const existing = p.weapons.find((w) => w.id === newId);
  if (existing && existing.stars >= MAX_STARS) return fail("Ya tienes esa pieza con el máximo de estrellas.");
  if (existing && worn.has(baseId)) return fail("Desequipa la pieza base: ya tienes esa pieza en el rango siguiente.");

  const gone = new Set([baseId, ...ids]);
  let out: Profile = { ...p, coins: p.coins - rule.coins, weapons: p.weapons.filter((w) => !gone.has(w.id)) };
  out = grantPiece(
    out,
    { type: base.type, element: base.element, rarity: next, name: base.name, ...rollPiece(rng, base.type, next) },
    false,
  );
  // The worn base keeps its place under its new id.
  const equipped: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.equipped)) equipped[k] = v === baseId ? newId : v;
  out = { ...out, equipped };
  return {
    ok: true,
    profile: out,
    coins: rule.coins,
    newId,
    message: existing
      ? `Ascendes ${base.name}: ya tenías esa pieza en ${RARITIES[next].label}, sube a ${existing.stars + 1}★.`
      : `Ascendes ${base.name} a rango ${RARITIES[next].label}.`,
  };
}
