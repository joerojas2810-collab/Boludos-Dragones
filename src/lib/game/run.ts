import { generateCharacter, type Character, type ClassId } from "./characters";
import { startBattle, type Battle, type EnemyMod } from "./combat";
import { ELEMENTS } from "./elements";
import {
  LOOT_BOSS_CHOICES,
  LOOT_BOSS_RANK_BONUS,
  LOOT_CHEST_CHANCE,
  lootOffer,
  pieceSlot,
  rollPiece,
  samePiece,
  withLoot,
  type RunLoot,
  type RunPiece,
} from "./loot";
import { dungeonBudget, rollEvent } from "./budget";
import { addParts, rollDrops, type DropSource, type Parts } from "./parts";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import {
  EVENTS,
  type EventChoice,
  type EventEffect,
  type GameEvent,
} from "./events";
import {
  upgradeStats,
  type UpgradeBase,
  gainXp,
  rollUpgrades,
  scaleForFloor,
  UPGRADE_CHOICES,
  XP_PER_WIN,
  UPGRADES,
  type UpgradeId,
} from "./progression";
import {
  applyRelicStats,
  relicTotals,
  RELIC_CHOICES,
  RELIC_IDS,
  rollRelics,
  type RelicId,
} from "./relics";
import { createRng, hashSeed, type Rng } from "./rng";
import { needsSkill, SKILLS_BY_CLASS, type SkillId } from "./skills";
import { TRAITS, type Trait, type TraitId } from "./traits";
import {
  ASC_ATK_STEP,
  ASC_HP_STEP,
  ASC_LIVES,
  ASC_LOOT_STEP,
  ASC_REST_HEAL,
  DUNGEONS,
  FINAL_BOSS_MULT,
  victoryCoins,
} from "./dungeons";
import { WORLD_ELEMENT_BIAS, WORLDS, worldOf, type World } from "./worlds";

// Bump when a change makes old action logs replay differently. The server
// rejects logs from another version with a clear error (replay.ts).
export const ENGINE_VERSION = 6; // 6: dungeon ascension; 5: additive capped upgrades; 4: run loot (weapons/gear found in the run)

// ---- Tunable constants ----
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const BOSS_EVERY = 5;
// Clearing this floor ends the run as a victory (bounds replay cost and payload size).
export const MAX_FLOOR = 100;
export const VICTORY_COINS = 500;
// Dungeon runs end at the dungeon's last floor; rank null = the legacy endless run (rooms).
export const topFloor = (run: Pick<Run, "rank">) =>
  run.rank ? DUNGEONS[run.rank].floors : MAX_FLOOR;
export const isVictory = (run: Run) =>
  run.status === "over" && run.lives > 0 && run.maxFloor >= topFloor(run);
// Difficulty floor: enemy scaling, rewards and prices follow it, not the real floor.
// `difficulty` is the room rank: it shifts difficulty only (rooms keep their own
// layout and bosses); `rank` is the dungeon rank and wins when both are set.
export const depthOf = (
  floor: number,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
) => {
  const r = rank ?? difficulty;
  return floor + (r ? DUNGEONS[r].offset : 0);
};
export const RELIC_EVERY = 3;
// First floor where each enemy modifier appears (all stay on afterwards).
export const MODIFIER_FLOORS: Readonly<Record<EnemyMod, number>> = {
  regeneracion: 12,
  escudo: 20,
  dobleAtaque: 28,
  elementoCambiante: 36,
};
// Multiplier applied on top of 1.12^floor to ALL enemy stats (hp, atk, def).
// Slower leveling => the first floors are gentler: enemy power ramps from EARLY_EASE_START
// at floor 1 up to full strength at floor EARLY_EASE_FLOORS + 1.
export const EARLY_EASE_START = 0.6;
export const EARLY_EASE_FLOORS = 9;
export const earlyEase = (floor: number) =>
  Math.min(
    1,
    EARLY_EASE_START +
      ((1 - EARLY_EASE_START) * (floor - 1)) / EARLY_EASE_FLOORS,
  );

export const FIGHT_POWER = { easy: 0.3, hard: 0.4, boss: 0.22 } as const;
// Extra multiplier on enemy hp only (longer fights, same damage per turn).
export const ENEMY_HP_MULT = 2;
// Hero hp fraction restored after a win, per fight kind.
export const FIGHT_HEAL = { easy: 0.05, hard: 0.1, boss: 0.2 } as const;
export const LEVEL_UP_HEAL = 0.4; // hp fraction restored per level gained
// Fight xp = XP_PER_WIN * FIGHT_XP_MULT * (1 + XP_FLOOR_SCALE * floor).
export const XP_FLOOR_SCALE = 0.1;
// From this floor on, each extra door is the other fight kind with probability
// (floor - FROM) * PER_FLOOR, capped at MAX.
export const FIGHT_PRESSURE_FROM = 3;
export const FIGHT_PRESSURE_PER_FLOOR = 0.07;
export const FIGHT_PRESSURE_MAX = 0.75;
// Base coins per reward, scaled by (1 + COIN_FLOOR_SCALE * floor).
export const COIN_FLOOR_SCALE = 0.12;
export const FIGHT_COINS = { easy: 5, hard: 9, boss: 27 } as const;
export const FIGHT_XP_MULT = { easy: 1.5, hard: 2.5, boss: 5 } as const;
export const CHEST_COINS = 11;
export const REST_HEAL = 0.4; // fraction of max hp
export const LIFE_LOSS_HEAL = 0.6; // hp fraction after losing a life
export const FLEE_COIN_FRACTION = 0.3; // coins lost when fleeing (min 1 if any)
export const SEDIENTO_HEAL = 0.1; // trait healOnWin
export const GAFE_LOSS_XP = 15; // trait xpOnLoss
export const SHOP_PRICES = {
  heal: 11,
  stat: 27,
  life: 63,
  reroll: 16,
} as const;
export const POTION_HEAL = 0.4;

