// Coins of the dungeon levels (Run v2): nearly flat per rank (high ranks pay with
// loot), first-clear chests carry the early game, repeats pay 60% with a daily decay.
import { RARITY_IDS, type RarityId } from "./rarity";

// Tune here (starting values, economy-sim.ts scenario B).
export const LEVEL_COINS: Record<RarityId, number> = {
  f: 25,
  e: 25,
  d: 26,
  c: 27,
  b: 28,
  a: 30,
  s: 32,
  ss: 34,
  ssr: 36,
};
export const FIRST_CLEAR_CHEST: Record<RarityId, number> = {
  f: 1000,
  e: 1600,
  d: 2500,
  c: 1200,
  b: 1500,
  a: 2000,
  s: 2500,
  ss: 3000,
  ssr: 4000,
};
export const ASC_CHEST_MULT = 0.5; // each new ascension level: 50% of the chest, flat
export const ASC_COIN_STEP = 0.2; // level coins per ascension level
export const REPEAT_COIN_MULT = 0.6;

// Daily decay by repeated levels played today (a new level is never decayed).
export const DAY_LEVEL_TIERS = [
  { upTo: 20, mult: 1 },
  { upTo: 40, mult: 0.5 },
  { upTo: 80, mult: 0.2 },
] as const;
export const DAY_LEVEL_FLOOR = 0.1;
export const levelDecay = (nthRepeatToday: number): number =>
  DAY_LEVEL_TIERS.find((t) => nthRepeatToday <= t.upTo)?.mult ?? DAY_LEVEL_FLOOR;

// Coins of clearing one level. nthRepeatToday only matters when repeat.
export function levelCoins(
  rank: RarityId,
  asc: number,
  repeat: boolean,
  nthRepeatToday = 1,
): number {
  const base = LEVEL_COINS[rank] * (1 + ASC_COIN_STEP * asc);
  return Math.round(
    repeat ? base * REPEAT_COIN_MULT * levelDecay(nthRepeatToday) : base,
  );
}

// One-off chest when the LAST level of a dungeon is cleared for the first time at
// an ascension (asc 0: the full chest, later ones 50% flat).
export const firstClearChest = (rank: RarityId, asc: number): number =>
  Math.round(FIRST_CLEAR_CHEST[rank] * (asc === 0 ? 1 : ASC_CHEST_MULT));

export const rankIndex = (rank: RarityId) => RARITY_IDS.indexOf(rank);
