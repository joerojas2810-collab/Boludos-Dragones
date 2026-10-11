// E2a/E2b comparison against two seeded ENGINE 13 datasets (100+ runs each).
// Usage: npx tsx scripts/compare-e2.ts [--noise=scripts/baseline/motor13-noise.json]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLASSES,
  CLASS_IDS,
  generateCharacter,
  type Character,
  type ClassId,
} from "../src/lib/game/characters";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import {
  actionCounts,
  buildQueue,
  pickIntents,
  skillOf,
  speedOf,
  startBattle,
  step,
  type Battle,
  type Combatant,
  type EnemySlot,
  type Slot,
} from "../src/lib/game/combat";
import { createRng, hashSeed, type Rng } from "../src/lib/game/rng";
import { applyGear, gearBonus, rollGear } from "../src/lib/game/gear";
import { levelCap } from "../src/lib/game/heroLevel";
import { levelsOf } from "../src/lib/game/levels";
import { itemRankOf, DUNGEON_IDS, scaleStats, type DungeonId } from "../src/lib/game/rarity";
import {
  advanceActivationTimer,
  DEFAULT_TIMER_CONVERSIONS,
  initialProgressFromRoll,
  nextActivations,
  THRESHOLD,
} from "../src/lib/game/progressEngine";
import { heroSkill } from "../src/lib/game/skills";
import {
  createStage,
  finishFight,
  levelFights,
  type Stage,
} from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";
import {
  BURN_CAP,
  type StatusEffect,
  type StatusId,
} from "../src/lib/game/statuses";
import { autoPolicy } from "../src/lib/game/auto";

const CASES = 10_000;
const modifiers = [0.7, 0.8, 0.9, 1, 1.08, 1.16, 1.24] as const;
type BaselineRow = {
  classId: ClassId;
  element: Element;
  rank: DungeonId;
  levelAttempts: number;
  clearedLevels: number;
  winRate: number;
  meanTurnsPerLevel: number;
  meanTurnsPerFight: number;
  fights: number;
};
const baseline = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/baseline/motor13.json"), "utf8"),
) as { seed?: number; runsPerLevel?: number; rows?: BaselineRow[] };
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const noiseSamples = (args.get("noise") ?? [13014, 13015, 13016, 13017]
  .map((seed) => `scripts/baseline/motor13-noise-${seed}.json`).join(","))
  .split(",")
  .map((path) => JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as { seed?: number; runsPerLevel?: number; rows?: BaselineRow[] });
if ((baseline.runsPerLevel ?? 0) < 100 || baseline.rows?.length !== 225)
  throw new Error("E2 requires 225 baseline rows with at least 100 runs per level");
const noiseSeeds = noiseSamples.map((sample) => sample.seed);
if (noiseSamples.length < 3 || new Set(noiseSeeds).size !== noiseSeeds.length || noiseSeeds.includes(baseline.seed) || noiseSamples.some((sample) =>
  (sample.runsPerLevel ?? 0) < 100 || sample.rows?.length !== 225,
)) throw new Error("E2 requires at least three distinct independent 225-row noise samples with 100 runs per level");

const sideLabels = (slots: Slot[]) =>
  slots.map((slot) => (slot === "player" ? "player" : "enemy"));
let exactOrderMatches = 0;
let actionCountMatches = 0;
let naturalCountMismatches = 0;
let minSpeed = Number.POSITIVE_INFINITY;
let maxSpeed = 0;
let minRatio = Number.POSITIVE_INFINITY;
let maxRatio = 0;
const mismatchBySpeedRatio = { under1_1: 0, under1_5: 0, under2: 0, under3: 0, threePlus: 0 };
const examples: {
  playerClass: string;
  enemyClass: string;
  playerSpeed: number;
  enemySpeed: number;
  engine13: string[];
  progress: string[];
}[] = [];

type Conversion = {
  cooldown: number;
  status: number;
  reflect: number;
  defending: number;
  burn: number;
};
type TimedStatus = { remaining: number; stacks: number; amount?: number };
type ActorClock = {
  cooldown: number;
  cooldown3: number;
  reflect: number;
  defending: number;
  burnRemainder: number;
  statuses: Map<StatusId, TimedStatus>;
};
type Runtime = { clocks: Map<string, ActorClock>; progress: Map<string, number>; draws: number[] };

const BASE_SEED = baseline.seed ?? 13013;
const ASCENSION = 0;
const STARS = 3;
const HERO_LEVEL = 20;
const FIGHT_STEP_LIMIT = 400;
const RUNS_PER_LEVEL = baseline.runsPerLevel ?? 100;
const CONVERSION_TRIALS: Conversion[] = [
  { ...DEFAULT_TIMER_CONVERSIONS, cooldown: 1, status: 1, reflect: 1, burn: 1 },
  { ...DEFAULT_TIMER_CONVERSIONS, cooldown: 0.7, status: 0.7, reflect: 0.7, burn: 0.7 },
  { ...DEFAULT_TIMER_CONVERSIONS, cooldown: 0.85, status: 0.85, reflect: 0.85, burn: 0.85 },
  { ...DEFAULT_TIMER_CONVERSIONS, cooldown: 0.5, status: 0.5, reflect: 0.5, burn: 0.5 },
];

