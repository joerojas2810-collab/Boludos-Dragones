import {
  CLASS_PASSIVE_ADVANTAGE_BONUS,
  CLASS_PASSIVE_DMG_REDUCTION,
  CLASS_PASSIVE_FURY,
  CLASS_PASSIVE_MAGE_CRIT,
  CLASS_PASSIVE_MAGE_REDUCTION,
  CLASS_PASSIVE_REGEN,
  CLASSES,
  type Attack,
  type Character,
  type ClassId,
} from "./characters";
import {
  ADVANTAGE_BONUS,
  ELEMENTS,
  elementMultiplier,
  ELEMENT_LABEL,
} from "./elements";
import type { Rng } from "./rng";
import {
  COUNTER_REFLECT,
  COUNTER_ROUNDS,
  COUNTER_TAKEN,
  SKILLS,
  type Skill,
} from "./skills";
import {
  addStatus,
  BURN_CAP,
  burnDamage,
  CLASS_STACKS,
  cleanse,
  defMult,
  OVERLOAD_BONUS,
  OVERLOAD_EVERY,
  speedMult,
  stacksOf,
  STATUS_DATA,
  STATUS_OF_ELEMENT,
  tickStatuses,
  type StatusEffect,
} from "./statuses";
import {
  ADAPT_AFTER,
  ADAPT_FACTOR,
  ARMOR_FRACTION,
  ARMOR_REGROW,
  ARMOR_TAKEN,
  BROKEN_ROUNDS,
  BROKEN_TAKEN,
  HEAD_HEAL,
  HEAD_THRESHOLDS,
  HUNGER_BELOW,
  HUNGER_STEAL,
  NEW_BOSS,
  PLAGUE_LOSS,
  PRESSURE_MAX,
  PRESSURE_STEP,
  RAMP_MAX,
  RAMP_STEP,
  RITUAL_EVERY,
  RITUAL_HEAL_CUT,
  RITUAL_ROUNDS,
  ruleOf,
  stanceFor,
  STANCES,
  type BossState,
} from "./bossRules";
import { EXECUTE_HP, HIGH_HP, RAGE_MAX, traitTotals } from "./traits";
import { weaponSpecial } from "./weapons";

export type AttackKey = "attack1" | "attack2";
export type MoveKey = AttackKey | "attack3"; // attack3 = class skill (skills.ts)
export type Action = MoveKey | "defend";
export type Intent = AttackKey | "defend";
export type Status = "ongoing" | "won" | "lost";

export const DEFEND_FACTOR = 0.5;
// Defense is a percentage: def / (def + DEF_K * attacker ATK), capped. Relative to
// the attacker so it stays meaningful at every power level (tuned in phase 6).
export const DEF_K = 1;
export const DEF_CAP = 0.75;
// Passive healing caps (active skills do not count).
export const REGEN_CAP = 0.02; // gear regen, fraction of max hp per round
export const LIFESTEAL_CAP = 0.15; // gear + perks, fraction of damage dealt
export const PASSIVE_HEAL_CAP = 0.06; // class blessing + regen, per round
export const MAX_ENEMIES = 3;

// Perfect guard: choosing Defender while at least one STRONG hit (Ataque 2) is
// still announced this round. That strong hit is cut to PERFECT_GUARD_FACTOR of
// its damage (instead of DEFEND_FACTOR; it replaces it, it does not stack) and
// the guard earns a bonus of the hero's class (see earnGuard). Weaker hits in the
// same round still get the normal DEFEND_FACTOR.
export const PERFECT_GUARD_FACTOR = 0.25;
export const GUARD_REFLECT = 0.4; // Caballero: share of the avoided damage sent back
export const GUARD_CRIT_BONUS = 0.5; // Pícaro: extra crit chance on the next hit
export const GUARD_HEAL = 0.04; // Clérigo: fraction of max hp healed
export const isStrongIntent = (k: MoveKey | Intent): boolean => k === "attack2";

// Speed -> actions ("acciones acumuladas"). Per (hero, enemy) pair the slower
// side acts once per round; the faster side acts floor(carry) times, where
// carry grows by fast/slow every round and keeps its fractional remainder
// (12 vs 8 -> 1,2,1,2...; 12 vs 6 -> 2 every round). Capped per combatant. With
// several enemies every enemy keeps its own carry against the hero, and the
// hero gets the MOST actions any pair gives him (see planRound).
export const MAX_ACTIONS_PER_ROUND = 3;
const CARRY_EPS = 1e-9;

// Enemy modifiers unlocked every 10 floors in runs (see run.ts). They apply to
// EVERY enemy of the group.
export type EnemyMod =
  "regeneracion" | "escudo" | "dobleAtaque" | "elementoCambiante";
export const REGEN_FRACTION = 0.03; // of max hp, per round
export const SHIELD_FRACTION = 0.3; // of max hp, absorbs damage first
export const DOUBLE_ATTACK_FACTOR = 0.5; // damage of the extra attack
export const ELEMENT_SHIFT_EVERY = 2; // rounds

// Ceilings for trait rules (they used to be shared with relics).
export const TRAIT_CAPS = { dmgReduction: 0.35, critDamage: 1.2 } as const;

// Optional combat perks (player only; no relics feed them any more).
export interface Perks {
  lifesteal?: number; // fraction of damage dealt healed
  critDamage?: number; // added to CRIT_MULTIPLIER
  regen?: number; // fraction of max hp healed at the end of each round
  dmgReduction?: number; // fraction of incoming damage ignored
  dmgMult?: number; // multiplier on damage dealt
}

export interface BattleOptions {
  perks?: Perks;
  playerHp?: number; // carried hp (runs); defaults to full
  playerShield?: number;
  freeHits?: number; // enemy attacks the player evades automatically
  mods?: EnemyMod[];
  enemyStatus?: boolean; // enemies apply their element status on strong hits (elites, bosses)
}

export interface BattleEvent {
  actor: "player" | "enemy";
  kind: "hit" | "crit" | "miss" | "buff";
  classId: ClassId;
  move: MoveKey;
  weapon?: string; // attacker's weapon type (sfx)
  enemy: number; // index in Battle.enemies of the enemy involved
}

export type Side = "player" | "enemy";

