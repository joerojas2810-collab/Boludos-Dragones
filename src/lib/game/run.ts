import { generateCharacter, type Character } from "./characters";
import { startBattle, type Battle, type EnemyMod } from "./combat";
import { ELEMENTS } from "./elements";
import {
  EVENTS,
  type EventChoice,
  type EventEffect,
  type GameEvent,
} from "./events";
import {
  applyUpgrade,
  gainXp,
  rollUpgrades,
  scaleForFloor,
  UPGRADE_CHOICES,
  XP_PER_WIN,
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
import { WORLD_ELEMENT_BIAS, worldOf, type World } from "./worlds";

// Bump when a change makes old action logs replay differently. The server
// rejects logs from another version with a clear error (replay.ts).
export const ENGINE_VERSION = 2;

// ---- Tunable constants ----
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const BOSS_EVERY = 5;
// Clearing this floor ends the run as a victory (bounds replay cost and payload size).
export const MAX_FLOOR = 100;
export const VICTORY_COINS = 500;
export const isVictory = (run: Run) =>
  run.status === "over" && run.lives > 0 && run.maxFloor >= MAX_FLOOR;
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
export const FIGHT_COINS = { easy: 10, hard: 20, boss: 60 } as const;
export const FIGHT_XP_MULT = { easy: 1.5, hard: 2.5, boss: 5 } as const;
export const CHEST_COINS = 25;
export const REST_HEAL = 0.4; // fraction of max hp
export const LIFE_LOSS_HEAL = 0.6; // hp fraction after losing a life
export const FLEE_COIN_FRACTION = 0.3; // coins lost when fleeing (min 1 if any)
export const SEDIENTO_HEAL = 0.1; // trait healOnWin
export const GAFE_LOSS_XP = 15; // trait xpOnLoss
export const SHOP_PRICES = {
  heal: 25,
  stat: 60,
  life: 140,
  reroll: 35,
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
  pendingPicks: number; // level-up picks owed
  pendingRelic: RelicId[] | null; // relic offer owed
  rerolls: number; // merchant relic rerolls for the next offer
  bought: string[]; // shop item ids bought on this floor
  node: RunNode | null; // node opened by chooseDoor and not yet resolved
  floorCleared: boolean; // current floor's node is resolved; nextFloor allowed
  attempts: number; // fights started so far; mixed into the fight seed
  pendingSkill: boolean; // class skill pick owed (reached SKILL_LEVEL)
  engineVersion: number;
}

interface ShopBase {
  id: string;
  label: string;
  price: number;
}
export type ShopItem =
  | (ShopBase & { kind: "heal" | "life" | "reroll" })
  | (ShopBase & { kind: "stat"; stat: UpgradeId });

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

export const isBossFloor = (floor: number) => floor % BOSS_EVERY === 0;

export function modsAtFloor(floor: number): EnemyMod[] {
  return (Object.keys(MODIFIER_FLOORS) as EnemyMod[]).filter(
    (m) => floor >= MODIFIER_FLOORS[m],
  );
}

export function doorsFor(seed: number, floor: number): Door[] {
  if (isBossFloor(floor)) return [{ kind: "boss" }];
  const rng = createRng(hashSeed(seed, floor, 0));
  const kinds: DoorKind[] = [rng.pick(["easy", "hard"])];
  const pool = DOOR_POOL.filter((k) => k !== kinds[0]);
  // Deeper floors push more fights: the safe doors thin out.
  const pressure = clamp(
    (floor - FIGHT_PRESSURE_FROM) * FIGHT_PRESSURE_PER_FLOOR,
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
  if (isBossFloor(floor + 1) && !kinds.includes("rest")) {
    const i = kinds.findIndex((k) => k !== "easy" && k !== "hard");
    if (i >= 0) kinds[i] = "rest";
    else if (kinds.length < 3) kinds.push("rest");
    else kinds[kinds.length - 1] = "rest";
  }
  return kinds.map((kind) => ({ kind }));
}

export function groupSize(seed: number, floor: number, kind: FightKind) {
  const rows = GROUP_SCHEDULE[kind].filter((r) => floor >= r.fromFloor);
  const w = rows[rows.length - 1].weights;
  const rng = createRng(hashSeed(seed, floor, 70 + FIGHT_SALT[kind]));
  let r = rng.next() * (w[0] + w[1] + w[2]);
  return w.findIndex((x) => (r -= x) < 0) + 1 || 1;
}

const ROMAN = ["", " II", " III"];

// One group member. Member 0 uses the same stream a lone enemy always had.
function makeEnemy(
  seed: number,
  floor: number,
  kind: FightKind,
  i: number,
  size: number,
): Character {
  const salt = 10 + FIGHT_SALT[kind];
  const rng = createRng(
    i === 0 ? hashSeed(seed, floor, salt) : hashSeed(seed, floor, salt, i),
  );
  const world = worldOf(floor);
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
  const ease = earlyEase(floor);
  return scaleForFloor(
    { ...base, name, element: themed ? world.element : other },
    floor,
    mult * ease,
    hpMult * ease,
  );
}

export function enemyFor(
  seed: number,
  floor: number,
  kind: FightKind,
): Omit<FightNode, "type" | "kind"> {
  const size = groupSize(seed, floor, kind);
  const made = Array.from({ length: size }, (_, i) =>
    makeEnemy(seed, floor, kind, i, size),
  );
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
    mods: modsAtFloor(floor),
    battleSeed: hashSeed(seed, floor, 20 + FIGHT_SALT[kind]),
  };
}

// Relics already owned are never offered again; null when nothing is left.
export function relicOffer(
  seed: number,
  floor: number,
  rerolls = 0,
  owned: readonly RelicId[] = [],
): RelicId[] | null {
  if (floor % RELIC_EVERY !== 0) return null;
  const pool = RELIC_IDS.filter((id) => !owned.includes(id));
  const offer = rollRelics(
    createRng(hashSeed(seed, floor, 30, rerolls)),
    RELIC_CHOICES,
    pool,
    floor,
  );
  return offer.length > 0 ? offer : null;
}

export function shopItems(seed: number, floor: number): ShopItem[] {
  const rng = createRng(hashSeed(seed, floor, 40));
  const price = (k: keyof typeof SHOP_PRICES) => scaled(SHOP_PRICES[k], floor);
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
    isBoss: isBossFloor(run.floor),
    world: worldOf(run.floor),
    doors: doorsFor(run.seed, run.floor),
  };
}

