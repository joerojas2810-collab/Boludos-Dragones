// Class × weapon synthetic dungeon audit using the universal combat actions.
// `auto` follows the shared policy; `eager` uses ready skills whenever possible.
import { autoPolicy, type AutoPick } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step, type Battle } from "../src/lib/game/combat";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelsOf } from "../src/lib/game/levels";
import { scaleStats, type Difficulty, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { GEAR_TYPES, weaponAtk, weaponSecondary, CLASS_WEAPONS, type HandType } from "../src/lib/game/weapons";

const N = Number(process.argv[2] ?? 30);
const ASC = Number(process.argv[3] ?? 0);
const STARS = Number(process.env.STARS ?? 3);
const LEVEL = Number(process.env.LEVEL ?? 20);
const rank = (process.env.RANK ?? "s") as Difficulty;
const itemRank: RarityId = rank;
const GEAR = Number(process.env.GEAR ?? 1);
const POL = process.env.POLICY ?? "both";

function hero(classId: ClassId, seed: number, wt: HandType) {
  const rng = createRng(seed);
  const c = generateCharacter(rng, classId);
  const pieces = GEAR
    ? GEAR_TYPES.map((type) => ({ type, rarity: itemRank, stars: 0, element: c.element, ...rollGear(rng, type, itemRank) }))
    : [];
  const g = applyGear(scaleStats(c.stats, itemRank, STARS, LEVEL), gearBonus(pieces));
  const sec = weaponSecondary(wt);
  const atkBonus = weaponAtk(itemRank, 0, wt);
  return { ...c, rarity: itemRank, stars: STARS, level: LEVEL, weapon: { element: c.element, atkBonus, type: wt }, stats: { ...g, atk: Math.round((g.atk + atkBonus) * 10) / 10, accuracy: g.accuracy + sec.accuracy, crit: Math.min(0.6, g.crit + sec.crit), speed: Math.round(g.speed * sec.speedMult * 10) / 10 } };
}

function eager(b: Battle): AutoPick {
  if ((b.player.universalCooldowns?.barrido ?? 0) <= 0 && b.enemies.filter((e) => e.hp > 0).length > 1) return { action: "barrido" };
  if ((b.player.universalCooldowns?.golpe ?? 0) <= 0) return { action: "golpe", target: 0 };
  return autoPolicy(b, { useUniversalSkills: false });
}

function clearRate(classId: ClassId, wt: HandType, pick: (b: Battle) => AutoPick): number {
  let total = 0;
  for (const spec of levelsOf("lord_of_flies", rank)) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      let st = createStage(hashSeed(i, spec.index, 5), hero(classId, hashSeed(i, 31), wt), levelFights(spec, ASC), ASC);
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
  return total / levelsOf("lord_of_flies", rank).length;
}

const policies: [string, (b: Battle) => AutoPick][] = [];
if (POL !== "eager") policies.push(["auto", autoPolicy]);
if (POL !== "auto") policies.push(["eager", eager]);
console.log(`${rank.toUpperCase()} ${STARS}★ Nv${LEVEL} gear=${GEAR} asc=${ASC}, ${N} runs per level`);
console.log(["clase · arma".padEnd(24), ...policies.map(([name]) => name.padStart(8))].join(" "));
for (const cls of CLASS_IDS)
  for (const wt of CLASS_WEAPONS[cls])
    console.log([`${cls} · ${wt}`.padEnd(24), ...policies.map(([, pick]) => `${Math.round(clearRate(cls, wt, pick) * 100)}%`.padStart(8))].join(" "));