function makeHero(classId: ClassId, element: Element, rank: DungeonId, run: number): Character {
  const heroRank = itemRankOf(rank);
  const rankIndex = DUNGEON_IDS.indexOf(rank);
  const rng = createRng(hashSeed(BASE_SEED, 11, rankIndex, run));
  const character = generateCharacter(rng, classId);
  character.element = element;
  const pieces = GEAR_TYPES.map((type) => ({
    type,
    rarity: heroRank,
    stars: 0,
    element: character.element,
    ...rollGear(rng, type, heroRank),
  }));
  const base = scaleStats(
    character.stats,
    heroRank,
    STARS,
    Math.min(HERO_LEVEL, levelCap(STARS)),
  );
  const geared = applyGear(base, gearBonus(pieces));
  return {
    ...character,
    rarity: heroRank,
    stars: STARS,
    level: Math.min(HERO_LEVEL, levelCap(STARS)),
    skill: heroSkill(classId),
    stats: {
      ...geared,
      atk:
        Math.round(
          (geared.atk + weaponAtk(heroRank, 0, CLASS_WEAPONS[classId][0])) * 10,
        ) / 10,
    },
  };
}

function recordingRng(seed: number): { rng: Rng; draws: number[] } {
  const base = createRng(seed);
  const draws: number[] = [];
  const next = () => {
    const value = base.next();
    draws.push(value);
    return value;
  };
  return {
    draws,
    rng: {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      chance: (chance) => next() < chance,
      pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    },
  };
}

function newClock(c: Combatant): ActorClock {
  return {
    cooldown: c.cooldown,
    cooldown3: c.cooldown3 ?? 0,
    reflect: c.reflect ?? 0,
    defending: 0,
    burnRemainder: 0,
    statuses: new Map(
      (c.statuses ?? []).map((status) => [status.id, {
        remaining: status.turns,
        stacks: status.stacks,
        ...(status.amount !== undefined && { amount: status.amount }),
      }]),
    ),
  };
}

function projectActor(c: Combatant, clock: ActorClock): Combatant {
  const statuses: StatusEffect[] = [...clock.statuses.entries()]
    .filter(([, status]) => status.remaining > 1e-9)
    .map(([id, status]) => ({
      id,
      stacks: status.stacks,
      turns: Math.max(1, Math.ceil(status.remaining - 1e-9)),
      ...(status.amount !== undefined && { amount: status.amount }),
    }));
  return {
    ...c,
    cooldown: Math.ceil(clock.cooldown - 1e-9),
    cooldown3: Math.ceil(clock.cooldown3 - 1e-9),
    reflect: Math.ceil(clock.reflect - 1e-9),
    defending: clock.defending > 1e-9,
    statuses,
  };
}

function projectBattle(battle: Battle, clocks: Map<string, ActorClock>): Battle {
  const playerClock = clocks.get("player");
  const firstPlayer = battle.queue.indexOf("player");
  return {
    ...battle,
    player: playerClock ? projectActor(battle.player, playerClock) : battle.player,
    enemies: battle.enemies.map((enemy, index) => {
      const clock = clocks.get(`enemy-${index}`);
      const projected = clock ? projectActor(enemy, clock) : enemy;
      const defendingBeforePlayer = firstPlayer > 0 && battle.queue
        .slice(0, firstPlayer)
        .some((slot) => slot !== "player" && slot.e === index && slot.intent === "defend");
      return defendingBeforePlayer ? { ...projected, defending: true } : projected;
    }),
  };
}

function plannedRolls(battle: Battle, draws: number[]) {
  const enemySlots = battle.queue.filter((slot) => slot !== "player").length;
  const live = [...new Set(
    battle.queue.flatMap((slot) => slot === "player" ? [] : [slot.e]),
  )].sort((a, b) => a - b);
  const tailSize = enemySlots + live.length + 1;
  const tail = draws.slice(-tailSize);
  if (tail.length !== tailSize) throw new Error("missing seeded initiative draws");
  const values = tail.slice(enemySlots);
  return {
    player: speedOf(battle.player) * (0.7 + 0.6 * values[values.length - 1]),
    enemies: new Map(live.map((index, i) => [
      index,
      speedOf(battle.enemies[index]) * (0.7 + 0.6 * values[i]),
    ])),
  };
}

function scheduleQueue(
  battle: Battle,
  draws: number[],
  progress: Map<string, number>,
): { battle: Battle; progress: Map<string, number> } {
  const rolls = plannedRolls(battle, draws);
  const activeQueue = battle.queue.filter((slot) =>
    slot === "player" || battle.enemies[slot.e]?.hp > 0,
  );
  const actors = [
    { id: "player", speed: speedOf(battle.player), roll: rolls.player },
    ...[...rolls.enemies.entries()].map(([index, roll]) => ({
      id: `enemy-${index}`,
      speed: speedOf(battle.enemies[index]),
      roll,
    })).filter((actor) => activeQueue.some((slot) =>
      slot !== "player" && `enemy-${slot.e}` === actor.id,
    )),
  ];
  const quotas: Record<string, number> = {};
  const slots = new Map<string, Slot[]>();
  for (const actor of actors) slots.set(actor.id, []);
  for (const slot of activeQueue) {
    const id = slot === "player" ? "player" : `enemy-${slot.e}`;
    quotas[id] = (quotas[id] ?? 0) + 1;
    slots.get(id)?.push(slot);
  }
  const runners = actors.map((actor) => ({
    id: actor.id,
    speed: actor.speed,
    progress:
      ((progress.get(actor.id) ?? 0) +
        initialProgressFromRoll(actor.speed, actor.roll)) % THRESHOLD,
  }));
  const scheduled = nextActivations(runners, { activations: quotas });
  const nextProgress = new Map(scheduled.runners.map((runner) => [runner.id, runner.progress]));
  const nextQueue = scheduled.order.map((id) => {
    const slot = slots.get(id)?.shift();
    if (!slot) throw new Error(`missing scheduled slot for ${id}`);
    return slot;
  });
  return { battle: { ...battle, queue: nextQueue }, progress: nextProgress };
}

