// Deterministic stage 3 audit: class × element × class-eligible hand weapon × dungeon rank.
// By default each class uses its two equipable weapons; pass --all-weapons to include all ten.
// Usage: npx tsx scripts/sim-stage3.ts [--runs=100] [--seed=33013] [--all-weapons] [--output=scripts/baseline/stage3.json]
//        [--quick] [--workers=N]
// --quick: fast iteration mode (20 runs/level, canonical weapon per class, ranks f,d,b,s,ssr).
//          Good for tuning; use the full run (default) for the final measurement of each stage.
// --workers=N: split the cells across N processes (default: CPU cores - 1, max 8). The result is
//          identical for any N: aggregates are plain sums and rows are re-sorted by cell index.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { LEVELS_PER_RANK, levelsOf } from "../src/lib/game/levels";
import { itemRankOf, DUNGEON_IDS, scaleStats, type DungeonId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { ENGINE_VERSION, createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, HAND_TYPES, canUseWeapon, weaponAtk, weaponSecondary, type HandType } from "../src/lib/game/weapons";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const BASE_SEED = Number(args.get("seed") ?? 13013);
const QUICK = args.has("quick");
const RUNS_PER_LEVEL = Number(args.get("runs") ?? (QUICK ? 20 : 100));
const OUTPUT = args.get("output") ?? (QUICK ? "scripts/baseline/stage3-quick.json" : "scripts/baseline/stage3.json");
const WORKERS = Math.max(1, Math.floor(Number(args.get("workers") ?? Math.min(Math.max(1, cpus().length - 1), 8))));
const [SHARD_INDEX, SHARD_COUNT] = (args.get("shard") ?? "0/1").split("/").map(Number);
const IS_SHARD = args.has("shard");
const PARTIAL = args.get("partial") ?? "";
const QUICK_RANKS: readonly DungeonId[] = ["f", "d", "b", "s", "ssr"];
const selected = <T extends string>(key: string, all: readonly T[]): readonly T[] => {
  const requested = args.get(key)?.split(",") as T[] | undefined;
  if (!requested) return all;
  const invalid = requested.filter((value) => !all.includes(value));
  if (invalid.length) throw new Error(`Invalid --${key}: ${invalid.join(", ")}`);
  return requested;
};
const CLASSES = selected("classes", CLASS_IDS);
const ELEMENT_SET = selected("elements", ELEMENTS);
const REQUESTED_WEAPONS = selected("weapons", HAND_TYPES);
const ALL_WEAPONS = args.has("all-weapons");
const WEAPONS_BY_CLASS = new Map(CLASSES.map((classId) => [
  classId,
  REQUESTED_WEAPONS.filter((weaponType) => ALL_WEAPONS || (QUICK ? weaponType === CLASS_WEAPONS[classId][0] : canUseWeapon(classId, weaponType))),
]));
if ([...WEAPONS_BY_CLASS.values()].some((weapons) => weapons.length === 0)) {
  throw new Error("No eligible weapons remain for a selected class; use --all-weapons to include cross-class weapons.");
}
const WEAPONS = [...new Set([...WEAPONS_BY_CLASS.values()].flat())];
const RANKS = args.has("ranks") ? selected("ranks", DUNGEON_IDS) : QUICK ? QUICK_RANKS : DUNGEON_IDS;
if (!Number.isInteger(BASE_SEED) || BASE_SEED < 0) throw new Error("--seed must be a nonnegative integer");
if (!Number.isInteger(RUNS_PER_LEVEL) || RUNS_PER_LEVEL < 1) throw new Error("--runs must be a positive integer");

const ASCENSION = 0;
const STARS = 3;
const LEVEL = 20;
const FIGHT_STEP_LIMIT = 400;
const RUN_STARTED = Date.now();

type Sample = { cleared: boolean; turns: number; fights: number };
type Aggregate = { n: number; wins: number; turns: number; turnSquares: number };
type Floor = { classId: ClassId; pp: number };
const aggregate = (): Aggregate => ({ n: 0, wins: 0, turns: 0, turnSquares: 0 });
const add = (a: Aggregate, sample: Sample) => {
  a.n++;
  if (sample.cleared) a.wins++;
  a.turns += sample.turns;
  a.turnSquares += sample.turns * sample.turns;
};
const summarize = (a: Aggregate) => {
  const winRate = a.n ? a.wins / a.n : 0;
  const meanTurns = a.n ? a.turns / a.n : 0;
  const turnVariance = a.n > 1 ? Math.max(0, (a.turnSquares - a.turns * a.turns / a.n) / (a.n - 1)) : 0;
  return {
    attempts: a.n,
    winRate,
    meanTurnsPerLevel: meanTurns,
    winRate95HalfWidthPp: 1.96 * Math.sqrt((winRate * (1 - winRate)) / Math.max(1, a.n)) * 100,
    duration95HalfWidthTurns: 1.96 * Math.sqrt(turnVariance / Math.max(1, a.n)),
  };
};

// Read the approved class noise floors from E2_RESULTADO so this audit stays aligned
// with the reviewed source of truth. Weapon-specific floors are not approved there.
function readClassNoiseFloors(): Floor[] {
  const report = readFileSync(resolve(process.cwd(), "docs/E2_RESULTADO.md"), "utf8");
  const section = report.split("| Clase | Piso ruido | Tolerancia E2b |")[1]?.split("\n\n")[0];
  if (!section) throw new Error("Could not find class noise-floor table in docs/E2_RESULTADO.md");
  const floors = [...section.matchAll(/^\|\s*(caballero|mago|picaro|clerigo|berserker)\s*\|\s*([0-9.]+)\s*pp\s*\|/gm)]
    .map((match) => ({ classId: match[1] as ClassId, pp: Number(match[2]) }));
  if (floors.length !== CLASS_IDS.length) throw new Error("E2_RESULTADO class noise-floor table is incomplete");
  return floors;
}
const classNoiseFloors = readClassNoiseFloors();

function makeHero(classId: ClassId, element: Element, rank: DungeonId, weaponType: HandType, run: number) {
  const heroRank = itemRankOf(rank);
  const rankIndex = DUNGEON_IDS.indexOf(rank);
  const rng = createRng(hashSeed(BASE_SEED, 11, rankIndex, run));
  const character = generateCharacter(rng, classId);
  character.element = element;
  const pieces = ["casco", "peto", "piernas", "zapatos", "collar"] as const;
  const gear = pieces.map((type) => ({ type, rarity: heroRank, stars: 0, element, ...rollGear(rng, type, heroRank) }));
  const base = scaleStats(character.stats, heroRank, STARS, Math.min(LEVEL, levelCap(STARS)));
  const geared = applyGear(base, gearBonus(gear));
  const secondary = weaponSecondary(weaponType);
  return {
    ...character,
    weapon: { type: weaponType, element, atkBonus: weaponAtk(heroRank, 0, weaponType) },
    rarity: heroRank,
    stars: STARS,
    level: Math.min(LEVEL, levelCap(STARS)),
    stats: {
      ...geared,
      atk: Math.round((geared.atk + weaponAtk(heroRank, 0, weaponType)) * 10) / 10,
      accuracy: Math.round((geared.accuracy + secondary.accuracy) * 100) / 100,
      crit: Math.round(Math.min(0.6, Math.max(0, geared.crit + secondary.crit)) * 100) / 100,
      speed: Math.round(geared.speed * secondary.speedMult * 10) / 10,
    },
  };
}

function runLevel(classId: ClassId, element: Element, rank: DungeonId, weaponType: HandType, run: number, levelIndex: number): Sample {
  const spec = levelsOf(rank)[levelIndex];
  const hero = makeHero(classId, element, rank, weaponType, run);
  let stage = createStage(hashSeed(BASE_SEED, 23, DUNGEON_IDS.indexOf(rank), levelIndex, run), hero, levelFights(spec, ASCENSION), ASCENSION);
  let turns = 0;
  let fights = 0;
  while (stage.status === "playing") {
    const { battle: initialBattle, rng } = startFight(stage);
    let battle = initialBattle;
    for (let i = 0; i < FIGHT_STEP_LIMIT && battle.status === "ongoing"; i++) {
      const pick = autoPolicy(battle);
      battle = step(battle, pick.action, rng, pick.target);
    }
    if (battle.status === "ongoing") throw new Error(`Fight exceeded ${FIGHT_STEP_LIMIT} steps (${rank} level ${levelIndex + 1}).`);
    turns += battle.turn;
    fights++;
    stage = finishFight(stage, battle);
  }
  return { cleared: stage.status === "cleared", turns, fights };
}

const byClass = new Map(CLASSES.map((id) => [id, aggregate()]));
const byWeapon = new Map(WEAPONS.map((id) => [id, aggregate()]));
const byClassRank = new Map<string, Aggregate>();
const byElement = new Map(ELEMENT_SET.map((id) => [id, aggregate()]));
const byClassElement = new Map<string, Aggregate>();
const canonicalByElement = new Map(ELEMENT_SET.map((id) => [id, aggregate()]));
const canonicalByClassElement = new Map<string, Aggregate>();
const rows: Array<Record<string, unknown>> = [];
const SKIP_LOCAL = WORKERS > 1 && !IS_SHARD; // the parent only merges what the shards computed
let cellIndex = -1;
for (const classId of CLASSES) {
  for (const element of ELEMENT_SET) {
    for (const weaponType of WEAPONS_BY_CLASS.get(classId)!) {
      cellIndex++;
      if (SKIP_LOCAL || cellIndex % SHARD_COUNT !== SHARD_INDEX) continue;
      const cell = aggregate();
      for (const rank of RANKS) {
        const levels = levelsOf(rank);
        for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
          for (let run = 0; run < RUNS_PER_LEVEL; run++) {
            const result = runLevel(classId, element, rank, weaponType, run, levelIndex);
            add(cell, result);
            add(byClass.get(classId)!, result);
            add(byWeapon.get(weaponType)!, result);
            add(byElement.get(element)!, result);
            const classElement = `${classId}:${element}`;
            if (!byClassElement.has(classElement)) byClassElement.set(classElement, aggregate());
            add(byClassElement.get(classElement)!, result);
            if (weaponType === CLASS_WEAPONS[classId][0]) {
              add(canonicalByElement.get(element)!, result);
              if (!canonicalByClassElement.has(classElement)) canonicalByClassElement.set(classElement, aggregate());
              add(canonicalByClassElement.get(classElement)!, result);
            }
            const classRank = `${classId}:${rank}`;
            if (!byClassRank.has(classRank)) byClassRank.set(classRank, aggregate());
            if (weaponType === CLASS_WEAPONS[classId][0])
              add(byClassRank.get(classRank)!, result);
          }
        }
      }
      rows.push({ cellIndex, classId, element, weaponType, ...summarize(cell) });
    }
  }
}

