// Coins of the dungeon levels (Run v2): nearly flat per rank (high ranks pay with
// loot), first-clear chests carry the early game, repeats pay 60% with a daily decay.
import { DUNGEON_IDS, type DungeonId } from "./rarity";

// Tune here. Target: ~2 ten-pulls a day at the steady state of a high-rank player (economy-sim.ts).
export const LEVEL_COINS: Record<DungeonId, number> = {
  f: 60,
  e: 75,
  d: 95,
  c: 120,
  b: 150,
  a: 180,
  s: 210,
  ss: 240,
  ssr: 270,
};
export const FIRST_CLEAR_CHEST: Record<DungeonId, number> = {
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
  rank: DungeonId,
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
export const firstClearChest = (rank: DungeonId, asc: number): number =>
  Math.round(FIRST_CLEAR_CHEST[rank] * (asc === 0 ? 1 : ASC_CHEST_MULT));

export const rankIndex = (rank: DungeonId) => DUNGEON_IDS.indexOf(rank);