function planProgressCycle(battle: Battle, rng: Rng): Battle {
  const live = battle.enemies.flatMap((enemy, index) => enemy.hp > 0 ? [index] : []);
  const counts = battle.enemies.map((enemy) => enemy.hp > 0
    ? actionCounts(speedOf(battle.player), speedOf(enemy), enemy.carry ?? 0)
    : null,
  );
  const intents = battle.enemies.map((enemy, index) =>
    counts[index] ? pickIntents(enemy, counts[index]?.enemy ?? 0, rng) : [],
  );
  const rolls = battle.enemies.map((enemy) =>
    enemy.hp > 0 ? speedOf(enemy) * (0.7 + 0.6 * rng.next()) : -1,
  );
  const playerRoll = speedOf(battle.player) * (0.7 + 0.6 * rng.next());
  const order = [...live].sort((a, b) => rolls[b] - rolls[a] || a - b);
  const enemyActions: EnemySlot[] = [];
  const most = Math.max(0, ...intents.map((list) => list.length));
  for (let n = 0; n < most; n++)
    for (const index of order)
      if (intents[index][n]) enemyActions.push({ e: index, n, intent: intents[index][n] });
  const playerActions = Math.max(1, ...live.map((index) => counts[index]?.player ?? 1));
  const lead = live.filter((index) => rolls[index] > playerRoll).length;
  return {
    ...battle,
    status: "ongoing",
    playerActions,
    queue: buildQueue(playerActions, enemyActions, lead),
    enemies: battle.enemies.map((enemy, index) => ({
      ...enemy,
      ...(counts[index] && { carry: counts[index]?.carry ?? enemy.carry }),
      defending: false,
    })),
  };
}

const sameSlot = (a: Slot, b: Slot): boolean =>
  a === "player"
    ? b === "player"
    : b !== "player" && a.e === b.e && a.n === b.n && a.intent === b.intent;

function consumedSlots(before: Battle, after: Battle): Slot[] {
  if (after.turn > before.turn) return before.queue;
  if (after.status === "ongoing") {
    for (let start = 0; start <= before.queue.length; start++) {
      const suffix = before.queue.slice(start);
      if (
        suffix.length === after.queue.length &&
        suffix.every((slot, index) => sameSlot(slot, after.queue[index]))
      ) return before.queue.slice(0, start);
    }
    return [];
  }
  const playerAt = before.queue.indexOf("player");
  if (after.status === "won")
    return playerAt < 0 ? [] : before.queue.slice(0, playerAt + 1);
  const lastEnemy = [...after.events].reverse().find((event) => event.actor === "enemy")?.enemy;
  if (lastEnemy !== undefined) {
    const afterPlayer = before.queue.findIndex((slot, index) => index > playerAt &&
      slot !== "player" && slot.e === lastEnemy);
    if (afterPlayer >= 0) return before.queue.slice(0, afterPlayer + 1);
  }
  return playerAt < 0 ? [] : before.queue.slice(0, playerAt + 1);
}

function countActivations(
  before: Battle,
  after: Battle,
  prefix: Slot[],
  action: "attack1" | "attack2" | "attack3" | "defend",
): Map<string, number> {
  const counts = new Map<string, number>();
  const playerAt = prefix.indexOf("player");
  if (playerAt >= 0) counts.set("player", 1);
  const enemyEvents = new Set(
    after.events.filter((event) => event.actor === "enemy" && event.enemy !== undefined)
      .map((event) => event.enemy as number),
  );
  prefix.forEach((slot, index) => {
    if (slot === "player" || before.enemies[slot.e]?.hp <= 0) return;
    const acted = index < playerAt || after.enemies[slot.e]?.hp > 0 || enemyEvents.has(slot.e);
    if (acted) {
      const id = `enemy-${slot.e}`;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  });
  // Contraataque can consume a queued player slot without using an activation.
  if (
    action === "attack3" &&
    skillOf(before.player)?.counter &&
    (before.player.reflect ?? 0) > 0 &&
    prefix.filter((slot) => slot === "player").length > 1
  ) counts.set("player", 1);
  return counts;
}

function freezeRoundEndStatuses(battle: Battle, freeze: boolean): Battle {
  if (!freeze) return battle;
  const freezeActor = (actor: Combatant): Combatant => ({
    ...actor,
    statuses: actor.statuses?.map((status) => ({
      ...status,
      turns: 1000,
      ...(status.id === "quemadura" && { amount: 0 }),
    })),
  });
  return {
    ...battle,
    player: freezeActor(battle.player),
    enemies: battle.enemies.map(freezeActor),
  };
}

function undoRoundEndBurn(battle: Battle, previous: Battle): Battle {
  const lines = battle.log.slice(previous.log.length);
  const restore = (actor: Combatant): Combatant => {
    const escaped = actor.char.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`^${escaped} se quema: (\\d+) de daño\\.$`);
    const loss = lines.reduce((sum, line) => sum + Number(expression.exec(line)?.[1] ?? 0), 0);
    return loss
      ? { ...actor, hp: Math.min(actor.char.stats.hp, actor.hp + loss) }
      : actor;
  };
  return { ...battle, player: restore(battle.player), enemies: battle.enemies.map(restore) };
}