// ---- Run state ----

export function createRun(seed: number, hero: Character): Run {
  return {
    seed,
    floor: 1,
    maxFloor: 1,
    lives: START_LIVES,
    hero,
    hp: hero.stats.hp,
    coins: 0,
    relics: [],
    status: "active",
    ups: {},
    pendingPicks: 0,
    pendingRelic: null,
    rerolls: 0,
    bought: [],
    node: null,
    floorCleared: false,
    attempts: 0,
    pendingSkill: false,
    engineVersion: ENGINE_VERSION,
  };
}

export const effectiveHero = (run: Run): Character => ({
  ...run.hero,
  stats: applyRelicStats(run.hero.stats, run.relics),
});
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
  hero: applyUpgrade(run.hero, id, run.ups[id] ?? 0),
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
    run.pendingRelic !== null
  )
    return run;
  if (run.floor >= MAX_FLOOR)
    return { ...run, status: "over", coins: run.coins + VICTORY_COINS };
  const floor = run.floor + 1;
  return {
    ...run,
    floor,
    maxFloor: Math.max(run.maxFloor, floor),
    floorCleared: false,
    bought: [],
    rerolls: 0,
    pendingRelic: relicOffer(run.seed, run.floor, run.rerolls, run.relics),
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
  const door = doorsFor(run.seed, run.floor)[doorIndex];
  if (run.status !== "active" || run.node || run.floorCleared || !door)
    return null;
  const open = (r: Run, node: RunNode) => ({ run: { ...r, node }, node });
  switch (door.kind) {
    case "easy":
    case "hard":
    case "boss":
      return open(run, {
        type: "fight",
        kind: door.kind,
        ...enemyFor(run.seed, run.floor, door.kind),
      });
    case "chest": {
      const coins = Math.round(
        scaled(CHEST_COINS, run.floor) *
          (1 + relicTotals(run.relics).coinBonus),
      );
      return open(
        { ...run, coins: run.coins + coins },
        { type: "chest", coins },
      );
    }
    case "rest": {
      const next = heal(run, maxHp(run) * REST_HEAL);
      return open(next, { type: "rest", healed: next.hp - run.hp });
    }
    case "merchant":
      return open(run, {
        type: "shop",
        items: shopItems(run.seed, run.floor),
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
  (item.kind === "life" && run.lives >= MAX_LIVES);

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
        r.coins + Math.sign(e.coins) * scaled(Math.abs(e.coins), r.floor),
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
  const coins = choice.cost?.coins ? scaled(choice.cost.coins, run.floor) : 0;
  const hp = choice.cost?.hp ? Math.round(maxHp(run) * choice.cost.hp) : 0;
  return { coins, hp, affordable: run.coins >= coins && run.hp - hp >= 1 };
}

// Null if no event is open, the choice doesn't exist or can't be afforded.
export function resolveEvent(
  run: Run,
  choiceIndex: number,
): { run: Run; text: string } | null {
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
  return {
    run: {
      ...applyEffect(paid, outcome.effect),
      node: null,
      floorCleared: true,
    },
    text: outcome.text,
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
export function applyBattleResult(
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
      scaled(FIGHT_COINS[kind], run.floor) * (1 + t.coinBonus) * group,
    );
    const xp =
      XP_PER_WIN *
      FIGHT_XP_MULT[kind] *
      (1 + XP_FLOOR_SCALE * run.floor) *
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
    return heal(r, maxHp(r) * healFrac);
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
