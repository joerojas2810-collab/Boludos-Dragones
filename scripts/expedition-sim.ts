// Torre expedition simulation (docs/torre/03 "Balance y criterio de salida"). Plays whole expeditions with
// autoPolicy in combat and three meta strategies (greedy / conservative / random) for class x element x mode.
//   npx tsx scripts/expedition-sim.ts [--runs=1] [--seed=1] [--maxSectors=8] [--output=work/reports/expedition-sim.json]
//        [--class=mago] [--element=fuego] [--mode=nivelado|coleccion] [--strategy=greedy] [--rank=d] [--stars=3]
// runs = seeds per (class, element, mode, strategy) cell. Cheap by default; raise --runs / --maxSectors for balance work.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyExpeditionAction, startExpedition, type ExpMode, type ExpState } from "../src/lib/game/expedition";
import { nextAction, STRATEGIES, type Strategy } from "../src/lib/game/expeditionBot";
import { levelCap } from "../src/lib/game/heroLevel";
import { normalizeHero } from "../src/lib/game/nivelado";
import { scaleStats, type RarityId } from "../src/lib/game/rarity";
import { RELIC_IDS, type RelicId } from "../src/lib/game/relics";
import { createRng, hashSeed } from "../src/lib/game/rng";

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const RUNS = Number(arg("runs", "1"));
const SEED = Number(arg("seed", "1"));
const MAX_SECTORS = Number(arg("maxSectors", "8"));
const OUT = arg("output", "work/reports/expedition-sim.json");
const RANK = arg("rank", "d") as RarityId;
const STARS = Number(arg("stars", "3"));
const only = (k: string) => arg(k, "");
const classes = (only("class") ? [only("class")] : CLASS_IDS) as ClassId[];
const elements = (only("element") ? [only("element")] : ELEMENTS) as Element[];
const modes = (only("mode") ? [only("mode")] : ["nivelado", "coleccion"]) as ExpMode[];
const strategies = (only("strategy") ? [only("strategy")] : STRATEGIES) as Strategy[];

function makeHero(classId: ClassId, element: Element, mode: ExpMode, seed: number) {
  const base = { ...generateCharacter(createRng(hashSeed(seed, 11)), classId), element };
  if (mode === "nivelado") return normalizeHero(base, "nivelado");
  const level = levelCap(STARS);
  return normalizeHero({ ...base, rarity: RANK, stars: STARS, level, stats: scaleStats(base.stats, RANK, STARS, level) }, "completo");
}

interface RunResult {
  classId: ClassId; element: Element; mode: ExpMode; strategy: Strategy;
  nodes: number; sector: number; combats: number; turns: number; reason: string; picks: RelicId[]; capped: boolean;
}

function run(classId: ClassId, element: Element, mode: ExpMode, strategy: Strategy, i: number): RunResult {
  const seed = hashSeed(SEED, i, 7);
  let s: ExpState = startExpedition({ mode, seed, weekKey: "sim", hero: makeHero(classId, element, mode, hashSeed(seed, 3)) });
  const rng = createRng(hashSeed(seed, 99));
  const picks: RelicId[] = [];
  let capped = false;
  for (let k = 0; k < 40000 && s.phase !== "ended"; k++) {
    if (s.phase === "sector_summary" && s.sector >= MAX_SECTORS) { capped = true; break; }
    const a = nextAction(s, strategy, rng);
    if (!a) break;
    const r = applyExpeditionAction(s, a);
    if (r.error) throw new Error(`${classId}/${element}/${strategy} rejected ${a.type} in ${s.phase}: ${r.error}`);
    for (const o of r.state.relics) {
      const prev = s.relics.find((x) => x.id === o.id);
      if (!prev) picks.push(o.id);
    }
    s = r.state;
  }
  return {
    classId, element, mode, strategy, nodes: s.nodes, sector: s.sector, combats: s.combats, turns: s.turns,
    // "retired" only happens when the bot found a finished battle stuck in the combat phase (core bug, see report)
    reason: s.end?.reason === "retired" ? "stuck_battle" : (s.end?.reason ?? (capped ? "cap" : "?")), picks, capped,
  };
}

const t0 = Date.now();
const results: RunResult[] = [];
for (const mode of modes)
  for (const strategy of strategies)
    for (const classId of classes)
      for (const element of elements)
        for (let i = 0; i < RUNS; i++) results.push(run(classId, element, mode, strategy, i));

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

// survival by sector: share of runs that reached (started) sector k
const survival: Record<string, number[]> = {};
const group = (key: (r: RunResult) => string) => {
  const m = new Map<string, RunResult[]>();
  for (const r of results) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};
for (const [k, rs] of group((r) => `${r.mode}/${r.strategy}`))
  survival[k] = Array.from({ length: MAX_SECTORS }, (_, i) => r2(rs.filter((r) => r.sector >= i + 1).length / rs.length));

const totalCombats = results.reduce((a, r) => a + r.combats, 0);
const turnsPerCombat = r2(results.reduce((a, r) => a + r.turns, 0) / Math.max(1, totalCombats));
const pickCount = Object.fromEntries(RELIC_IDS.map((id) => [id, results.reduce((a, r) => a + r.picks.filter((p) => p === id).length, 0)]));
const neverChosen = RELIC_IDS.filter((id) => pickCount[id] === 0);
const cells = [...group((r) => `${r.classId}/${r.element}`)].map(([k, rs]) => ({ cell: k, meanNodes: r2(mean(rs.map((r) => r.nodes))) }));
cells.sort((a, b) => b.meanNodes - a.meanNodes);
const byClass = Object.fromEntries([...group((r) => r.classId)].map(([k, rs]) => [k, r2(mean(rs.map((r) => r.nodes)))]));
const byElement = Object.fromEntries([...group((r) => r.element)].map(([k, rs]) => [k, r2(mean(rs.map((r) => r.nodes)))]));
const byStrategy = Object.fromEntries([...group((r) => `${r.mode}/${r.strategy}`)].map(([k, rs]) => [k, { meanNodes: r2(mean(rs.map((r) => r.nodes))), capped: rs.filter((r) => r.capped).length }]));
const deaths = Object.fromEntries([...group((r) => r.reason)].map(([k, rs]) => [k, rs.length]));
// dominant relic pairs among winners' (deepest quartile) builds are approximated by pick frequency in the top runs
const top = [...results].sort((a, b) => b.nodes - a.nodes).slice(0, Math.max(1, Math.ceil(results.length / 4)));
const topPicks = Object.fromEntries(RELIC_IDS.map((id) => [id, top.filter((r) => r.picks.includes(id)).length]));

const summary = {
  params: { runs: RUNS, seed: SEED, maxSectors: MAX_SECTORS, rank: RANK, stars: STARS, expeditions: results.length, seconds: r2((Date.now() - t0) / 1000) },
  survivalBySector: survival,
  turnsPerCombat,
  endReasons: deaths,
  byStrategy,
  byClass,
  byElement,
  topCells: cells.slice(0, 5),
  bottomCells: cells.slice(-5),
  relicPickCount: pickCount,
  neverChosen,
  relicInTopQuartile: topPicks,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
