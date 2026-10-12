// Bridge values for the F-S difficulty scale. 6a-1 intentionally changes no payouts.
import { RARITY_IDS, type Difficulty } from "./rarity";
export const LEVEL_COINS: Record<Difficulty, number> = {
  f: 60, e: 75, d: 95, c: 120, b: 150, a: 180, s: 210,
};
export const FIRST_CLEAR_CHEST: Record<Difficulty, number> = {
  f: 1000, e: 1600, d: 2500, c: 1200, b: 1500, a: 2000, s: 2500,
};
export const ASC_CHEST_MULT = 0.5;
export const ASC_COIN_STEP = 0.04;
export const REPEAT_COIN_MULT = 0.6;
export const DAY_LEVEL_TIERS = [
  { upTo: 20, mult: 1 }, { upTo: 40, mult: 0.5 }, { upTo: 80, mult: 0.2 },
] as const;
export const DAY_LEVEL_FLOOR = 0.1;
export const levelDecay = (nthRepeatToday: number): number =>
  DAY_LEVEL_TIERS.find((tier) => nthRepeatToday <= tier.upTo)?.mult ?? DAY_LEVEL_FLOOR;
export function levelCoins(difficulty: Difficulty, asc: number, repeat: boolean, nthRepeatToday = 1): number {
  const base = LEVEL_COINS[difficulty] * (1 + ASC_COIN_STEP * asc);
  const decay = DAY_LEVEL_TIERS.find((tier) => nthRepeatToday <= tier.upTo)?.mult ?? DAY_LEVEL_FLOOR;
  return Math.round(repeat ? base * REPEAT_COIN_MULT * decay : base);
}
export const firstClearChest = (difficulty: Difficulty, asc: number): number =>
  Math.round(FIRST_CLEAR_CHEST[difficulty] * (asc === 0 ? 1 : ASC_CHEST_MULT));
export const rankIndex = (difficulty: Difficulty) => RARITY_IDS.indexOf(difficulty);
