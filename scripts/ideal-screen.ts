// Deterministic screening for the turn engine (docs/ideal/03 §4): class x element x loadout pair
// x the nine boss levels at one reference rank/stars, auto policies, same seeds for every cell.
// Usage: npx tsx scripts/ideal-screen.ts [--runs=4] [--rank=d] [--seed=7] [--policy=contextual|naive|basic]
//        [--asc=0] [--output=work/reports/ideal-screen.json]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { autoPolicy, type AutoPolicyName } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { levelsOf, ROUTE_IDS } from "../src/lib/game/levels";
import { itemRankOf, RARITY_IDS, scaleStats, type Difficulty } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { skillsOfClass, type Loadout } from "../src/lib/game/skills";
import { CLASS_WEAPONS, weaponAtk, weaponSecondary } from "../src/lib/game/weapons";

const args = new Map(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=")]; }));
const RUNS = Number(args.get("runs") ?? 4);
const RANK = (args.get("rank") ?? "d") as Difficulty;
const SEED = Number(args.get("seed") ?? 7);
const ASC = Number(args.get("asc") ?? 0);
const POLICY = (args.get("policy") ?? "contextual") as AutoPolicyName;
const OUT = args.get("output") ?? "work/reports/ideal-screen.json";
const STARS = 3;

function hero(classId: ClassId, element: Element, run: number) {
  const heroRank = itemRankOf(RANK);
  const rng = createRng(hashSeed(SEED, 11, RARITY_IDS.indexOf(RANK), run));
  const c = generateCharacter(rng, classId);
  c.element = element;
  const weaponType = CLASS_WEAPONS[classId][0];
  const gear = (["casco", "peto", "piernas", "zapatos", "collar"] as const).map((type) => ({ type, rarity: heroRank, stars: 0, element, ...rollGear(rng, type, heroRank) }));
  const lvl = Math.min(20, levelCap(STARS));
  const geared = applyGear(scaleStats(c.stats, heroRank, STARS, lvl), gearBonus(gear));
  const sec = weaponSecondary(weaponType);
  return {
    ...c, weapon: { type: weaponType, element, atkBonus: weaponAtk(heroRank, 0, weaponType) },
    rarity: heroRank, stars: STARS, level: lvl,
    stats: {
      ...geared, atk: Math.round((geared.atk + weaponAtk(heroRank, 0, weaponType)) * 10) / 10,
      accuracy: Math.round((geared.accuracy + sec.accuracy) * 100) / 100,
      crit: Math.round(Math.min(0.6, Math.max(0, geared.crit + sec.crit)) * 100) / 100,
      speed: Math.round(geared.speed * sec.speedMult * 10) / 10,
    },
  };
}

type Agg = { n: number; wins: number; turns: number; hpLeft: number };
const agg = (): Agg => ({ n: 0, wins: 0, turns: 0, hpLeft: 0 });
const add = (a: Agg, win: boolean, turns: number, hp: number) => { a.n++; a.wins += win ? 1 : 0; a.turns += turns; a.hpLeft += hp; };
const rate = (a: Agg) => (a.n ? a.wins / a.n : 0);
const byClass = new Map<string, Agg>(), byPair = new Map<string, Agg>(), byBoss = new Map<string, Agg>(), byElement = new Map<string, Agg>(), byCell = new Map<string, Agg>();
const get = (m: Map<string, Agg>, k: string) => { let a = m.get(k); if (!a) m.set(k, (a = agg())); return a; };

for (const classId of CLASS_IDS) {
  const ids = skillsOfClass(classId).map((s) => s.id);
  const pairs: Loadout[] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([ids[i], ids[j]]);
  for (const element of ELEMENTS) for (const pair of pairs) for (const route of ROUTE_IDS) {
    const spec = levelsOf(route, RANK)[3]; // final boss level
    for (let run = 0; run < RUNS; run++) {
      const h = hero(classId, element, run);
      let stage = createStage(hashSeed(SEED, 23, ROUTE_IDS.indexOf(route), run), h, levelFights(spec, ASC), ASC, pair);
      let turns = 0;
      while (stage.status === "playing") {
        const { battle: b0, rng } = startFight(stage);
        let b = b0;
        for (let i = 0; i < 500 && b.status === "ongoing"; i++) { const p = autoPolicy(b, { policy: POLICY }); b = step(b, p.action, rng, p.target); }
        turns += b.turn;
        stage = finishFight(stage, b);
      }
      const win = stage.status === "cleared";
      const hp = win ? 1 : 0;
      const pk = `${classId}:${pair.join("+")}`;
      for (const [m, k] of [[byClass, classId], [byPair, pk], [byBoss, route], [byElement, `${classId}:${element}`], [byCell, `${pk}|${route}`]] as const) add(get(m, k), win, turns, hp);
    }
  }
}
const dump = (m: Map<string, Agg>) => Object.fromEntries([...m].map(([k, a]) => [k, { n: a.n, win: +rate(a).toFixed(3), turns: +(a.turns / a.n).toFixed(1) }]));
const classRates = [...byClass].map(([k, a]) => rate(a));
const report = {
  rank: RANK, stars: STARS, asc: ASC, runs: RUNS, policy: POLICY, seed: SEED,
  classSpreadPp: +((Math.max(...classRates) - Math.min(...classRates)) * 100).toFixed(1),
  byClass: dump(byClass), byPair: dump(byPair), byBoss: dump(byBoss), byClassElement: dump(byElement),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log("classSpreadPp", report.classSpreadPp);
console.log("byClass", report.byClass);
console.log("byBoss", report.byBoss);
console.log("byPair", report.byPair);
// a pair "dominates" if it is the best pair of its class against at least 7 of 9 bosses
