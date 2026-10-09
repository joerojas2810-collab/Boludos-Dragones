// Dungeon drops: the piece shape (RunPiece), the drop-rank rule and its one-line summary.
import type { Element } from "./elements";
import type { GearLine } from "./gear";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";
import type { WeaponType } from "./weapons";

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
export function dropRank(
  rng: Rng,
  rank: RarityId,
  upChance: number,
  decay = RANK_DECAY,
): RarityId {
  const top = RARITY_IDS.indexOf(rank);
  if (rng.chance(upChance) && top < RARITY_IDS.length - 1)
    return RARITY_IDS[top + 1];
  const weights: number[] = [];
  for (let d = 0, w = 1; d <= top; d++, w *= decay) weights.push(w); // no ** (engine determinism)
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  const d = weights.findIndex((w) => (r -= w) < 0);
  return RARITY_IDS[top - (d < 0 ? 0 : d)];
}

/**
 * Rank of one dungeon piece, anchored to the gacha: the pull odds of the ranks up to the
 * dungeon's, renormalized, so a rank-R dungeon NEVER drops above R and its own rank is as
 * rare as in a pull (S dungeon: S 3 %, A 6 %, ... F 31 %; SSR dungeon: SSR 0.5 %). `tilt` > 1
 * leans toward the top (weight x tilt^index); 1 = exactly the gacha odds.
 */
export function gachaDropRank(rng: Rng, rank: RarityId, tilt = 1): RarityId {
  const top = RARITY_IDS.indexOf(rank);
  const weights: number[] = [];
  for (let i = 0, f = 1; i <= top; i++, f *= tilt) // no ** (engine determinism)
    weights.push(RARITIES[RARITY_IDS[i]].probability * f);
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  const i = weights.findIndex((w) => (r -= w) < 0);
  return RARITY_IDS[i < 0 ? top : i];
}

// One-line description: gear shows its bonuses, a weapon its attack and effect.
