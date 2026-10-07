// Bisects RANK_TUNE per rank so the average clear rate of a standard hero (same
// rank, 3 stars, level 20, same-rank gear at 0 stars) hits the target. Usage:
//   npx tsx scripts/stage-tune.ts [runs=24]
// Prints the table to paste into stage.ts.
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelsOf } from "../src/lib/game/levels";
import { RARITY_IDS, scaleStats, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { heroSkill } from "../src/lib/game/skills";
import { RANK_TUNE, createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";

const N = Number(process.argv[2] ?? 24);
const TARGET: Record<RarityId, number> = { f: 0.95, e: 0.92, d: 0.88, c: 0.84, b: 0.78, a: 0.7, s: 0.62, ss: 0.48, ssr: 0.35 };
const STARS = Number(process.env.STARS ?? 3);
const LEVEL = Number(process.env.LEVEL ?? 20);

function hero(rank: RarityId, seed: number) {
  const rng = createRng(seed);
  const c = generateCharacter(rng, rng.pick(CLASS_IDS), rank);
  const pieces = GEAR_TYPES.map((type) => ({ type, rarity: rank, stars: 0, element: c.element, ...rollGear(rng, type, rank) }));
  const base = scaleStats(c.stats, rank, STARS, LEVEL);
  const g = applyGear(base, gearBonus(pieces));
  return { ...c, rarity: rank, stars: STARS, level: LEVEL, skill: heroSkill(c.classId, rank, STARS), stats: { ...g, atk: Math.round((g.atk + weaponAtk(rank, 0, CLASS_WEAPONS[c.classId][0])) * 10) / 10 } };
}

function rate(rank: RarityId): number {
  let total = 0;
  const levels = levelsOf(rank);
  for (const spec of levels) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      let st = createStage(hashSeed(i, spec.index, 5), hero(rank, hashSeed(i, 31)), levelFights(spec, 0));
      while (st.status === "playing") {
        const f = startFight(st);
        let b = f.battle;
        for (let k = 0; k < 400 && b.status === "ongoing"; k++) {
          const p = autoPolicy(b);
          b = step(b, p.action, f.rng, p.target);
        }
        st = finishFight(st, b);
      }
      if (st.status === "cleared") ok++;
    }
    total += ok / N;
  }
  return total / levels.length;
}

for (const rank of RARITY_IDS) {
  let lo = 0.3, hi = 6;
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2;
    RANK_TUNE[rank] = mid;
    if (rate(rank) > TARGET[rank]) lo = mid; else hi = mid;
  }
  RANK_TUNE[rank] = Math.round(((lo + hi) / 2) * 100) / 100;
  console.log(`${rank}: ${RANK_TUNE[rank]}  (rate ${Math.round(rate(rank) * 100)}% target ${TARGET[rank] * 100}%)`);
}
