// Class x skill balance matrix with synthetic heroes (same recipe as stage-tune.ts).
//   npx tsx scripts/class-synth.ts [runs=30] [asc=0]
// env: RANK=ssr STARS=3 LEVEL=20 GEAR=1 (0 = no gear) POLICY=auto|greedy|both (default both)
// "greedy" fires the skill and Ataque 2 whenever ready, a stand-in for a human who always uses cooldowns.
import { autoPolicy, type AutoPick } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step, livingEnemies, type Battle } from "../src/lib/game/combat";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelsOf } from "../src/lib/game/levels";
import { scaleStats, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { SKILLS_BY_CLASS, type SkillId } from "../src/lib/game/skills";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";

const N = Number(process.argv[2] ?? 30);
const ASC = Number(process.argv[3] ?? 0);
const STARS = Number(process.env.STARS ?? 3);
const LEVEL = Number(process.env.LEVEL ?? 20);
const rank = (process.env.RANK ?? "ssr") as RarityId;
const GEAR = Number(process.env.GEAR ?? 1);
const POL = process.env.POLICY ?? "both";

function hero(classId: ClassId, skill: SkillId, seed: number) {
  const rng = createRng(seed);
  const c = generateCharacter(rng, classId, rank);
  const pieces = GEAR
    ? GEAR_TYPES.map((type) => ({ type, rarity: rank, stars: 0, element: c.element, ...rollGear(rng, type, rank) }))
    : [];
  const g = applyGear(scaleStats(c.stats, rank, STARS, LEVEL), gearBonus(pieces));
  return { ...c, rarity: rank, stars: STARS, level: LEVEL, skill, stats: { ...g, atk: Math.round((g.atk + weaponAtk(rank, 0, CLASS_WEAPONS[c.classId][0])) * 10) / 10 } };
}

function greedy(b: Battle): AutoPick {
  const p = b.player;
  if ((p.cooldown3 ?? 0) === 0 && p.char.skill) return { action: "attack3" };
  if (p.cooldown === 0) return { action: "attack2" };
  return autoPolicy(b, { skill: false });
}

function clearRate(classId: ClassId, skill: SkillId, pick: (b: Battle) => AutoPick): number {
  let total = 0;
  const levels = levelsOf(rank);
  for (const spec of levels) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      let st = createStage(hashSeed(i, spec.index, 5), hero(classId, skill, hashSeed(i, 31)), levelFights(spec, ASC), ASC);
      while (st.status === "playing") {
        const f = startFight(st);
        let b = f.battle;
        for (let k = 0; k < 400 && b.status === "ongoing"; k++) {
          const p = pick(b);
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
void livingEnemies;

const policies: [string, (b: Battle) => AutoPick][] = [];
if (POL !== "greedy") policies.push(["auto", (b) => autoPolicy(b)]);
if (POL !== "auto") policies.push(["greedy", greedy]);
console.log(`${rank.toUpperCase()} ${STARS}★ Nv${LEVEL} gear=${GEAR} asc=${ASC}, ${N} heroes x ${levelsOf(rank).length} niveles`);
console.log(["clase · habilidad".padEnd(26), ...policies.map(([n]) => n.padStart(7))].join(" "));
for (const cls of CLASS_IDS)
  for (const sk of SKILLS_BY_CLASS[cls])
    console.log([`${cls} · ${sk}`.padEnd(26), ...policies.map(([, f]) => `${Math.round(clearRate(cls, sk, f) * 100)}%`.padStart(7))].join(" "));
