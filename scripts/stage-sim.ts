// Clear-rate simulation for dungeon levels (Run v2). Usage:
//   npx tsx scripts/stage-sim.ts [runsPerLevel=40] [ranks=f,c,s] [stars=3] [level=20] [asc=0]
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { GEAR_TYPES, weaponAtk, CLASS_WEAPONS } from "../src/lib/game/weapons";
import { levelCap } from "../src/lib/game/heroLevel";
import { heroSkill } from "../src/lib/game/skills";
import { LEVELS_PER_RANK, levelsOf } from "../src/lib/game/levels";
import { RARITY_IDS, scaleStats, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";

const n = Number(process.argv[2] ?? 40);
const ranks = (process.argv[3] ?? "f,c,s").split(",") as RarityId[];
const stars = Number(process.argv[4] ?? 3);
const lvl = Number(process.argv[5] ?? 20);
const asc = Number(process.argv[6] ?? 0);

function hero(rank: RarityId, seed: number) {
  const rng = createRng(seed);
  const c = generateCharacter(rng, rng.pick(CLASS_IDS), rank);
  const level = Math.min(lvl, levelCap(stars));
  const gearStars = Number(process.env.GEAR_STARS ?? 0);
  const gearRank = (process.env.GEAR_RANK as RarityId | undefined) ?? rank;
  const pieces = process.env.NOGEAR
    ? []
    : GEAR_TYPES.map((type) => ({
        type,
        rarity: gearRank,
        stars: gearStars,
        element: c.element,
        ...rollGear(rng, type, gearRank),
      }));
  const wtype = CLASS_WEAPONS[c.classId][0];
  const watk = process.env.NOGEAR ? 0 : weaponAtk(gearRank, gearStars, wtype);
  const base = scaleStats(c.stats, rank, stars, level);
  const geared = applyGear(base, gearBonus(pieces));
  return {
    ...c,
    rarity: rank,
    stars,
    level,
    skill: heroSkill(c.classId, rank, stars),
    stats: { ...geared, atk: Math.round((geared.atk + watk) * 10) / 10 },
  };
}

for (const rank of ranks) {
  const levels = levelsOf(rank);
  const row: string[] = [];
  let dungeon = 0;
  for (const spec of levels) {
    let clears = 0;
    for (let i = 0; i < n; i++) {
      const h = hero(rank, hashSeed(i, 31));
      let st = createStage(hashSeed(i, spec.index, 5), h, levelFights(spec, asc), asc);
      while (st.status === "playing") {
        const f = startFight(st);
        let b = f.battle;
        for (let k = 0; k < 400 && b.status === "ongoing"; k++) {
          const p = autoPolicy(b);
          b = step(b, p.action, f.rng, p.target);
        }
        st = finishFight(st, b);
      }
      if (st.status === "cleared") clears++;
    }
    row.push(`${Math.round((100 * clears) / n)}`);
    dungeon += clears / n;
  }
  console.log(
    `${rank.toUpperCase().padEnd(3)} L${lvl} ${stars}★ asc${asc}: ${row.join(" ")}  (levels ${LEVELS_PER_RANK[rank]}, avg ${Math.round((100 * dungeon) / levels.length)}%)`,
  );
}
void RARITY_IDS;