// ---- Enemy groups (1 to 3 enemies per fight) ----
// Group size per fight kind, by floor: the last row with fromFloor <= floor
// applies; `weights` are the odds of 1, 2 and 3 enemies (bosses: total with
// the boss itself). Deterministic from (seed, floor, kind).
export interface GroupRow {
  fromFloor: number;
  weights: readonly [number, number, number];
}
export const GROUP_SCHEDULE: Record<FightKind, readonly GroupRow[]> = {
  easy: [
    { fromFloor: 1, weights: [1, 0, 0] },
    { fromFloor: 3, weights: [0.7, 0.3, 0] },
    { fromFloor: 10, weights: [0.5, 0.5, 0] },
  ],
  hard: [
    { fromFloor: 1, weights: [0, 1, 0] },
    { fromFloor: 6, weights: [0, 0.65, 0.35] },
    { fromFloor: 15, weights: [0, 0.4, 0.6] },
  ],
  boss: [
    { fromFloor: 1, weights: [1, 0, 0] },
    { fromFloor: 15, weights: [0.5, 0.5, 0] },
    { fromFloor: 30, weights: [0.3, 0.4, 0.3] },
  ],
};
// Per-enemy stat multipliers by group size (index = size - 1): more bodies,
// each one weaker, so total threat grows less than linearly.
export const GROUP_STAT_MULT = [1, 0.96, 0.82] as const; // atk and def
export const GROUP_HP_MULT = [1, 0.55, 0.4] as const;
// Boss multiplier when escorted, and minion power (relative to an easy fight).
export const BOSS_ESCORT_MULT = [1, 0.85, 0.75] as const;
export const BOSS_MINION_POWER = 0.7;
// Coins and xp multiplier by group size.
export const GROUP_REWARD_MULT = [1, 1.1, 1.2] as const;

export const BOSS_NAMES = [
  "Rey Ceniza",
  "Madre Hidra",
  "Coloso Hueco",
  "Señor de las Moscas",
  "La Reina Marchita",
  "Gran Devorador",
  "Vigía Eterno",
  "El Sin Rostro",
];

export type FightKind = "easy" | "hard" | "boss";
export type DoorKind = FightKind | "chest" | "merchant" | "rest" | "event";
export interface Door {
  kind: DoorKind;
}

export interface Run {
  seed: number;
  floor: number; // current floor
  maxFloor: number; // score
  lives: number;
  hero: Character; // base hero + level-up picks (no relics)
  hp: number;
  coins: number;
  relics: RelicId[];
  status: "active" | "over";
  ups: Partial<Record<UpgradeId, number>>; // times each upgrade was taken
  upBase: UpgradeBase; // hero stats at the start: upgrades add fractions of these
  pendingPicks: number; // level-up picks owed
  pendingRelic: RelicId[] | null; // relic offer owed
  rerolls: number; // merchant relic rerolls for the next offer
  bought: string[]; // shop item ids bought on this floor
  node: RunNode | null; // node opened by chooseDoor and not yet resolved
  floorCleared: boolean; // current floor's node is resolved; nextFloor allowed
  attempts: number; // fights started so far; mixed into the fight seed
  pendingSkill: boolean; // class skill pick owed (reached SKILL_LEVEL)
  rank: RarityId | null; // dungeon rank; null = legacy endless run (room rounds)
  ascension: number; // dungeon ascension level 0-5 (dungeons.ts)
  difficulty: RarityId | null; // room rank: enemy difficulty only (layout stays legacy)
  lootEnabled: boolean; // solo runs find loot; room rounds do not
  loot: RunLoot; // run-only pieces worn on top of the collection gear
  pendingLoot: RunPiece[] | null; // loot offer owed (take one or skip)
  bag: RunPiece[]; // pieces taken since the last boss (lost if the run ends now)
  secured: RunPiece[]; // pieces locked in by a defeated boss: paid at the end
  partBag: Parts; // forge parts/cores since the last boss (lost if the run ends now)
  partSecured: Parts; // parts locked in by defeated bosses: paid at the end
  lastDrops: Parts; // what the last node dropped (for the UI)
  lootPool: number; // dungeon loot budget left (points); see budget.ts
  wins?: number; // fights won this run (missions); absent in old saves
  bossWins?: number; // boss fights won this run (missions)
  engineVersion: number;
}

interface ShopBase {
  id: string;
  label: string;
  price: number;
}
export type ShopItem =
  | (ShopBase & { kind: "heal" | "life" | "reroll" })
  | (ShopBase & { kind: "stat"; stat: UpgradeId })
  | (ShopBase & { kind: "gear"; piece: RunPiece });