function advanceActorClock(
  source: Combatant,
  target: Combatant,
  clock: ActorClock,
  id: string,
  activations: number,
  action: "attack1" | "attack2" | "attack3" | "defend",
  conversion: Conversion,
  roundEnded: boolean,
  enemySlots: Slot[],
): { actor: Combatant; clock: ActorClock } {
  const skill = id === "player" && action === "attack3" ? skillOf(source) : undefined;
  const usedCooldown2 = id === "player"
    ? action === "attack2"
    : enemySlots.some((slot) => slot !== "player" && slot.intent === "attack2");
  const usedCooldown3 = id === "player" && action === "attack3";
  const cooldown = usedCooldown2
    ? target.cooldown + (roundEnded ? 1 : 0)
    : clock.cooldown;
  const cooldown3 = usedCooldown3
    ? (target.cooldown3 ?? 0) + (roundEnded ? 1 : 0)
    : clock.cooldown3;
  const reflect = id === "player" && skill?.counter
    ? (target.reflect ?? 0) + (roundEnded ? 1 : 0)
    : clock.reflect;
  const nextClock: ActorClock = {
    ...clock,
    cooldown: advanceActivationTimer(cooldown, activations, conversion.cooldown),
    cooldown3: advanceActivationTimer(cooldown3, activations, conversion.cooldown),
    reflect: advanceActivationTimer(reflect, activations, conversion.reflect),
    defending:
      id === "player" && action === "defend"
        ? conversion.defending
        : advanceActivationTimer(clock.defending, activations, conversion.defending),
  };
  if (id !== "player") {
    for (const slot of enemySlots) {
      if (slot === "player" || slot.e !== Number(id.slice("enemy-".length))) continue;
      nextClock.defending = slot.intent === "defend"
        ? conversion.defending
        : advanceActivationTimer(nextClock.defending, 1, conversion.defending);
    }
  }

  const oldStatuses = clock.statuses;
  const nextStatuses = new Map<StatusId, TimedStatus>();
  for (const status of target.statuses ?? []) {
    const previous = oldStatuses.get(status.id);
    const untouchedFrozen = !!previous && (
      (roundEnded && status.turns >= 900) ||
      (!roundEnded && status.turns === Math.ceil(previous.remaining - 1e-9) &&
        status.stacks === previous.stacks && status.amount === previous.amount)
    );
    const freshTurns = status.turns + (roundEnded && status.turns < 900 ? 1 : 0);
    nextStatuses.set(status.id, untouchedFrozen
      ? { ...previous, stacks: status.stacks }
      : {
          remaining: freshTurns,
          stacks: status.stacks,
          ...(status.amount !== undefined && { amount: status.amount }),
        });
  }
  nextClock.statuses = nextStatuses;

  let hp = target.hp;
  for (let activation = 0; activation < activations; activation++) {
    const burn = nextClock.statuses.get("quemadura");
    if (burn) {
      nextClock.burnRemainder += conversion.burn;
      while (nextClock.burnRemainder >= 1 - 1e-9) {
        const dmg = Math.min(
          Math.round((burn.amount ?? 0) * burn.stacks),
          Math.round(target.char.stats.hp * BURN_CAP),
        );
        hp = Math.max(0, hp - dmg);
        nextClock.burnRemainder = Math.max(0, nextClock.burnRemainder - 1);
      }
    } else nextClock.burnRemainder = 0;
    for (const [statusId, state] of nextClock.statuses) {
      const remaining = state.remaining - conversion.status;
      if (remaining <= 1e-9) nextClock.statuses.delete(statusId);
      else nextClock.statuses.set(statusId, { ...state, remaining });
    }
  }
  const statuses: StatusEffect[] = [...nextClock.statuses.entries()].map(([statusId, state]) => ({
    id: statusId,
    stacks: state.stacks,
    turns: Math.max(1, Math.ceil(state.remaining - 1e-9)),
    ...(state.amount !== undefined && { amount: state.amount }),
  }));
  return {
    actor: {
      ...target,
      cooldown: Math.ceil(nextClock.cooldown - 1e-9),
      cooldown3: Math.ceil(nextClock.cooldown3 - 1e-9),
      reflect: Math.ceil(nextClock.reflect - 1e-9),
      defending: nextClock.defending > 1e-9,
      hp,
      statuses,
    },
    clock: nextClock,
  };
}

