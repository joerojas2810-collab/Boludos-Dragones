// Reproducible ENGINE_VERSION 13 baseline for every class, element, and dungeon rank.
// Usage: npx tsx scripts/baseline-motor13.ts [--runs=100] [--seed=13013] [--output=path]
// PvE uses stage-sim's pure autoPolicy/createStage/step/finishFight path; balance.ts is PvP,
// while class-balance.ts reads real accounts through Supabase, so neither fits this matrix.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { LEVELS_PER_RANK, levelsOf } from "../src/lib/game/levels";
import { itemRankOf, DUNGEON_IDS, scaleStats, type DungeonId, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { ENGINE_VERSION, createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const BASE_SEED = Number(args.get("seed") ?? 13013);
const RUNS_PER_LEVEL = Number(args.get("runs") ?? 10);
const OUTPUT = args.get("output") ?? "scripts/baseline/motor13.json";
if (!Number.isInteger(BASE_SEED) || BASE_SEED < 0)
  throw new Error("--seed must be a nonnegative integer");
if (!Number.isInteger(RUNS_PER_LEVEL) || RUNS_PER_LEVEL < 1)
  throw new Error("--runs must be a positive integer");
const ASCENSION = 0;
const STARS = 3;
const LEVEL = 20;
const FIGHT_STEP_LIMIT = 400;

type BaselineRow = {
  classId: ClassId;
  element: Element;
  rank: DungeonId;
  heroRank: RarityId;
  levelAttempts: number;
  clearedLevels: number;
  winRate: number;
  meanTurnsPerLevel: number;
  meanTurnsPerFight: number;
  fights: number;
};

function makeHero(classId: ClassId, element: Element, rank: DungeonId, run: number) {
  const heroRank = itemRankOf(rank);
  const rankIndex = DUNGEON_IDS.indexOf(rank);
  const rng = createRng(hashSeed(BASE_SEED, 11, rankIndex, run));
  const character = generateCharacter(rng, classId);
  character.element = element;
  const pieces = GEAR_TYPES.map((type) => ({
    type,
    rarity: heroRank,
    stars: 0,
    element,
    ...rollGear(rng, type, heroRank),
  }));
  const base = scaleStats(character.stats, heroRank, STARS, Math.min(LEVEL, levelCap(STARS)));
  const geared = applyGear(base, gearBonus(pieces));
  return {
    ...character,
    rarity: heroRank,
    stars: STARS,
    level: Math.min(LEVEL, levelCap(STARS)),
    stats: {
      ...geared,
      atk: Math.round((geared.atk + weaponAtk(heroRank, 0, CLASS_WEAPONS[classId][0])) * 10) / 10,
    },
  };
}

function runLevel(
  classId: ClassId,
  element: Element,
  rank: DungeonId,
  run: number,
  levelIndex: number,
) {
  const spec = levelsOf(rank)[levelIndex];
  const hero = makeHero(classId, element, rank, run);
  let stage = createStage(
    hashSeed(BASE_SEED, 23, DUNGEON_IDS.indexOf(rank), levelIndex, run),
    hero,
    levelFights(spec, ASCENSION),
    ASCENSION,
  );
  let turns = 0;
  let fights = 0;

  while (stage.status === "playing") {
    const { battle: initialBattle, rng } = startFight(stage);
    let battle = initialBattle;
    for (let stepIndex = 0; stepIndex < FIGHT_STEP_LIMIT && battle.status === "ongoing"; stepIndex++) {
      const pick = autoPolicy(battle);
      battle = step(battle, pick.action, rng, pick.target);
    }
    if (battle.status === "ongoing") {
      throw new Error(`Fight exceeded ${FIGHT_STEP_LIMIT} steps (${rank} level ${levelIndex + 1}).`);
    }
    turns += battle.turn;
    fights++;
    stage = finishFight(stage, battle);
  }
  return { cleared: stage.status === "cleared", turns, fights };
}

const rows: BaselineRow[] = [];
for (const rank of DUNGEON_IDS) {
  const levels = levelsOf(rank);
  for (const classId of CLASS_IDS) {
    for (const element of ELEMENTS) {
      let clearedLevels = 0;
      let turns = 0;
      let fights = 0;
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        for (let run = 0; run < RUNS_PER_LEVEL; run++) {
          const result = runLevel(classId, element, rank, run, levelIndex);
          if (result.cleared) clearedLevels++;
          turns += result.turns;
          fights += result.fights;
        }
      }
      const levelAttempts = levels.length * RUNS_PER_LEVEL;
      rows.push({
        classId,
        element,
        rank,
        heroRank: itemRankOf(rank),
        levelAttempts,
        clearedLevels,
        winRate: clearedLevels / levelAttempts,
        meanTurnsPerLevel: turns / levelAttempts,
        meanTurnsPerFight: fights ? turns / fights : 0,
        fights,
      });
    }
  }
}

const document = {
  schemaVersion: 1,
  engineVersion: ENGINE_VERSION,
  seed: BASE_SEED,
  runsPerLevel: RUNS_PER_LEVEL,
  ascension: ASCENSION,
  hero: { stars: STARS, level: LEVEL, gearStars: 0, gearRank: "same-as-hero" },
  policy: "autoPolicy",
  durationUnit: "turns",
  dimensions: {
    classes: CLASS_IDS,
    elements: ELEMENTS,
    ranks: DUNGEON_IDS,
    levelsPerRank: LEVELS_PER_RANK,
  },
  rows,
};
const outputPath = resolve(process.cwd(), OUTPUT);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote ${rows.length} rows to ${outputPath}`);
