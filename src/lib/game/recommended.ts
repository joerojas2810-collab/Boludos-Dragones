import { CLASS_IDS, generateCharacter } from "./characters";
import { applyGear, gearBonus, rollGear } from "./gear";
import { LEVEL_STEP, ASC_ATK_STEP, ASC_HP_STEP } from "./stage";
import { LEVELS_PER_ROUTE } from "./levels";
import { scaleStats, type Difficulty } from "./rarity";
import { createRng, hashSeed } from "./rng";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "./weapons";
import type { Stats } from "./characters";
export const statPower = (s: Pick<Stats, "hp" | "atk" | "def">) => Math.round((s.hp * (s.atk + s.def * 0.5)) / 50);
const STD_STARS = 3, STD_LEVEL = 20, SAMPLE = 12;
const stdCache = new Map<Difficulty, number>();
function standardPower(difficulty: Difficulty): number {
  const hit = stdCache.get(difficulty); if (hit !== undefined) return hit;
  let total = 0;
  for (let i = 0; i < SAMPLE; i++) {
    const rng = createRng(hashSeed(i, 4411));
    const c = generateCharacter(rng, CLASS_IDS[i % CLASS_IDS.length]);
    const pieces = GEAR_TYPES.map((type) => ({ type, rarity: difficulty, stars: 0, element: c.element, ...rollGear(rng, type, difficulty) }));
    const g = applyGear(scaleStats(c.stats, difficulty, STD_STARS, STD_LEVEL), gearBonus(pieces));
    total += statPower({ ...g, atk: g.atk + weaponAtk(difficulty, 0, CLASS_WEAPONS[c.classId][0]) });
  }
  const p = Math.round(total / SAMPLE); stdCache.set(difficulty, p); return p;
}
export function recommendedPower(difficulty: Difficulty, level: number, asc = 0): number {
  const avg = 1 + LEVEL_STEP * ((LEVELS_PER_ROUTE - 1) / 2);
  const lv = (1 + LEVEL_STEP * level) / avg;
  const ascM = (1 + ASC_HP_STEP * asc) * (1 + ASC_ATK_STEP * asc);
  const raw = standardPower(difficulty) * lv * lv * ascM;
  const step = raw >= 1000 ? 50 : raw >= 100 ? 10 : 5;
  return Math.max(step, Math.round(raw / step) * step);
}
export const recommendedPowerRange = (difficulty: Difficulty, asc = 0): [number, number] => [
  recommendedPower(difficulty, 0, asc), recommendedPower(difficulty, LEVELS_PER_ROUTE - 1, asc),
];
