// Deterministic stage 3 audit: class × element × class-eligible hand weapon × dungeon rank.
// By default each class uses its two equipable weapons; pass --all-weapons to include all ten.
// Usage: npx tsx scripts/sim-stage3.ts [--runs=100] [--seed=33013] [--all-weapons] [--output=scripts/baseline/stage3.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { LEVELS_PER_RANK, levelsOf } from "../src/lib/game/levels";
import { itemRankOf, DUNGEON_IDS, scaleStats, type DungeonId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { heroSkill } from "../src/lib/game/skills";
import { ENGINE_VERSION, createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { HAND_TYPES, canUseWeapon, weaponAtk, weaponSecondary, type HandType } from "../src/lib/game/weapons";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const BASE_SEED = Number(args.get("seed") ?? 33013);
const RUNS_PER_LEVEL = Number(args.get("runs") ?? 100);
const OUTPUT = args.get("output") ?? "scripts/baseline/stage3.json";
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
  REQUESTED_WEAPONS.filter((weaponType) => ALL_WEAPONS || canUseWeapon(classId, weaponType)),
]));
if ([...WEAPONS_BY_CLASS.values()].some((weapons) => weapons.length === 0)) {
  throw new Error("No eligible weapons remain for a selected class; use --all-weapons to include cross-class weapons.");
}
const WEAPONS = [...new Set([...WEAPONS_BY_CLASS.values()].flat())];
const RANKS = selected("ranks", DUNGEON_IDS);
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
    skill: heroSkill(classId),
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
const rows: Array<Record<string, unknown>> = [];
for (const classId of CLASSES) {
  for (const element of ELEMENT_SET) {
    for (const weaponType of WEAPONS_BY_CLASS.get(classId)!) {
      const cell = aggregate();
      for (const rank of RANKS) {
        const levels = levelsOf(rank);
        for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
          for (let run = 0; run < RUNS_PER_LEVEL; run++) {
            const result = runLevel(classId, element, rank, weaponType, run, levelIndex);
            add(cell, result);
            add(byClass.get(classId)!, result);
            add(byWeapon.get(weaponType)!, result);
          }
        }
      }
      rows.push({ classId, element, weaponType, ...summarize(cell) });
    }
  }
}

const classSummary = CLASSES.map((classId) => ({
  classId,
  approvedE2NoiseFloorPp: classNoiseFloors.find((floor) => floor.classId === classId)!.pp,
  ...summarize(byClass.get(classId)!),
}));
const weaponSummary = WEAPONS.map((weaponType) => ({ weaponType, ...summarize(byWeapon.get(weaponType)!) }));
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
    "E2 class noise floors are context for later paired comparisons, not a pass/fail result for this standalone run.",
    "Weapon-specific noise floor is estimated with the displayed 95% normal-approximation half-widths over deterministic samples; this is diagnostic, not an approved threshold.",
    "Win-rate and duration half-widths assume independent level attempts; compare weapons with paired seeds for tighter causal estimates.",
  ],
  runtimeMs: durationMs,
  runtimeSeconds: durationMs / 1000,
  classSummary,
  weaponSummary,
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
console.log(`Runtime ${(durationMs / 1000).toFixed(2)}s; wrote ${outputPath}`);
