// Diminishing returns on run coins by how many runs the player has banked today
// (game day, see streak.ts). Never a hard cap: late runs pay less but keep paying.
// Tune here.
export const DAY_PAY_TIERS = [
  { upTo: 10, mult: 1 },
  { upTo: 30, mult: 0.5 },
  { upTo: 60, mult: 0.2 },
] as const;
export const DAY_PAY_FLOOR = 0.1; // run 61 and beyond

/** Pay multiplier of the Nth run of the day (1-based). */
export const dayPayMult = (runIndex: number): number =>
  DAY_PAY_TIERS.find((t) => runIndex <= t.upTo)?.mult ?? DAY_PAY_FLOOR;
