// Hero fusion (Forja > Héroes): HERO_FUSION[rank].ratio heroes of one rank (the base hero plus
// ratio-1 materials) + coins -> the base hero one rank higher. It keeps class, element, name,
// phrase, traits, level and skill; it spends FUSION_STARS stars (leftovers stay) and gains the
// traits the new rank grants. If a hero of that class + element + next rank is already owned, that one gets +1 star
// instead (same as a gacha duplicate). Pure over the Profile; the server runs the same code.
import { characterKey, type OwnedCharacter, type Profile } from "./profile";
import { levelCap } from "./heroLevel";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";

// Tune here. `ratio` counts the base hero too. Lots of common heroes, few rare ones: what you
// can spare shrinks with rank, so the ratio never rises. S is the top rank, so there is no S row.
// Fusing every hero you ever pull adds ~+70% S on top of the S that comes straight from pulls
// (almost all of it from A and B; S is 3% of pulls); the stars the base must spend (FUSION_STARS) are what really
// gates it. Retune here if that proves too much or too little. Coins double per rank.
export const HERO_FUSION: Partial<Record<RarityId, { ratio: number; coins: number }>> = {
  f: { ratio: 5, coins: 20 },
  e: { ratio: 5, coins: 40 },
  d: { ratio: 4, coins: 80 },
  c: { ratio: 4, coins: 160 },
  b: { ratio: 4, coins: 320 },
  a: { ratio: 4, coins: 640 },
};

// The base hero spends this many stars to rank up; any extra stars stay (4★ -> 1★, 5★ -> 2★).
export const FUSION_STARS = 3;

export interface HeroFusion {
  baseId: string;
  materialIds: string[];
  coins: number;
  rank: RarityId; // rank of the result
  hero?: OwnedCharacter; // the new hero (absent when it became a +1 star)
  starTo?: string; // id of the existing hero that got +1 star
}
export type HeroFusionResult =
  | { ok: true; profile: Profile; fusion: HeroFusion; text: string }
  | { ok: false; error: string };

const fail = (error: string): HeroFusionResult => ({ ok: false, error });
const nextRank = (r: RarityId): RarityId | null => RARITY_IDS[RARITY_IDS.indexOf(r) + 1] ?? null;


export function fuseHeroes(
  p: Profile,
  a: { baseId: string; materialIds: string[] },
): HeroFusionResult {
  const base = p.characters.find((c) => c.id === a.baseId);
  if (!base) return fail("Ese héroe no es tuyo.");
  const rule = HERO_FUSION[base.rarity];
  const next = nextRank(base.rarity);
  if (!rule || !next) return fail("Ese rango ya no se puede fusionar.");
  if (base.stars < FUSION_STARS)
    return fail(`El héroe base necesita ${FUSION_STARS}★ (tiene ${base.stars}★).`);
  const ids = Array.from(new Set(a.materialIds));
  if (ids.length !== a.materialIds.length || ids.includes(base.id))
    return fail("Los héroes de material deben ser distintos entre sí y del héroe base.");
  if (ids.length !== rule.ratio - 1)
    return fail(`Necesitas el héroe base y ${rule.ratio - 1} héroes más del mismo rango.`);
  const mats = ids.map((id) => p.characters.find((c) => c.id === id));
  if (mats.some((m) => !m)) return fail("Uno de los héroes no es tuyo.");
  if ((mats as OwnedCharacter[]).some((m) => m.rarity !== base.rarity))
    return fail("Todos los héroes deben ser del mismo rango.");
  if (p.coins < rule.coins) return fail(`Te faltan ${rule.coins - p.coins} monedas.`);

  const newId = characterKey(base.classId, base.element, next);
  const existing = p.characters.find((c) => c.id === newId);
  if (existing && existing.stars >= MAX_STARS)
    return fail("Ya tienes a ese héroe con el máximo de estrellas.");

  const gone = new Set([base.id, ...ids]);
  let hero: OwnedCharacter | undefined;
  let characters = p.characters.filter((c) => !gone.has(c.id));
  if (existing) {
    characters = characters.map((c) => (c.id === newId ? { ...c, stars: c.stars + 1 } : c));
  } else {
    const stars = base.stars - FUSION_STARS;
    const cap = levelCap(stars);
    const capped = base.level > cap;
    hero = {
      ...base,
      id: newId,
      rarity: next,
      stars,
      level: Math.min(base.level, cap),
      xp: capped ? 0 : base.xp,
      legacy: false,
    };
    characters = [...characters, hero];
  }
  // Gear follows the base hero to its new id; materials (and a star-only fusion) unequip.
  const equipped: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.equipped)) {
    const owner = k.split("|")[0];
    if (owner === base.id && hero) equipped[hero.id + k.slice(owner.length)] = v;
    else if (!gone.has(owner)) equipped[k] = v;
  }
  const out: Profile = { ...p, coins: p.coins - rule.coins, characters, equipped };
  const label = RARITIES[next].label;
  return {
    ok: true,
    profile: out,
    fusion: { baseId: base.id, materialIds: ids, coins: rule.coins, rank: next, hero, starTo: existing?.id },
    text: existing
      ? `Fusionas ${rule.ratio} héroes: ${existing.name} ya existía en ${label} y sube a ${existing.stars + 1}★.`
      : `Fusionas ${rule.ratio} héroes: ${base.name} sube a rango ${label}.`,
  };
}
