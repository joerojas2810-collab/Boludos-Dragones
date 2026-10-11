// Simulate the approved F–S dungeon staircase reference heroes.
// Usage: npx tsx scripts/stage-tune.ts [--quick] [--runs=100] [--route=lord_of_flies]
// --quick uses 8 runs per level; the full run defaults to 100. Use --all-routes for
// a route-variance audit. Output is deterministic for a given seed and run count.
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { LEVELS_PER_ROUTE, ROUTE_IDS, levelsOf, type RouteId } from "../src/lib/game/levels";
import { RARITY_IDS, scaleStats, type Difficulty } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { ASC_TUNE, createStage, finishFight, levelFights, RANK_TUNE, ROUTE_TUNE, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";
import { cpus } from "node:os";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const QUICK = args.has("quick");
const RUNS = Number(args.get("runs") ?? (QUICK ? 8 : 100));
const BASE_SEED = Number(args.get("seed") ?? 13013);
const ROUTES: readonly RouteId[] = args.has("all-routes")
  ? ROUTE_IDS
  : [((args.get("route") ?? "lord_of_flies") as RouteId)];
const WORKERS = Math.max(1, Math.min(8, Math.floor(Number(args.get("workers") ?? Math.min(8, cpus().length - 1)))));
const [SHARD_INDEX, SHARD_COUNT] = (args.get("shard") ?? "0/1").split("/").map(Number);
const IS_SHARD = args.has("shard");
const PARTIAL = args.get("partial") ?? "";
const OUTPUT = resolve(args.get("output") ?? "scripts/baseline/staircase-sim.json");
for (const assignment of (args.get("rank-tune") ?? "").split(",").filter(Boolean)) {
  const [rank, value] = assignment.split(":");
  if (!RARITY_IDS.includes(rank as Difficulty) || !Number.isFinite(Number(value))) throw new Error(`Invalid --rank-tune entry: ${assignment}`);
  RANK_TUNE[rank as Difficulty] = Number(value);
}
if (args.has("asc-tune")) {
  const assignments = args.get("asc-tune")!.split(";").filter(Boolean);
  for (const assignment of assignments) {
    const [rank, rawValues] = assignment.split(":");
    const values = rawValues?.split(",").map(Number);
    if (!RARITY_IDS.includes(rank as Difficulty) || !values || values.length !== 6 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("--asc-tune requires rank:value,value,value,value,value,value assignments separated by semicolons");
    }
    (ASC_TUNE[rank as Difficulty] as unknown as number[]).splice(0, 6, ...values);
  }
}
const FIGHT_STEP_LIMIT = 500;
if (!Number.isInteger(RUNS) || RUNS < 1 || !Number.isInteger(BASE_SEED) || BASE_SEED < 0) {
  throw new Error("--runs must be positive and --seed must be a nonnegative integer");
}
for (const route of ROUTES) if (!ROUTE_IDS.includes(route)) throw new Error(`Invalid route: ${route}`);

type Scenario = { stars: number; target: number; label: string };
function scenarios(difficulty: Difficulty, asc: number): Scenario[] {
  const referenceTarget = difficulty === "s" && asc === 5 ? 0.45 : asc === 0 ? 0.70 : 0.60;
  const result: Scenario[] = [{ stars: asc, target: referenceTarget, label: "reference" }];
  if (asc + 2 <= 5) result.push({ stars: asc + 2, target: 0.85, label: "+2 stars" });
  if (asc >= 2) result.push({ stars: asc - 2, target: 0.25, label: "−2 stars" });
  return result;
}
type Cell = { difficulty: Difficulty; asc: number; stars: number; target: number; label: string };
const cells: Cell[] = RARITY_IDS.flatMap((difficulty) =>
  ASC_TUNE[difficulty].map((_, asc) => scenarios(difficulty, asc).map((scenario) => ({ difficulty, asc, ...scenario }))).flat(),
);
type Sum = { attempts: number; wins: number; fights: number; turns: number };
const keyOf = (c: Cell, route: RouteId) => `${route}:${c.difficulty}:${c.asc}:${c.stars}:${c.label}`;
const totals = new Map<string, Sum>();
const classTotals = new Map<string, Sum>();
const elementTotals = new Map<string, Sum>();
const add = (sum: Sum, outcome: { cleared: boolean; fights: number; turns: number }) => {
  sum.attempts++;
  if (outcome.cleared) sum.wins++;
  sum.fights += outcome.fights;
  sum.turns += outcome.turns;
};
const empty = (): Sum => ({ attempts: 0, wins: 0, fights: 0, turns: 0 });

function makeHero(rank: Difficulty, stars: number, classId: ClassId, element: Element, seed: number) {
  const rng = createRng(seed);
  const character = generateCharacter(rng, classId);
  character.element = element;
  const level = levelCap(stars);
  const pieces = GEAR_TYPES.map((type) => ({
    type,
    rarity: rank,
    stars: 0,
    element,
    ...rollGear(rng, type, rank),
  }));
  const geared = applyGear(scaleStats(character.stats, rank, stars, level), gearBonus(pieces));
  const weapon = CLASS_WEAPONS[classId][0];
  return {
    ...character,
    rarity: rank,
    stars,
    level,
    weapon: { type: weapon, element, atkBonus: weaponAtk(rank, 0, weapon) },
    stats: { ...geared, atk: Math.round((geared.atk + weaponAtk(rank, 0, weapon)) * 10) / 10 },
  };
}

function simulate(cellIndex: number, route: RouteId, run: number, levelIndex: number) {
  const cell = cells[cellIndex];
  // Rotate through every class/element deterministically instead of favoring one fixture.
  const sample = (run * LEVELS_PER_ROUTE + levelIndex + cell.asc + RARITY_IDS.indexOf(cell.difficulty)) % (CLASS_IDS.length * ELEMENTS.length);
  const classId = CLASS_IDS[Math.floor(sample / ELEMENTS.length)];
  const element = ELEMENTS[sample % ELEMENTS.length];
  const routeIndex = ROUTE_IDS.indexOf(route);
  const hero = makeHero(cell.difficulty, cell.stars, classId, element, hashSeed(BASE_SEED, cellIndex, routeIndex, run, levelIndex));
  const spec = levelsOf(route, cell.difficulty)[levelIndex];
  let stage = createStage(hashSeed(BASE_SEED, 23, cellIndex, routeIndex, run, levelIndex), hero, levelFights(spec, cell.asc), cell.asc);
  let fights = 0;
  let turns = 0;
  while (stage.status === "playing") {
    const { battle: initial, rng } = startFight(stage);
    let battle = initial;
    for (let i = 0; i < FIGHT_STEP_LIMIT && battle.status === "ongoing"; i++) {
      const pick = autoPolicy(battle);
      battle = step(battle, pick.action, rng, pick.target);
    }
    if (battle.status === "ongoing") throw new Error(`Fight exceeded ${FIGHT_STEP_LIMIT} steps (${cell.difficulty}+${cell.asc}, ${route}).`);
    turns += battle.turn;
    fights++;
    stage = finishFight(stage, battle);
  }
  return { cleared: stage.status === "cleared", fights, turns, classId, element };
}

// Quick coordinate search: fit only per-rank ascension multipliers to every approved
// reference and +/-2-star target, preserving each rank's strict +0…+5 monotonicity.
if (args.has("fit-staircase")) {
  const fitRuns = Number(args.get("fit-runs") ?? (QUICK ? 8 : RUNS));
  const fitRate = (cellIndex: number) => {
    let wins = 0;
    let attempts = 0;
    for (const route of ROUTES) for (let levelIndex = 0; levelIndex < LEVELS_PER_ROUTE; levelIndex++) {
      for (let run = 0; run < fitRuns; run++) {
        if (simulate(cellIndex, route, run, levelIndex).cleared) wins++;
        attempts++;
      }
    }
    return wins / attempts;
  };
  for (const difficulty of RARITY_IDS) {
    const asc = ASC_TUNE[difficulty] as unknown as number[];
    asc[0] = 1;
    for (let index = 1; index < asc.length; index++) {
      const low = asc[index - 1] + 0.01;
      let best = { value: low, error: Number.POSITIVE_INFINITY };
      for (let candidate = low; candidate <= 2.0001; candidate += 0.025) {
        asc[index] = Math.min(2, Math.round(candidate * 1000) / 1000);
        let error = 0;
        for (const cellIndex of cells.flatMap((cell, i) => cell.difficulty === difficulty && cell.asc === index ? [i] : [])) {
          const delta = fitRate(cellIndex) - cells[cellIndex].target;
          // The approved target is the reference hero at each of the 42 steps;
          // the +/-2-star probes are secondary diagnostics for the same factor.
          error += delta * delta * (cells[cellIndex].label === "reference" ? 4 : 1);
        }
        if (error < best.error) best = { value: asc[index], error };
      }
      asc[index] = best.value;
    }
  }
  console.log(`--fit-staircase: per-rank ASC_TUNE fitted to all approved scenario targets; cap ×2`);
  for (const difficulty of RARITY_IDS) console.log(`${difficulty}: RANK_TUNE=${RANK_TUNE[difficulty].toFixed(3)}`);
  for (const difficulty of RARITY_IDS) console.log(`${difficulty}: ASC_TUNE=${ASC_TUNE[difficulty].map((value) => value.toFixed(3)).join(",")}`);
}

const runCell = (cellIndex: number) => {
  for (const route of ROUTES) {
    for (let levelIndex = 0; levelIndex < LEVELS_PER_ROUTE; levelIndex++) {
      for (let run = 0; run < RUNS; run++) {
        const result = simulate(cellIndex, route, run, levelIndex);
        const cell = cells[cellIndex];
        add(totals.get(keyOf(cell, route)) ?? (totals.set(keyOf(cell, route), empty()), totals.get(keyOf(cell, route))!), result);
        const classKey = `${route}:${cell.difficulty}:${cell.asc}:${cell.stars}:${cell.label}:${result.classId}`;
        add(classTotals.get(classKey) ?? (classTotals.set(classKey, empty()), classTotals.get(classKey)!), result);
        const elementKey = `${route}:${cell.difficulty}:${cell.asc}:${cell.stars}:${cell.label}:${result.element}`;
        add(elementTotals.get(elementKey) ?? (elementTotals.set(elementKey, empty()), elementTotals.get(elementKey)!), result);
      }
    }
  }
};

if (IS_SHARD) {
  for (let i = 0; i < cells.length; i++) if (i % SHARD_COUNT === SHARD_INDEX) runCell(i);
  writeFileSync(PARTIAL, JSON.stringify({ totals: [...totals], classTotals: [...classTotals], elementTotals: [...elementTotals] }));
  process.exit(0);
}

if (WORKERS > 1) {
  const dir = mkdtempSync(join(tmpdir(), "staircase-sim-"));
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const passthrough = process.argv.slice(2).filter((arg) => !arg.startsWith("--workers") && !arg.startsWith("--output") && !arg.startsWith("--fit-staircase") && !arg.startsWith("--fit-runs"));
  if (args.has("fit-staircase")) {
    passthrough.push(`--rank-tune=${RARITY_IDS.map((rank) => `${rank}:${RANK_TUNE[rank]}`).join(",")}`);
    passthrough.push(`--asc-tune=${RARITY_IDS.map((rank) => `${rank}:${ASC_TUNE[rank].join(",")}`).join(";")}`);
  }
  const files = Array.from({ length: WORKERS }, (_, index) => join(dir, `part-${index}.json`));
  const commands = files.map((file, index) => [process.execPath, ...process.execArgv, process.argv[1], ...passthrough, `--shard=${index}/${WORKERS}`, `--partial=${file}`].map(quote).join(" ") + " &");
  const childResult = spawnSync("sh", ["-c", `${commands.join("\n")}\nwait`], { stdio: "inherit" });
  if (childResult.status !== 0) throw new Error(`Simulation workers failed (${childResult.status})`);
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Missing worker output: ${file}`);
    const part = JSON.parse(readFileSync(file, "utf8")) as { totals: Array<[string, Sum]>; classTotals: Array<[string, Sum]>; elementTotals: Array<[string, Sum]> };
    for (const [key, value] of part.totals) totals.set(key, value);
    for (const [key, value] of part.classTotals) classTotals.set(key, value);
    for (const [key, value] of part.elementTotals) elementTotals.set(key, value);
  }
} else {
  cells.forEach((_, index) => runCell(index));
}

const summary = (sum: Sum) => ({
  attempts: sum.attempts,
  winRate: sum.attempts ? sum.wins / sum.attempts : 0,
  meanFights: sum.attempts ? sum.fights / sum.attempts : 0,
  meanTurnsPerLevel: sum.attempts ? sum.turns / sum.attempts : 0,
});
const routeRows = cells.flatMap((cell) => ROUTES.map((route) => {
  const sum = totals.get(keyOf(cell, route)) ?? empty();
  const result = summary(sum);
  return { route, ...cell, ...result, target: cell.target, deltaPp: (result.winRate - cell.target) * 100 };
}));
const rows = cells.map((cell) => {
  const selected = routeRows.filter((row) => row.difficulty === cell.difficulty && row.asc === cell.asc && row.label === cell.label);
  const combined = empty();
  for (const row of selected) {
    combined.attempts += row.attempts;
    combined.wins += row.winRate * row.attempts;
    combined.fights += row.meanFights * row.attempts;
    combined.turns += row.meanTurnsPerLevel * row.attempts;
  }
  combined.wins = Math.round(combined.wins);
  const result = summary(combined);
  const rates = selected.map((row) => row.winRate * 100);
  return {
    ...cell,
    ...result,
    target: cell.target,
    deltaPp: (result.winRate - cell.target) * 100,
    routeMinWinRate: Math.min(...rates) / 100,
    routeMaxWinRate: Math.max(...rates) / 100,
  };
});
const classRows = [...classTotals].map(([key, sum]) => ({ key, ...summary(sum) }));
const elementRows = [...elementTotals].map(([key, sum]) => ({ key, ...summary(sum) }));
const aggregateBy = (items: Array<{ key: string; attempts: number; winRate: number; meanFights: number; meanTurnsPerLevel: number }>, tokenIndex: number, token: string) => {
  const result = new Map<string, Sum>();
  for (const item of items) {
    const parts = item.key.split(":");
    if (parts[tokenIndex] !== token) continue;
    const name = parts.at(-1)!;
    const sum = result.get(name) ?? empty();
    sum.attempts += item.attempts;
    sum.wins += item.winRate * item.attempts;
    sum.fights += item.meanFights * item.attempts;
    sum.turns += item.meanTurnsPerLevel * item.attempts;
    result.set(name, sum);
  }
  return Object.fromEntries([...result].map(([key, sum]) => [key, summary({
    ...sum,
    wins: Math.round(sum.wins),
  })]));
};
const monotonicity = RARITY_IDS.flatMap((rank) => ASC_TUNE[rank].slice(0, -1).map((value, index) => ({
  rank, from: `+${index}`, to: `+${index + 1}`, fromEnemyFactor: value,
  toEnemyFactor: ASC_TUNE[rank][index + 1], passes: value < ASC_TUNE[rank][index + 1],
})));
const result = {
  seed: BASE_SEED,
  runsPerLevel: RUNS,
  routes: ROUTES,
  formula: "DIFFICULTY_MULT × RANK_TUNE × ASC_TUNE[difficulty] × (1 + LEVEL_STEP × levelIndex) × ROUTE_TUNE",
  rankTune: RANK_TUNE,
  ascTune: ASC_TUNE,
  routeTune: Object.fromEntries(ROUTES.map((route) => [route, ROUTE_TUNE[route]])),
  monotonicity,
  rows,
  referenceClassSummary: aggregateBy(classRows, 4, "reference"),
  referenceElementSummary: aggregateBy(elementRows, 4, "reference"),
  classElementReferenceRows: classRows.filter((row) => row.key.split(":")[4] === "reference"),
  elementReferenceRows: elementRows.filter((row) => row.key.split(":")[4] === "reference"),
};
writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Staircase simulation: ${rows.length} step/scenario rows; ${RUNS} runs/level; routes ${ROUTES.join(", ")}`);
for (const cell of cells) {
  const selected = rows.filter((row) => row.difficulty === cell.difficulty && row.asc === cell.asc && row.label === cell.label);
  const row = selected[0];
  console.log(`${cell.difficulty}+${cell.asc} ${cell.stars}★ ${cell.label}: ${(row.winRate * 100).toFixed(1)}% (target ${(cell.target * 100).toFixed(0)}%, ${row.deltaPp >= 0 ? "+" : ""}${row.deltaPp.toFixed(1)} pp), ${row.attempts} attempts, ${row.meanTurnsPerLevel.toFixed(1)} turns; route range ${(row.routeMinWinRate * 100).toFixed(1)}–${(row.routeMaxWinRate * 100).toFixed(1)}%`);
}
for (const row of monotonicity) console.log(`Monotonic ${row.rank} ${row.from} < ${row.to}: ${row.passes ? "PASS" : "FAIL"} (${row.fromEnemyFactor.toFixed(3)} vs ${row.toEnemyFactor.toFixed(3)})`);
console.log(`Wrote ${OUTPUT}`);
