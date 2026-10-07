// Hero level and EXP (Run v2). Pure numbers; no imports so any module can use it.
// Level cap comes from stars, power from level is a small multiplier.

export const LEVEL_BASE_CAP = 20;
export const LEVEL_CAP_PER_STAR = 10;
export const LEVEL_POWER_STEP = 0.01; // +1% hp/atk/def per level above 1
export const XP_COST_FACTOR = 10; // cost of level L = XP_COST_FACTOR * (L-1)^2

export const levelCap = (stars: number) =>
  LEVEL_BASE_CAP + LEVEL_CAP_PER_STAR * stars;

export const levelMult = (level: number) =>
  1 + LEVEL_POWER_STEP * (Math.max(1, level) - 1);

// EXP needed to go from `level` to `level + 1`.
export const xpToNextLevel = (level: number) => XP_COST_FACTOR * level * level;

// Catch-up bonus: heroes far below the player's best hero level learn faster.
export const GAP_BANDS: readonly { gap: number; mult: number }[] = [
  { gap: 20, mult: 3 },
  { gap: 10, mult: 2 },
];
export function gapMult(level: number, topLevel: number): number {
  const gap = topLevel - level;
  return GAP_BANDS.find((b) => gap >= b.gap)?.mult ?? 1;
}

// Adds EXP (already multiplied by gapMult by the caller if wanted). At the cap
// the hero stops leveling and keeps no leftover EXP.
export function addHeroXp(
  hero: { level: number; xp: number },
  stars: number,
  amount: number,
): { level: number; xp: number; gained: number } {
  const cap = levelCap(stars);
  let { level, xp } = hero;
  if (level >= cap) return { level: cap, xp: 0, gained: 0 };
  xp += Math.max(0, Math.floor(amount));
  while (level < cap && xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level++;
  }
  if (level >= cap) xp = 0;
  return { level, xp, gained: level - hero.level };
}