function progressStep(
  battle: Battle,
  action: "attack1" | "attack2" | "attack3" | "defend",
  rng: Rng,
  target: number,
  runtime: Runtime,
  conversion: Conversion,
): { battle: Battle; runtime: Runtime } {
  const projected = projectBattle(battle, runtime.clocks);
  const playerSlots = projected.queue.filter((slot) => slot === "player").length;
  const special = action === "attack3" ? skillOf(projected.player) : undefined;
  const roundMayEnd = playerSlots <= 1 ||
    (playerSlots === 2 && !!special?.counter && (projected.player.reflect ?? 0) > 0);
  const input = freezeRoundEndStatuses(projected, roundMayEnd);
  const nextRaw = step(input, action, rng, target);
  if (nextRaw === input) return { battle, runtime };
  const roundEnded = nextRaw.turn > projected.turn;
  const prefix = consumedSlots(projected, nextRaw);
  const counts = countActivations(projected, nextRaw, prefix, action);
  let nextBattle = roundEnded ? undoRoundEndBurn(nextRaw, projected) : nextRaw;

  for (const [id, actor] of [["player", nextBattle.player] as const, ...nextBattle.enemies.map((enemy, index) => [`enemy-${index}`, enemy] as const)]) {
    const clock = runtime.clocks.get(id) ?? newClock(actor);
    const activations = counts.get(id) ?? 0;
    const relatedSlots = prefix.filter((slot) => slot !== "player" && `enemy-${slot.e}` === id);
    const advanced = advanceActorClock(
      projected.enemies[Number(id.slice("enemy-".length))] ?? projected.player,
      actor,
      clock,
      id,
      activations,
      action,
      conversion,
      roundEnded,
      relatedSlots,
    );
    runtime.clocks.set(id, advanced.clock);
    if (id === "player") nextBattle = { ...nextBattle, player: advanced.actor };
    else {
      const index = Number(id.slice("enemy-".length));
      nextBattle = {
        ...nextBattle,
        enemies: nextBattle.enemies.map((enemy, i) => i === index ? advanced.actor : enemy),
      };
    }
  }
  if (nextBattle.status === "ongoing" && roundEnded) {
    // A cooldown adjusted by actor activations can invalidate an announced class move.
    nextBattle = {
      ...nextBattle,
      queue: nextBattle.queue.map((slot) =>
        slot !== "player" && slot.intent === "attack2" &&
        (runtime.clocks.get(`enemy-${slot.e}`)?.cooldown ?? 0) > 0
          ? { ...slot, intent: "attack1" }
          : slot,
      ),
    };
  }
  const playerDead = nextBattle.player.hp <= 0;
  const enemiesDead = nextBattle.enemies.every((enemy) => enemy.hp <= 0);
  if (enemiesDead || playerDead) {
    nextBattle = { ...nextBattle, status: enemiesDead ? "won" : "lost", queue: [] };
  } else if (roundEnded && nextBattle.status !== "ongoing") {
    nextBattle = planProgressCycle({ ...nextBattle, status: "ongoing" }, rng);
  }
  if (nextBattle.status === "ongoing" && roundEnded) {
    const scheduled = scheduleQueue(nextBattle, runtime.draws, runtime.progress);
    nextBattle = scheduled.battle;
    runtime.progress = scheduled.progress;
  }
  return { battle: nextBattle, runtime };
}

function startProgressFight(stage: Stage): { battle: Battle; rng: Rng; runtime: Runtime } {
  const fight = stage.fights[stage.index];
  const seed = hashSeed(stage.seed, stage.index, fight.battleSeed);
  const tracked = recordingRng(seed);
  const battle = startBattle(stage.hero, fight.enemies, tracked.rng, {
    playerHp: stage.hp,
    mods: fight.mods,
    enemyStatus: fight.role !== "normal",
  });
  const runtime: Runtime = {
    clocks: new Map([
      ["player", newClock(battle.player)],
      ...battle.enemies.map((enemy, index) => [`enemy-${index}`, newClock(enemy)] as const),
    ]),
    progress: new Map(),
    draws: tracked.draws,
  };
  const scheduled = scheduleQueue(battle, tracked.draws, runtime.progress);
  runtime.progress = scheduled.progress;
  return { battle: scheduled.battle, rng: tracked.rng, runtime };
}

function runE2Level(
  classId: ClassId,
  element: Element,
  rank: DungeonId,
  run: number,
  levelIndex: number,
  conversion: Conversion,
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
    const started = startProgressFight(stage);
    let battle = started.battle;
    const runtime = started.runtime;
    for (let stepIndex = 0; stepIndex < FIGHT_STEP_LIMIT && battle.status === "ongoing"; stepIndex++) {
      const pick = autoPolicy(battle);
      const next = progressStep(
        battle,
        pick.action,
        started.rng,
        pick.target ?? 0,
        runtime,
        conversion,
      ).battle;
      if (next === battle) break;
      battle = next;
    }
    if (battle.status === "ongoing")
      throw new Error(`E2 fight exceeded ${FIGHT_STEP_LIMIT} steps (${rank} level ${levelIndex + 1}).`);
    turns += battle.turn;
    fights++;
    stage = finishFight(stage, battle);
  }
  return { cleared: stage.status === "cleared", turns, fights };
}

function simulateConversion(conversion: Conversion): BaselineRow[] {
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
            const result = runE2Level(classId, element, rank, run, levelIndex, conversion);
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
  return rows;
}

function aggregateBy(rows: BaselineRow[], keyOf: (row: BaselineRow) => string) {
  const groups = new Map<string, { cleared: number; attempts: number; turns: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const value = groups.get(key) ?? { cleared: 0, attempts: 0, turns: 0 };
    value.cleared += row.clearedLevels;
    value.attempts += row.levelAttempts;
    value.turns += row.meanTurnsPerLevel * row.levelAttempts;
    groups.set(key, value);
  }
  return new Map([...groups].map(([key, value]) => [key, {
    winRate: value.cleared / value.attempts,
    meanTurnsPerLevel: value.turns / value.attempts,
  }]));
}

