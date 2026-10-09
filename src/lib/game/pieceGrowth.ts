// Piece growth (Forja > Equipo): the same model as heroes (heroFusion.ts) with pieces.
//  - a duplicate pull is a spare copy that keeps its own roll and lines (profile.copies);
//  - starUpPiece: STAR_UNITS units of material of the piece's rank = +1 star;
//  - ascendPiece: base + (ratio - 1) units + coins = the base one rank up (same type, element, roll and
//    lines; the lines the new rank adds are rolled), stars converted by STAR_CARRY, merged with an
//    owned piece of that rank (you pick which roll stays, the other becomes a copy);
//  - swapPieceRoll: the main roll trades places with a copy's.
// A unit is any same-rank piece (any type or element) or spare copy; a piece that leaves entirely
// must not be worn nor carry +N. Pure over the Profile; the server runs the same code.
import { growLines } from "./gear";
import { HERO_FUSION, STAR_CARRY, STAR_UNITS } from "./heroFusion";
import { MAX_COPIES, type Profile } from "./profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";
import { spendUnits, unitsOf, type Material, type SpendRules } from "./units";
import { weaponAtk, weaponKey, weaponName, type PieceRoll, type Weapon } from "./weapons";

// total counts the base too.
export const ASCEND: Partial<Record<RarityId, { total: number; coins: number }>> = Object.fromEntries(
  Object.entries(HERO_FUSION).map(([r, v]) => [r, { total: v!.ratio, coins: v!.coins }]),
);

export const nextRank = (r: RarityId): RarityId | null => RARITY_IDS[RARITY_IDS.indexOf(r) + 1] ?? null;

export { unitsOf };
export type { Material };

export interface PieceFusion {
  piece: Weapon; // the result (the owned piece when it merged)
  merged: boolean;
  split?: Weapon; // the base's unspent copies stay behind as a piece of the old rank
}
export type PieceGrowthResult =
  | { ok: true; profile: Profile; text: string; id: string; coins: number; fusion?: PieceFusion }
  | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

const roll = (w: { roll?: number; lines?: PieceRoll["lines"] }): PieceRoll => ({ roll: w.roll, lines: w.lines });

function withCopies(w: Weapon, copies: PieceRoll[] | undefined): Weapon {
  const out = { ...w };
  delete out.copies;
  return copies?.length ? { ...out, copies } : out;
}
// The piece with a given roll set: keeps its stars, recomputes the attack it gives.
const rolled = (w: Weapon, r: PieceRoll): Weapon => {
  const out: Weapon = { ...w, atkBonus: weaponAtk(w.rarity, w.stars, w.type, r.roll) };
  if (r.roll === undefined) delete out.roll;
  else out.roll = r.roll;
  if (r.lines) out.lines = r.lines;
  else delete out.lines;
  return out;
};

const rules = (worn: Set<string>): SpendRules<Weapon> => ({
  msg: {
    notYours: "Una de las piezas no es tuya.",
    otherRank: "Todas las piezas deben ser del mismo rango.",
    repeated: "No repitas la misma pieza en los materiales.",
    badAmount: "Cantidad de material no válida.",
    baseCopies: "La pieza base solo puede dar sus copias.",
    tooMany: "Usas más unidades de las que tiene esa pieza.",
  },
  trim: (w, copies) => withCopies(w, copies as PieceRoll[]),
  cannotLeave: (w) =>
    worn.has(w.id)
      ? "Una de las piezas de material está equipada."
      : (w.plus ?? 0) > 0
        ? "Una pieza con +N no puede usarse de material."
        : null,
});
const wornSet = (p: Profile) => new Set(Object.values(p.equipped));

// +1 star for STAR_UNITS units of material of the piece's rank.
export function starUpPiece(p: Profile, a: { baseId: string; materials: Material[] }): PieceGrowthResult {
  const base = p.weapons.find((w) => w.id === a.baseId);
  if (!base) return fail("Esa pieza no es tuya.");
  if (base.stars >= MAX_STARS) return fail("Esa pieza ya tiene el máximo de estrellas.");
  const s = spendUnits(p.weapons, base, a.materials, rules(wornSet(p)));
  if (!s.ok) return s;
  if (s.units !== STAR_UNITS) return fail(`Necesitas ${STAR_UNITS} piezas (o copias) del mismo rango.`);
  const weapons = s.items.map((w) =>
    w.id === base.id ? { ...w, stars: w.stars + 1, atkBonus: weaponAtk(w.rarity, w.stars + 1, w.type, w.roll) } : w,
  );
  return {
    ok: true,
    profile: { ...p, weapons },
    id: base.id,
    coins: 0,
    text: `${base.name} sube a ${base.stars + 1}★.`,
  };
}