// ---- sharding: children write their partial sums, the parent merges them ----
const SUM_MAPS: Record<string, Map<string, Aggregate>> = { byClass, byWeapon, byClassRank, byElement, byClassElement, canonicalByElement, canonicalByClassElement };
if (IS_SHARD) {
  const dump = Object.fromEntries(Object.entries(SUM_MAPS).map(([name, map]) => [name, [...map.entries()]]));
  writeFileSync(PARTIAL, JSON.stringify({ maps: dump, rows }));
  process.exit(0);
}
if (SKIP_LOCAL) {
  const dir = mkdtempSync(join(tmpdir(), "sim-stage3-"));
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const passthrough = process.argv.slice(2).filter((arg) => !arg.startsWith("--workers") && !arg.startsWith("--output"));
  const files = Array.from({ length: WORKERS }, (_, index) => join(dir, `part-${index}.json`));
  const commands = files.map((file, index) =>
    [process.execPath, ...process.execArgv, process.argv[1], ...passthrough, `--shard=${index}/${WORKERS}`, `--partial=${file}`]
      .map(quote).join(" ") + " &");
  spawnSync("sh", ["-c", `${commands.join("\n")}\nwait`], { stdio: "inherit" });
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Shard did not finish: ${file}`);
    const part = JSON.parse(readFileSync(file, "utf8")) as { maps: Record<string, Array<[string, Aggregate]>>; rows: Array<Record<string, unknown>> };
    for (const [name, entries] of Object.entries(part.maps)) {
      const target = SUM_MAPS[name];
      for (const [key, value] of entries) {
        const into = target.get(key) ?? aggregate();
        into.n += value.n; into.wins += value.wins; into.turns += value.turns; into.turnSquares += value.turnSquares;
        target.set(key, into);
      }
    }
    rows.push(...part.rows);
  }
}
rows.sort((a, b) => (a.cellIndex as number) - (b.cellIndex as number));
for (const row of rows) delete row.cellIndex;

const classSummary = CLASSES.map((classId) => ({
  classId,
  approvedE2NoiseFloorPp: classNoiseFloors.find((floor) => floor.classId === classId)!.pp,
  ...summarize(byClass.get(classId)!),
}));
const baseline = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/baseline/motor13.json"), "utf8")) as {
  engineVersion: number;
  rows: Array<{ classId: ClassId; element: Element; rank: DungeonId; levelAttempts: number; clearedLevels: number; meanTurnsPerLevel: number }>;
};
if (baseline.engineVersion !== 13) throw new Error("scripts/baseline/motor13.json is not an ENGINE_VERSION 13 baseline");
const baselineClassRank = new Map<string, { n: number; wins: number; turns: number }>();
for (const row of baseline.rows) {
  if (!ELEMENT_SET.includes(row.element)) continue;
  const key = `${row.classId}:${row.rank}`;
  const value = baselineClassRank.get(key) ?? { n: 0, wins: 0, turns: 0 };
  value.n += row.levelAttempts;
  value.wins += row.clearedLevels;
  value.turns += row.meanTurnsPerLevel * row.levelAttempts;
  baselineClassRank.set(key, value);
}
const comparison = CLASSES.flatMap((classId) => RANKS.map((rank) => {
  const key = `${classId}:${rank}`;
  const current = summarize(byClassRank.get(key) ?? aggregate());
  const old = baselineClassRank.get(key);
  if (!old) throw new Error(`Missing baseline cell ${key}`);
  const baselineWinRate = old.wins / old.n;
  const baselineTurns = old.turns / old.n;
  return {
    classId, rank,
    baselineAttempts: old.n,
    currentAttempts: current.attempts,
    baselineWinRate,
    currentWinRate: current.winRate,
    deltaWinRatePp: (current.winRate - baselineWinRate) * 100,
    baselineMeanTurns: baselineTurns,
    currentMeanTurns: current.meanTurnsPerLevel,
    deltaDurationPercent: baselineTurns ? (current.meanTurnsPerLevel / baselineTurns - 1) * 100 : 0,
    approvedClassNoiseFloorPp: classNoiseFloors.find((floor) => floor.classId === classId)!.pp,
  };
}));
const weaponSummary = WEAPONS.map((weaponType) => ({ weaponType, ...summarize(byWeapon.get(weaponType)!) }));
const baselineByElement = new Map<string, { n: number; wins: number; turns: number }>();
const baselineByClassElement = new Map<string, { n: number; wins: number; turns: number }>();
for (const row of baseline.rows) {
  if (!RANKS.includes(row.rank)) continue; // quick mode covers fewer ranks: compare like with like
  const element = baselineByElement.get(row.element) ?? { n: 0, wins: 0, turns: 0 };
  element.n += row.levelAttempts;
  element.wins += row.clearedLevels;
  element.turns += row.meanTurnsPerLevel * row.levelAttempts;
  baselineByElement.set(row.element, element);
  const key = `${row.classId}:${row.element}`;
  const cell = baselineByClassElement.get(key) ?? { n: 0, wins: 0, turns: 0 };
  cell.n += row.levelAttempts;
  cell.wins += row.clearedLevels;
  cell.turns += row.meanTurnsPerLevel * row.levelAttempts;
  baselineByClassElement.set(key, cell);
}
const compareAggregate = (current: Aggregate, old: { n: number; wins: number; turns: number }) => {
  const currentSummary = summarize(current);
  const baselineWinRate = old.wins / old.n;
  const baselineMeanTurns = old.turns / old.n;
  return {
    attempts: currentSummary.attempts,
    winRate: currentSummary.winRate,
    meanTurnsPerLevel: currentSummary.meanTurnsPerLevel,
    baselineWinRate,
    deltaWinRatePp: (currentSummary.winRate - baselineWinRate) * 100,
    baselineMeanTurns,
    deltaDurationPercent: baselineMeanTurns ? (currentSummary.meanTurnsPerLevel / baselineMeanTurns - 1) * 100 : 0,
  };
};
const elementComparison = ELEMENT_SET.map((element) => {
  const old = baselineByElement.get(element);
  if (!old) throw new Error(`Missing baseline element ${element}`);
  return { element, ...compareAggregate(canonicalByElement.get(element)!, old) };
});
const classElementComparison = CLASSES.flatMap((classId) => ELEMENT_SET.map((element) => {
  const old = baselineByClassElement.get(`${classId}:${element}`);
  if (!old) throw new Error(`Missing baseline cell ${classId}:${element}`);
  return { classId, element, ...compareAggregate(canonicalByClassElement.get(`${classId}:${element}`)!, old) };
}));
const allLegalElementSummary = ELEMENT_SET.map((element) => ({ element, ...summarize(byElement.get(element)!) }));
const allLegalElementComparison = ELEMENT_SET.map((element) => {
  const old = baselineByElement.get(element)!;
  return { element, ...compareAggregate(byElement.get(element)!, old) };
});
const allLegalClassElementComparison = CLASSES.flatMap((classId) => ELEMENT_SET.map((element) => ({
  classId, element,
  ...compareAggregate(byClassElement.get(`${classId}:${element}`)!, baselineByClassElement.get(`${classId}:${element}`)!),
})));
const allLegalClassElementSummary = CLASSES.flatMap((classId) => ELEMENT_SET.map((element) => ({
  classId, element, ...summarize(byClassElement.get(`${classId}:${element}`) ?? aggregate()),
})));
const durationMs = Date.now() - RUN_STARTED;
const result = {
  schemaVersion: 1,
  engineVersion: ENGINE_VERSION,
  seed: BASE_SEED,
  runsPerLevel: RUNS_PER_LEVEL,
  ascension: ASCENSION,
  hero: { stars: STARS, level: LEVEL, gearStars: 0, gearRank: "same-as-hero" },
  policy: "autoPolicy",
  durationUnit: "turns per attempted dungeon level",
  dimensions: { classes: CLASSES, elements: ELEMENT_SET, weapons: WEAPONS, ranks: RANKS, levelsPerRank: Object.fromEntries(RANKS.map((rank) => [rank, LEVELS_PER_RANK[rank]])) },
  notes: [
    ALL_WEAPONS
      ? "--all-weapons includes cross-class weapon combinations; these may not be equipable in live play."
      : "Only weapons permitted by each class are included (two per class in the current rules).",
    "Comparison uses the same seed, rank/element fixtures and attempts per level as motor13; the class×rank comparison uses the class's first equipable weapon, matching motor13. The full matrix below also reports both legal weapons.",
    "Class noise floor from E2_RESULTADO is reported per class; weapon-specific confidence intervals are diagnostic, not approved thresholds.",
    "Win-rate and duration half-widths assume independent level attempts; compare weapons with paired seeds for tighter causal estimates.",
  ],
  runtimeMs: durationMs,
  runtimeSeconds: durationMs / 1000,
  classSummary,
  weaponSummary,
  elementComparison,
  classElementComparison,
  allLegalElementSummary,
  allLegalClassElementSummary,
  allLegalElementComparison,
  allLegalClassElementComparison,
  comparison,
  matrix: rows,
};
const outputPath = resolve(process.cwd(), OUTPUT);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`E3 audit: ${rows.length} class × element × weapon rows; ${RUNS_PER_LEVEL} runs/level; seed ${BASE_SEED}`);
console.log("Class summary (win rate / mean turns / approved E2 noise floor):");
for (const row of classSummary) console.log(`${row.classId}: ${(row.winRate * 100).toFixed(2)}% / ${row.meanTurnsPerLevel.toFixed(2)} / ${row.approvedE2NoiseFloorPp.toFixed(2)} pp`);
console.log("Weapon summary (win rate / mean turns / diagnostic 95% win-rate half-width):");
for (const row of weaponSummary) console.log(`${row.weaponType}: ${(row.winRate * 100).toFixed(2)}% / ${row.meanTurnsPerLevel.toFixed(2)} / ±${row.winRate95HalfWidthPp.toFixed(2)} pp`);
const worstWin = Math.max(...comparison.map((row) => Math.abs(row.deltaWinRatePp)));
const worstDuration = Math.max(...comparison.map((row) => Math.abs(row.deltaDurationPercent)));
console.log(`Baseline comparison: largest class×rank win-rate delta ${worstWin.toFixed(2)} pp; largest duration delta ${worstDuration.toFixed(2)}%.`);
console.log("Element comparison (canonical legal weapon vs motor13):");
for (const row of elementComparison) console.log(`${row.element}: ${(row.winRate * 100).toFixed(2)}% / ${row.deltaWinRatePp >= 0 ? "+" : ""}${row.deltaWinRatePp.toFixed(2)} pp / ${row.deltaDurationPercent.toFixed(2)}%`);
console.log(`Runtime ${(durationMs / 1000).toFixed(2)}s; wrote ${outputPath}`);