export interface FightNode {
  type: "fight";
  kind: FightKind;
  enemy: Character; // the group leader (enemies[0])
  enemies: Character[]; // 1..3, in battle order
  mods: EnemyMod[];
  battleSeed: number;
}

export type RunNode =
  | FightNode
  | { type: "chest"; coins: number }
  | { type: "rest"; healed: number }
  | { type: "shop"; items: ShopItem[] }
  | { type: "event"; event: GameEvent };

const DOOR_POOL: readonly DoorKind[] = [
  "easy",
  "hard",
  "chest",
  "merchant",
  "rest",
  "event",
];
const FIGHT_SALT = { easy: 1, hard: 2, boss: 3 } as const;

const asTrait = (t: Trait): Trait => t;
const hasTag = (ids: readonly TraitId[], tag: NonNullable<Trait["tag"]>) =>
  ids.some((id) => asTrait(TRAITS[id]).tag === tag);
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const scaled = (base: number, floor: number) =>
  Math.round(base * (1 + COIN_FLOOR_SCALE * floor));

// ---- Pure floor content: depends only on (seed, floor) ----

export const isBossFloor = (floor: number, rank?: RarityId | null) =>
  rank ? DUNGEONS[rank].bosses.includes(floor) : floor % BOSS_EVERY === 0;

export function modsAtFloor(floor: number): EnemyMod[] {
  return (Object.keys(MODIFIER_FLOORS) as EnemyMod[]).filter(
    (m) => floor >= MODIFIER_FLOORS[m],
  );
}

export function doorsFor(
  seed: number,
  floor: number,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
): Door[] {
  if (isBossFloor(floor, rank)) return [{ kind: "boss" }];
  const rng = createRng(hashSeed(seed, floor, 0));
  const kinds: DoorKind[] = [rng.pick(["easy", "hard"])];
  const pool = DOOR_POOL.filter((k) => k !== kinds[0]);
  // Deeper floors push more fights: the safe doors thin out.
  const pressure = clamp(
    (depthOf(floor, rank, difficulty) - FIGHT_PRESSURE_FROM) *
      FIGHT_PRESSURE_PER_FLOOR,
    0,
    FIGHT_PRESSURE_MAX,
  );
  const other: DoorKind = kinds[0] === "easy" ? "hard" : "easy";
  for (let n = rng.int(2, 3) - 1; n > 0; n--) {
    const k =
      pressure > 0 && pool.includes(other) && rng.chance(pressure)
        ? other
        : pool[rng.int(0, pool.length - 1)];
    kinds.push(k);
    pool.splice(pool.indexOf(k), 1);
  }
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // The floor before a boss always has a campfire (no boss from a cold start).
  if (isBossFloor(floor + 1, rank) && !kinds.includes("rest")) {
    const i = kinds.findIndex((k) => k !== "easy" && k !== "hard");
    if (i >= 0) kinds[i] = "rest";
    else if (kinds.length < 3) kinds.push("rest");
    else kinds[kinds.length - 1] = "rest";
  }
  return kinds.map((kind) => ({ kind }));
}

export function groupSize(
  seed: number,
  floor: number,
  kind: FightKind,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
  ascension = 0,
) {
  const rows = GROUP_SCHEDULE[kind].filter(
    (r) => depthOf(floor, rank, difficulty) >= r.fromFloor,
  );
  const w = rows[rows.length - 1].weights;
  const rng = createRng(hashSeed(seed, floor, 70 + FIGHT_SALT[kind]));
  let r = rng.next() * (w[0] + w[1] + w[2]);
  const size = w.findIndex((x) => (r -= x) < 0) + 1 || 1;
  return kind === "hard" && ascension >= 3 ? Math.min(3, size + 1) : size;
}

const ROMAN = ["", " II", " III"];

// One group member. Member 0 uses the same stream a lone enemy always had.
function makeEnemy(
  seed: number,
  floor: number,
  kind: FightKind,
  i: number,
  size: number,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
  ascension = 0,
): Character {
  const salt = 10 + FIGHT_SALT[kind];
  const rng = createRng(
    i === 0 ? hashSeed(seed, floor, salt) : hashSeed(seed, floor, salt, i),
  );
  const world = rank ? WORLDS[DUNGEONS[rank].world] : worldOf(floor);
  const base = generateCharacter(rng);
  const themed = rng.chance(WORLD_ELEMENT_BIAS);
  const other = rng.pick(ELEMENTS);
  const suffix = rng.pick(world.enemySuffixes);
  const bossName = rng.pick(BOSS_NAMES);
  const isBoss = kind === "boss" && i === 0;
  const name = isBoss ? bossName : `${base.name} ${suffix}`;
  let mult: number;
  let hpMult: number;
  if (kind === "boss") {
    mult = isBoss
      ? FIGHT_POWER.boss * BOSS_ESCORT_MULT[size - 1]
      : FIGHT_POWER.easy * BOSS_MINION_POWER;
    hpMult = mult * ENEMY_HP_MULT;
  } else {
    mult = FIGHT_POWER[kind] * GROUP_STAT_MULT[size - 1];
    hpMult = FIGHT_POWER[kind] * GROUP_HP_MULT[size - 1] * ENEMY_HP_MULT;
  }
  const depth = depthOf(floor, rank, difficulty);
  const ease = earlyEase(depth);
  const final = isBoss && rank && floor === DUNGEONS[rank].floors;
  const fin = final ? FINAL_BOSS_MULT : 1;
  return scaleForFloor(
    { ...base, name, element: themed ? world.element : other },
    depth,
    mult * ease * fin * (1 + ASC_ATK_STEP * ascension),
    hpMult * ease * fin * (1 + ASC_HP_STEP * ascension),
  );
}

