// Dungeon drops: the piece shape (RunPiece), the drop-rank rule and its one-line summary.
import type { Element } from "./elements";
import { type GearLine, gearLine } from "./gear";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";
import {
  WEAPON_TYPE_DATA,
  isGearType,
  weaponAtk,
  type WeaponType,
} from "./weapons";

export interface RunPiece {
  type: WeaponType;
  element: Element;
  rarity: RarityId;
  name: string;
  roll?: number; // +-15% roll and extra lines (gear.rollGear)
  lines?: GearLine[];
}
export const RANK_DECAY = 0.5; // each rank below is this much as likely as the one above
export const UP_CHANCE = 0.1; // a drop one rank ABOVE the dungeon's

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

// One-line description: gear shows its bonuses, a weapon its attack and effect.
export function pieceSummary(p: RunPiece): string {
  const info = WEAPON_TYPE_DATA[p.type];
  const worn = { type: p.type, rarity: p.rarity, stars: 0 };
  return isGearType(p.type)
    ? `${info.label} · rango ${RARITIES[p.rarity].label}: ${gearLine(worn)}`
    : `${info.label} · rango ${RARITIES[p.rarity].label}: ATQ +${weaponAtk(p.rarity, 0, p.type)} · ${info.description}`;
}
