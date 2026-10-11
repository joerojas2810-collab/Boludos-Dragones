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
import type { Element } from "./elements";
import type { Rng } from "./rng";
import {
  addStatus,
  BURN_CAP,
  burnDamage,
  cleanse,
  defMult,
  MAX_ELEMENT_CHARGES,
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
import { isWeaponType, WEAPON_TYPE_DATA } from "./weapons";
import {
  UNIVERSAL_COOLDOWN_CONVERSION,
  UNIVERSAL_SKILLS,
  type UniversalSkillId,
} from "./universalSkills";

// Enemy intents retain attack2 as their strong strike. Player actions use only
// the weapon basic, universal skills and Defender.
// Internal strike keys: attack2 is only an enemy's announced strong hit.
export type AttackKey = "attack1" | "attack2";
export type MoveKey = AttackKey | UniversalSkillId;
export type CombatMoveKey = MoveKey;
type TelegraphKey = CombatMoveKey | "charge" | "channeling";
export type Action = "attack1" | "defend" | UniversalSkillId;
export type BattleAction = Action;
/** Semantic categories available to enemy patterns; only Carga and Canalización are new active patterns in E4. */
export type EnemyIntentType =
  | "golpe"
  | "carga"
  | "preparacion"
  | "represalia"
  | "canalizacion"
  | "ataque_multiple";
export type Intent = AttackKey | "charge" | "channeling" | "defend";
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

// Perfect guard: choosing Defender while at least one strong enemy hit is
// still announced this round. That strong hit is cut to PERFECT_GUARD_FACTOR of
// its damage (instead of DEFEND_FACTOR; it replaces it, it does not stack) and
// the guard earns a bonus of the hero's class (see earnGuard). Weaker hits in the
// same round still get the normal DEFEND_FACTOR.
export const PERFECT_GUARD_FACTOR = 0.25;
export const AGUANTE_FRACTION = 0.3;
export const AGUANTE_HIT_FRACTION = 0.25;
export const QUEBRAR_HIT_FRACTION = 1;
export const QUIEBRE_EXPOSED_REDUCTION = 0.15;
export const QUIEBRE_RESIST_ACTIVATIONS = 2;
const COLOSSAL_GOLEM = "Gólem Colosal";
const CHARGE_DEFENSE_BYPASS = 0.3;
export const GUARD_CRIT_BONUS = 0.5; // Pícaro: extra crit chance on the next hit
export const GUARD_HEAL = 0.03; // Clérigo: fraction of max hp healed (class cap)
export const isStrongIntent = (k: CombatMoveKey | Intent): boolean =>
  k === "attack2" || k === "golpe" || k === "charge" || k === "channeling";

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
  enemyAguante?: boolean; // elites and bosses receive the secondary defense bar
}

export interface BattleEvent {
  actor: "player" | "enemy";
  kind: "hit" | "crit" | "miss" | "buff";
  classId: ClassId;
  move: CombatMoveKey;
  weapon?: string; // attacker's weapon type (sfx)
  element?: Element;
  enemy: number; // index in Battle.enemies of the enemy involved
}

export type Side = "player" | "enemy";

export interface Combatant {
  char: Character;
  hp: number;
  cooldown: number; // enemy strong-strike cooldown (players no longer use it)
  defending: boolean; // lasts until the end of the round
  // (an enemy's Defender is active from round start: it is announced)
  guard?: boolean; // perfect guard earned this round (see PERFECT_GUARD_FACTOR)
  riposte?: boolean; // Mago/Pícaro next-hit bonus; Berserker next-skill cooldown discount
  resolution?: boolean; // Caballero: one guarded hit enables the next Golpe
  nextHitReduction?: number; // temporary class effect, consumed by the next landed hit
  classHealThisRound?: number;
  classHealThisActivation?: number;
  classShieldThisRound?: number;
  classShieldThisActivation?: number;
  carry?: number; // enemies: speed remainder against the hero
  shield?: number;
  freeHits?: number;
  perks?: Perks;
  statuses?: StatusEffect[]; // elemental effects (statuses.ts)
  charge?: number; // Rayo's Sobrecarga charges, consumed later by Explotar
  nextAttackDefenseBypass?: number; // Ruptura consumed: next player activation's attack
  nextCritChance?: number; // Pícaro: Explotar Impulso empowers the next attack
  missed?: boolean; // Terco: the last hit missed
  guardedLast?: boolean; // Paciente: it spent the last round defending (spent by its next hit)
  opened?: boolean; // Fanfarrón: it has already thrown its first hit
  rage?: number; // Furioso: hits taken so far
  boss?: BossState; // dungeon boss mechanic state (bossRules.ts)
  exposed?: boolean; // target remains Expuesto until its next activation (stage 4)
  aguante?: number;
  aguanteMax?: number;
  quiebre?: number;
  quiebreResist?: number;
  chargePending?: boolean;
  chargeUsed?: boolean;
  channelingState?: "announced" | "resolved" | "cancelled";
  healCut?: number; // rounds left with the heals cut (Reina Marchita ritual)
  applies?: boolean; // enemies: strong hits apply their element's status (elites, bosses)
  universalCooldowns?: Partial<Record<UniversalSkillId, number>>;
}

