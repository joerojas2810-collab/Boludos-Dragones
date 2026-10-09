import { CLASS_IDS, generateCharacter } from "./characters";
import { applyGear, gearBonus, rollGear } from "./gear";
import { LEVEL_STEP, ASC_ATK_STEP, ASC_HP_STEP } from "./stage";
import { LEVELS_PER_RANK } from "./levels";
import { itemRankOf, scaleStats, type DungeonId } from "./rarity";
import { createRng, hashSeed } from "./rng";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "./weapons";
import type { Stats } from "./characters";

// Single number to compare heroes (and levels): effective hp x (atk + half def).
export const statPower = (s: Pick<Stats, "hp" | "atk" | "def">) =>
  Math.round((s.hp * (s.atk + s.def * 0.5)) / 50);

// The "standard hero" the difficulty is tuned with (scripts/stage-tune.ts): same rank,
// 3 stars, level 20, same-rank gear at 0 stars. Averaged over a fixed sample of heroes.
const STD_STARS = 3;
const STD_LEVEL = 20;
const SAMPLE = 12;
const stdCache = new Map<DungeonId, number>();

function standardPower(rank: DungeonId): number {
  const hit = stdCache.get(rank);
  if (hit !== undefined) return hit;
  let total = 0;
  const item = itemRankOf(rank); // tiers above S use the best items (S)
  for (let i = 0; i < SAMPLE; i++) {
    const rng = createRng(hashSeed(i, 4411));
    const c = generateCharacter(rng, CLASS_IDS[i % CLASS_IDS.length]);
    const pieces = GEAR_TYPES.map((type) => ({
      type,
      rarity: item,
      stars: 0,
      element: c.element,
      ...rollGear(rng, type, item),
    }));
    const g = applyGear(
      scaleStats(c.stats, item, STD_STARS, STD_LEVEL),
      gearBonus(pieces),
    );
    const atk = g.atk + weaponAtk(item, 0, CLASS_WEAPONS[c.classId][0]);
    total += statPower({ ...g, atk });
  }
  const p = Math.round(total / SAMPLE);
  stdCache.set(rank, p);
  return p;
}

// Rough power a hero should have to clear a level: the standard hero's power, scaled by
// how much harder this level is than the rank's average (enemy hp and atk both grow, so
// the effect is squared) and by ascension. An estimate, not a guarantee.
export function recommendedPower(rank: DungeonId, level: number, asc = 0): number {
  const n = LEVELS_PER_RANK[rank];
  const avg = 1 + LEVEL_STEP * ((n - 1) / 2);
  const lv = (1 + LEVEL_STEP * level) / avg;
  const ascM = (1 + ASC_HP_STEP * asc) * (1 + ASC_ATK_STEP * asc);
  const raw = standardPower(rank) * lv * lv * ascM;
  const step = raw >= 1000 ? 50 : raw >= 100 ? 10 : 5;
  return Math.max(step, Math.round(raw / step) * step);
}

// Mean over a rank's levels, for the dungeon list.
export const recommendedPowerRange = (rank: DungeonId, asc = 0): [number, number] => [
  recommendedPower(rank, 0, asc),
  recommendedPower(rank, LEVELS_PER_RANK[rank] - 1, asc),
];
