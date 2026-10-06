// Loot found during a run (chests, bosses, merchant). Worn pieces live in
// Run.loot for the run; every piece taken also goes to Run.bag and reaches the
// collection only once a defeated boss secures it (Run.secured, see run.ts).
import type { Character } from "./characters";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import {
  applyGearDelta,
  combineGear,
  gearBonus,
  gearLine,
  NO_GEAR,
} from "./gear";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import {
  CLASS_WEAPONS,
  GEAR_TYPES,
  WEAPON_TYPE_DATA,
  isGearType,
  slotOf,
  weaponAtk,
  weaponSecondary,
  type Slot,
  type WeaponType,
} from "./weapons";
import type { ClassId } from "./characters";

export interface RunPiece {
  type: WeaponType;
  element: Element;
  rarity: RarityId;
  name: string;
}
export type RunLoot = Partial<Record<Slot, RunPiece>>;

// Tune here.
export const LOOT_CHEST_CHANCE = 0.5; // a chest also holds a piece
export const LOOT_BOSS_CHOICES = 2; // boss drop: pick 1 of N (or skip)
export const LOOT_FLOORS_PER_RANK = 8; // best possible rank rises 1 step per N floors
export const LOOT_BOSS_RANK_BONUS = 1;

export const RANK_DECAY = 0.5; // each rank below is this much as likely as the one above
export const UP_CHANCE = 0.1; // a drop one rank ABOVE the dungeon's
export const FINAL_UP_CHANCE = 0.25; // same, for the final boss

// Rank of one dungeon drop: the dungeon's rank or lower (geometric), rarely one above.
export function dropRank(rng: Rng, rank: RarityId, upChance: number): RarityId {
  const top = RARITY_IDS.indexOf(rank);
  if (rng.chance(upChance) && top < RARITY_IDS.length - 1)
    return RARITY_IDS[top + 1];
  const weights: number[] = [];
  for (let d = 0, w = 1; d <= top; d++, w *= RANK_DECAY) weights.push(w); // no ** (engine determinism)
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  const d = weights.findIndex((w) => (r -= w) < 0);
  return RARITY_IDS[top - (d < 0 ? 0 : d)];
}

// Dungeon runs: dropRank. Legacy runs (rank null): rank skews low (r*r) and the
// ceiling grows with the floor.
export function lootRank(
  rng: Rng,
  floor: number,
  bonus = 0,
  rank?: RarityId | null,
): RarityId {
  if (rank) return dropRank(rng, rank, bonus > 0 ? FINAL_UP_CHANCE : UP_CHANCE);
  const top = Math.min(
    RARITY_IDS.length - 1,
    Math.floor(floor / LOOT_FLOORS_PER_RANK),
  );
  const r = rng.next();
  const idx = Math.min(
    RARITY_IDS.length - 1,
    Math.floor(r * r * (top + 1)) + bonus,
  );
  return RARITY_IDS[idx];
}

export function rollPiece(
  rng: Rng,
  classId: ClassId,
  floor: number,
  bonus = 0,
  rank?: RarityId | null,
): RunPiece {
  const slot = rng.pick<Slot>(["arma", ...GEAR_TYPES]);
  const type: WeaponType =
    slot === "arma" ? rng.pick(CLASS_WEAPONS[classId]) : slot;
  const element = rng.pick(ELEMENTS);
  return {
    type,
    element,
    rarity: lootRank(rng, floor, bonus, rank),
    name: `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]}`,
  };
}

export function lootOffer(
  seed: number,
  floor: number,
  classId: ClassId,
  count: number,
  bonus: number,
  salt: number,
  rank?: RarityId | null,
): RunPiece[] {
  const rng = createRng(hashSeed(seed, floor, salt));
  return Array.from({ length: count }, () =>
    rollPiece(rng, classId, floor, bonus, rank),
  );
}

export const samePiece = (a: RunPiece | undefined, b: RunPiece) =>
  !!a && a.type === b.type && a.element === b.element && a.rarity === b.rarity;

// Hero with its run loot applied on top of the (already geared) stats.
export function withLoot(hero: Character, loot: RunLoot): Character {
  const pieces = Object.values(loot);
  if (pieces.length === 0) return hero;
  const base = hero.gear ?? NO_GEAR;
  const total = combineGear(
    base,
    gearBonus(
      pieces.filter((p) => isGearType(p.type)).map((p) => ({ ...p, stars: 0 })),
    ),
  );
  let stats = applyGearDelta(hero.stats, base, total);
  let weapon = hero.weapon;
  const w = loot.arma;
  if (w) {
    // ponytail: the collection weapon's secondary effect (if any) stays too.
    const sec = weaponSecondary(w.type);
    const atkBonus = weaponAtk(w.rarity, 0, w.type);
    stats = {
      ...stats,
      atk:
        Math.round((stats.atk - (hero.weapon?.atkBonus ?? 0) + atkBonus) * 10) /
        10,
      accuracy: Math.round((stats.accuracy + sec.accuracy) * 1000) / 1000,
      crit: Math.min(0.6, Math.max(0, stats.crit + sec.crit)),
      speed: Math.round(stats.speed * sec.speedMult * 10) / 10,
    };
    weapon = { element: w.element, atkBonus };
  }
  return { ...hero, stats, weapon, gear: total };
}

export const pieceSlot = (p: RunPiece): Slot => slotOf(p.type);

// One-line description: gear shows its bonuses, a weapon its attack and effect.
export function pieceSummary(p: RunPiece): string {
  const info = WEAPON_TYPE_DATA[p.type];
  const worn = { type: p.type, rarity: p.rarity, stars: 0 };
  return isGearType(p.type)
    ? `${info.label} · rango ${RARITIES[p.rarity].label}: ${gearLine(worn)}`
    : `${info.label} · rango ${RARITIES[p.rarity].label}: ATQ +${weaponAtk(p.rarity, 0, p.type)} · ${info.description}`;
}