export function enemyFor(
  seed: number,
  floor: number,
  kind: FightKind,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
  ascension = 0,
): Omit<FightNode, "type" | "kind"> {
  const size = groupSize(seed, floor, kind, rank, difficulty, ascension);
  const made = Array.from({ length: size }, (_, i) =>
    makeEnemy(seed, floor, kind, i, size, rank, difficulty, ascension),
  );
  const mods = modsAtFloor(depthOf(floor, rank, difficulty));
  if (kind === "boss" && ascension >= 4 && !mods.includes("dobleAtaque"))
    mods.push("dobleAtaque");
  // Twins get a numeral so logs and targets stay readable.
  const seen = new Map<string, number>();
  const enemies = made.map((e) => {
    const n = seen.get(e.name) ?? 0;
    seen.set(e.name, n + 1);
    return n > 0 ? { ...e, name: e.name + ROMAN[Math.min(n, 2)] } : e;
  });
  return {
    enemy: enemies[0],
    enemies,
    mods,
    battleSeed: hashSeed(seed, floor, 20 + FIGHT_SALT[kind]),
  };
}

// Relics already owned are never offered again; null when nothing is left.
export function relicOffer(
  seed: number,
  floor: number,
  rerolls = 0,
  owned: readonly RelicId[] = [],
  rank?: RarityId | null,
  difficulty?: RarityId | null,
): RelicId[] | null {
  if (floor % RELIC_EVERY !== 0) return null;
  const pool = RELIC_IDS.filter((id) => !owned.includes(id));
  const offer = rollRelics(
    createRng(hashSeed(seed, floor, 30, rerolls)),
    RELIC_CHOICES,
    pool,
    depthOf(floor, rank, difficulty),
  );
  return offer.length > 0 ? offer : null;
}

export function shopItems(
  seed: number,
  floor: number,
  classId?: ClassId,
  rank?: RarityId | null,
  difficulty?: RarityId | null,
): ShopItem[] {
  const rng = createRng(hashSeed(seed, floor, 40));
  const price = (k: keyof typeof SHOP_PRICES) =>
    scaled(SHOP_PRICES[k], depthOf(floor, rank, difficulty));
  const items: ShopItem[] = [
    {
      id: "heal",
      kind: "heal",
      label: "Poción (+40% vida)",
      price: price("heal"),
    },
    ...rollUpgrades(rng, 2).map((stat, i): ShopItem => ({
      id: `stat${i}`,
      kind: "stat",
      label: "Entrenamiento",
      price: price("stat"),
      stat,
    })),
  ];
  if (rng.chance(0.25))
    items.push({
      id: "life",
      kind: "life",
      label: "Vida extra",
      price: price("life"),
    });
  if (classId) {
    const piece = rollPiece(
      createRng(hashSeed(seed, floor, 72)),
      classId,
      floor,
      0,
      rank,
    );
    items.push({
      id: "gear0",
      kind: "gear",
      label: `${piece.name} (${RARITIES[piece.rarity].label})`,
      price: Math.round(
        price("stat") * (1 + 0.6 * RARITY_IDS.indexOf(piece.rarity)),
      ),
      piece,
    });
  }
  if (floor % RELIC_EVERY === 0)
    items.push({
      id: "reroll",
      kind: "reroll",
      label: "Cambiar ofrenda de reliquias",
      price: price("reroll"),
    });
  return items;
}

export const eventFor = (seed: number, floor: number): GameEvent =>
  createRng(hashSeed(seed, floor, 50)).pick(EVENTS);

export function getFloor(run: Run): {
  floor: number;
  isBoss: boolean;
  world: World;
  doors: Door[];
} {
  return {
    floor: run.floor,
    isBoss: isBossFloor(run.floor, run.rank),
    world: run.rank ? WORLDS[DUNGEONS[run.rank].world] : worldOf(run.floor),
    doors: doorsFor(run.seed, run.floor, run.rank, run.difficulty),
  };
}

// ---- Run state ----

export function createRun(
  seed: number,
  hero: Character,
  lootEnabled = false,
  rank: RarityId | null = null,
  difficulty: RarityId | null = null,
  ascension = 0,
): Run {
  return {
    seed,
    floor: 1,
    maxFloor: 1,
    lives: ascension >= 5 ? ASC_LIVES : START_LIVES,
    hero,
    hp: hero.stats.hp,
    coins: 0,
    relics: [],
    status: "active",
    ups: {},
    upBase: {
      hp: hero.stats.hp,
      atk: hero.stats.atk,
      def: hero.stats.def,
      speed: hero.stats.speed,
    },
    pendingPicks: 0,
    pendingRelic: null,
    rerolls: 0,
    bought: [],
    node: null,
    floorCleared: false,
    attempts: 0,
    pendingSkill: false,
    rank,
    difficulty,
    ascension,
    lootEnabled,
    loot: {},
    pendingLoot: null,
    bag: [],
    secured: [],
    partBag: {},
    partSecured: {},
    lastDrops: {},
    lootPool:
      rank && lootEnabled
        ? Math.round(dungeonBudget(rank) * (1 + ASC_LOOT_STEP * ascension))
        : 0,
    wins: 0,
    bossWins: 0,
    engineVersion: ENGINE_VERSION,
  };
}