function compareRows(
  candidate: BaselineRow[],
  reference: BaselineRow[],
  limits: { ranks: Map<string, number>; classes: Map<string, number> },
) {
  const rankRef = aggregateBy(reference, (row) => row.rank);
  const rankE2 = aggregateBy(candidate, (row) => row.rank);
  const classRef = aggregateBy(reference, (row) => row.classId);
  const classE2 = aggregateBy(candidate, (row) => row.classId);
  const cellDifferences = candidate.map((row) => {
    const ref = reference.find((other) =>
      other.classId === row.classId && other.element === row.element && other.rank === row.rank,
    );
    return {
      cell: `${row.classId}/${row.element}/${row.rank}`,
      winRatePp: Math.abs(row.winRate - (ref?.winRate ?? 0)) * 100,
    };
  });
  const rankDifferences = [...rankRef].map(([rank, ref]) => ({
    rank,
    winRatePp: Math.abs(ref.winRate - (rankE2.get(rank)?.winRate ?? 0)) * 100,
    tolerancePp: (limits.ranks.get(rank) ?? 0) + 2,
  }));
  const classDifferences = [...classRef].map(([classId, ref]) => ({
    classId,
    winRatePp: Math.abs(ref.winRate - (classE2.get(classId)?.winRate ?? 0)) * 100,
    tolerancePp: (limits.classes.get(classId) ?? 0) + 2,
  }));
  const baseTurns = reference.reduce((sum, row) => sum + row.meanTurnsPerLevel * row.levelAttempts, 0) /
    reference.reduce((sum, row) => sum + row.levelAttempts, 0);
  const e2Turns = candidate.reduce((sum, row) => sum + row.meanTurnsPerLevel * row.levelAttempts, 0) /
    candidate.reduce((sum, row) => sum + row.levelAttempts, 0);
  const durationPct = Math.abs(e2Turns - baseTurns) / Math.max(1e-9, baseTurns) * 100;
  return {
    ranks: rankDifferences,
    classes: classDifferences,
    maxCellPp: Math.max(0, ...cellDifferences.map((row) => row.winRatePp)),
    worstCells: cellDifferences.sort((a, b) => b.winRatePp - a.winRatePp).slice(0, 10),
    durationPct,
    baseTurns,
    e2Turns,
    passed: rankDifferences.every((row) => row.winRatePp <= row.tolerancePp) &&
      classDifferences.every((row) => row.winRatePp <= row.tolerancePp) &&
      durationPct <= 10,
  };
}