// A round is a queue of action slots (see buildQueue). `step` resolves one
// player action plus every enemy slot up to the next player slot. An enemy slot
// carries its announced intent; `n` is its ordinal among that enemy's actions
// this round.
export type EnemySlot = { e: number; n: number; intent: Intent; warningWaited?: boolean };
export type Slot = "player" | EnemySlot;

export interface Battle {
  player: Combatant;
  enemies: Combatant[]; // 1..MAX_ENEMIES; dead ones stay (hp 0) to keep indices
  queue: Slot[]; // action slots still to resolve this round
  playerActions: number; // player's total actions this round
  frostDelayedEnemies?: number[]; // one Explotar delay event per enemy this round
  impulseGranted?: boolean; // one extra action from Impulso per round
  turn: number; // round number
  actions: number; // player actions resolved so far (0 = fight not started)
  status: Status;
  log: string[];
  events: BattleEvent[]; // what happened in the last step, for sfx/animation
  guardEarned?: boolean; // the last step earned a perfect guard (sfx/animation only)
  mods?: EnemyMod[];
}

export type ExploitableState =
  | { id: "escarcha" | "impulso" | "quemadura" | "ruptura"; stacks: number }
  | { id: "sobrecarga"; stacks: 3 };

/** Returns the first state available to Explotar, in stable priority order. */
export function exploitableState(player: Combatant, target?: Combatant): ExploitableState | null {
  const frost = stacksOf(target?.statuses, "escarcha");
  if (frost > 0) return { id: "escarcha", stacks: frost };
  const burn = stacksOf(target?.statuses, "quemadura");
  if (burn > 0) return { id: "quemadura", stacks: burn };
  const rupture = stacksOf(target?.statuses, "ruptura");
  if (rupture > 0) return { id: "ruptura", stacks: rupture };
  const impulse = stacksOf(player.statuses, "impulso");
  if (impulse > 0) return { id: "impulso", stacks: impulse };
  return (player.charge ?? 0) >= MAX_ELEMENT_CHARGES
    ? { id: "sobrecarga", stacks: MAX_ELEMENT_CHARGES }
    : null;
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

// Class passive damage reduction, capped together.
export const PASSIVE_REDUCTION_CAP = 0.25;
export const passiveReduction = (c: Combatant): number =>
  Math.min(
    PASSIVE_REDUCTION_CAP,
    (c.char.classId === "caballero" ? CLASS_PASSIVE_DMG_REDUCTION : 0) +
      (c.char.classId === "mago" ? CLASS_PASSIVE_MAGE_REDUCTION : 0) +
      (c.char.gear?.dmgTaken ?? 0),
  );

// Fraction of damage absorbed by defense (0..DEF_CAP).
export const defReduction = (att: Combatant, def: Combatant, defenseBypass = 0): number => {
  const d =
    def.char.stats.def *
    defMult(def.statuses) *
    (def.exposed ? 1 - QUIEBRE_EXPOSED_REDUCTION : 1) *
    (1 - defenseBypass) *
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

export const CLASS_HEAL_PER_ACTIVATION_CAP = 0.03;
export const CLASS_HEAL_PER_ROUND_CAP = 0.06;
export const CLASS_SHIELD_PER_ACTIVATION_CAP = 0.03;
export const CLASS_SHIELD_PER_ROUND_CAP = 0.06;
export const BERSERKER_SKILL_FURY_THRESHOLD = 0.6;
export const BERSERKER_GOLPE_BONUS = 0.5;
export const BERSERKER_BARRIDO_BONUS = 0.3;
export const EXPLOIT_BASIC_DAMAGE_FRACTION = 0.4;
export const EXPLOIT_OVERLOAD_DAMAGE_FRACTION = 1.0;
export const EXPLOIT_RUPTURE_DEFENSE_PER_STACK = 0.08;
export const EXPLOIT_MAGE_EFFECT_MULT = 1.25;
export const EXPLOIT_BERSERKER_BURN_MULT = 1.25;

export function classHeal(c: Combatant, requested: number): Combatant {
  const maxHp = c.char.stats.hp;
  const allowed = Math.max(0, Math.min(
    requested,
    CLASS_HEAL_PER_ACTIVATION_CAP - (c.classHealThisActivation ?? 0),
    CLASS_HEAL_PER_ROUND_CAP - (c.classHealThisRound ?? 0),
  ));
  const hp = Math.min(maxHp, c.hp + Math.round(maxHp * allowed * healMult(c)));
  const actual = (hp - c.hp) / maxHp;
  return {
    ...c,
    hp,
    classHealThisActivation: (c.classHealThisActivation ?? 0) + actual,
    classHealThisRound: (c.classHealThisRound ?? 0) + actual,
  };
}

export function classShield(c: Combatant, requested: number): Combatant {
  const maxHp = c.char.stats.hp;
  const allowed = Math.max(0, Math.min(
    requested,
    CLASS_SHIELD_PER_ACTIVATION_CAP - (c.classShieldThisActivation ?? 0),
    CLASS_SHIELD_PER_ROUND_CAP - (c.classShieldThisRound ?? 0),
  ));
  const value = Math.round(maxHp * allowed);
  const actual = value / maxHp;
  return {
    ...c,
    shield: (c.shield ?? 0) + value,
    classShieldThisActivation: (c.classShieldThisActivation ?? 0) + actual,
    classShieldThisRound: (c.classShieldThisRound ?? 0) + actual,
  };
}

// Berserker Furia: damage bonus by hp threshold.
export const furyBonus = (c: Combatant): number =>
  c.char.classId !== "berserker"
    ? 0
    : (CLASS_PASSIVE_FURY.find((t) => c.hp / c.char.stats.hp < t.below)?.bonus ?? 0);

export function attackOf(c: Combatant, intent: TelegraphKey): Attack {
  if (intent === "channeling")
    return { name: "Canalización", power: 0, accuracy: 1, cooldown: 0, heal: 0 };
  const key: CombatMoveKey = intent === "charge" ? "attack2" : intent;
  if (key in UNIVERSAL_SKILLS) return UNIVERSAL_SKILLS[key as UniversalSkillId].attack;
  if (key === "attack1" && isWeaponType(c.char.weapon?.type)) {
    const basic = WEAPON_TYPE_DATA[c.char.weapon.type].basic;
    if (basic)
      return {
        ...CLASSES[c.char.classId].attack1,
        name: basic.name,
        power: basic.power,
        ...(basic.crit !== undefined && { crit: basic.crit }),
        ...(basic.heal !== undefined && { heal: basic.heal }),
      };
  }
  return CLASSES[c.char.classId][key as AttackKey];
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

export const intentType = (intent: Intent): EnemyIntentType | null => {
  if (intent === "charge") return "carga";
  if (intent === "channeling") return "canalizacion";
  if (intent === "attack1" || intent === "attack2") return "golpe";
  return null;
};

// A strong hit is still coming: Defender now would be a perfect guard.
export const strongPending = (b: Battle): boolean =>
  pendingIntents(b).some((s) => isStrongIntent(s.intent));

export const actionsLeft = (b: Battle): number =>
  b.queue.filter((s) => s === "player").length;

// One intent per enemy action; at most one strong enemy hit per round (cooldown).
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

// A strong intention announced before the hero's first slot waits until just
// after that slot. It is moved only once, so it resolves at its next enemy turn.
function grantFirstPlayerResponse(queue: Slot[]): Slot[] {
  const firstPlayer = queue.indexOf("player");
  if (firstPlayer <= 0) return queue;
  const waiting = queue.slice(0, firstPlayer).filter(
    (slot): slot is EnemySlot => slot !== "player" && isStrongIntent(slot.intent),
  ).map((slot) => ({ ...slot, warningWaited: true }));
  if (!waiting.length) return queue;
  const waitingKeys = new Set(waiting.map((slot) => `${slot.e}:${slot.n}`));
  const before = queue.slice(0, firstPlayer).filter(
    (slot) => slot === "player" || !waitingKeys.has(`${slot.e}:${slot.n}`),
  );
  return [...before, "player", ...waiting, ...queue.slice(firstPlayer + 1)];
}

// Move at most `limit` eligible pending slots for one enemy to just after the
// next player slot. Strong intents already moved once for their warning stay put.
function delayEnemySlots(queue: Slot[], enemy: number, limit: number): { queue: Slot[]; moved: number } {
  const nextPlayer = queue.indexOf("player");
  if (nextPlayer < 0) return { queue, moved: 0 };
  const selected = queue.slice(0, nextPlayer).filter(
    (slot): slot is EnemySlot =>
      slot !== "player" && slot.e === enemy && !(isStrongIntent(slot.intent) && slot.warningWaited),
  ).slice(0, limit);
  if (!selected.length) return { queue, moved: 0 };
  const selectedKeys = new Set(selected.map((slot) => `${slot.e}:${slot.n}`));
  const remaining = queue.filter((slot) =>
    slot === "player" || !selectedKeys.has(`${slot.e}:${slot.n}`),
  );
  const playerIndex = remaining.indexOf("player");
  remaining.splice(playerIndex + 1, 0, ...selected);
  return { queue: remaining, moved: selected.length };
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
  const preparingCharge = enemies.map(() => false);
  enemies.forEach((e, i) => {
    if (e.char.name !== COLOSSAL_GOLEM || !intents[i].length) return;
    if (e.chargePending) {
      intents[i][0] = "charge";
    } else if (!e.chargeUsed) {
      const strongIndex = intents[i].indexOf("attack2");
      if (strongIndex >= 0) {
        intents[i][strongIndex] = "defend";
        preparingCharge[i] = true;
      }
    }
  });
  enemies.forEach((e, i) => {
    if (ruleOf(e) === "marchitar" && turn % RITUAL_EVERY === 0 && intents[i].length) {
      intents[i][0] = "channeling";
      enemies[i] = { ...e, channelingState: "announced" };
    } else {
      enemies[i] = { ...e, channelingState: undefined };
    }
  });
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
    if (intents[i].includes("channeling"))
      lines.push(`${e.char.name} canaliza su ritual: Interrumpir lo detiene; una guardia perfecta también lo anula.`);
    if (intents[i].includes("charge"))
      lines.push(`${e.char.name} anuncia una Carga: tendrás una activación para responder; Defender la mitiga y Quebrar Aguante puede cancelarla.`);
    else if (intents[i].includes("attack2"))
      lines.push(
        ruleOf(e) === "presion"
          ? `${e.char.name} anuncia su golpe fuerte: tendrás una activación para responder; la guardia perfecta apaga su Presión.`
          : `${e.char.name} anuncia un golpe fuerte: tendrás una activación para responder.`,
      );
    if (preparingCharge[i])
      lines.push(`${e.char.name} prepara una Carga cancelable por Quiebre.`);
  }
  for (const i of live)
    if ((counts[i]?.enemy ?? 1) > 1)
      lines.push(
        `${enemies[i].char.name} es más veloz: actúa ${counts[i]?.enemy} veces.`,
      );
  return {
    queue: grantFirstPlayerResponse(buildQueue(playerActions, enemySlots(order, intents), lead)),
    playerActions,
    enemies: enemies.map((e, i) => ({
      ...e,
      carry: counts[i]?.carry ?? e.carry,
      defending: intents[i].includes("defend"),
      ...(e.boss && ruleOf(e) === "posturas" && { boss: { ...e.boss, stance: stanceFor(turn) } }),
      ...(preparingCharge[i] && { chargeUsed: true, chargePending: true }),
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
    frostDelayedEnemies: [],
    impulseGranted: false,
    queue: buildQueue(
      playerActions,
      enemySlots(order, per),
      enemyFirst === true ? 1 : enemyFirst === false ? 0 : enemyFirst,
    ),
    enemies: b.enemies.map((e, i) => ({
      ...e,
      defending: (per[i] ?? []).includes("defend"),
      channelingState: per[i]?.includes("channeling") ? "announced" : undefined,
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
  const es = list.slice(0, MAX_ENEMIES).map((c, i) => {
    const e = newCombatant(c);
    if (opts.enemyStatus) e.applies = true;
    if ((opts.enemyAguante && i === 0) || c.bossId || c.name === COLOSSAL_GOLEM) {
      e.aguanteMax = Math.max(1, Math.round(c.stats.hp * AGUANTE_FRACTION));
      e.aguante = e.aguanteMax;
    }
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
    frostDelayedEnemies: [],
    impulseGranted: false,
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
export function hitChance(att: Combatant, intent: TelegraphKey): number {
  if (intent === "channeling") return 1;
  const key: CombatMoveKey = intent === "charge" ? "attack2" : intent;
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
const stanceFactor = (def: Combatant, key: CombatMoveKey): number =>
  !def.defending
    ? 1
    : def.guard && isStrongIntent(key)
      ? PERFECT_GUARD_FACTOR
      : DEFEND_FACTOR;

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

// Expected damage of a non-critical hit (one strike).
// Every hit (both sides) is scaled by this: longer fights, so statuses, guard and cooldowns matter.
export const DAMAGE_SCALE = 0.8;

export function estimateDamage(
  att: Combatant,
  def: Combatant,
  intent: TelegraphKey,
  crit = false, // true: skip the non-crit penalty (the crit multiplier is applied by the caller)
  defenseBypass = 0,
): number {
  if (intent === "channeling") return 0;
  const key: CombatMoveKey = intent === "charge" ? "attack2" : intent;
  const a = attackOf(att, key);
  const raw =
    att.char.stats.atk *
    a.power *
    attackElementMultiplier(att, def) *
    (1 - defReduction(att, def, defenseBypass));
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
        (1 - (def.nextHitReduction ?? 0)) *
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
    att.char.element,
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
  caballero: "reúne Resolución para su próximo Golpe",
  mago: "potenciará su próximo golpe",
  picaro: "afinará su puntería",
  clerigo: "se purifica",
  berserker: "su próxima habilidad recargará una activación antes",
};
export function earnGuard(c: Combatant, log: string[]): Combatant {
  let out: Combatant = { ...c, guard: true };
  if (c.char.classId === "caballero") out.resolution = true;
  if (["mago", "picaro", "berserker"].includes(c.char.classId)) out.riposte = true;
  if (c.char.classId === "clerigo") {
    out = { ...classHeal(out, GUARD_HEAL), statuses: cleanse(c.statuses) };
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

// Contraataque returns damage without a hit roll: it still carries the hero's element status.
export function strike(
  att: Combatant,
  def: Combatant,
  key: CombatMoveKey,
  rng: Rng,
  log: string[],
  events: BattleEvent[],
  actor: BattleEvent["actor"],
  enemy: number,
  dmgFactor = 1,
  asHero = actor === "player", // duels: both sides are heroes (elemental charges and status rules)
  applyOwnElementalStatus = true,
  defenseBypass = 0,
  applyElementalStatus = true,
): Strike {
  const a = attackOf(att, key);
  const who = att.char.name;
  const on = actor === "player" ? ` sobre ${def.char.name}` : "";
  let hp = att.hp;
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
    ...(key === "attack2" && !asHero && { cooldown: a.cooldown + 1 }),
  };
  const element = att.char.element;
  const ev = (kind: BattleEvent["kind"]) =>
    events.push({
      actor,
      kind,
      classId: att.char.classId,
      move: key,
      weapon: att.char.weapon?.type,
      element,
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
      (a.crit ?? 0) +
      (att.nextCritChance ?? 0) +
      (att.char.classId === "mago" ? CLASS_PASSIVE_MAGE_CRIT : 0) +
      (att.riposte && att.char.classId === "picaro" ? GUARD_CRIT_BONUS : 0),
  );
  // Apostador: one extra draw per landed hit, only for gamblers (old streams intact).
  const spread = rulesOf(att).spread;
  const gamble = spread > 0 ? 1 + spread * (2 * rng.next() - 1) : 1;
  // Every damaging hero action applies one elemental interaction. Enemies apply
  // their element only on announced strong attacks when flagged (elites/bosses).
  const canApply = asHero || (!!att.applies && isStrongIntent(key));
  const guardBoost = att.riposte && att.char.classId === "mago" ? 2 : 1;
  const stacks = guardBoost;
  // Rayo stores up to three charges; Explotar will consume them in stage 5.
  let charge = att.charge ?? 0;
  if (applyElementalStatus && element === "rayo" && (asHero || canApply) && applyOwnElementalStatus) {
    charge = Math.min(MAX_ELEMENT_CHARGES, charge + 1);
  }
  const dmg = Math.round(
      estimateDamage(att, def, key, crit, defenseBypass) *
      (crit ? critMultiplier(att) : 1) *
      dmgFactor *
      gamble,
  );
  events.push({
    actor,
    kind: crit ? "crit" : "hit",
    classId: att.char.classId,
    move: key,
    weapon: att.char.weapon?.type,
    element,
    enemy,
  });
  log.push(
    `${who} usa ${a.name}${on}: ${dmg} de daño${crit ? " (¡crítico!)" : ""}.`,
  );
  const absorbed = Math.min(def.shield ?? 0, dmg);
  if (absorbed > 0)
    log.push(`El escudo de ${def.char.name} absorbe ${absorbed}.`);
  const steal = Math.round(
    dmg *
      (lifestealOf(att) +
        (ruleOf(att) === "hambre" ? HUNGER_STEAL : 0)) *
      healMult(att),
  );
  let defender: Combatant = {
    ...def,
    hp: Math.max(0, def.hp - (dmg - absorbed)),
    ...(def.shield !== undefined && { shield: def.shield - absorbed }),
  };
  defender = bossOnHit(def, defender, log);
  let ownStatuses = attacker.statuses;
  const sid = applyElementalStatus && canApply ? STATUS_OF_ELEMENT[element] : undefined;
  if (sid === "impulso") {
    if (applyOwnElementalStatus) ownStatuses = addStatus(ownStatuses, sid, stacks);
  } else if (sid) {
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
  }
  if (sid && (sid !== "impulso" || applyOwnElementalStatus))
    log.push(`${sid === "impulso" ? who : def.char.name}: ${STATUS_DATA[sid].label} ×${stacksOf(sid === "impulso" ? ownStatuses : defender.statuses, sid)}.`);
  let back = 0;
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
      ...(def.nextHitReduction ? { nextHitReduction: undefined } : {}),
      rage: Math.min(RAGE_MAX, (defender.rage ?? 0) + 1),
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
  action: BattleAction,
  rng: Rng,
  target?: number,
): Battle {
  if (b.status !== "ongoing" || !b.queue.includes("player")) return b;
  const universal = action in UNIVERSAL_SKILLS
    ? UNIVERSAL_SKILLS[action as UniversalSkillId]
    : undefined;
  if (action !== "attack1" && action !== "defend" && !universal) return b;
  if (universal && !universal.enabled) return b;
  if (universal && (b.player.universalCooldowns?.[universal.id] ?? 0) > 1e-9)
    return b;
  const alive = livingEnemies(b);
  if (
    target !== undefined &&
    (!Number.isInteger(target) || target < 0 || target >= alive.length)
  )
    return b;
  const tIdx = alive[target ?? 0];
  if (
    action === "interrumpir" &&
    (tIdx === undefined ||
      b.enemies[tIdx].channelingState !== "announced" ||
      !b.queue.some((slot) => slot !== "player" && slot.e === tIdx && slot.intent === "channeling"))
  )
    return b;
  if (action === "explotar" && !exploitableState(b.player, tIdx === undefined ? undefined : b.enemies[tIdx]))
    return b;
  const log: string[] = [];
  const events: BattleEvent[] = [];
  const resolutionReady = !!b.player.resolution;
  let player: Combatant = {
    ...b.player,
    resolution: undefined,
    nextHitReduction: undefined,
    nextAttackDefenseBypass: undefined,
    classHealThisActivation: 0,
    classShieldThisActivation: 0,
  };
  const enemies: Combatant[] = b.enemies.map((e) => ({ ...e }));
  const fallen = enemies.map((e) => e.hp <= 0);

  if (action === "defend") {
    player.defending = true;
    // A next-attack bonus survives the action that grants it, then expires
    // after this activation if the player chooses to defend instead of attack.
    player.nextCritChance = undefined;
    if (action === "defend") log.push(`${player.char.name} se defiende.`);
    if (!player.guard && strongPending(b)) player = earnGuard(player, log);
  }

  const guardEarned = log.some((l) => l.startsWith("¡Guardia perfecta!"));
  let queue = [...b.queue];
  let playerActions = b.playerActions;
  const frostDelayed = new Set(b.frostDelayedEnemies ?? []);
  let impulseGranted = b.impulseGranted ?? false;
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
  const hit = (
    i: number,
    key: CombatMoveKey,
    factor = 1,
    applyOwnElementalStatus = true,
    defenseBypass = 0,
    applyElementalStatus = true,
  ) => {
    const eventCount = events.length;
    if (adapted(i)) {
      factor *= ADAPT_FACTOR;
      log.push(`${enemies[i].char.name} te lee: tu golpe repetido le hace menos.`);
    }
    const before = enemies[i];
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
      undefined,
      applyOwnElementalStatus,
      Math.min(0.9, defenseBypass + (b.player.nextAttackDefenseBypass ?? 0)),
      applyElementalStatus,
    );
    player = key === action
      ? { ...r.attacker, nextCritChance: undefined }
      : r.attacker;
    enemies[i] = r.defender;
    if (before.aguante !== undefined && r.dmg > 0) {
      const lifeDamage = Math.max(0, before.hp - r.defender.hp);
      let aguanteFactor = key === "quebrar" ? QUEBRAR_HIT_FRACTION : AGUANTE_HIT_FRACTION;
      if (key === "quebrar") {
        if (player.char.classId === "caballero" && resolutionReady) aguanteFactor *= 1.25;
        if (player.char.classId === "mago" && attackElementMultiplier(player, before) > 1) aguanteFactor *= 1.2;
        if (player.char.classId === "picaro" && before.statuses?.length) aguanteFactor *= 1.2;
        if (player.char.classId === "berserker" && player.hp < player.char.stats.hp * BERSERKER_SKILL_FURY_THRESHOLD) aguanteFactor *= 1.25;
      }
      const rawRemaining = before.aguante - Math.round(lifeDamage * aguanteFactor);
      const remaining = Math.max(1, rawRemaining);
      const broke = rawRemaining <= 0 && (before.quiebreResist ?? 0) === 0;
      if (broke) {
        if (key === "quebrar") chargeBrokenTargets.add(i);
        enemies[i] = {
          ...enemies[i],
          aguante: before.aguanteMax,
          exposed: true,
          quiebre: 1,
          quiebreResist: QUIEBRE_RESIST_ACTIVATIONS,
          chargePending: key === "quebrar" ? false : before.chargePending,
        };
        log.push(`¡Quiebre! ${before.char.name} queda Expuesto.`);
        if (player.char.classId === "clerigo" && key === "quebrar") healClass(0.03);
        if (key === "quebrar" && before.chargePending)
          log.push(`El Quiebre cancela la Carga de ${before.char.name}.`);
      } else {
        enemies[i] = { ...enemies[i], aguante: remaining };
      }
      if (key === "quebrar" && resolutionReady && player.char.classId === "caballero")
        log.push(`${player.char.name} consume Resolución: +15 % de daño.`);
    }
    lastHitLanded = events.length > eventCount && events.at(-1)?.kind !== "miss";
    return r.dmg;
  };
  let lastHitLanded = false;
  const chargeBrokenTargets = new Set<number>();
  const healClass = (fraction: number) => {
    const before = player.hp;
    player = classHeal(player, fraction);
    if (player.hp > before) log.push(`${player.char.name} recupera ${player.hp - before} de vida.`);
  };
  const playMove = () => {
    if (universal) {
      const cooldownDiscount = player.char.classId === "berserker" && player.riposte ? 1 : 0;
      const targets = universal.target === "all" ? alive : [tIdx];
      if (universal.id === "explotar") {
        if (tIdx === undefined) return;
        const foe = enemies[tIdx];
        const state = exploitableState(player, foe);
        if (!state) return;
        const mageEffect = player.char.classId === "mago" ? EXPLOIT_MAGE_EFFECT_MULT : 1;
        let factor = EXPLOIT_BASIC_DAMAGE_FRACTION;
        if (state.id === "sobrecarga")
          factor += EXPLOIT_OVERLOAD_DAMAGE_FRACTION * mageEffect;
        const damage = hit(tIdx, "attack1", factor, false, 0, false);
        if (damage > 0) {
          player.riposte = false;
          player.guardedLast = false;
        }
        log.push(`${player.char.name} explota ${state.id === "sobrecarga" ? "Sobrecarga" : STATUS_DATA[state.id].label} ×${state.stacks}.`);
        if (state.id === "quemadura") {
          const current = enemies[tIdx];
          const berserkerEffect = player.char.classId === "berserker" && player.hp < player.char.stats.hp * BERSERKER_SKILL_FURY_THRESHOLD
            ? EXPLOIT_BERSERKER_BURN_MULT
            : 1;
          const burn = Math.min(
            Math.round(burnDamage(current.statuses) * mageEffect * berserkerEffect),
            Math.round(current.char.stats.hp * BURN_CAP),
          );
          if (burn > 0) {
            enemies[tIdx] = {
              ...current,
              hp: Math.max(0, current.hp - burn),
              statuses: (current.statuses ?? []).filter((item) => item.id !== "quemadura"),
            };
            log.push(`${current.char.name} sufre ${burn} de Quemadura adelantada; el efecto termina.`);
          } else {
            enemies[tIdx] = {
              ...current,
              statuses: (current.statuses ?? []).filter((item) => item.id !== "quemadura"),
            };
          }
        } else if (state.id === "ruptura") {
          enemies[tIdx] = {
            ...enemies[tIdx],
            statuses: (enemies[tIdx].statuses ?? []).filter((item) => item.id !== "ruptura"),
          };
          const bypass = Math.min(0.9, state.stacks * EXPLOIT_RUPTURE_DEFENSE_PER_STACK * mageEffect);
          player.nextAttackDefenseBypass = bypass;
          log.push(`${player.char.name} prepara el siguiente ataque: ignora ${Math.round(bypass * 100)} % de DEF.`);
        } else if (state.id === "escarcha") {
          enemies[tIdx] = {
            ...enemies[tIdx],
            statuses: (enemies[tIdx].statuses ?? []).filter((item) => item.id !== "escarcha"),
          };
          if (!frostDelayed.has(tIdx)) {
            const delayed = delayEnemySlots(queue, tIdx, state.stacks >= 3 ? 2 : 1);
            queue = delayed.queue;
            if (delayed.moved > 0) {
              frostDelayed.add(tIdx);
              log.push(`Escarcha retrasa ${delayed.moved === 1 ? "una acción" : `${delayed.moved} acciones`} de ${foe.char.name} hasta después de tu próxima acción.`);
            } else {
              log.push(`${foe.char.name} no tiene una acción pendiente que Escarcha pueda retrasar.`);
            }
          } else {
            log.push(`Escarcha ya retrasó una acción de ${foe.char.name} esta ronda.`);
          }
        } else if (state.id === "impulso") {
          player = {
            ...player,
            statuses: (player.statuses ?? []).filter((item) => item.id !== "impulso"),
          };
          if (player.char.classId === "picaro") {
            player.nextCritChance = (player.nextCritChance ?? 0) + 0.15;
            log.push(`${player.char.name} consume Impulso: +15 % de crítico en su próximo ataque.`);
          }
          if (state.stacks >= 2 && !impulseGranted && playerActions < MAX_ACTIONS_PER_ROUND) {
            queue.unshift("player");
            playerActions++;
            impulseGranted = true;
            log.push(`${player.char.name} consume Impulso: añade una acción a esta ronda.`);
          } else if (state.stacks >= 2 && playerActions >= MAX_ACTIONS_PER_ROUND) {
            log.push(`Impulso no puede superar el máximo de ${MAX_ACTIONS_PER_ROUND} acciones por ronda.`);
          }
        } else {
          player.charge = 0;
          log.push(`La Sobrecarga de ${player.char.name} se descarga.`);
        }
        if (player.char.classId === "caballero") {
          const shieldBefore = player.shield ?? 0;
          player = classShield(player, 0.03);
          if ((player.shield ?? 0) > shieldBefore)
            log.push(`${player.char.name} gana un escudo de ${Math.round((player.shield ?? 0) - shieldBefore)}.`);
        }
        if (player.char.classId === "clerigo") healClass(0.03);
        player.universalCooldowns = {
          ...player.universalCooldowns,
          explotar: Math.max(0, universal.cooldown - cooldownDiscount) * UNIVERSAL_COOLDOWN_CONVERSION,
        };
        if (cooldownDiscount) player.riposte = false;
        return;
      }
      if (universal.id === "interrumpir") {
        if (tIdx === undefined) return;
        const foe = enemies[tIdx];
        hit(tIdx, "interrumpir");
        enemies[tIdx] = { ...enemies[tIdx], channelingState: "cancelled" };
        for (let q = queue.length - 1; q >= 0; q--) {
          const queued = queue[q];
          if (queued !== "player" && queued.e === tIdx && queued.intent === "channeling")
            queue.splice(q, 1);
        }
        log.push(`${foe.char.name}: canalización interrumpida; su ritual queda cancelado.`);
        player.universalCooldowns = {
          ...player.universalCooldowns,
          interrumpir: Math.max(0, universal.cooldown - cooldownDiscount) * UNIVERSAL_COOLDOWN_CONVERSION,
        };
        if (cooldownDiscount) player.riposte = false;
        return;
      }
      let ownerElementApplied = false;
      let dealt = 0;
      for (const i of targets) {
        if (enemies[i]?.hp > 0) {
          const foe = enemies[i];
          let hook = 1;
          if (universal.id === "golpe") {
            if (player.char.classId === "caballero" && resolutionReady) hook *= 1.15;
            if (player.char.classId === "mago" && foe.statuses?.length) hook *= 1.15;
            if (player.char.classId === "picaro" && foe.exposed) hook *= 1.2;
            if (player.char.classId === "berserker" && player.hp < player.char.stats.hp * BERSERKER_SKILL_FURY_THRESHOLD) hook *= 1 + BERSERKER_GOLPE_BONUS;
          } else if (universal.id === "quebrar") {
            if (player.char.classId === "caballero" && resolutionReady) hook *= 1.15;
          } else if (universal.id === "barrido") {
            if (player.char.classId === "mago" && foe.statuses?.length) hook *= 1.1;
            if (player.char.classId === "picaro" && alive.length === 1) hook *= 1.1;
            if (player.char.classId === "berserker" && player.hp < player.char.stats.hp * BERSERKER_SKILL_FURY_THRESHOLD) hook *= 1 + BERSERKER_BARRIDO_BONUS;
          }
          const damage = hit(i, universal.id, hook, !ownerElementApplied);
          dealt += damage;
          if (lastHitLanded && player.char.classId === "clerigo") healClass(0.03);
          if (
            damage > 0 &&
            (player.char.element === "viento" || player.char.element === "rayo")
          ) ownerElementApplied = true;
        }
      }
      if (dealt > 0) {
        player.riposte = false;
        player.guardedLast = false;
      }
      if (universal.id === "barrido" && player.char.classId === "caballero" && alive.length >= 2) {
        player.nextHitReduction = 0.10;
        log.push(`${player.char.name} reduce en 10 % el próximo golpe recibido.`);
      }
      if (universal.id === "golpe" && resolutionReady && player.char.classId === "caballero")
        log.push(`${player.char.name} consume Resolución: +15 % de daño.`);
      player.universalCooldowns = {
        ...player.universalCooldowns,
        [universal.id]: Math.max(0, universal.cooldown - cooldownDiscount) * UNIVERSAL_COOLDOWN_CONVERSION,
      };
      if (cooldownDiscount) player.riposte = false;
      return;
    }
    if (action === "attack1") {
      const dealt = hit(tIdx, action);
      if (dealt > 0 && !(player.char.classId === "berserker" && player.riposte))
        player.riposte = false;
      if (dealt > 0) player.guardedLast = false;
      return;
    }
  };

  while (queue.length && !end) {
    const slot = queue[0];
    if (slot === "player" && playerActed) {
      break;
    }
    queue.shift();
    if (slot === "player") {
      playerActed = true;
      const clocks = Object.fromEntries(
        Object.entries(player.universalCooldowns ?? {}).map(([id, value]) => [
          id,
          Math.max(0, (value ?? 0) - UNIVERSAL_COOLDOWN_CONVERSION),
        ]),
      ) as Combatant["universalCooldowns"];
      if (Object.keys(clocks ?? {}).length) player.universalCooldowns = clocks;
      if (playerDone++ > 0) log.push(`${player.char.name} actúa de nuevo.`);
      if (action !== "defend") playMove();
      if (chargeBrokenTargets.size)
        for (let q = queue.length - 1; q >= 0; q--) {
          const queued = queue[q];
          if (queued !== "player" && queued?.intent === "charge" && chargeBrokenTargets.has(queued.e))
            queue.splice(q, 1);
        }
      enemies.forEach((e, i) => {
        if (e.boss && ruleOf(e) === "aprende")
          enemies[i] = {
            ...e,
            boss: { ...e.boss, last: [...e.boss.last, action].slice(-ADAPT_AFTER) },
          };
      });
    } else if (enemies[slot.e].hp > 0) {
      let foe = enemies[slot.e];
      if (slot.intent === "channeling") {
        if (foe.channelingState === "announced") {
          enemies[slot.e] = { ...foe, channelingState: "resolved" };
          log.push(`${foe.char.name} completa su canalización.`);
        }
        continue;
      }
      if (slot.n > 0) log.push(`${foe.char.name} actúa de nuevo.`);
      if (slot.intent === "defend") {
        log.push(`${foe.char.name} se defiende.`);
        enemies[slot.e] = {
          ...foe,
          exposed: false,
          quiebre: 0,
          quiebreResist: Math.max(0, (foe.quiebreResist ?? 0) - 1),
        };
        continue;
      }
      if (slot.intent === "charge")
        log.push(`${foe.char.name} lanza su Carga.`);
      const r = strike(
        foe,
        player,
        slot.intent === "charge" ? "attack2" : slot.intent,
        rng,
        log,
        events,
        "enemy",
        slot.e,
        1,
        undefined,
        true,
        slot.intent === "charge" ? CHARGE_DEFENSE_BYPASS : 0,
      );
      foe = {
        ...r.attacker,
        exposed: false,
        quiebre: 0,
        quiebreResist: Math.max(0, (r.attacker.quiebreResist ?? 0) - 1),
        chargePending: false,
      };
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
      playerActions,
      frostDelayedEnemies: [...frostDelayed].sort((a, z) => a - z),
      impulseGranted,
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
    classHealThisRound: 0,
    classHealThisActivation: 0,
    classShieldThisRound: 0,
    classShieldThisActivation: 0,
  };
  player = statusTick(passiveHeal(player, log), log);
  const bosses = enemies.filter((e) => e.hp > 0 && e.boss);
  const bossRule = (r: string) => bosses.some((e) => ruleOf(e) === r);
  if (bossRule("plaga")) {
    const loss = Math.round(player.char.stats.hp * PLAGUE_LOSS);
    player = { ...player, hp: Math.max(0, player.hp - loss) };
    log.push(`La plaga te consume ${loss} de vida.`);
  }
  if (enemies.some((e) => e.hp > 0 && ruleOf(e) === "marchitar" && e.channelingState === "resolved")) {
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
    frostDelayedEnemies: [],
    impulseGranted: false,
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
