// Fit all route × rank × ascension multipliers with the deterministic staircase simulator.
// Run: node --import tsx/esm scripts/fit-route-tune.ts --quick --runs=24 --fit-runs=100 --iterations=10 --workers=8
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ROUTE_IDS, type RouteId } from "../src/lib/game/levels";
import { RARITY_IDS, type Difficulty } from "../src/lib/game/rarity";
import { ROUTE_FIT } from "../src/lib/game/routeFit.generated";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const QUICK = args.has("quick");
const ITERATIONS = Number(args.get("iterations") ?? (QUICK ? 8 : 10));
const QUICK_RUNS = Number(args.get("runs") ?? 24);
const FIT_RUNS = Number(args.get("fit-runs") ?? QUICK_RUNS);
const WORKERS = Number(args.get("workers") ?? 8);
const SEED = Number(args.get("seed") ?? 13013);
const LOW_FACTOR = 0.5;
const HIGH_FACTOR = 1.5;
const OUT = resolve(args.get("output") ?? "src/lib/game/routeFit.generated.ts");
const TMP = mkdtempSync(join(tmpdir(), "route-fit-"));
const STAGE_TUNE = resolve("scripts/stage-tune.ts");
const ranks = [...RARITY_IDS] as Difficulty[];
type FitTable = Record<RouteId, Record<Difficulty, [number, number, number, number, number, number]>>;
type RouteRow = { route: RouteId; difficulty: Difficulty; asc: number; label: string; winRate: number };
type SimResult = { routeRows: RouteRow[] };
const factorTable = (): FitTable => Object.fromEntries(ROUTE_IDS.map((route) => [route,
  Object.fromEntries(ranks.map((rank) => [rank, [...ROUTE_FIT[route][rank]]])),
])) as FitTable;

function runSimulation(runs: number, tag: string, table: FitTable): SimResult {
  const factorsPath = join(TMP, `factors-${tag}.json`);
  const outputPath = join(TMP, `result-${tag}.json`);
  writeFileSync(factorsPath, JSON.stringify(table));
  const command = spawnSync(process.execPath, [
    ...process.execArgv,
    STAGE_TUNE,
    "--all-routes",
    "--references-only",
    "--quiet",
    `--runs=${runs}`,
    `--seed=${SEED}`,
    `--workers=${WORKERS}`,
    `--route-fit-file=${factorsPath}`,
    `--output=${outputPath}`,
  ], { stdio: "inherit" });
  if (command.status !== 0) throw new Error(`stage-tune failed at ${tag} (exit ${command.status})`);
  return JSON.parse(readFileSync(outputPath, "utf8")) as SimResult;
}

const targetFor = (difficulty: Difficulty, asc: number) =>
  difficulty === "s" && asc === 5 ? 0.45 : asc === 0 ? 0.70 : 0.60;
const key = (route: RouteId, difficulty: Difficulty, asc: number) => `${route}:${difficulty}:${asc}`;
const getRates = (rows: RouteRow[]) => new Map(rows
  .filter((row) => row.label === "reference")
  .map((row) => [key(row.route, row.difficulty, row.asc), row.winRate]));
const factors = factorTable();
const low = factorTable();
const high = factorTable();
for (const route of ROUTE_IDS) for (const rank of ranks) for (let asc = 0; asc < 6; asc++) {
  low[route][rank][asc] = LOW_FACTOR;
  high[route][rank][asc] = HIGH_FACTOR;
}

try {
  // Measure the current table, then bring each route/rank/ascension cell to the
  // approved target for that step so all nine routes share the same win-rate goal.
  const initial = runSimulation(FIT_RUNS, "initial", factors);
  const initialRates = getRates(initial.routeRows);
  const fittedTargets = new Map<string, number>();
  for (const rank of ranks) for (let asc = 0; asc < 6; asc++) {
    // Read the measured mean so a missing simulator cell fails loudly.
    const routeMean = ROUTE_IDS.reduce((sum, route) => sum + initialRates.get(key(route, rank, asc))!, 0) / ROUTE_IDS.length;
    if (!Number.isFinite(routeMean)) throw new Error(`Missing baseline mean for ${rank}+${asc}`);
    fittedTargets.set(`${rank}:${asc}`, targetFor(rank, asc));
  }

  let current = initialRates;
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    for (const route of ROUTE_IDS) for (const rank of ranks) for (let asc = 0; asc < 6; asc++) {
      const observed = current.get(key(route, rank, asc))!;
      const target = fittedTargets.get(`${rank}:${asc}`)!;
      if (observed > target) low[route][rank][asc] = factors[route][rank][asc];
      else high[route][rank][asc] = factors[route][rank][asc];
      factors[route][rank][asc] = Math.round(((low[route][rank][asc] + high[route][rank][asc]) / 2) * 10000) / 10000;
    }
    current = getRates(runSimulation(FIT_RUNS, `quick-${iteration + 1}`, factors).routeRows);
    console.log(`Bisection ${iteration + 1}/${ITERATIONS} complete (${FIT_RUNS} runs per level).`);
  }

  const final = runSimulation(100, "confirm-100", factors);
  const finalRates = getRates(final.routeRows);
  const cells = ranks.flatMap((rank) => Array.from({ length: 6 }, (_, asc) => {
    const routes = ROUTE_IDS.map((route) => finalRates.get(key(route, rank, asc))!);
    const mean = routes.reduce((sum, value) => sum + value, 0) / routes.length;
    const spread = Math.max(...routes) - Math.min(...routes);
    const target = targetFor(rank, asc);
    return { rank, asc, mean, spread, target, withinGoal: Math.abs(mean - target) <= 0.05, withinSpread: spread <= 0.10 };
  }));

  const generated = [
    "/* Generated by scripts/fit-route-tune.ts; do not edit by hand.",
    " * Regenerate with: node --import tsx/esm scripts/fit-route-tune.ts --quick --runs=24 --fit-runs=100 --iterations=10 --workers=8",
    " * Quick bisection is followed by a deterministic 100-runs-per-level confirmation.",
    " */",
    'import type { RouteId } from "./levels";',
    'import type { Difficulty } from "./rarity";',
    "",
    "export type RouteFitTable = Record<RouteId, Record<Difficulty, [number, number, number, number, number, number]>>;",
    "",
    "export const ROUTE_FIT: RouteFitTable = {",
    ...ROUTE_IDS.flatMap((route) => [
      `  ${route}: {`,
      ...ranks.map((rank) => `    ${rank}: [${factors[route][rank].map((value) => value.toFixed(4)).join(", ")}],`),
      "  },",
    ]),
    "};",
    "",
  ].join("\n");
  writeFileSync(OUT, generated);
  console.log(`Confirmed 378 factors with ${SEED}, 100 runs per level.`);
  console.log(`Reference means within ±5 pp: ${cells.filter((cell) => cell.withinGoal).length}/42.`);
  console.log(`Route spreads ≤10 pp: ${cells.filter((cell) => cell.withinSpread).length}/42; max ${(Math.max(...cells.map((cell) => cell.spread)) * 100).toFixed(2)} pp.`);
  for (const cell of cells.filter((candidate) => !candidate.withinGoal || !candidate.withinSpread)) {
    console.log(`Out of tolerance: ${cell.rank}+${cell.asc}, mean ${(cell.mean * 100).toFixed(2)}% vs ${(cell.target * 100).toFixed(0)}%, spread ${(cell.spread * 100).toFixed(2)} pp.`);
  }
  console.log(`Wrote ${OUT}`);
  if (cells.some((cell) => !cell.withinGoal || !cell.withinSpread)) process.exitCode = 2;
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