for (let index = 0; index < CASES; index++) {
  const playerClass = CLASS_IDS[Math.floor(index / 400) % CLASS_IDS.length];
  const enemyClass = CLASS_IDS[index % CLASS_IDS.length];
  const variation = createRng(hashSeed(13013, index));
  const playerSpeed =
    CLASSES[playerClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    modifiers[variation.int(0, modifiers.length - 1)];
  const enemySpeed =
    CLASSES[enemyClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    modifiers[variation.int(0, modifiers.length - 1)];
  minSpeed = Math.min(minSpeed, playerSpeed, enemySpeed);
  maxSpeed = Math.max(maxSpeed, playerSpeed, enemySpeed);
  const ratio = Math.max(playerSpeed, enemySpeed) / Math.min(playerSpeed, enemySpeed);
  minRatio = Math.min(minRatio, ratio);
  maxRatio = Math.max(maxRatio, ratio);

  const counts = actionCounts(playerSpeed, enemySpeed, 0);
  const initiative = createRng(hashSeed(13013, index, 91));
  // planRound consumes one intent roll for each announced enemy action first.
  for (let n = 0; n < counts.enemy; n++) initiative.next();
  const enemyRoll = enemySpeed * (0.7 + 0.6 * initiative.next());
  const playerRoll = playerSpeed * (0.7 + 0.6 * initiative.next());
  const lead = enemyRoll > playerRoll ? 1 : 0;
  const enemySlots: EnemySlot[] = Array.from({ length: counts.enemy }, (_, n) => ({
    e: 0,
    n,
    intent: "attack1",
  }));
  const reference = sideLabels(
    buildQueue(Math.max(1, counts.player), enemySlots, lead),
  );
  const runners = [
    {
      id: "player",
      speed: playerSpeed,
      progress: initialProgressFromRoll(playerSpeed, playerRoll),
    },
    {
      id: "enemy",
      speed: enemySpeed,
      progress: initialProgressFromRoll(enemySpeed, enemyRoll),
    },
  ];
  const natural = nextActivations(runners).order;
  const candidate = nextActivations(runners, {
    activations: { player: Math.max(1, counts.player), enemy: counts.enemy },
  }).order;
  if (
    natural.filter((id) => id === "player").length !== Math.max(1, counts.player) ||
    natural.filter((id) => id === "enemy").length !== counts.enemy
  ) naturalCountMismatches++;
  const countsMatch =
    candidate.filter((id) => id === "player").length === Math.max(1, counts.player) &&
    candidate.filter((id) => id === "enemy").length === counts.enemy;
  if (countsMatch) actionCountMatches++;
  if (candidate.join(",") === reference.join(",")) exactOrderMatches++;
  else {
    if (examples.length < 5)
      examples.push({
        playerClass,
        enemyClass,
        playerSpeed: Number(playerSpeed.toFixed(3)),
        enemySpeed: Number(enemySpeed.toFixed(3)),
        engine13: reference,
        progress: candidate,
      });
    if (ratio < 1.1) mismatchBySpeedRatio.under1_1++;
    else if (ratio < 1.5) mismatchBySpeedRatio.under1_5++;
    else if (ratio < 2) mismatchBySpeedRatio.under2++;
    else if (ratio < 3) mismatchBySpeedRatio.under3++;
    else mismatchBySpeedRatio.threePlus++;
  }
}

const report = {
  cases: CASES,
  speedRange: [Number(minSpeed.toFixed(3)), Number(maxSpeed.toFixed(3))],
  ratioRange: [Number(minRatio.toFixed(3)), Number(maxRatio.toFixed(3))],
  actionCountMatches,
  actionCountMatchPercent: Number(((actionCountMatches / CASES) * 100).toFixed(2)),
  naturalActionCountMismatches: naturalCountMismatches,
  naturalActionCountMatchPercent: Number(((1 - naturalCountMismatches / CASES) * 100).toFixed(2)),
  exactOrderMatches,
  exactOrderMatchPercent: Number(((exactOrderMatches / CASES) * 100).toFixed(2)),
  exactOrderMismatches: CASES - exactOrderMatches,
  mismatchBySpeedRatio,
  examples,
  baselineRunsPerLevel: baseline.runsPerLevel,
  baselineRows: baseline.rows?.length,
};
const baselineRows = baseline.rows ?? [];
const baselineRanks = aggregateBy(baselineRows, (row) => row.rank);
const baselineClasses = aggregateBy(baselineRows, (row) => row.classId);
const percentile95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = 0.95 * (sorted.length - 1);
  const low = Math.floor(position);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (position - low);
};
const noiseByRank = new Map([...baselineRanks].map(([rank, row]) => [rank, percentile95(
  noiseSamples.map((sample) => {
    const group = aggregateBy(sample.rows ?? [], (item) => item.rank).get(rank);
    return Math.abs(row.winRate - (group?.winRate ?? 0)) * 100;
  }),
)]));
const noiseByClass = new Map([...baselineClasses].map(([classId, row]) => [classId, percentile95(
  noiseSamples.map((sample) => {
    const group = aggregateBy(sample.rows ?? [], (item) => item.classId).get(classId);
    return Math.abs(row.winRate - (group?.winRate ?? 0)) * 100;
  }),
)]));
const noiseRankRows = [...noiseByRank].map(([rank, noisePp]) => ({ rank, noisePp }));
const noiseClassRows = [...noiseByClass].map(([classId, noisePp]) => ({ classId, noisePp }));
const noiseLimits = { ranks: noiseByRank, classes: noiseByClass };
const e2Iterations: {
  iteration: number;
  conversion: Conversion;
  metrics: ReturnType<typeof compareRows>;
}[] = [];
for (const [index, conversion] of CONVERSION_TRIALS.entries()) {
  console.log(`E2b iteration ${index + 1}: ${JSON.stringify(conversion)}`);
  const candidate = simulateConversion(conversion);
  const metrics = compareRows(candidate, baselineRows, noiseLimits);
  e2Iterations.push({ iteration: index + 1, conversion, metrics });
  console.log(JSON.stringify({ iteration: index + 1, passed: metrics.passed, ranks: metrics.ranks, classes: metrics.classes, durationPct: metrics.durationPct, maxCellPp: metrics.maxCellPp }, null, 2));
  if (metrics.passed) break;
}
const best = [...e2Iterations].sort((a, b) =>
  Number(b.metrics.passed) - Number(a.metrics.passed) ||
  Math.max(...a.metrics.ranks.map((x) => x.winRatePp / x.tolerancePp), ...a.metrics.classes.map((x) => x.winRatePp / x.tolerancePp), a.metrics.durationPct / 10) -
  Math.max(...b.metrics.ranks.map((x) => x.winRatePp / x.tolerancePp), ...b.metrics.classes.map((x) => x.winRatePp / x.tolerancePp), b.metrics.durationPct / 10),
)[0];
const finalRecommendation = best?.metrics.passed ? "CONTINUAR" : "ABORTAR";
const formatPp = (value: number) => `${value.toFixed(2)} pp`;
const iterationRows = e2Iterations.map((trial) =>
  `| ${trial.iteration} | cd/status/reflect/defend/burn = ${trial.conversion.cooldown}/${trial.conversion.status}/${trial.conversion.reflect}/${trial.conversion.defending}/${trial.conversion.burn} | ${trial.metrics.ranks.map((x) => `${x.rank}: ${formatPp(x.winRatePp)} / ${formatPp(x.tolerancePp)}`).join(", ")} | ${trial.metrics.classes.map((x) => `${x.classId}: ${formatPp(x.winRatePp)} / ${formatPp(x.tolerancePp)}`).join(", ")} | ${trial.metrics.durationPct.toFixed(2)} % | ${formatPp(trial.metrics.maxCellPp)} | ${trial.metrics.passed ? "Pasa" : "Falla"} |`,
).join("\n");
const worstCells = best?.metrics.worstCells.map((row) =>
  `| ${row.cell} | ${formatPp(row.winRatePp)} |`,
).join("\n") ?? "";
const markdown = `# E2 — Resultado de la puerta de viabilidad\n\n` +
  `## E2a: orden de activaciones\n\n` +
  `Se compararon ${report.cases.toLocaleString("es-AR")} muestras deterministas (semillas derivadas de 13013). ` +
  `Se recorrieron por igual las 25 parejas ordenadas de clases, con velocidades base de sus plantillas, ` +
  `factor de atributo (0,85–1,15) y multiplicadores de estado actuales (0,70–1,24). En cada caso se usaron ` +
  `actionCounts(carry=0) y buildQueue con el orden de tiradas real: una tirada de intención por acción enemiga, ` +
  `luego iniciativa del enemigo y del jugador; el mismo roll se convirtió en progreso inicial mediante ` +
  `100 × (1 − 0,7 / (roll / velocidad)). ` +
  `La línea base motor 13 presente tiene ${report.baselineRows} filas y ${report.baselineRunsPerLevel} corridas por nivel.\n\n` +
  `| Medida | Resultado |\n|---|---:|\n` +
  `| Velocidad muestreada | ${report.speedRange[0]}–${report.speedRange[1]} |\n` +
  `| Razón entre velocidades | ${report.ratioRange[0]}–${report.ratioRange[1]} |\n` +
  `| Cantidad de activaciones coincide | ${report.actionCountMatches}/${report.cases} (${report.actionCountMatchPercent} %) |\n` +
  `| Reloj libre coincide en cantidad | ${CASES - report.naturalActionCountMismatches}/${report.cases} (${report.naturalActionCountMatchPercent} %) |\n` +
  `| Orden exacto coincide | ${report.exactOrderMatches}/${report.cases} (${report.exactOrderMatchPercent} %) |\n` +
  `| Órdenes distintas | ${report.exactOrderMismatches}/${report.cases} (${(100 - report.exactOrderMatchPercent).toFixed(2)} %) |\n\n` +
  `### Desacuerdos por razón de velocidades\n\n` +
  `| Razón | Casos con orden distinto |\n|---|---:|\n` +
  `| < 1,10 | ${report.mismatchBySpeedRatio.under1_1} |\n` +
  `| 1,10–<1,50 | ${report.mismatchBySpeedRatio.under1_5} |\n` +
  `| 1,50–<2,00 | ${report.mismatchBySpeedRatio.under2} |\n` +
  `| 2,00–<3,00 | ${report.mismatchBySpeedRatio.under3} |\n` +
  `| ≥ 3,00 | ${report.mismatchBySpeedRatio.threePlus} |\n\n` +
  `### Ejemplos reproducibles de orden distinto\n\n` +
  `| PJ (VEL) | Enemigo (VEL) | Motor 13 | Progreso |\n|---|---|---|---|\n` +
  report.examples.map((row) =>
    `| ${row.playerClass} (${row.playerSpeed}) | ${row.enemyClass} (${row.enemySpeed}) | ${row.engine13.join(" → ")} | ${row.progress.join(" → ")} |`,
  ).join("\n") + `\n\n` +
  `## Recomendación E2a\n\n` +
  `Las cuotas actionCounts conservan el número de activaciones; el reloj libre por sí solo difiere en ` +
  `${report.naturalActionCountMismatches} casos y se documenta, porque la nueva API conserva las cuotas del motor ` +
  `mientras progreso inicial del roll ordena las acciones. El desacuerdo restante de orden se reporta como diferencia ` +
  `del planificador por progreso frente al intercalado por rondas del motor 13.\n\n` +
  `## Piso de ruido del motor 13\n\n` +
  `Se comparó la muestra de referencia (semilla ${baseline.seed}) con ${noiseSamples.length} muestras independientes ` +
  `del motor 13, cada una con ${baseline.runsPerLevel} corridas por nivel (semillas ${noiseSamples.map((sample) => sample.seed).join(", ")}). ` +
  `El piso de ruido es el percentil 95 de las diferencias absolutas agregadas por rango y clase; las tolerancias ` +
  `para E2b son ese piso + 2 pp.\n\n` +
  `| Rango | Piso ruido | Tolerancia E2b |\n|---|---:|---:|\n` +
  noiseRankRows.map((row) => `| ${row.rank} | ${formatPp(row.noisePp)} | ${formatPp(row.noisePp + 2)} |`).join("\n") + `\n\n` +
  `| Clase | Piso ruido | Tolerancia E2b |\n|---|---:|---:|\n` +
  noiseClassRows.map((row) => `| ${row.classId} | ${formatPp(row.noisePp)} | ${formatPp(row.noisePp + 2)} |`).join("\n") + `\n\n` +
  `## E2b: balance con temporizadores por activación\n\n` +
  `Se comparó la matriz completa de 225 celdas con ${RUNS_PER_LEVEL} corridas por nivel, mismas semillas y ` +
  `mismo perfil de héroes que la primera muestra del motor. Un ciclo del prototipo conserva las cuotas de acción de actionCounts; progreso acumulado ` +
  `y el progreso inicial derivado del roll ordenan las ranuras. Cooldowns, estados, reflect, defensa y Quemadura ` +
  `usan relojes por portador con conversiones fraccionales. La simulación reusa step de motor 13 como ejecutor ` +
  `aislado y ajusta los relojes después de cada segmento entre activaciones; combat.ts permanece intacto.\n\n` +
  `| Iteración | Conversión | Diferencia de winrate por rango (delta / tolerancia) | Por clase (delta / tolerancia) | Duración | Máx. celda diagnóstica | Resultado |\n` +
  `|---:|---|---|---|---:|---:|---|\n${iterationRows}\n\n` +
  `### Diez celdas más alejadas (diagnóstico; no son criterio)\n\n| Clase / elemento / rango | Diferencia |\n|---|---:|\n${worstCells}\n\n` +
  `Duración media motor 13: ${best?.metrics.baseTurns.toFixed(2)} rondas por nivel; prototipo: ${best?.metrics.e2Turns.toFixed(2)} ciclos por nivel. ` +
  `Tolerancias: piso de ruido + 2 pp por rango y clase; duración ±10 %. Las celdas se muestran solo como diagnóstico. ` +
  `Resultado final: **${finalRecommendation}**${best?.metrics.passed ? ` con conversión ${JSON.stringify(best.conversion)}` : " tras las iteraciones permitidas"}.\n\n` +
  `### Lectura y limitaciones\n\n` +
  `La conversión se aplica al final del segmento que resuelve la acción del jugador y las ranuras enemigas ` +
  `hasta su siguiente acción. Por eso, cuando varias activaciones del mismo portador ocurren dentro del segmento, ` +
  `los tics se acumulan después de resolverlo; no se altera el orden interno de step ni sus reglas. Los ciclos de ` +
  `boss y regen que no están en la lista del contrato conservan el comportamiento de motor 13. El prototipo sigue ` +
  `aislado y no debe conectarse sin revisar la recomendación y estas limitaciones.\n`;

writeFileSync(resolve(process.cwd(), "docs/E2_RESULTADO.md"), markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Wrote docs/E2_RESULTADO.md");