export const effectiveHero = (run: Run): Character => {
  const h = withLoot(run.hero, run.loot);
  return { ...h, stats: applyRelicStats(h.stats, run.relics) };
};
export const maxHp = (run: Run) => effectiveHero(run).stats.hp;

// Changes hero/relics; any max-hp gain also heals that amount.
function rebuild(run: Run, patch: Partial<Run>): Run {
  const next = { ...run, ...patch };
  const gain = Math.max(0, maxHp(next) - maxHp(run));
  return { ...next, hp: Math.min(maxHp(next), next.hp + gain) };
}

const heal = (run: Run, amount: number): Run => ({
  ...run,
  hp: clamp(run.hp + Math.round(amount), 1, maxHp(run)),
});

function addXp(run: Run, xp: number): Run {
  const r = gainXp(run.hero, Math.round(xp));
  const lvl: Run = {
    ...run,
    hero: r.char,
    pendingPicks: run.pendingPicks + r.levelsGained,
    pendingSkill: run.pendingSkill || needsSkill(r.char),
  };
  return r.levelsGained > 0
    ? heal(lvl, maxHp(lvl) * LEVEL_UP_HEAL * r.levelsGained)
    : lvl;
}

export const upgradeOffer = (run: Run): UpgradeId[] =>
  rollUpgrades(
    createRng(hashSeed(run.seed, run.hero.level, run.pendingPicks, 60)),
    UPGRADE_CHOICES,
    run.hero.level,
  );

// Applies an upgrade, compounding with earlier picks of the same one.
const learn = (run: Run, id: UpgradeId): Partial<Run> => ({
  hero: {
    ...run.hero,
    stats: upgradeStats(
      run.hero.stats,
      run.upBase ?? run.hero.stats, // runs saved before upBase existed
      run.ups,
      id,
    ),
  },
  ups: { ...run.ups, [id]: (run.ups[id] ?? 0) + 1 },
});

export function pickUpgrade(run: Run, id: UpgradeId): Run {
  if (run.status !== "active" || run.pendingPicks <= 0) return run;
  return rebuild(run, {
    ...learn(run, id),
    pendingPicks: run.pendingPicks - 1,
  });
}

// The two skills the hero can learn at SKILL_LEVEL (fixed per class).
export const skillOffer = (run: Run): readonly SkillId[] =>
  SKILLS_BY_CLASS[run.hero.classId];

export function chooseSkill(run: Run, id: SkillId): Run {
  if (
    run.status !== "active" ||
    !run.pendingSkill ||
    !skillOffer(run).includes(id)
  )
    return run;
  return { ...run, hero: { ...run.hero, skill: id }, pendingSkill: false };
}

export function chooseRelic(run: Run, id: RelicId): Run {
  if (
    run.status !== "active" ||
    !run.pendingRelic?.includes(id) ||
    run.relics.includes(id)
  )
    return run;
  return rebuild(run, { relics: [...run.relics, id], pendingRelic: null });
}

const worldElementOf = (run: Run) =>
  (run.rank ? WORLDS[DUNGEONS[run.rank].world] : worldOf(run.floor)).element;

// Dungeon runs: a node takes a share of the loot budget (budget.ts). Parts and
// cores go to the bag now; the returned pieces become the player's offer.
function budgetDrop(
  run: Run,
  source: DropSource,
  salt: number,
  group = 1,
): { run: Run; pieces: RunPiece[] } {
  const ev = rollEvent(
    source,
    run.seed,
    run.floor,
    salt,
    run.rank!,
    run.hero.classId,
    run.lootPool,
    worldElementOf(run),
    group,
  );
  return {
    run: {
      ...run,
      lootPool: run.lootPool - ev.spent,
      partBag: addParts(run.partBag, ev.parts),
      lastDrops: ev.parts,
    },
    pieces: ev.pieces,
  };
}

// Moves everything carried (pieces and parts) to the secured stock.
const secureBag = (r: Run): Run => ({
  ...r,
  secured: [...r.secured, ...r.bag],
  bag: [],
  partSecured: addParts(r.partSecured, r.partBag),
  partBag: {},
});

// Adds what a node dropped to the (unsecured) part bag (legacy runs, rank null).
function drop(run: Run, source: DropSource, salt: number): Run {
  if (!run.lootEnabled) return { ...run, lastDrops: {} };
  const got = rollDrops(
    source,
    run.seed,
    run.floor,
    salt,
    run.rank,
    worldElementOf(run),
  );
  return { ...run, partBag: addParts(run.partBag, got), lastDrops: got };
}