// Rank-up. `rng` rolls the lines the new rank adds (the server passes a real one).
export function ascendPiece(
  p: Profile,
  a: { baseId: string; materials: Material[]; keep?: "base" | "existing" },
  rng: Rng,
): PieceGrowthResult {
  const base = p.weapons.find((w) => w.id === a.baseId);
  if (!base) return fail("Esa pieza no es tuya.");
  const rule = ASCEND[base.rarity];
  const next = nextRank(base.rarity);
  if (!rule || !next) return fail("Ese rango ya no se puede ascender.");
  const worn = wornSet(p);
  const s = spendUnits(p.weapons, base, a.materials, rules(worn));
  if (!s.ok) return s;
  if (s.units !== rule.total - 1)
    return fail(`Necesitas la pieza base y ${rule.total - 1} piezas (o copias) más del mismo rango.`);
  if (p.coins < rule.coins) return fail(`Te faltan ${rule.coins - p.coins} monedas.`);

  const mine = s.items.find((w) => w.id === base.id) ?? base; // base minus the copies it gave
  const rest = mine.copies ?? [];
  const others = s.items.filter((w) => w.id !== base.id);
  const newId = weaponKey(base.type, base.element, next);
  const target = others.find((w) => w.id === newId);
  const carried = STAR_CARRY[base.rarity]?.[base.stars] ?? 0;
  const grown = roll({ roll: base.roll, lines: growLines(rng, base.type, next, base.lines) });

  let piece: Weapon;
  let weapons: Weapon[];
  if (target) {
    const keepBase = (a.keep ?? "base") === "base";
    const stars = Math.max(target.stars, carried);
    const main = keepBase ? grown : roll(target);
    const other = keepBase ? roll(target) : roll(base);
    piece = withCopies(
      rolled({ ...target, stars }, main),
      [...(target.copies ?? []), other].slice(0, MAX_COPIES),
    );
    weapons = others.map((w) => (w.id === newId ? piece : w));
  } else {
    piece = rolled(
      {
        ...withCopies(base, undefined),
        id: newId,
        name: weaponName(base.type, base.element, next),
        rarity: next,
        stars: carried,
        plus: 0,
        plusStreak: 0,
        legacy: false,
      },
      grown,
    );
    weapons = [...others, piece];
  }
  // Unspent copies of the base stay behind as a piece of the old rank (first copy = its roll).
  let split: Weapon | undefined;
  if (rest.length) {
    split = withCopies(
      rolled({ ...base, stars: 0, plus: 0, plusStreak: 0, legacy: false }, rest[0]),
      rest.slice(1),
    );
    weapons = [...weapons, split];
  }
  // The worn base keeps its slot under its new id, unless the owned piece was already worn elsewhere.
  const equipped: Record<string, string> = {};
  const taken = new Set(Object.values(p.equipped).filter((v) => v === newId));
  for (const [k, v] of Object.entries(p.equipped)) {
    if (v !== base.id) equipped[k] = v;
    else if (!taken.size) {
      equipped[k] = newId;
      taken.add(newId);
    }
  }
  const label = RARITIES[next].label;
  return {
    ok: true,
    profile: { ...p, coins: p.coins - rule.coins, weapons, equipped },
    id: newId,
    coins: rule.coins,
    fusion: { piece, merged: !!target, split },
    text: target
      ? `${target.name} (${label}) absorbe a ${base.name}: queda con ${piece.stars}★ y ${piece.copies?.length ?? 0} ${piece.copies?.length === 1 ? "copia" : "copias"} (la tirada que no elegiste pasa a ser una copia).`
      : `${base.name} sube a rango ${label}${carried ? ` con ${carried}★` : ""}.`,
  };
}

// The main roll trades places with the roll of spare copy `index`.
export function swapPieceRoll(p: Profile, a: { id: string; index: number }): PieceGrowthResult {
  const w = p.weapons.find((x) => x.id === a.id);
  const copies = w?.copies ?? [];
  if (!w || !Number.isInteger(a.index) || a.index < 0 || a.index >= copies.length)
    return fail("Esa copia no existe.");
  const next = copies.map((c, i) => (i === a.index ? roll(w) : c));
  const swapped = withCopies(rolled(w, copies[a.index]), next);
  return {
    ok: true,
    profile: { ...p, weapons: p.weapons.map((x) => (x.id === w.id ? swapped : x)) },
    id: w.id,
    coins: 0,
    text: `${w.name} cambia de tirada.`,
  };
}
