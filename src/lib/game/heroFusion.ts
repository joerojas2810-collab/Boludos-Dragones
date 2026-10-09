// Hero growth (Forja > Héroes). A hero is class + element + rank and grows on two axes:
//  - stars (starUpHero): STAR_UNITS units of material of the hero's own rank = +1 star;
//  - rank (fuseHeroes): HERO_FUSION[rank].ratio - 1 units of material of that rank + coins = the
//    hero one rank higher (same class, element, name, trait, skill, level), its stars converted by
//    STAR_CARRY so stars bought at a cheap rank never skip the price of the higher one.
// A unit of material is any hero of the rank or any spare copy (profile.copies): a hero with c
// copies holds c + 1 units, the base hero itself only gives its copies. Copies keep the trait they
// rolled; swapTrait makes one of them the main trait. Pure over the Profile; the server runs the same code.
import { characterKey, MAX_COPIES, type OwnedCharacter, type Profile } from "./profile";
import { levelCap } from "./heroLevel";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";

// Tune here. `ratio` counts the base hero too. Lots of common heroes, few rare ones: what you
// can spare shrinks with rank, so the ratio never rises. S is the top rank, so there is no S row.
// Fusing every hero you ever pull adds ~+78% S on top of the S that comes straight from pulls
// (the theoretical ceiling: it burns the whole collection). Coins double per rank.
export const HERO_FUSION: Partial<Record<RarityId, { ratio: number; coins: number }>> = {
  f: { ratio: 5, coins: 20 },
  e: { ratio: 5, coins: 40 },
  d: { ratio: 4, coins: 80 },
  c: { ratio: 4, coins: 160 },
  b: { ratio: 4, coins: 320 },
  a: { ratio: 4, coins: 640 },
};

// Units of material per star. 3 keeps a star about as dear (in pulls) as a rank-up of the same rank.
export const STAR_UNITS = 3;

// Stars a hero keeps when it ranks up from the key rank, indexed by its stars (0..5). A star is
// worth STAR_UNITS heroes of its rank and the next rank is rarer, so the same value is fewer stars
// (the rarity ratio, rounded down: 5★ at F reaches S as 0★, no shortcut around the price of S).
export const STAR_CARRY: Partial<Record<RarityId, readonly number[]>> = {
  f: [0, 0, 1, 2, 2, 3],
  e: [0, 0, 1, 2, 2, 3],
  d: [0, 0, 1, 2, 2, 3],
  c: [0, 0, 1, 2, 3, 3],
  b: [0, 0, 1, 2, 2, 3],
  a: [0, 0, 1, 1, 2, 2],
};

// `n` units taken from hero `id` (its copies first; the hero leaves when all its units are used).
export interface Material {
  id: string;
  n: number;
}
export interface HeroFusion {
  baseId: string;
  materials: Material[];
  coins: number;
  rank: RarityId; // rank of the result
  hero: OwnedCharacter; // the result (a merged hero when one of that rank was already owned)
  merged: boolean;
  split?: OwnedCharacter; // the base's unspent copies stay behind as a hero of the old rank
}
export type HeroFusionResult =
  | { ok: true; profile: Profile; fusion: HeroFusion; text: string }
  | { ok: false; error: string };
export type HeroGrowthResult =
  | { ok: true; profile: Profile; text: string }
  | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const nextRank = (r: RarityId): RarityId | null => RARITY_IDS[RARITY_IDS.indexOf(r) + 1] ?? null;
export const unitsOf = (c: OwnedCharacter) => 1 + (c.copies?.length ?? 0);

function withCopies(c: OwnedCharacter, copies: OwnedCharacter["copies"]): OwnedCharacter {
  const out = { ...c };
  delete out.copies;
  return copies?.length ? { ...out, copies } : out;
}

type Spent = { ok: true; characters: OwnedCharacter[]; units: number } | { ok: false; error: string };

// Takes the materials out of the collection and counts their units.
function spend(characters: OwnedCharacter[], base: OwnedCharacter, mats: Material[]): Spent {
  if (new Set(mats.map((m) => m.id)).size !== mats.length)
    return fail("No repitas el mismo héroe en los materiales.");
  let out = characters;
  let units = 0;
  for (const m of mats) {
    const h = out.find((c) => c.id === m.id);
    if (!h) return fail("Uno de los héroes no es tuyo.");
    if (h.rarity !== base.rarity) return fail("Todos los héroes deben ser del mismo rango.");
    if (!Number.isInteger(m.n) || m.n < 1) return fail("Cantidad de material no válida.");
    const copies = h.copies ?? [];
    if (m.n > (h.id === base.id ? copies.length : copies.length + 1))
      return fail(
        h.id === base.id
          ? "El héroe base solo puede dar sus copias."
          : "Usas más unidades de las que tiene ese héroe.",
      );
    units += m.n;
    out =
      m.n > copies.length
        ? out.filter((c) => c.id !== h.id)
        : out.map((c) => (c.id === h.id ? withCopies(c, copies.slice(0, copies.length - m.n)) : c));
  }
  return { ok: true, characters: out, units };
}