// Wears a piece for the run and puts it in the bag (it only reaches the
// collection once a boss secures it).
function takePiece(run: Run, piece: RunPiece): Run {
  return rebuild(run, {
    loot: { ...run.loot, [pieceSlot(piece)]: piece },
    bag: [...run.bag, piece],
  });
}

// Takes piece `i` of the loot offer (-1 = skip). A new piece replaces whatever
// the run wears in that slot. When it was the boss drop, the floor advances.
export function chooseLoot(run: Run, i: number): Run {
  const offer = run.pendingLoot;
  if (run.status !== "active" || !offer || i < -1 || i >= offer.length)
    return run;
  const piece = offer[i];
  let r = piece
    ? takePiece({ ...run, pendingLoot: null }, piece)
    : { ...run, pendingLoot: null };
  if (r.floorCleared && r.node === null) {
    // Boss drop: the boss locks in everything carried so far.
    r = secureBag(r);
    r = nextFloor(r);
  }
  return r;
}

// Moves to the next floor and sets the relic offer when the floor just left is
// a multiple of RELIC_EVERY. Refused (same run) unless the floor is cleared,
// no node is open and no pick/relic is owed.
export function nextFloor(run: Run): Run {
  if (
    run.status !== "active" ||
    run.node !== null ||
    !run.floorCleared ||
    run.pendingPicks > 0 ||
    run.pendingSkill ||
    run.pendingRelic !== null ||
    run.pendingLoot !== null
  )
    return run;
  if (run.floor >= topFloor(run))
    return {
      ...run,
      status: "over",
      coins:
        run.coins +
        (run.rank ? victoryCoins(run.rank, run.ascension) : VICTORY_COINS),
    };
  const floor = run.floor + 1;
  return {
    ...run,
    floor,
    maxFloor: Math.max(run.maxFloor, floor),
    floorCleared: false,
    bought: [],
    rerolls: 0,
    pendingRelic: relicOffer(
      run.seed,
      run.floor,
      run.rerolls,
      run.relics,
      run.rank,
      run.difficulty,
    ),
  };
}

// Closes a chest/rest/shop node (rewards were already applied) and clears the
// floor. Fights and events close through applyBattleResult / resolveEvent.
export function leaveNode(run: Run): Run {
  const n = run.node;
  if (run.status !== "active" || !n) return run;
  if (n.type === "chest" || n.type === "rest" || n.type === "shop")
    return { ...run, node: null, floorCleared: true };
  return run;
}

// ---- Nodes ----

// Opens the node behind a door. Null if a node is already open, the floor is
// already cleared, the run is over or the door doesn't exist.
export function chooseDoor(
  run: Run,
  doorIndex: number,
): { run: Run; node: RunNode } | null {
  const door = doorsFor(run.seed, run.floor, run.rank, run.difficulty)[
    doorIndex
  ];
  if (
    run.status !== "active" ||
    run.node ||
    run.floorCleared ||
    run.pendingLoot ||
    !door
  )
    return null;
  const open = (r: Run, node: RunNode) => ({
    run: { ...r, node, lastDrops: {} },
    node,
  });
  switch (door.kind) {
    case "easy":
    case "hard":
    case "boss":
      return open(run, {
        type: "fight",
        kind: door.kind,
        ...enemyFor(
          run.seed,
          run.floor,
          door.kind,
          run.rank,
          run.difficulty,
          run.ascension,
        ),
      });
    case "chest": {
      const coins = Math.round(
        scaled(CHEST_COINS, depthOf(run.floor, run.rank, run.difficulty)) *
          (1 + relicTotals(run.relics).coinBonus),
      );
      if (run.lootEnabled && run.rank) {
        const b = budgetDrop(run, "chest", 0);
        const o = open(
          {
            ...b.run,
            coins: run.coins + coins,
            pendingLoot: b.pieces.length ? b.pieces : null,
          },
          { type: "chest", coins },
        );
        return { run: { ...o.run, lastDrops: b.run.lastDrops }, node: o.node };
      }
      const found =
        run.lootEnabled &&
        createRng(hashSeed(run.seed, run.floor, 70)).chance(LOOT_CHEST_CHANCE)
          ? lootOffer(run.seed, run.floor, run.hero.classId, 1, 0, 71, run.rank)
          : null;
      const opened = open(
        { ...run, coins: run.coins + coins, pendingLoot: found },
        { type: "chest", coins },
      );
      const withParts = drop(opened.run, "chest", 0);
      return { run: withParts, node: opened.node };
    }
    case "rest": {
      const next = heal(
        run,
        maxHp(run) * REST_HEAL * (run.ascension >= 2 ? ASC_REST_HEAL : 1),
      );
      return open(next, { type: "rest", healed: next.hp - run.hp });
    }
    case "merchant":
      return open(run, {
        type: "shop",
        items: shopItems(
          run.seed,
          run.floor,
          run.lootEnabled ? run.hero.classId : undefined,
          run.rank,
          run.difficulty,
        ),
      });
    case "event":
      return open(run, {
        type: "event",
        event: eventFor(run.seed, run.floor),
      });
  }
}

// Whether a shop item is worth buying right now (UI uses it to disable).
export const itemUseless = (run: Run, item: ShopItem): boolean =>
  (item.kind === "heal" && run.hp >= maxHp(run)) ||
  (item.kind === "life" && run.lives >= MAX_LIVES) ||
  (item.kind === "gear" &&
    samePiece(run.loot[pieceSlot(item.piece)], item.piece));