export interface Combatant {
  char: Character;
  hp: number;
  cooldown: number; // rounds before attack2 is usable again
  cooldown3?: number; // same for the class skill (attack3)
  defending: boolean; // lasts until the end of the round
  // (an enemy's Defender is active from round start: it is announced)
  guard?: boolean; // perfect guard earned this round (see PERFECT_GUARD_FACTOR)
  riposte?: boolean; // Mago / Pícaro guard bonus, spent by the next damaging action
  reflect?: number; // rounds left of Contraataque
  taken?: number; // damage received this round (Contraataque returns what already landed)
  takenFrom?: number; // enemy slot of the last hit received this round
  carry?: number; // enemies: speed remainder against the hero
  shield?: number;
  freeHits?: number;
  perks?: Perks;
  statuses?: StatusEffect[]; // elemental effects (statuses.ts)
  charge?: number; // Rayo hits since the last overload
  missed?: boolean; // Terco: the last hit missed
  guardedLast?: boolean; // Paciente: it spent the last round defending (spent by its next hit)
  opened?: boolean; // Fanfarrón: it has already thrown its first hit
  rage?: number; // Furioso: hits taken so far
  boss?: BossState; // dungeon boss mechanic state (bossRules.ts)
  healCut?: number; // rounds left with the heals cut (Reina Marchita ritual)
  applies?: boolean; // enemies: strong hits apply their element's status (elites, bosses)
}

// A round is a queue of action slots (see buildQueue). `step` resolves one
// player action plus every enemy slot up to the next player slot. An enemy slot
// carries its announced intent; `n` is its ordinal among that enemy's actions
// this round.
export type EnemySlot = { e: number; n: number; intent: Intent };
export type Slot = "player" | EnemySlot;