// +1 star for STAR_UNITS units of material of the hero's rank.
export function starUpHero(
  p: Profile,
  a: { baseId: string; materials: Material[] },
): HeroGrowthResult {
  const base = p.characters.find((c) => c.id === a.baseId);
  if (!base) return fail("Ese héroe no es tuyo.");
  if (base.stars >= MAX_STARS) return fail("Ese héroe ya tiene el máximo de estrellas.");
  const s = spend(p.characters, base, a.materials);
  if (!s.ok) return s;
  if (s.units !== STAR_UNITS)
    return fail(`Necesitas ${STAR_UNITS} héroes (o copias) del mismo rango.`);
  const characters = s.characters.map((c) => (c.id === base.id ? { ...c, stars: c.stars + 1 } : c));
  const equipped = Object.fromEntries(
    Object.entries(p.equipped).filter(([k]) => characters.some((c) => c.id === k.split("|")[0])),
  );
  return {
    ok: true,
    profile: { ...p, characters, equipped },
    text: `${base.name} sube a ${base.stars + 1}★.`,
  };
}

// Rank-up. If a hero of the next rank (same class + element) is already owned the two merge:
// `keep` picks which trait stays as the main one (the other becomes a copy), stars are the higher
// of the two, the owned hero keeps its level and gear.
export function fuseHeroes(
  p: Profile,
  a: { baseId: string; materials: Material[]; keep?: "base" | "existing" },
): HeroFusionResult {
  const base = p.characters.find((c) => c.id === a.baseId);
  if (!base) return fail("Ese héroe no es tuyo.");
  const rule = HERO_FUSION[base.rarity];
  const next = nextRank(base.rarity);
  if (!rule || !next) return fail("Ese rango ya no se puede fusionar.");
  const s = spend(p.characters, base, a.materials);
  if (!s.ok) return s;
  if (s.units !== rule.ratio - 1)
    return fail(`Necesitas el héroe base y ${rule.ratio - 1} héroes (o copias) más del mismo rango.`);
  if (p.coins < rule.coins) return fail(`Te faltan ${rule.coins - p.coins} monedas.`);

  const mine = s.characters.find((c) => c.id === base.id) ?? base; // base minus the copies it gave
  const rest = mine.copies ?? [];
  const others = s.characters.filter((c) => c.id !== base.id);
  const newId = characterKey(base.classId, base.element, next);
  const target = others.find((c) => c.id === newId);
  const carried = STAR_CARRY[base.rarity]?.[base.stars] ?? 0;

  let hero: OwnedCharacter;
  let characters: OwnedCharacter[];
  if (target) {
    const keepBase = (a.keep ?? "base") === "base";
    hero = withCopies(
      { ...target, stars: Math.max(target.stars, carried), traits: keepBase ? base.traits : target.traits },
      [...(target.copies ?? []), ...(keepBase ? target.traits : base.traits)].slice(0, MAX_COPIES),
    );
    characters = others.map((c) => (c.id === newId ? hero : c));
  } else {
    const cap = levelCap(carried);
    hero = withCopies(
      {
        ...base,
        id: newId,
        rarity: next,
        stars: carried,
        level: Math.min(base.level, cap),
        xp: base.level > cap ? 0 : base.xp,
        legacy: false,
      },
      undefined,
    );
    characters = [...others, hero];
  }
  // Unspent copies of the base stay behind as a hero of the old rank (first copy = its trait).
  let split: OwnedCharacter | undefined;
  if (rest.length) {
    split = withCopies(
      { ...base, stars: 0, level: 1, xp: 0, legacy: false, traits: [rest[0]] },
      rest.slice(1),
    );
    characters = [...characters, split];
  }
  // Gear follows the base hero to its new id (a merge keeps the owned hero's own gear).
  const equipped: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.equipped)) {
    const owner = k.split("|")[0];
    if (owner === base.id) {
      if (!target) equipped[hero.id + k.slice(owner.length)] = v;
    } else if (characters.some((c) => c.id === owner)) equipped[k] = v;
  }
  const label = RARITIES[next].label;
  return {
    ok: true,
    profile: { ...p, coins: p.coins - rule.coins, characters, equipped },
    fusion: { baseId: base.id, materials: a.materials, coins: rule.coins, rank: next, hero, merged: !!target, split },
    text: target
      ? `${target.name} (${label}) absorbe a ${base.name}: ${hero.stars}★.`
      : `${base.name} sube a rango ${label}${carried ? ` con ${carried}★` : ""}.`,
  };
}

// The main trait trades places with the trait of spare copy `index`.
export function swapTrait(p: Profile, a: { id: string; index: number }): HeroGrowthResult {
  const h = p.characters.find((c) => c.id === a.id);
  const copies = h?.copies ?? [];
  if (!h || !Number.isInteger(a.index) || a.index < 0 || a.index >= copies.length)
    return fail("Esa copia no existe.");
  const next = copies.map((t, i) => (i === a.index ? h.traits[0] : t));
  const swapped = { ...withCopies(h, next), traits: [copies[a.index]] };
  return {
    ok: true,
    profile: { ...p, characters: p.characters.map((c) => (c.id === h.id ? swapped : c)) },
    text: `${h.name} cambia de rasgo.`,
  };
}