// Null when there is no open shop, the item isn't on offer, was bought,
// is useless right now, or is too expensive.
export function buyItem(run: Run, itemId: string): Run | null {
  if (run.status !== "active" || run.node?.type !== "shop") return null;
  const item = run.node.items.find((i) => i.id === itemId);
  if (
    !item ||
    run.bought.includes(itemId) ||
    run.coins < item.price ||
    itemUseless(run, item)
  )
    return null;
  const paid: Run = {
    ...run,
    coins: run.coins - item.price,
    bought: [...run.bought, itemId],
  };
  switch (item.kind) {
    case "heal":
      return heal(paid, maxHp(run) * POTION_HEAL);
    case "stat":
      return rebuild(paid, learn(run, item.stat));
    case "life":
      return { ...paid, lives: paid.lives + 1 };
    case "gear":
      return takePiece(paid, item.piece);
    case "reroll": // once per floor: "reroll" can only be bought once
      return { ...paid, rerolls: paid.rerolls + 1 };
  }
}

function applyEffect(run: Run, e: EventEffect): Run {
  let r = run;
  if (e.coins)
    r = {
      ...r,
      coins: Math.max(
        0,
        r.coins +
          Math.sign(e.coins) *
            scaled(Math.abs(e.coins), depthOf(r.floor, r.rank, r.difficulty)),
      ),
    };
  if (e.hp) r = heal(r, maxHp(r) * e.hp);
  if (e.xp) r = addXp(r, e.xp);
  if (e.stat) r = rebuild(r, learn(r, e.stat));
  if (e.lives) r = { ...r, lives: clamp(r.lives + e.lives, 1, MAX_LIVES) };
  return r;
}

// What a choice costs right now and whether the run can pay it.
export function eventCost(run: Run, choice: EventChoice) {
  const coins = choice.cost?.coins
    ? scaled(choice.cost.coins, depthOf(run.floor, run.rank, run.difficulty))
    : 0;
  const hp = choice.cost?.hp ? Math.round(maxHp(run) * choice.cost.hp) : 0;
  return { coins, hp, affordable: run.coins >= coins && run.hp - hp >= 1 };
}

// One line of an encounter's result for the dialog: good / bad / neutral.
export interface EventChange {
  text: string;
  good: boolean | null;
}

// What an effect did to the run (coins, hp, lives, xp, upgrades), in words.
export function describeChanges(before: Run, after: Run): EventChange[] {
  const out: EventChange[] = [];
  const num = (d: number, unit: string, extra = "") =>
    out.push({
      text: `${d > 0 ? "+" : "−"}${Math.abs(d)} ${unit}${extra}`,
      good: d > 0,
    });
  if (after.coins !== before.coins) num(after.coins - before.coins, "monedas");
  if (after.hp !== before.hp) num(after.hp - before.hp, "de vida");
  if (after.lives !== before.lives)
    num(
      after.lives - before.lives,
      after.lives - before.lives === 1 ? "vida extra" : "vidas",
    );
  if (after.hero.level > before.hero.level)
    out.push({ text: `¡Subes al nivel ${after.hero.level}!`, good: true });
  else if (after.hero.xp > before.hero.xp)
    out.push({
      text: `+${after.hero.xp - before.hero.xp} de experiencia`,
      good: true,
    });
  for (const k of Object.keys(UPGRADES) as UpgradeId[])
    if ((after.ups[k] ?? 0) > (before.ups[k] ?? 0))
      out.push({ text: `Mejora permanente: ${UPGRADES[k].name}`, good: true });
  return out;
}

// Null if no event is open, the choice doesn't exist or can't be afforded.
export function resolveEvent(
  run: Run,
  choiceIndex: number,
): {
  run: Run;
  text: string;
  paid: EventChange[];
  changes: EventChange[];
} | null {
  if (run.status !== "active" || run.node?.type !== "event") return null;
  const choice = run.node.event.choices[choiceIndex];
  if (!choice) return null;
  const cost = eventCost(run, choice);
  if (!cost.affordable) return null;
  const rng = createRng(hashSeed(run.seed, run.floor, 51, choiceIndex));
  const total = choice.outcomes.reduce((s, o) => s + o.p, 0);
  let roll = rng.next() * total;
  const outcome =
    choice.outcomes.find((o) => (roll -= o.p) < 0) ?? choice.outcomes[0];
  const paid: Run = {
    ...run,
    coins: run.coins - cost.coins,
    hp: run.hp - cost.hp,
  };
  const after = applyEffect(paid, outcome.effect);
  const price: EventChange[] = [];
  if (cost.coins > 0)
    price.push({ text: `Pagas ${cost.coins} monedas`, good: false });
  if (cost.hp > 0)
    price.push({ text: `Pagas ${cost.hp} de vida`, good: false });
  const changes = describeChanges(paid, after);
  return {
    run: { ...after, node: null, floorCleared: true },
    text: outcome.text,
    paid: price,
    changes: changes.length ? changes : [{ text: "Sin cambios", good: null }],
  };
}

// ---- Battles ----