export interface Battle {
  player: Combatant;
  enemies: Combatant[]; // 1..MAX_ENEMIES; dead ones stay (hp 0) to keep indices
  queue: Slot[]; // action slots still to resolve this round
  playerActions: number; // player's total actions this round
  turn: number; // round number
  actions: number; // player actions resolved so far (0 = fight not started)
  status: Status;
  log: string[];
  events: BattleEvent[]; // what happened in the last step, for sfx/animation
  guardEarned?: boolean; // the last step earned a perfect guard (sfx/animation only)
  mods?: EnemyMod[];
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// ---- trait rules (engine v3). Additive with relic perks, then capped by the
// relic caps so traits and relics never stack past the same ceiling.
const rulesOf = (c: Combatant) => traitTotals(c.char.traits);

// Fraction of incoming damage ignored: relic perk + Último aliento (grows as hp
// drops), capped at TRAIT_CAPS.dmgReduction.
export const dmgReductionOf = (c: Combatant): number => {
  const low = rulesOf(c).lowHpReduction;
  const missing = 1 - clamp(c.hp / c.char.stats.hp, 0, 1);
  const perk = c.perks?.dmgReduction ?? 0;
  // Cauteloso: sturdier while healthy
  const high = c.hp / c.char.stats.hp > HIGH_HP ? rulesOf(c).highHpReduction : 0;
  return Math.min(
    Math.max(perk, TRAIT_CAPS.dmgReduction),
    perk + low * missing + high,
  );
};

// Class passive + style resonance damage reduction, capped together.
export const PASSIVE_REDUCTION_CAP = 0.25;
export const passiveReduction = (c: Combatant): number =>
  Math.min(
    PASSIVE_REDUCTION_CAP,
    (c.char.classId === "caballero" ? CLASS_PASSIVE_DMG_REDUCTION : 0) +
      (c.char.classId === "mago" ? CLASS_PASSIVE_MAGE_REDUCTION : 0) +
      (c.char.gear?.dmgTaken ?? 0),
  );

// Fraction of damage absorbed by defense (0..DEF_CAP).
export const defReduction = (att: Combatant, def: Combatant): number => {
  const d =
    def.char.stats.def *
    defMult(def.statuses) *
    (def.boss && ruleOf(def) === "posturas" ? STANCES[def.boss.stance].def : 1);
  return Math.min(DEF_CAP, d / Math.max(1e-6, d + DEF_K * att.char.stats.atk));
};

// Speed after Escarcha / Impulso.
export const speedOf = (c: Combatant): number =>
  c.char.stats.speed * speedMult(c.statuses) * (1 + RAMP_STEP * (c.boss?.ramp ?? 0));

// Passive healing per round as a fraction of max hp: class blessing plus gear
// and perk regen, with the global cap.
export const passiveHealRate = (c: Combatant): number =>
  Math.min(
    PASSIVE_HEAL_CAP,
    (c.char.classId === "clerigo" ? CLASS_PASSIVE_REGEN : 0) +
      Math.min(REGEN_CAP, c.char.stats.regen) +
      (c.perks?.regen ?? 0),
  );

export const lifestealOf = (c: Combatant): number =>
  Math.min(LIFESTEAL_CAP, c.char.stats.lifesteal + (c.perks?.lifesteal ?? 0));

// Every heal (attack heal, skills, lifesteal, regen, Clérigo blessing).
export const healMult = (c: Combatant): number =>
  (1 - rulesOf(c).healPenalty) * ((c.healCut ?? 0) > 0 ? RITUAL_HEAL_CUT : 1);

// Berserker Furia: damage bonus by hp threshold.
export const furyBonus = (c: Combatant): number =>
  c.char.classId !== "berserker"
    ? 0
    : (CLASS_PASSIVE_FURY.find((t) => c.hp / c.char.stats.hp < t.below)?.bonus ?? 0);

// Berserker perfect guard: the next Ataque 2 / 3 costs no hp and recharges 1 round sooner.
export const guardFree = (c: Combatant): boolean =>
  !!c.riposte && c.char.classId === "berserker";

export const skillOf = (c: Combatant): Skill | undefined =>
  c.char.skill ? SKILLS[c.char.skill] : undefined;

export function attackOf(c: Combatant, key: MoveKey): Attack {
  if (key === "attack3") {
    const s = skillOf(c);
    if (s)
      return {
        name: s.name,
        power: s.power,
        accuracy: s.accuracy,
        cooldown: s.cooldown,
        heal: 0,
      };
    key = "attack1";
  }
  if (key === "attack2") {
    const sp = weaponSpecial(c.char.weapon?.type);
    if (sp) return sp;
  }
  return CLASSES[c.char.classId][key];
}

const newCombatant = (char: Character): Combatant => ({
  char,
  hp: char.stats.hp,
  cooldown: 0,
  defending: false,
});

// ---- queries (also used by the UI and the auto policy) ----

// Indices (in Battle.enemies) of the enemies still standing.
export const livingEnemies = (b: Battle): number[] =>
  b.enemies.flatMap((e, i) => (e.hp > 0 ? [i] : []));

// Enemy slots not resolved yet this round (dead enemies skipped).
export const pendingIntents = (b: Battle): EnemySlot[] =>
  b.queue.filter(
    (s): s is EnemySlot => s !== "player" && b.enemies[s.e].hp > 0,
  );

export const enemyIntents = (b: Battle, e: number): Intent[] =>
  pendingIntents(b)
    .filter((s) => s.e === e)
    .map((s) => s.intent);

// A strong hit is still coming: Defender now would be a perfect guard.
export const strongPending = (b: Battle): boolean =>
  pendingIntents(b).some((s) => isStrongIntent(s.intent));

export const actionsLeft = (b: Battle): number =>
  b.queue.filter((s) => s === "player").length;

// One intent per enemy action; at most one Ataque 2 per round (cooldown).
export function pickIntents(enemy: Combatant, n: number, rng: Rng): Intent[] {
  const out: Intent[] = [];
  let cd = enemy.cooldown;
  for (let i = 0; i < n; i++) {
    const roll = rng.next();
    if (roll < 0.2) out.push("defend");
    else if (roll < 0.5 && cd === 0) {
      out.push("attack2");
      cd = 1;
    } else out.push("attack1");
  }
  return out;
}

// Actions each side gets this round and the new carry.
export function actionCounts(
  playerSpeed: number,
  enemySpeed: number,
  carry: number,
): { player: number; enemy: number; carry: number } {
  const playerFast = playerSpeed >= enemySpeed;
  const slow = Math.max(0.1, playerFast ? enemySpeed : playerSpeed);
  const total = carry + (playerFast ? playerSpeed : enemySpeed) / slow;
  const n = Math.floor(total + CARRY_EPS);
  const fast = Math.min(MAX_ACTIONS_PER_ROUND, n);
  return {
    player: playerFast ? fast : 1,
    enemy: playerFast ? 1 : fast,
    carry: Math.max(0, total - n), // the excess over the cap is discarded
  };
}

// Round order. `lead` enemy slots act before the hero's first action (the
// enemies whose initiative beat his); after that it alternates hero / enemy
// side and the leftovers follow (hero first, 2 vs 1: P E P; lead 1, 1 vs 2:
// E P E).
export function buildQueue(
  playerN: number,
  enemyActs: readonly EnemySlot[],
  lead: number,
): Slot[] {
  const es = [...enemyActs];
  const q: Slot[] = es.splice(0, Math.max(0, lead));
  let p = playerN;
  let next: Side = "player";
  while (p + es.length > 0) {
    if (next === "player" && p === 0) next = "enemy";
    else if (next === "enemy" && es.length === 0) next = "player";
    if (next === "player") {
      q.push("player");
      p--;
    } else q.push(es.shift() as EnemySlot);
    next = next === "player" ? "enemy" : "player";
  }
  return q;
}

// Enemy action slots of a round: pass k lists every enemy with a k-th action,
// in initiative order.
function enemySlots(
  order: readonly number[],
  intents: readonly (readonly Intent[])[],
): EnemySlot[] {
  const out: EnemySlot[] = [];
  const most = Math.max(0, ...intents.map((i) => i.length));
  for (let n = 0; n < most; n++)
    for (const e of order)
      if (intents[e]?.[n]) out.push({ e, n, intent: intents[e][n] });
  return out;
}

const roll = (c: Combatant, rng: Rng) =>
  speedOf(c) * (0.7 + 0.6 * rng.next());

// Rolls everything announced for a new round. An enemy's Defender (if any of
// its intents is one) is active from the start, so shown estimates stay honest.
// RNG order: intents (enemy by enemy), then initiative (enemies, then hero).
function planRound(
  player: Combatant,
  enemies: Combatant[],
  turn: number,
  rng: Rng,
): {
  queue: Slot[];
  playerActions: number;
  enemies: Combatant[];
  lines: string[];
} {
  const live = enemies.flatMap((e, i) => (e.hp > 0 ? [i] : []));
  // Bosses: Hidra heads and a starving Devorador add actions on top of the speed ones.
  const extra = (e: Combatant) =>
    (e.boss?.heads ?? 0) +
    (ruleOf(e) === "hambre" && e.hp < e.char.stats.hp * HUNGER_BELOW ? 1 : 0);
  const counts = enemies.map((e) => {
    if (e.hp <= 0) return null;
    const c = actionCounts(speedOf(player), speedOf(e), e.carry ?? 0);
    return { ...c, enemy: Math.min(MAX_ACTIONS_PER_ROUND + 1, c.enemy + extra(e)) };
  });
  const intents: Intent[][] = enemies.map((e, i) =>
    counts[i] ? pickIntents(e, counts[i].enemy, rng) : [],
  );
  const rolls = enemies.map((e) => (e.hp > 0 ? roll(e, rng) : -1));
  const mine = roll(player, rng);
  const order = [...live].sort((a, b) => rolls[b] - rolls[a] || a - b);
  const lead = live.filter((i) => rolls[i] > mine).length;
  const playerActions = Math.max(1, ...live.map((i) => counts[i]?.player ?? 1));
  const lines = [`— Ronda ${turn} —`];
  if (playerActions > 1)
    lines.push(
      `${player.char.name} es más veloz: actúa ${playerActions} veces.`,
    );
  for (const i of live) {
    const e = enemies[i];
    if (ruleOf(e) === "posturas")
      lines.push(`${e.char.name} adopta la postura ${stanceFor(turn)}.`);
    if (ruleOf(e) === "marchitar" && turn % RITUAL_EVERY === 0)
      lines.push(`${e.char.name} prepara un ritual: defiende con guardia perfecta para anularlo.`);
  }
  for (const i of live)
    if ((counts[i]?.enemy ?? 1) > 1)
      lines.push(
        `${enemies[i].char.name} es más veloz: actúa ${counts[i]?.enemy} veces.`,
      );
  return {
    queue: buildQueue(playerActions, enemySlots(order, intents), lead),
    playerActions,
    enemies: enemies.map((e, i) => ({
      ...e,
      carry: counts[i]?.carry ?? e.carry,
      defending: intents[i].includes("defend"),
      ...(e.boss && ruleOf(e) === "posturas" && { boss: { ...e.boss, stance: stanceFor(turn) } }),
    })),
    lines,
  };
}

// Forces the round layout (tests, scripted fights): how many enemy slots open
// the round (true = 1), the announced actions (one list for the first enemy, or
// one list per enemy) and how many actions the hero gets.
export function withRound(
  b: Battle,
  enemyFirst: boolean | number,
  intents: readonly Intent[] | readonly (readonly Intent[])[],
  playerActions = 1,
): Battle {
  const per: (readonly Intent[])[] = (intents as readonly unknown[]).every(
    (i) => Array.isArray(i),
  )
    ? (intents as (readonly Intent[])[])
    : [intents as readonly Intent[]];
  const order = b.enemies.map((_, i) => i);
  return {
    ...b,
    playerActions,
    queue: buildQueue(
      playerActions,
      enemySlots(order, per),
      enemyFirst === true ? 1 : enemyFirst === false ? 0 : enemyFirst,
    ),
    enemies: b.enemies.map((e, i) => ({
      ...e,
      defending: (per[i] ?? []).includes("defend"),
    })),
  };
}

export function startBattle(
  player: Character,
  foes: Character | readonly Character[],
  rng: Rng,
  opts: BattleOptions = {},
): Battle {
  const mods = opts.mods ?? [];
  const list: readonly Character[] = "name" in foes ? [foes] : foes;
  const es = list.slice(0, MAX_ENEMIES).map((c) => {
    const e = newCombatant(c);
    if (opts.enemyStatus) e.applies = true;
    if (ruleOf(e)) e.boss = { ...NEW_BOSS };
    if (ruleOf(e) === "armadura") e.shield = Math.round(c.stats.hp * ARMOR_FRACTION);
    if (mods.includes("escudo"))
      e.shield = Math.round(c.stats.hp * SHIELD_FRACTION);
    return e;
  });
  const p = newCombatant(player);
  if (opts.playerHp !== undefined) p.hp = opts.playerHp;
  if (opts.playerShield) p.shield = opts.playerShield;
  if (opts.freeHits) p.freeHits = opts.freeHits;
  if (opts.perks) p.perks = opts.perks;
  const plan = planRound(p, es, 1, rng);
  return {
    ...(mods.length ? { mods } : {}),
    queue: plan.queue,
    playerActions: plan.playerActions,
    player: p,
    enemies: plan.enemies,
    turn: 1,
    actions: 0,
    status: "ongoing",
    events: [],
    log: [
      ...(list.length === MAX_ENEMIES && !list.some((c) => c.bossId)
        ? ["¡Emboscada! Tres enemigos te rodean."]
        : []),
      ...list
        .slice(0, MAX_ENEMIES)
        .map((c) => `${c.name} (${ELEMENT_LABEL[c.element]}) aparece.`),
      `${list[0].name}: «${list[0].catchphrase}»`,
      `${player.name}: «${player.catchphrase}»`,
      ...plan.lines,
    ],
  };
}

// No dodge in engine v11: only accuracy decides a hit.
export function hitChance(att: Combatant, key: MoveKey): number {
  if (key === "attack1") return 1; // the basic attack is the safe one; accuracy is the risk of the others
  const retry = att.missed ? rulesOf(att).retryAccuracy : 0; // Terco insists after a miss
  return clamp(attackOf(att, key).accuracy + att.char.stats.accuracy + retry, 0.05, 1);
}

// Personality traits that change the damage of a hit (see traits.ts).
function traitDealtMult(att: Combatant, def: Combatant): number {
  const r = rulesOf(att);
  let m = 1;
  if (r.pride) m += att.hp / att.char.stats.hp > 0.5 ? r.pride : -r.pride;
  if (r.executeBonus && def.hp < def.char.stats.hp * EXECUTE_HP) m += r.executeBonus;
  if (r.guardedBonus && att.guardedLast) m += r.guardedBonus;
  if (r.openingBonus && !att.opened) m += r.openingBonus;
  if (r.statusBonus && def.statuses?.length) m += r.statusBonus;
  if (r.rageStep) m += r.rageStep * Math.min(RAGE_MAX, att.rage ?? 0);
  return m;
}

// Damage multiplier of the defender's stance against this move.
const stanceFactor = (def: Combatant, key: MoveKey): number =>
  !def.defending
    ? 1
    : def.guard && isStrongIntent(key)
      ? PERFECT_GUARD_FACTOR
      : DEFEND_FACTOR;

// Skill bonus while the user is hurt (Aniquilación).
function selfFactor(att: Combatant, key: MoveKey): number {
  const s = key === "attack3" ? skillOf(att) : undefined;
  return s?.selfBelow !== undefined &&
    att.hp < att.char.stats.hp * s.selfBelow
    ? (s.selfMult ?? 1)
    : 1;
}

// Boss mechanics on damage: what a boss deals and what it takes.
function bossDealtMult(att: Combatant): number {
  if (!att.boss) return 1;
  const r = ruleOf(att);
  if (r === "presion") return 1 + PRESSURE_STEP * att.boss.pressure;
  if (r === "posturas") return STANCES[att.boss.stance].dmg;
  return 1;
}
function bossTakenMult(def: Combatant): number {
  if (!def.boss || ruleOf(def) !== "armadura") return 1;
  if ((def.shield ?? 0) > 0) return ARMOR_TAKEN;
  return def.boss.broken > 0 ? BROKEN_TAKEN : 1;
}

// Detonar: extra damage per status stack on the target.
function detonateFactor(att: Combatant, def: Combatant, key: MoveKey): number {
  const d = key === "attack3" ? skillOf(att)?.detonate : undefined;
  return d ? 1 + d * (def.statuses ?? []).reduce((n, s) => n + s.stacks, 0) : 1;
}

// Skill bonus vs a weakened target (Ejecutar).
function executeFactor(att: Combatant, def: Combatant, key: MoveKey): number {
  const s = key === "attack3" ? skillOf(att) : undefined;
  return s?.executeBelow !== undefined &&
    def.hp < def.char.stats.hp * s.executeBelow
    ? (s.executeMult ?? 1)
    : 1;
}

// Expected damage of a non-critical hit (one strike).
// Every hit (both sides) is scaled by this: longer fights, so statuses, guard and cooldowns matter.
export const DAMAGE_SCALE = 0.8;

export function estimateDamage(
  att: Combatant,
  def: Combatant,
  key: MoveKey,
  crit = false, // true: skip the non-crit penalty (the crit multiplier is applied by the caller)
): number {
  const a = attackOf(att, key);
  const raw =
    att.char.stats.atk *
    a.power *
    attackElementMultiplier(att, def) *
    (1 - defReduction(att, def));
  return Math.max(
    1,
    Math.round(
      raw *
        DAMAGE_SCALE *
        stanceFactor(def, key) *
        (att.perks?.dmgMult ?? 1) *
        (1 - dmgReductionOf(def)) *
        (crit ? 1 : 1 - rulesOf(att).nonCritPenalty) *
        (1 - passiveReduction(def)) *
        (1 + (att.char.gear?.dmgDealt ?? 0)) *
        ((def.reflect ?? 0) > 0 ? COUNTER_TAKEN : 1) *
        executeFactor(att, def, key) *
        selfFactor(att, key) *
        detonateFactor(att, def, key) *
        bossDealtMult(att) *
        traitDealtMult(att, def) *
        bossTakenMult(def) *
        (1 + furyBonus(att)),
    ),
  );
}

// Crit multiplier: Pícaro passive replaces the base; relic bonus adds on top.
export const critMultiplier = (c: Combatant): number =>
  c.char.stats.critDmg +
  Math.min(
    Math.max(c.perks?.critDamage ?? 0, TRAIT_CAPS.critDamage),
    (c.perks?.critDamage ?? 0) + rulesOf(c).critDamage,
  );

// Element multiplier with the Mago passive (stronger advantage when attacking).
export function attackElementMultiplier(
  att: Combatant,
  def: Combatant,
): number {
  const m = elementMultiplier(
    att.char.weapon?.element ?? att.char.element,
    def.char.element,
  );
  return att.char.classId === "mago" && m > 1
    ? m - ADVANTAGE_BONUS + CLASS_PASSIVE_ADVANTAGE_BONUS
    : m;
}

// End-of-round passive heal (Clérigo blessing + regen), one capped number.
export function passiveHeal(c: Combatant, log: string[]): Combatant {
  const rate = passiveHealRate(c);
  if (rate <= 0) return c;
  const hp = Math.min(
    c.char.stats.hp,
    c.hp + Math.round(c.char.stats.hp * rate * healMult(c)),
  );
  if (hp > c.hp) log.push(`${c.char.name} se recupera ${hp - c.hp}.`);
  return { ...c, hp };
}

// Perfect guard earned: flags the combatant and grants its class bonus.
const GUARD_TEXT: Record<ClassId, string> = {
  caballero: "devolverá parte del golpe",
  mago: "potenciará su próximo golpe",
  picaro: "afinará su puntería",
  clerigo: "se purifica",
  berserker: "se enciende: su próxima habilidad sale gratis",
};
export function earnGuard(c: Combatant, log: string[]): Combatant {
  let out: Combatant = { ...c, guard: true };
  if (["mago", "picaro", "berserker"].includes(c.char.classId)) out.riposte = true;
  if (c.char.classId === "clerigo") {
    const hp = Math.min(
      c.char.stats.hp,
      c.hp + Math.round(c.char.stats.hp * GUARD_HEAL * healMult(c)),
    );
    out = { ...out, hp, statuses: cleanse(c.statuses) };
  }
  log.push(`¡Guardia perfecta! ${c.char.name} ${GUARD_TEXT[c.char.classId]}.`);
  return out;
}

// End of round: the burn bites (capped at BURN_CAP of max hp), then every status
// loses a round.
export function statusTick(c: Combatant, log: string[]): Combatant {
  if (!c.statuses?.length) return c;
  const burn = Math.min(
    burnDamage(c.statuses),
    Math.round(c.char.stats.hp * BURN_CAP),
  );
  if (burn > 0) log.push(`${c.char.name} se quema: ${burn} de daño.`);
  return {
    ...c,
    hp: Math.max(0, c.hp - burn),
    statuses: tickStatuses(c.statuses),
  };
}

// End-of-round upkeep of a boss: pressure and speed grow, the armor comes back.
function bossRoundEnd(c: Combatant, turn: number, log: string[]): Combatant {
  if (!c.boss) return c;
  const rule = ruleOf(c);
  const boss = { ...c.boss };
  let out = c;
  if (rule === "presion") boss.pressure = Math.min(PRESSURE_MAX, boss.pressure + 1);
  if (rule === "velocidad" && turn % 2 === 0) boss.ramp = Math.min(RAMP_MAX, boss.ramp + 1);
  if (rule === "armadura") {
    boss.broken = Math.max(0, boss.broken - 1);
    if (boss.regrow > 0 && --boss.regrow === 0) {
      boss.broken = 0;
      out = { ...c, shield: Math.round(c.char.stats.hp * ARMOR_FRACTION) };
      log.push(`${c.char.name} recompone su armadura.`);
    }
  }
  return { ...out, boss };
}

// A boss reacts to the hit it just took: the armor breaks, the hydra grows a head.
function bossOnHit(before: Combatant, after: Combatant, log: string[]): Combatant {
  const rule = ruleOf(after);
  if (!after.boss || !rule) return after;
  if (rule === "armadura" && (before.shield ?? 0) > 0 && (after.shield ?? 0) <= 0) {
    log.push(`¡La armadura de ${after.char.name} se rompe! Queda Roto.`);
    return { ...after, boss: { ...after.boss, broken: BROKEN_ROUNDS, regrow: ARMOR_REGROW } };
  }
  if (rule === "cabezas" && after.hp > 0) {
    const max = after.char.stats.hp;
    const crossed = HEAD_THRESHOLDS.filter(
      (t) => before.hp > t * max && after.hp <= t * max,
    ).length;
    if (crossed > 0) {
      log.push(`A ${after.char.name} le brota otra cabeza: se cura y ataca más.`);
      return {
        ...after,
        hp: Math.min(max, after.hp + Math.round(max * HEAD_HEAL * crossed)),
        boss: { ...after.boss, heads: after.boss.heads + crossed },
      };
    }
  }
  return after;
}

export interface Strike {
  attacker: Combatant;
  defender: Combatant;
  dmg: number; // damage dealt after crit (0 on a miss)
}

export function strike(
  att: Combatant,
  def: Combatant,
  key: MoveKey,
  rng: Rng,
  log: string[],
  events: BattleEvent[],
  actor: BattleEvent["actor"],
  enemy: number,
  dmgFactor = 1,
  asHero = actor === "player", // duels: both sides are heroes (class special, statuses, overload)
): Strike {
  const a = attackOf(att, key);
  const skill = key === "attack3" ? skillOf(att) : undefined;
  const who = att.char.name;
  const on = actor === "player" ? ` sobre ${def.char.name}` : "";
  let hp = att.hp;
  const free = guardFree(att) && key !== "attack1";
  if (a.selfCost && !free) {
    // The price of Frenesí: a share of the CURRENT hp, never lethal.
    const cost = Math.min(hp - 1, Math.round(hp * a.selfCost));
    if (cost > 0) {
      hp -= cost;
      log.push(`${who} se desangra ${cost} al usar ${a.name}.`);
    }
  }
  if (a.heal > 0) {
    hp = Math.min(
      att.char.stats.hp,
      hp + Math.round(att.char.stats.hp * a.heal * healMult(att)),
    );
    log.push(`${who} usa ${a.name} y recupera ${hp - att.hp} de vida.`);
  }
  const attacker: Combatant = {
    ...att,
    hp,
    ...(key === "attack2" && { cooldown: a.cooldown + 1 - (free ? 1 : 0) }),
    ...(key === "attack3" && { cooldown3: a.cooldown + 1 - (free ? 1 : 0) }),
  };
  const ev = (kind: BattleEvent["kind"]) =>
    events.push({
      actor,
      kind,
      classId: att.char.classId,
      move: key,
      weapon: att.char.weapon?.type,
      enemy,
    });
  if (def.freeHits) {
    log.push(`${def.char.name} esquiva el golpe de ${who}.`);
    return {
      attacker,
      defender: { ...def, freeHits: def.freeHits - 1 },
      dmg: 0,
    };
  }
  if (!rng.chance(hitChance(att, key))) {
    if (a.heal === 0) log.push(`${who} usa ${a.name}${on} y falla.`);
    ev("miss");
    return { attacker: { ...attacker, missed: true, opened: true }, defender: def, dmg: 0 };
  }
  const crit = rng.chance(
    att.char.stats.crit +
      (att.char.classId === "mago" ? CLASS_PASSIVE_MAGE_CRIT : 0) +
      (att.riposte && att.char.classId === "picaro" ? GUARD_CRIT_BONUS : 0),
  );
  // Apostador: one extra draw per landed hit, only for gamblers (old streams intact).
  const spread = rulesOf(att).spread;
  const gamble = spread > 0 ? 1 + spread * (2 * rng.next() - 1) : 1;
  // Elemental effects: the player always applies them, enemies only on strong
  // hits when flagged (elites, bosses). Mago's perfect guard doubles the stacks.
  const element = att.char.weapon?.element ?? att.char.element;
  // The class special applies statuses, except Detonar, which only consumes them.
  // Every hero hit applies its element's status (1 stack; the class special 2), except Detonar,
  // which only consumes them. Enemies apply theirs only when flagged (elites, bosses) on strong hits.
  const classMove = asHero && key === "attack3" && !skill?.detonate;
  const canApply = asHero ? !skill?.detonate : !!att.applies && isStrongIntent(key);
  const guardBoost = att.riposte && att.char.classId === "mago" ? 2 : 1;
  const stacks = guardBoost * (classMove ? CLASS_STACKS : 1);
  // Rayo: any landed hit charges, the overload is spent by the class special.
  let charge = att.charge ?? 0;
  let overload = false;
  if (element === "rayo" && (asHero || canApply)) {
    charge = Math.min(OVERLOAD_EVERY, charge + guardBoost);
    if (charge >= OVERLOAD_EVERY && (classMove || !asHero)) {
      overload = true;
      charge -= OVERLOAD_EVERY;
    }
  }
  const dmg = Math.round(
    estimateDamage(att, def, key, crit) *
      (crit ? critMultiplier(att) : 1) *
      dmgFactor *
      gamble *
      (overload ? 1 + OVERLOAD_BONUS : 1),
  );
  ev(crit ? "crit" : "hit");
  log.push(
    `${who} usa ${a.name}${on}: ${dmg} de daño${crit ? " (¡crítico!)" : ""}${overload ? " ¡Sobrecarga!" : ""}.`,
  );
  const absorbed = Math.min(def.shield ?? 0, dmg);
  if (absorbed > 0)
    log.push(`El escudo de ${def.char.name} absorbe ${absorbed}.`);
  const steal = Math.round(
    dmg *
      (lifestealOf(att) +
        (skill?.lifesteal ?? 0) +
        (ruleOf(att) === "hambre" ? HUNGER_STEAL : 0)) *
      healMult(att),
  );
  let defender: Combatant = {
    ...def,
    hp: Math.max(0, def.hp - (dmg - absorbed)),
    ...(def.shield !== undefined && { shield: def.shield - absorbed }),
  };
  defender = bossOnHit(def, defender, log);
  if (skill?.detonate && defender.statuses?.length) {
    log.push(`${def.char.name} detona: se borran sus estados.`);
    defender = { ...defender, statuses: [] };
  }
  let ownStatuses = attacker.statuses;
  const sid = canApply ? STATUS_OF_ELEMENT[element] : undefined;
  if (sid === "impulso") ownStatuses = addStatus(ownStatuses, sid, stacks);
  else if (sid)
    defender = {
      ...defender,
      statuses: addStatus(
        defender.statuses,
        sid,
        stacks,
        sid === "quemadura" ? Math.round(dmg * STATUS_DATA.quemadura.per) : undefined,
        defender.char.stats.resist,
      ),
    };
  if (sid) log.push(`${sid === "impulso" ? who : def.char.name}: ${STATUS_DATA[sid].label} ×${stacksOf(sid === "impulso" ? ownStatuses : defender.statuses, sid)}.`);
  let back = 0;
  if ((def.reflect ?? 0) > 0) {
    // Contraataque: the hit was already reduced; the attacker eats it in full.
    back = Math.round((dmg / COUNTER_TAKEN) * COUNTER_REFLECT);
    defender = { ...defender, reflect: 0 };
    log.push(`${def.char.name} contraataca y devuelve ${back} a ${who}.`);
  }
  if (def.guard && def.defending && isStrongIntent(key) && def.char.classId === "caballero") {
    // Reflejo: part of the damage the perfect guard avoided goes back, no hit roll.
    const reflected = Math.round(dmg * (1 / PERFECT_GUARD_FACTOR - 1) * GUARD_REFLECT);
    back += reflected;
    log.push(`${def.char.name} refleja ${reflected} a ${who}.`);
  }
  const thorns = Math.round(dmg * rulesOf(def).thorns);
  if (thorns > 0) {
    back += thorns;
    log.push(`Las espinas de ${def.char.name} devuelven ${thorns} a ${who}.`);
  }
  return {
    attacker: {
      ...attacker,
      hp: Math.max(0, Math.min(att.char.stats.hp, attacker.hp + steal) - back),
      missed: false,
      opened: true,
      ...(ownStatuses && { statuses: ownStatuses }),
      ...(charge !== (att.charge ?? 0) && { charge }),
    },
    defender: {
      ...defender,
      rage: Math.min(RAGE_MAX, (defender.rage ?? 0) + 1),
      taken: (def.taken ?? 0) + Math.max(0, dmg - absorbed),
      takenFrom: enemy,
    },
    dmg,
  };
}

// Stalemate breaker: past this turn every enemy gains +ENRAGE_STEP ATQ per turn.
export const ENRAGE_AFTER_TURN = 40;
export const ENRAGE_STEP = 0.1;

// Resolves the player's current action, then every slot up to the player's next
// one (or the end of the round). An enemy opener acts after the player CHOSE
// (so Defender covers it). Cooldowns, regen, mods and the round counter tick
// once per round, not per action. A win or death ends the round on the spot. `target` indexes the LIVING
// enemies (default: the first one); single-target moves use it, area moves,
// Defender ignores it. An out-of-range target is an illegal action.
export function step(
  b: Battle,
  action: Action,
  rng: Rng,
  target?: number,
): Battle {
  if (b.status !== "ongoing" || !b.queue.includes("player")) return b;
  if (action === "attack2" && b.player.cooldown > 0) return b;
  const skill = action === "attack3" ? skillOf(b.player) : undefined;
  if (action === "attack3" && (!skill || (b.player.cooldown3 ?? 0) > 0))
    return b;
  const alive = livingEnemies(b);
  if (
    target !== undefined &&
    (!Number.isInteger(target) || target < 0 || target >= alive.length)
  )
    return b;
  const tIdx = alive[target ?? 0];
  const log: string[] = [];
  const events: BattleEvent[] = [];
  let player: Combatant = { ...b.player };
  const enemies: Combatant[] = b.enemies.map((e) => ({ ...e }));
  const fallen = enemies.map((e) => e.hp <= 0);

  if (action === "defend" || skill?.guard) {
    player.defending = true;
    if (action === "defend") log.push(`${player.char.name} se defiende.`);
    if (!player.guard && strongPending(b)) player = earnGuard(player, log);
  }

  const guardEarned = log.some((l) => l.startsWith("¡Guardia perfecta!"));
  const queue = [...b.queue];
  let playerDone = b.playerActions - queue.filter((s) => s === "player").length;
  let playerActed = false;
  let end: Status | null = null;

  // The hero's move. Strikes update `player` and `enemies` in place.
  // Vigía Eterno: it reads a hero who repeats the same action.
  const adapted = (i: number) => {
    const last = enemies[i].boss?.last ?? [];
    return (
      ruleOf(enemies[i]) === "aprende" &&
      last.length >= ADAPT_AFTER &&
      last.every((a) => a === action)
    );
  };
  const hit = (i: number, key: MoveKey, factor = 1) => {
    if (adapted(i)) {
      factor *= ADAPT_FACTOR;
      log.push(`${enemies[i].char.name} te lee: tu golpe repetido le hace menos.`);
    }
    const r = strike(
      player,
      enemies[i],
      key,
      rng,
      log,
      events,
      "player",
      i,
      factor,
    );
    player = r.attacker;
    enemies[i] = r.defender;
    return r.dmg;
  };
  const playMove = () => {
    if (action === "attack1" || action === "attack2") {
      const dealt = hit(tIdx, action);
      if (dealt > 0 && !(guardFree(player) && action === "attack1"))
        player.riposte = false;
      if (dealt > 0) player.guardedLast = false;
      return;
    }
    if (!skill) return;
    const cd = skill.cooldown + 1 - (guardFree(player) ? 1 : 0);
    if (skill.power === 0) {
      player.cooldown3 = cd;
      const m = player.char.stats.hp;
      const bits: string[] = [];
      if (skill.heal) {
        const hp = Math.min(
          m,
          player.hp + Math.round(m * skill.heal * healMult(player)),
        );
        bits.push(`recupera ${hp - player.hp} de vida`);
        player.hp = hp;
      }
      if (skill.shield) {
        const s = Math.round(m * skill.shield);
        player.shield = (player.shield ?? 0) + s;
        bits.push(`gana un escudo de ${s}`);
      }
      if (skill.counter) {
        player.reflect = COUNTER_ROUNDS;
        const taken = player.taken ?? 0;
        const foe = enemies[player.takenFrom ?? tIdx];
        if (taken > 0 && foe && foe.hp > 0) {
          // The rival already hit this round: the hit is returned right now.
          const back = Math.round((taken / COUNTER_TAKEN) * COUNTER_REFLECT);
          enemies[player.takenFrom ?? tIdx] = { ...foe, hp: Math.max(0, foe.hp - back) };
          bits.push(`devuelve ${back} a ${foe.char.name}`);
          player.taken = 0;
        } else bits.push("se prepara para devolver el próximo golpe");
      }
      if (skill.guard) bits.push("se protege");
      log.push(`${player.char.name} usa ${skill.name}: ${bits.join(" y ")}.`);
      events.push({
        actor: "player",
        kind: "buff",
        classId: player.char.classId,
        move: "attack3",
        enemy: tIdx,
      });
      return;
    }
    let dealt = 0;
    if (skill.area) {
      for (const i of alive) if (enemies[i].hp > 0) dealt += hit(i, "attack3");
    } else {
      for (let h = 0; h < (skill.hits ?? 1) && enemies[tIdx].hp > 0; h++)
        dealt += hit(tIdx, "attack3");
    }
    player.cooldown3 = cd;
    if (dealt > 0) {
      player.riposte = false;
      player.guardedLast = false;
    }
  };

  while (queue.length && !end) {
    const slot = queue[0];
    if (slot === "player" && playerActed) break;
    queue.shift();
    if (slot === "player") {
      playerActed = true;
      if (playerDone++ > 0) log.push(`${player.char.name} actúa de nuevo.`);
      if (action !== "defend") playMove();
      enemies.forEach((e, i) => {
        if (e.boss && ruleOf(e) === "aprende")
          enemies[i] = {
            ...e,
            boss: { ...e.boss, last: [...e.boss.last, action].slice(-ADAPT_AFTER) },
          };
      });
    } else if (enemies[slot.e].hp > 0) {
      let foe = enemies[slot.e];
      if (slot.n > 0) log.push(`${foe.char.name} actúa de nuevo.`);
      if (slot.intent === "defend") {
        log.push(`${foe.char.name} se defiende.`);
        continue;
      }
      const r = strike(
        foe,
        player,
        slot.intent,
        rng,
        log,
        events,
        "enemy",
        slot.e,
      );
      foe = r.attacker;
      player = r.defender;
      if (
        foe.boss &&
        ruleOf(foe) === "presion" &&
        isStrongIntent(slot.intent) &&
        player.guard &&
        player.defending &&
        foe.boss.pressure > 0
      ) {
        foe = { ...foe, boss: { ...foe.boss, pressure: 0 } };
        log.push(`La guardia perfecta apaga la presión de ${foe.char.name}.`);
      }
      if (b.mods?.includes("dobleAtaque") && player.hp > 0 && foe.hp > 0) {
        const x = strike(
          foe,
          player,
          "attack1",
          rng,
          log,
          events,
          "enemy",
          slot.e,
          DOUBLE_ATTACK_FACTOR,
        );
        foe = x.attacker;
        player = x.defender;
      }
      enemies[slot.e] = foe;
    }
    enemies.forEach((e, i) => {
      if (e.hp <= 0 && !fallen[i]) {
        fallen[i] = true;
        log.push(`${e.char.name} cae.`);
        const kh = rulesOf(player).killHeal; // Glotón feeds on the fallen
        if (kh > 0 && player.hp > 0) {
          const hp = Math.min(
            player.char.stats.hp,
            player.hp + Math.round(player.char.stats.hp * kh * healMult(player)),
          );
          if (hp > player.hp) log.push(`${player.char.name} se alimenta: recupera ${hp - player.hp}.`);
          player = { ...player, hp };
        }
      }
    });
    if (enemies.every((e) => e.hp <= 0)) end = "won";
    else if (player.hp <= 0) {
      end = "lost";
      log.push(`${player.char.name} cae.`);
    }
  }

  const actions = b.actions + 1;
  if (end || queue.length)
    return {
      ...b,
      player,
      enemies,
      queue: end ? [] : queue,
      status: end ?? "ongoing",
      events,
      guardEarned,
      actions,
      log: [...b.log, ...log],
    };

  // ---- end of round ----
  const guarded = !!player.guard; // perfect guard earned this round (Reina Marchita ritual)
  const defended = !!player.defending; // Paciente: this round was spent defending
  player = {
    ...player,
    guardedLast: defended,
    healCut: Math.max(0, (player.healCut ?? 0) - 1),
    defending: false,
    guard: false,
    cooldown: Math.max(0, player.cooldown - 1),
    cooldown3: Math.max(0, (player.cooldown3 ?? 0) - 1),
    reflect: Math.max(0, (player.reflect ?? 0) - 1),
    taken: 0,
  };
  player = statusTick(passiveHeal(player, log), log);
  const bosses = enemies.filter((e) => e.hp > 0 && e.boss);
  const bossRule = (r: string) => bosses.some((e) => ruleOf(e) === r);
  if (bossRule("plaga")) {
    const loss = Math.round(player.char.stats.hp * PLAGUE_LOSS);
    player = { ...player, hp: Math.max(0, player.hp - loss) };
    log.push(`La plaga te consume ${loss} de vida.`);
  }
  if (bossRule("marchitar") && b.turn % RITUAL_EVERY === 0) {
    if (guarded) log.push("Tu guardia perfecta anula el ritual marchito.");
    else {
      player = {
        ...player,
        healCut: RITUAL_ROUNDS,
        statuses: addStatus(player.statuses, "ruptura", 1, undefined, player.char.stats.resist),
      };
      log.push("El ritual te marchita: Ruptura y curas a la mitad.");
    }
  }
  const turn = b.turn + 1;
  const next = enemies.map((e): Combatant => {
    if (e.hp <= 0) return e;
    let c: Combatant = {
      ...e,
      defending: false,
      cooldown: Math.max(0, e.cooldown - 1),
    };
    c = statusTick(passiveHeal(c, log), log);
    if (c.hp <= 0) {
      log.push(`${c.char.name} cae.`);
      return c;
    }
    if (c.boss) c = bossRoundEnd(c, b.turn, log);
    if (b.mods?.includes("regeneracion")) {
      const hp = Math.min(
        c.char.stats.hp,
        c.hp + Math.round(c.char.stats.hp * REGEN_FRACTION),
      );
      if (hp > c.hp) log.push(`${c.char.name} se regenera.`);
      c = { ...c, hp };
    }
    if (
      b.mods?.includes("elementoCambiante") &&
      b.turn % ELEMENT_SHIFT_EVERY === 0
    ) {
      const element = rng.pick(ELEMENTS.filter((x) => x !== c.char.element));
      c = { ...c, char: { ...c.char, element } };
      log.push(`${c.char.name} cambia a ${ELEMENT_LABEL[element]}.`);
    }
    if (turn > ENRAGE_AFTER_TURN) {
      const stats = {
        ...c.char.stats,
        atk: c.char.stats.atk * (1 + ENRAGE_STEP),
      };
      c = { ...c, char: { ...c.char, stats } };
      log.push(`${c.char.name} se enfurece.`);
    }
    return c;
  });
  const burned: Status | null = next.every((e) => e.hp <= 0)
    ? "won"
    : player.hp <= 0
      ? "lost"
      : null;
  if (burned) {
    if (burned === "lost") log.push(`${player.char.name} cae.`);
    return {
      ...b,
      player,
      enemies: next,
      queue: [],
      turn,
      actions,
      status: burned,
      events,
      guardEarned,
      log: [...b.log, ...log],
    };
  }
  const plan = planRound(player, next, turn, rng);
  return {
    ...b,
    queue: plan.queue,
    playerActions: plan.playerActions,
    player,
    enemies: plan.enemies,
    turn,
    actions,
    status: "ongoing",
    events,
    guardEarned,
    log: [...b.log, ...log, ...plan.lines],
  };
}