// Starts the open fight node. Every call bumps `attempts`, so retries after
// fleeing or losing never replay the same RNG stream.
export function startFight(
  run: Run,
): { run: Run; battle: Battle; rng: Rng } | null {
  const node = run.node;
  if (run.status !== "active" || node?.type !== "fight") return null;
  const next: Run = { ...run, attempts: run.attempts + 1 };
  const rng = createRng(hashSeed(node.battleSeed, run.lives, next.attempts));
  const t = relicTotals(run.relics);
  const battle = startBattle(effectiveHero(run), node.enemies, rng, {
    playerHp: run.hp,
    playerShield: Math.round(maxHp(run) * t.startShield),
    freeHits: t.freeHits,
    perks: {
      lifesteal: t.lifesteal,
      critDamage: t.critDamage,
      regen: t.regen,
      dmgReduction: t.dmgReduction,
      dmgMult: t.dmgMult,
    },
    mods: node.mods,
  });
  return { run: next, battle, rng };
}

// Fleeing always costs a share of the coins, at least 1 when you have any
// (so it is only free when broke).
export const fleeCost = (run: Run) =>
  run.coins < 1
    ? 0
    : Math.min(
        run.coins,
        Math.max(1, Math.round(run.coins * FLEE_COIN_FRACTION)),
      );

// Won: rewards + carry hp, floor cleared. Fled: pay fleeCost, keep hp.
// Lost: -1 life, LIFE_LOSS_HEAL hp; 0 lives = over. Fled/lost close the node
// but not the floor, so another door can be chosen. `node` must be the open one.
function resolveBattle(
  run: Run,
  battle: Battle,
  node: FightNode,
): Run {
  const open = run.node;
  if (
    run.status !== "active" ||
    open?.type !== "fight" ||
    open.battleSeed !== node.battleSeed
  )
    return run;
  const kind = open.kind;
  const group = GROUP_REWARD_MULT[(open.enemies?.length ?? 1) - 1] ?? 1;
  const t = relicTotals(run.relics);
  const traits = run.hero.traits;
  if (battle.status === "won") {
    const coins = Math.round(
      scaled(FIGHT_COINS[kind], depthOf(run.floor, run.rank, run.difficulty)) *
        (1 + t.coinBonus) *
        group,
    );
    const xp =
      XP_PER_WIN *
      FIGHT_XP_MULT[kind] *
      (1 + XP_FLOOR_SCALE * depthOf(run.floor, run.rank, run.difficulty)) *
      (1 + t.xpBonus) *
      group;
    const healFrac =
      FIGHT_HEAL[kind] +
      t.healAfterFight +
      (hasTag(traits, "healOnWin") ? SEDIENTO_HEAL : 0);
    const r = addXp(
      {
        ...run,
        coins: run.coins + coins,
        hp: battle.player.hp,
        node: null,
        floorCleared: true,
      },
      xp,
    );
    const source: DropSource =
      kind === "boss"
        ? run.rank && run.floor === DUNGEONS[run.rank].floors
          ? "finalBoss"
          : "boss"
        : kind;
    if (run.rank && run.lootEnabled) {
      const b = budgetDrop(
        r,
        source,
        1 + run.attempts,
        open.enemies?.length ?? 1,
      );
      let out = b.run;
      if (kind === "boss")
        out = b.pieces.length
          ? { ...out, pendingLoot: b.pieces }
          : secureBag(out); // nothing to pick: the boss still locks in the bag
      return heal(out, maxHp(out) * healFrac);
    }
    const dropped: Run =
      kind === "boss" && run.lootEnabled
        ? {
            ...r,
            pendingLoot: lootOffer(
              run.seed,
              run.floor,
              run.hero.classId,
              LOOT_BOSS_CHOICES,
              // Dungeons: only the final boss adds a rank step.
              run.rank
                ? run.floor === DUNGEONS[run.rank].floors
                  ? LOOT_BOSS_RANK_BONUS
                  : 0
                : LOOT_BOSS_RANK_BONUS,
              73,
              run.rank,
            ),
          }
        : r;
    const withParts = drop(dropped, source, 1 + run.attempts);
    return heal(withParts, maxHp(withParts) * healFrac);
  }
  if (battle.status === "fled")
    return {
      ...run,
      coins: run.coins - fleeCost(run),
      hp: battle.player.hp,
      node: null,
    };
  if (battle.status === "lost") {
    const lives = run.lives - 1;
    let r: Run =
      lives <= 0
        ? { ...run, lives: 0, status: "over", hp: 0, node: null }
        : {
            ...run,
            lives,
            hp: Math.max(1, Math.round(maxHp(run) * LIFE_LOSS_HEAL)),
            node: null,
          };
    if (hasTag(traits, "xpOnLoss")) r = addXp(r, GAFE_LOSS_XP);
    return r;
  }
  return run;
}

export const runScore = (run: Run) => run.maxFloor;

// Same as resolveBattle plus the win counters the missions read from the verified replay.
export function applyBattleResult(
  run: Run,
  battle: Battle,
  node: FightNode,
): Run {
  const out = resolveBattle(run, battle, node);
  if (out === run || battle.status !== "won") return out;
  return {
    ...out,
    wins: (run.wins ?? 0) + 1,
    bossWins: (run.bossWins ?? 0) + (node.kind === "boss" ? 1 : 0),
  };
}
