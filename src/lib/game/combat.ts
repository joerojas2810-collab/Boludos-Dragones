// Combat engine, turn-based (docs/ideal/01 §3). There are no rounds: every combatant fills an
// integer progress bar at a speed-based rate and acts alone when it reaches TURN_THRESHOLD.
// The battle always rests at a human decision (`awaiting`): `step` resolves that action and then
// every enemy turn up to the next human turn. Pure and deterministic given (state, action, rng).
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
import { ADVANTAGE_BONUS, ELEMENTS, elementMultiplier, ELEMENT_LABEL } from "./elements";
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
  ADAPT_FACTOR,
  adaptAfter,
  armorBrokenRounds,
  ARMOR_FRACTION,
  armorRegrow,
  ARMOR_TAKEN,
  BROKEN_TAKEN,
  ENRAGE_AFTER_OWN_TURN,
  ENRAGE_STEP,
  EXTRA_IMPACT,
  HEAD_HEAL,
  headThresholds,
  hungerBelow,
  HUNGER_STEAL,
  MAX_EXTRA_IMPACTS,
  NEW_BOSS,
  plagueLoss,
  PRESSURE_MAX,
  PRESSURE_STEP,
  pressureGain,
  RAMP_MAX,
  RITUAL_EFFECT_TURNS,
  RAMP_STEP,
  rampInterval,
  ritualEvery,
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
  ACTIVE_HEAL_CAP,
  defaultLoadout,
  RESOURCE_MAX,
  SHIELD_CAP,
  SKILLS,
  isSkillId,
  type Loadout,
  type SkillDef,
  type SkillId,
} from "./skills";
import { chooseIntent, type BrainView, type Candidate } from "./brain";

// ---- vocabulary -------------------------------------------------------------------------------

// Internal strike keys: attack2 is only an enemy's announced strong hit.
export type AttackKey = "attack1" | "attack2";
export type MoveKey = AttackKey | SkillId;
export type CombatMoveKey = MoveKey;
type HitKey = MoveKey | "charge";
export type Action = "attack1" | "defend" | SkillId;
export type BattleAction = Action;
/** Semantic categories of announced enemy intents. */
export type EnemyIntentType =
  | "golpe" | "carga" | "canalizacion" | "defensa" | "proteccion" | "reconstruccion";
export type Intent = AttackKey | "charge" | "channeling" | "defend" | "protect" | "rebuild";
export type Status = "ongoing" | "won" | "lost" | "draw";

/** Scheduler contract (docs/ideal/01 §3.1). */
export const TURN_THRESHOLD = 10_000;
export const RATE_MIN = 750;
export const RATE_MAX = 1500;
export const TURN_CAP = 300; // resolved turns without a winner => "draw" (timeout)
export const TURN_WARN = 250;
export const UPCOMING = 6; // turns shown in the queue

export const DEFEND_FACTOR = 0.5;
export const PERFECT_GUARD_FACTOR = 0.25; // 75 % reduction on the first compatible strong hit
// Defense is a percentage: def / (def + DEF_K * attacker ATK), capped.
export const DEF_K = 1;
export const DEF_CAP = 0.75;
export const REGEN_CAP = 0.02;
export const LIFESTEAL_CAP = 0.15;
export const PASSIVE_HEAL_CAP = 0.06;
export const MAX_ENEMIES = 3;
export const AGUANTE_FRACTION = 0.3;
export const AGUANTE_HIT_FRACTION = 0.25;
export const QUIEBRE_EXPOSED_REDUCTION = 0.15;
export const QUIEBRE_RESIST_TURNS = 2;
export const SOBRECARGA_DAMAGE_BONUS = 0.05;
export const SOBRECARGA_DISCHARGE = 0.6;
export const BURN_CONSUME_TICKS = 1.5;
export const FROST_DELAY = [0, 0.05, 0.1, 0.15] as const;
export const WIND_ADVANCE = [0, 0.1, 0.2, 0.3] as const;
export const RUPTURE_BYPASS_PER_CHARGE = 0.08;
export const MAGE_CONSUME_MULT = 1.25;
export const PROTECT_SHIELD = 0.08;
const COLOSSAL_GOLEM = "Gólem Colosal";
export const CHARGE_DEFENSE_BYPASS = 0.3;
export const isStrongIntent = (k: HitKey | Intent): boolean =>
  k === "attack2" || k === "charge" || k === "channeling";
/** Skills that cost 2 or more resource count as strong hits for guard purposes. */
export const isStrongKey = (k: HitKey): boolean =>
  k === "attack2" || k === "charge" || (isSkillId(k) && SKILLS[k].cost >= 2);

export type EnemyMod = "regeneracion" | "escudo" | "dobleAtaque" | "elementoCambiante";
export const REGEN_FRACTION = 0.03;
export const SHIELD_FRACTION = 0.3;
export const DOUBLE_ATTACK_FACTOR = 0.5;
export const ELEMENT_SHIFT_EVERY = 2; // own turns

export const TRAIT_CAPS = { dmgReduction: 0.35, critDamage: 1.2 } as const;

export interface Perks {
  lifesteal?: number;
  critDamage?: number;
  regen?: number;
  dmgReduction?: number;
  dmgMult?: number;
}

export interface BattleOptions {
  perks?: Perks;
  playerHp?: number;
  playerShield?: number;
  freeHits?: number;
  mods?: EnemyMod[];
  enemyStatus?: boolean;
  enemyAguante?: boolean;
  ascension?: number;
  loadout?: Loadout; // the hero's two equipped skills (default: the class defaults)
  /** Duels: the first foe is a second human (a hero with its own loadout). */
  humanFoe?: boolean;
  foeLoadout?: Loadout;
  /** Duels: swaps the tie-break order of the two sides (shared seed decides). */
  swapOrder?: boolean;
}

export interface BattleEvent {
  actor: "player" | "enemy";
  kind: "hit" | "crit" | "miss" | "buff";
  classId: ClassId;
  move: CombatMoveKey;
  weapon?: string;
  element?: Element;
  enemy: number; // index in Battle.enemies of the enemy involved
}

/** Structured events for presentation (docs/ideal/01 §9). Never instructions. */
export type CombatEventType =
  | "turnStarted" | "actionCommitted" | "skillResolved" | "hit" | "healed" | "shieldChanged"
  | "classResourceChanged" | "statusApplied" | "statusConsumed" | "statusExpired"
  | "progressChanged" | "guardTriggered" | "staggerDamaged" | "staggerBroken"
  | "telegraphStarted" | "telegraphCancelled" | "bossPhaseChanged" | "combatEnded";
export interface CombatEvent {
  seq: number;
  turn: number;
  type: CombatEventType;
  actor: number; // 0 = player, k = enemies[k-1]
  target?: number;
  skillId?: string;
  value?: number;
  detail?: string;
}

export type Side = "player" | "enemy";

export interface Combatant {
  char: Character;
  hp: number;
  cooldown: number; // enemy strong-strike cooldown (own turns)
  defending: boolean; // until the start of its next own turn
  guard?: boolean; // perfect guard still unspent against a strong hit
  shield?: number;
  freeHits?: number;
  perks?: Perks;
  statuses?: StatusEffect[];
  charge?: number; // Rayo Sobrecarga charges
  // --- turn scheduler
  progress: number;
  ownTurns: number;
  // --- heroes
  res?: number; // class resource 0..3
  loadout?: Loadout;
  cds?: Partial<Record<SkillId, number>>;
  activeHeal?: number; // fraction of max hp healed actively this turn
  nextAttackDefenseBypass?: number; // Ruptura consumed
  bypassFresh?: boolean;
  nextHitReduction?: number;
  frostDelayed?: boolean;
  // --- enemies
  intent?: Intent;
  intentAlly?: number;
  intentAnswered?: boolean; // the human has acted since the intent was announced
  mem?: Intent[]; // last resolved intents
  // --- shared
  missed?: boolean;
  guardedLast?: boolean;
  opened?: boolean;
  rage?: number;
  boss?: BossState;
  exposed?: boolean;
  aguante?: number;
  aguanteMax?: number;
  quiebreResist?: number; // own turns of resistance to a new Quiebre
  chargePending?: boolean;
  chargeUsed?: boolean;
  healCut?: number; // own turns left with heals cut (Reina Marchita ritual)
  applies?: boolean; // enemies: strong hits apply their element's status
}

export interface Battle {
  player: Combatant;
  enemies: Combatant[]; // 1..MAX_ENEMIES; dead ones stay (hp 0) to keep indices
  order: number[]; // stable tie-break order of actor ids (0 player, k = enemies[k-1])
  awaiting: number; // actor id waiting for a decision (0, or 1 in duels)
  humanFoe?: boolean;
  turn: number; // turns resolved by every actor
  actions: number; // human actions resolved so far
  status: Status;
  log: string[];
  events: BattleEvent[]; // last step
  cev: CombatEvent[]; // structured events of the last step
  seq: number;
  guardEarned?: boolean;
  mods?: EnemyMod[];
  trace?: { enemy: number; candidates: Candidate[] }[]; // development only
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

// ---- derived values ---------------------------------------------------------------------------

const rulesOf = (c: Combatant) => traitTotals(c.char.traits);

export const dmgReductionOf = (c: Combatant): number => {
  const low = rulesOf(c).lowHpReduction;
  const missing = 1 - clamp(c.hp / c.char.stats.hp, 0, 1);
  const perk = c.perks?.dmgReduction ?? 0;
  const high = c.hp / c.char.stats.hp > HIGH_HP ? rulesOf(c).highHpReduction : 0;
  return Math.min(Math.max(perk, TRAIT_CAPS.dmgReduction), perk + low * missing + high);
};

export const PASSIVE_REDUCTION_CAP = 0.25;
export const passiveReduction = (c: Combatant): number =>
  Math.min(
    PASSIVE_REDUCTION_CAP,
    (c.char.classId === "caballero" ? CLASS_PASSIVE_DMG_REDUCTION : 0) +
      (c.char.classId === "mago" ? CLASS_PASSIVE_MAGE_REDUCTION : 0) +
      (c.char.gear?.dmgTaken ?? 0),
  );

export const defReduction = (att: Combatant, def: Combatant, defenseBypass = 0): number => {
  const d =
    def.char.stats.def *
    defMult(def.statuses) *
    (def.exposed ? 1 - QUIEBRE_EXPOSED_REDUCTION : 1) *
    (1 - defenseBypass) *
    (def.boss && ruleOf(def) === "posturas" ? STANCES[def.boss.stance].def : 1);
  return Math.min(DEF_CAP, d / Math.max(1e-6, d + DEF_K * att.char.stats.atk));
};

/** Speed after Escarcha / Impulso and the Trueno ramp, before the global rate clamp. */
export const speedOf = (c: Combatant): number =>
  c.char.stats.speed * speedMult(c.statuses) * (1 + RAMP_STEP * (c.boss?.ramp ?? 0));
/** Integer progress gained per virtual tick. */
export const rateOf = (c: Combatant): number =>
  clamp(Math.round(100 * speedOf(c)), RATE_MIN, RATE_MAX);

export const passiveHealRate = (c: Combatant): number =>
  Math.min(
    PASSIVE_HEAL_CAP,
    (c.char.classId === "clerigo" ? CLASS_PASSIVE_REGEN : 0) +
      Math.min(REGEN_CAP, c.char.stats.regen) +
      (c.perks?.regen ?? 0),
  );

export const lifestealOf = (c: Combatant): number =>
  Math.min(LIFESTEAL_CAP, c.char.stats.lifesteal + (c.perks?.lifesteal ?? 0));

export const healMult = (c: Combatant): number =>
  (1 - rulesOf(c).healPenalty) * ((c.healCut ?? 0) > 0 ? RITUAL_HEAL_CUT : 1);

export const furyBonus = (c: Combatant): number =>
  c.char.classId !== "berserker"
    ? 0
    : (CLASS_PASSIVE_FURY.find((t) => c.hp / c.char.stats.hp < t.below)?.bonus ?? 0);

/** Basic attack of a combatant (weapon profile) used as the base of every skill. */
function basicOf(c: Combatant): Attack {
  if (isWeaponType(c.char.weapon?.type)) {
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
  return CLASSES[c.char.classId].attack1;
}

export function attackOf(c: Combatant, intent: HitKey | "channeling"): Attack {
  if (intent === "channeling")
    return { name: "Canalización", power: 0, accuracy: 1, cooldown: 0, heal: 0 };
  const key: MoveKey = intent === "charge" ? "attack2" : intent;
  if (isSkillId(key)) {
    const base = basicOf(c);
    return { ...base, name: SKILLS[key].name, power: base.power * SKILLS[key].power, accuracy: 1, heal: 0 };
  }
  if (key === "attack1") return basicOf(c);
  return CLASSES[c.char.classId][key];
}

const newCombatant = (char: Character): Combatant => ({
  char,
  hp: char.stats.hp,
  cooldown: 0,
  defending: false,
  progress: 0,
  ownTurns: 0,
});

// ---- queries (UI and auto policy) ------------------------------------------------------------

export const livingEnemies = (b: Battle): number[] =>
  b.enemies.flatMap((e, i) => (e.hp > 0 ? [i] : []));

export const intentType = (intent: Intent): EnemyIntentType =>
  intent === "charge" ? "carga"
    : intent === "channeling" ? "canalizacion"
    : intent === "defend" ? "defensa"
    : intent === "protect" ? "proteccion"
    : intent === "rebuild" ? "reconstruccion"
    : "golpe";

/** Committed intents of the living enemies (what the UI shows). */
export const pendingIntents = (b: Battle): { e: number; intent: Intent; ally?: number }[] =>
  b.enemies.flatMap((e, i) =>
    e.hp > 0 && e.intent ? [{ e: i, intent: e.intent, ...(e.intentAlly !== undefined && { ally: e.intentAlly }) }] : [],
  );

export const enemyIntents = (b: Battle, e: number): Intent[] =>
  b.enemies[e]?.hp > 0 && b.enemies[e].intent ? [b.enemies[e].intent as Intent] : [];

/** A strong threat is announced and unresolved: Defender now would be a perfect guard. */
export function strongPending(b: Battle): boolean {
  if (b.humanFoe) return duelThreat(b.enemies[0]);
  return b.enemies.some((e) => e.hp > 0 && e.intent !== undefined && isStrongIntent(e.intent));
}

/** Duels: the rival could throw a strong skill next turn. */
export function duelThreat(foe: Combatant | undefined): boolean {
  if (!foe || foe.hp <= 0) return false;
  return (foe.loadout ?? []).some((id) => SKILLS[id].cost >= 2 && (foe.res ?? 0) >= SKILLS[id].cost && !(foe.cds?.[id] ?? 0));
}

export const isHeld = (c: Combatant): boolean =>
  c.intent !== undefined && isStrongIntent(c.intent) && !c.intentAnswered;

// Estimated upcoming turns for the queue. Committed order is certain only for the first entry;
// the rest is a projection assuming current speeds (docs/ideal/01 §3.1).
export function projectTurns(b: Battle, n = UPCOMING): { id: number; certain: boolean }[] {
  const ids = [0, ...b.enemies.map((_, i) => i + 1)];
  const cs = (id: number) => (id === 0 ? b.player : b.enemies[id - 1]);
  const prog = new Map(ids.map((id) => [id, cs(id).progress]));
  const out: { id: number; certain: boolean }[] = [];
  const rank = (id: number) => b.order.indexOf(id);
  for (let guard = 0; out.length < n && guard < 400; guard++) {
    const live = ids.filter((id) => cs(id).hp > 0);
    const ready = live.filter((id) => (prog.get(id) ?? 0) >= TURN_THRESHOLD);
    if (!ready.length) {
      const t = Math.max(1, Math.min(...live.map((id) =>
        Math.ceil((TURN_THRESHOLD - (prog.get(id) ?? 0)) / rateOf(cs(id))))));
      for (const id of live) prog.set(id, (prog.get(id) ?? 0) + t * rateOf(cs(id)));
      continue;
    }
    ready.sort((x, y) =>
      (prog.get(y) ?? 0) - (prog.get(x) ?? 0) || rateOf(cs(y)) - rateOf(cs(x)) || rank(x) - rank(y));
    const id = ready[0];
    prog.set(id, (prog.get(id) ?? 0) - TURN_THRESHOLD);
    out.push({ id, certain: out.length === 0 });
  }
  return out;
}

// ---- damage -----------------------------------------------------------------------------------

export const DAMAGE_SCALE = 0.8;

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

const stanceFactor = (def: Combatant, key: HitKey): number =>
  !def.defending ? 1 : def.guard && isStrongKey(key) ? PERFECT_GUARD_FACTOR : DEFEND_FACTOR;

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

export function attackElementMultiplier(att: Combatant, def: Combatant): number {
  const m = elementMultiplier(att.char.element, def.char.element);
  return att.char.classId === "mago" && m > 1 ? m - ADVANTAGE_BONUS + CLASS_PASSIVE_ADVANTAGE_BONUS : m;
}

export function hitChance(att: Combatant, intent: HitKey | "channeling"): number {
  if (intent === "channeling") return 1;
  const key: MoveKey = intent === "charge" ? "attack2" : intent;
  if (key === "attack1" || isSkillId(key)) return 1; // basic and skills never miss
  const retry = att.missed ? rulesOf(att).retryAccuracy : 0;
  return clamp(attackOf(att, key).accuracy + att.char.stats.accuracy + retry, 0.05, 1);
}

/** Expected damage of a non-critical hit (one impact). */
export function estimateDamage(
  att: Combatant,
  def: Combatant,
  intent: HitKey | "channeling",
  crit = false,
  defenseBypass = 0,
): number {
  if (intent === "channeling") return 0;
  const key: MoveKey = intent === "charge" ? "attack2" : intent;
  const a = attackOf(att, key);
  const raw =
    att.char.stats.atk * a.power * attackElementMultiplier(att, def) *
    (1 - defReduction(att, def, defenseBypass));
  return Math.max(
    1,
    Math.round(
      raw *
        DAMAGE_SCALE *
        stanceFactor(def, intent === "charge" ? "charge" : key) *
        (att.perks?.dmgMult ?? 1) *
        (1 - dmgReductionOf(def)) *
        (crit ? 1 : 1 - rulesOf(att).nonCritPenalty) *
        (1 - passiveReduction(def)) *
        (1 + (att.char.gear?.dmgDealt ?? 0)) *
        (1 - (def.nextHitReduction ?? 0)) *
        bossDealtMult(att) *
        traitDealtMult(att, def) *
        bossTakenMult(def) *
        (1 + furyBonus(att)) *
        ((att.charge ?? 0) >= MAX_ELEMENT_CHARGES && att.char.element === "rayo" ? 1 + SOBRECARGA_DAMAGE_BONUS : 1),
    ),
  );
}

export const critMultiplier = (c: Combatant): number =>
  c.char.stats.critDmg +
  Math.min(
    Math.max(c.perks?.critDamage ?? 0, TRAIT_CAPS.critDamage),
    (c.perks?.critDamage ?? 0) + rulesOf(c).critDamage,
  );

// ---- mutable working state --------------------------------------------------------------------

interface Work {
  p: Combatant;
  es: Combatant[];
  order: number[];
  rng: Rng;
  turn: number;
  actions: number;
  seq: number;
  status: Status;
  humanFoe: boolean;
  awaiting: number;
  guardEarned: boolean;
  mods?: EnemyMod[];
  log: string[];
  events: BattleEvent[];
  cev: CombatEvent[];
  trace: { enemy: number; candidates: Candidate[] }[];
  warned: boolean;
}

const idOf = (w: Work, c: Combatant): number => (c === w.p ? 0 : w.es.indexOf(c) + 1);
const actorOf = (w: Work, id: number): Combatant => (id === 0 ? w.p : w.es[id - 1]);
const sideOf = (w: Work, c: Combatant): Side => (c === w.p ? "player" : "enemy");

function emit(w: Work, type: CombatEventType, actor: number, extra: Partial<CombatEvent> = {}) {
  w.cev.push({ seq: w.seq++, turn: w.turn, type, actor, ...extra });
}

function toWork(b: Battle, rng: Rng): Work {
  return {
    p: { ...b.player },
    es: b.enemies.map((e) => ({ ...e })),
    order: b.order,
    rng,
    turn: b.turn,
    actions: b.actions,
    seq: b.seq,
    status: b.status,
    humanFoe: !!b.humanFoe,
    awaiting: b.awaiting,
    guardEarned: false,
    ...(b.mods && { mods: b.mods }),
    log: [],
    events: [],
    cev: [],
    trace: [],
    warned: b.turn >= TURN_WARN,
  };
}

function toBattle(b: Battle, w: Work): Battle {
  return {
    ...b,
    player: w.p,
    enemies: w.es,
    order: w.order,
    awaiting: w.awaiting,
    turn: w.turn,
    actions: w.actions,
    status: w.status,
    log: [...b.log, ...w.log],
    events: w.events,
    cev: w.cev,
    seq: w.seq,
    guardEarned: w.guardEarned,
    ...(DEV && w.trace.length && { trace: w.trace }),
  };
}

/** 1v1 duels: view of the battle from the other human's seat. */
function mirror(b: Battle): Battle {
  const flip = (id: number) => (id === 0 ? 1 : id === 1 ? 0 : id);
  return {
    ...b,
    player: b.enemies[0],
    enemies: [b.player, ...b.enemies.slice(1)],
    order: b.order.map(flip),
    awaiting: flip(b.awaiting),
    status: b.status === "won" ? "lost" : b.status === "lost" ? "won" : b.status,
    events: b.events.map((e) => ({ ...e, actor: e.actor === "player" ? "enemy" : "player" })),
    cev: b.cev.map((e) => ({ ...e, actor: flip(e.actor), ...(e.target !== undefined && { target: flip(e.target) }) })),
  };
}

// ---- small mutators ---------------------------------------------------------------------------

function addRes(w: Work, c: Combatant, n: number) {
  if (n <= 0) return;
  const before = c.res ?? 0;
  c.res = Math.min(RESOURCE_MAX, before + n);
  if (c.res !== before) emit(w, "classResourceChanged", idOf(w, c), { value: c.res });
}

function healActive(w: Work, c: Combatant, fraction: number, receiver = c) {
  const max = receiver.char.stats.hp;
  const allowed = Math.max(0, Math.min(fraction, ACTIVE_HEAL_CAP - (receiver.activeHeal ?? 0)));
  const hp = Math.min(max, receiver.hp + Math.round(max * allowed * healMult(receiver)));
  const gained = hp - receiver.hp;
  receiver.activeHeal = (receiver.activeHeal ?? 0) + allowed;
  if (gained > 0) {
    receiver.hp = hp;
    w.log.push(`${receiver.char.name} recupera ${gained} de vida.`);
    emit(w, "healed", idOf(w, c), { target: idOf(w, receiver), value: gained });
  }
}

function addShield(w: Work, c: Combatant, fraction: number) {
  const max = c.char.stats.hp;
  const cap = Math.round(max * SHIELD_CAP);
  const before = c.shield ?? 0;
  const next = Math.min(Math.max(before, cap), before + Math.round(max * fraction));
  c.shield = next;
  if (next > before) {
    w.log.push(`${c.char.name} gana un escudo de ${next - before}.`);
    emit(w, "shieldChanged", idOf(w, c), { value: next });
  }
}

function earnGuard(w: Work, c: Combatant) {
  c.guard = true;
  addRes(w, c, 1);
  if (c.char.classId === "clerigo") c.statuses = cleanse(c.statuses);
  w.log.push(`¡Guardia perfecta! ${c.char.name} ${c.char.classId === "clerigo" ? "se purifica y " : ""}gana 1 de recurso.`);
  if (c === w.p || w.humanFoe) w.guardEarned = true;
  emit(w, "guardTriggered", idOf(w, c));
}

// ---- strike -----------------------------------------------------------------------------------

interface StrikeOpts {
  factor?: number;
  applyElement?: boolean; // elemental charge on hit (false: consuming skills, extra impacts)
  stacks?: number; // charges applied (Inscribir: 2)
  defenseBypass?: number;
  silent?: boolean;
  eIdx: number; // enemy index for events/sfx
}

/** One damaging impact. Returns the damage dealt (0 on a miss). */
function strike(w: Work, att: Combatant, def: Combatant, key: HitKey, o: StrikeOpts): number {
  const a = attackOf(att, key);
  const who = att.char.name;
  const actor = sideOf(w, att);
  const asHero = att === w.p || (w.humanFoe && att === w.es[0]);
  const on = actor === "player" ? ` sobre ${def.char.name}` : "";
  const ev = (kind: BattleEvent["kind"]) =>
    w.events.push({
      actor, kind, classId: att.char.classId, move: key === "charge" ? "attack2" : key,
      weapon: att.char.weapon?.type, element: att.char.element, enemy: o.eIdx,
    });
  if (def.freeHits) {
    w.log.push(`${def.char.name} esquiva el golpe de ${who}.`);
    def.freeHits -= 1;
    return 0;
  }
  if (!w.rng.chance(hitChance(att, key))) {
    w.log.push(`${who} usa ${a.name}${on} y falla.`);
    ev("miss");
    att.missed = true;
    att.opened = true;
    return 0;
  }
  const crit = w.rng.chance(
    att.char.stats.crit + (a.crit ?? 0) + (att.char.classId === "mago" ? CLASS_PASSIVE_MAGE_CRIT : 0),
  );
  const spread = rulesOf(att).spread;
  const gamble = spread > 0 ? 1 + spread * (2 * w.rng.next() - 1) : 1;
  const element = att.char.element;
  const canApply = (o.applyElement ?? true) && (asHero || (!!att.applies && isStrongIntent(key)));
  const bypass = Math.min(0.9, (o.defenseBypass ?? 0) + (att.nextAttackDefenseBypass ?? 0));
  const dmg = Math.round(
    estimateDamage(att, def, key, crit, bypass) * (crit ? critMultiplier(att) : 1) * (o.factor ?? 1) * gamble,
  );
  if (att.nextAttackDefenseBypass) att.nextAttackDefenseBypass = undefined;
  ev(crit ? "crit" : "hit");
  w.log.push(`${who} usa ${a.name}${on}: ${dmg} de daño${crit ? " (¡crítico!)" : ""}.`);
  const absorbed = Math.min(def.shield ?? 0, dmg);
  if (absorbed > 0) w.log.push(`El escudo de ${def.char.name} absorbe ${absorbed}.`);
  const before = { hp: def.hp, shield: def.shield ?? 0 };
  def.hp = Math.max(0, def.hp - (dmg - absorbed));
  if (def.shield !== undefined) def.shield -= absorbed;
  if (def.defending && def.guard && isStrongKey(key)) def.guard = false; // the guard is spent
  if (def.nextHitReduction) def.nextHitReduction = undefined;
  def.rage = Math.min(RAGE_MAX, (def.rage ?? 0) + 1);
  emit(w, "hit", idOf(w, att), { target: idOf(w, def), value: dmg, skillId: key });
  bossOnHit(w, def, before);
  // life steal: heroes go through the active heal cap, a Devorador does not
  const steal = Math.round(
    (dmg - absorbed) * (lifestealOf(att) + (ruleOf(att) === "hambre" ? HUNGER_STEAL : 0)) * healMult(att),
  );
  if (steal > 0) {
    if (asHero) {
      const room = Math.max(0, ACTIVE_HEAL_CAP - (att.activeHeal ?? 0)) * att.char.stats.hp;
      const got = Math.min(steal, Math.round(room));
      att.activeHeal = (att.activeHeal ?? 0) + got / att.char.stats.hp;
      att.hp = Math.min(att.char.stats.hp, att.hp + got);
    } else att.hp = Math.min(att.char.stats.hp, att.hp + steal);
  }
  // elemental application
  if (canApply) {
    const sid = STATUS_OF_ELEMENT[element];
    const stacks = o.stacks ?? 1;
    if (element === "rayo") att.charge = Math.min(MAX_ELEMENT_CHARGES, (att.charge ?? 0) + stacks);
    else if (sid === "impulso") att.statuses = addStatus(att.statuses, sid, stacks, undefined, 0, true);
    else if (sid && def.hp > 0)
      def.statuses = addStatus(
        def.statuses, sid, stacks,
        sid === "quemadura" ? Math.round(dmg * STATUS_DATA.quemadura.per) : undefined,
        def.char.stats.resist,
      );
    if (element === "rayo" || sid) {
      const target = sid === "impulso" || element === "rayo" ? att : def;
      const n = element === "rayo" ? (att.charge ?? 0) : stacksOf(def.statuses, sid ?? "ruptura");
      const sidn = element === "rayo" ? "Sobrecarga" : STATUS_DATA[sid!].label;
      w.log.push(`${sid === "impulso" || element === "rayo" ? who : def.char.name}: ${sidn} ×${sid === "impulso" ? stacksOf(att.statuses, "impulso") : n}.`);
      emit(w, "statusApplied", idOf(w, att), { target: idOf(w, target), detail: element });
    }
  }
  const thorns = Math.round(dmg * rulesOf(def).thorns);
  if (thorns > 0) {
    att.hp = Math.max(0, att.hp - thorns);
    w.log.push(`Las espinas de ${def.char.name} devuelven ${thorns} a ${who}.`);
  }
  att.missed = false;
  att.opened = true;
  return dmg;
}

// Boss mechanics that react to a hit.
function bossOnHit(w: Work, def: Combatant, before: { hp: number; shield: number }) {
  const rule = ruleOf(def);
  if (!def.boss || !rule) return;
  if (rule === "armadura" && before.shield > 0 && (def.shield ?? 0) <= 0) {
    const broken = armorBrokenRounds(def.boss.ascension);
    def.boss = { ...def.boss, broken, regrow: Math.max(armorRegrow(def.boss.ascension), broken + 1) };
    w.log.push(`¡La armadura de ${def.char.name} se rompe! Queda Roto.`);
    emit(w, "bossPhaseChanged", idOf(w, def), { detail: "roto" });
  }
  if (rule === "cabezas" && def.hp > 0) {
    const max = def.char.stats.hp;
    const ts = headThresholds(def.boss.ascension);
    let crossed = def.boss.crossed;
    let n = 0;
    ts.forEach((t, k) => {
      if (!(crossed & (1 << k)) && before.hp > t * max && def.hp <= t * max) {
        crossed |= 1 << k;
        n++;
      }
    });
    if (n > 0) {
      def.hp = Math.min(max, def.hp + Math.round(max * HEAD_HEAL * n));
      def.boss = { ...def.boss, heads: Math.min(MAX_EXTRA_IMPACTS, def.boss.heads + n), crossed };
      w.log.push(`A ${def.char.name} le brota otra cabeza: se cura y su próximo ataque golpea más veces.`);
      emit(w, "bossPhaseChanged", idOf(w, def), { detail: "cabeza" });
    }
  }
}

// ---- Aguante / Quiebre ------------------------------------------------------------------------

/** Applies Aguante damage after a landed hit. Returns true when it caused a Quiebre. */
function applyAguante(w: Work, tgt: Combatant, lifeDamage: number, fraction: number): boolean {
  if (tgt.aguante === undefined || lifeDamage <= 0) return false;
  const raw = tgt.aguante - Math.round(lifeDamage * fraction);
  emit(w, "staggerDamaged", 0, { target: idOf(w, tgt), value: Math.max(1, raw) });
  const broke = raw <= 0 && (tgt.quiebreResist ?? 0) === 0;
  if (!broke) {
    tgt.aguante = Math.max(1, raw);
    return false;
  }
  tgt.aguante = tgt.aguanteMax;
  tgt.exposed = true;
  tgt.quiebreResist = QUIEBRE_RESIST_TURNS;
  w.log.push(`¡Quiebre! ${tgt.char.name} queda Expuesto.`);
  emit(w, "staggerBroken", 0, { target: idOf(w, tgt) });
  return true;
}

function cancelIntent(w: Work, tgt: Combatant, why: string) {
  w.log.push(`${tgt.char.name}: ${why}; su amenaza queda cancelada.`);
  emit(w, "telegraphCancelled", idOf(w, tgt), { detail: tgt.intent });
  tgt.intent = "attack1";
  tgt.intentAnswered = true;
  tgt.chargePending = false;
}

// ---- elemental consumption (docs/ideal/01 §6) -------------------------------------------------

function consumeElement(w: Work, att: Combatant, tgt: Combatant | null, skillId: SkillId) {
  const el = att.char.element;
  const mage = att.char.classId === "mago" ? MAGE_CONSUME_MULT : 1;
  const consumed = (id: string, extra?: Partial<CombatEvent>) =>
    emit(w, "statusConsumed", idOf(w, att), { target: tgt ? idOf(w, tgt) : 0, detail: id, skillId, ...extra });
  if (el === "fuego" && tgt) {
    const stacks = stacksOf(tgt.statuses, "quemadura");
    if (!stacks) return;
    const burn = Math.min(Math.round(burnDamage(tgt.statuses) * BURN_CONSUME_TICKS * mage), Math.round(tgt.char.stats.hp * BURN_CAP));
    tgt.hp = Math.max(0, tgt.hp - burn);
    tgt.statuses = (tgt.statuses ?? []).filter((s) => s.id !== "quemadura");
    w.log.push(`${tgt.char.name} sufre ${burn} de Quemadura adelantada; el efecto termina.`);
    consumed("quemadura", { value: burn });
  } else if (el === "agua" && tgt) {
    const stacks = stacksOf(tgt.statuses, "escarcha");
    if (!stacks) return;
    tgt.statuses = (tgt.statuses ?? []).filter((s) => s.id !== "escarcha");
    if (!tgt.frostDelayed) {
      const pct = FROST_DELAY[stacks] * mage;
      const lost = Math.min(tgt.progress, Math.round(TURN_THRESHOLD * pct));
      tgt.progress -= lost;
      tgt.frostDelayed = true;
      w.log.push(`Escarcha retrasa el turno de ${tgt.char.name}.`);
      emit(w, "progressChanged", idOf(w, tgt), { value: -lost });
    } else w.log.push(`${tgt.char.name} ya fue retrasado por Escarcha.`);
    consumed("escarcha");
  } else if (el === "tierra" && tgt) {
    const stacks = stacksOf(tgt.statuses, "ruptura");
    if (!stacks) return;
    tgt.statuses = (tgt.statuses ?? []).filter((s) => s.id !== "ruptura");
    const bypass = Math.min(0.9, stacks * RUPTURE_BYPASS_PER_CHARGE * mage);
    att.nextAttackDefenseBypass = bypass;
    att.bypassFresh = true;
    w.log.push(`${att.char.name} prepara el siguiente ataque: ignora ${Math.round(bypass * 100)} % de DEF.`);
    consumed("ruptura");
  } else if (el === "viento") {
    const stacks = stacksOf(att.statuses, "impulso");
    if (!stacks) return;
    att.statuses = (att.statuses ?? []).filter((s) => s.id !== "impulso");
    const add = Math.round(TURN_THRESHOLD * WIND_ADVANCE[stacks] * mage);
    att.progress += add;
    w.log.push(`${att.char.name} consume Impulso y adelanta su próximo turno.`);
    emit(w, "progressChanged", idOf(w, att), { value: add });
    consumed("impulso");
  } else if (el === "rayo") {
    if ((att.charge ?? 0) < MAX_ELEMENT_CHARGES) return;
    att.charge = 0;
    if (tgt && tgt.hp > 0) {
      const extra = Math.round(estimateDamage(att, tgt, "attack1", true) * SOBRECARGA_DISCHARGE * mage);
      const absorbed = Math.min(tgt.shield ?? 0, extra);
      tgt.hp = Math.max(0, tgt.hp - (extra - absorbed));
      if (tgt.shield !== undefined) tgt.shield -= absorbed;
      w.log.push(`La Sobrecarga de ${att.char.name} se descarga: ${extra} de daño.`);
      consumed("sobrecarga", { value: extra });
    }
  }
}

// ---- player / hero action ---------------------------------------------------------------------

export function skillBlockReason(c: Combatant, id: SkillId): string | null {
  const def = SKILLS[id];
  if (def.classId !== c.char.classId) return "Habilidad de otra clase.";
  if (c.loadout && !c.loadout.includes(id)) return "No está equipada.";
  if ((c.cds?.[id] ?? 0) > 0) return `En enfriamiento (${c.cds?.[id]}).`;
  if ((c.res ?? 0) < def.cost) return `Necesita ${def.cost} de recurso.`;
  return null;
}

export const equippedSkills = (c: Combatant): Loadout => c.loadout ?? defaultLoadout(c.char.classId);

function aguanteOf(def: SkillDef | null): number {
  return def ? def.aguante : AGUANTE_HIT_FRACTION;
}

/** Plays the human action of `w.p`; foes are `w.es`. `tIdx` indexes `w.es`. */
function heroAction(w: Work, action: Action, tIdx: number | undefined) {
  const p = w.p;
  const alive = w.es.flatMap((e, i) => (e.hp > 0 ? [i] : []));
  const heroDefenders = w.humanFoe;
  if (action === "defend") {
    p.defending = true;
    w.log.push(`${p.char.name} se defiende.`);
    const threat = heroDefenders ? duelThreat(w.es[0]) : w.es.some((e) => e.hp > 0 && e.intent !== undefined && isStrongIntent(e.intent));
    if (!p.guard && threat) earnGuard(w, p);
    return;
  }
  const def = action === "attack1" ? null : SKILLS[action];
  const key: HitKey = action === "attack1" ? "attack1" : action;
  if (def) {
    p.res = (p.res ?? 0) - def.cost;
    if (def.cost) emit(w, "classResourceChanged", 0, { value: p.res });
  }
  emit(w, "actionCommitted", 0, { skillId: action, ...(tIdx !== undefined && { target: tIdx + 1 }) });
  const targets: number[] = !def || def.target === "single" ? (tIdx === undefined ? [] : [tIdx]) : def.target === "all" ? alive : [];
  let dealt = 0;
  let ownApplied = false;
  for (const i of targets) {
    const foe = w.es[i];
    if (foe.hp <= 0) continue;
    // Vigía: reads a hero who repeats the same action
    let factor = 1;
    const last = foe.boss?.last ?? [];
    if (ruleOf(foe) === "aprende" && last.length >= adaptAfter(foe.boss?.ascension ?? 0) &&
      last.slice(-adaptAfter(foe.boss?.ascension ?? 0)).every((x) => x === action)) {
      factor *= ADAPT_FACTOR;
      w.log.push(`${foe.char.name} te lee: tu golpe repetido le hace menos.`);
    }
    if (def?.exposedPower && foe.exposed) factor *= def.exposedPower / def.power;
    const wantsElement = !def?.consume;
    const el = p.char.element;
    const selfEl = el === "viento" || el === "rayo";
    const apply = wantsElement && (!selfEl || !ownApplied);
    const hpBefore = foe.hp;
    const d = strike(w, p, foe, key, {
      factor, applyElement: apply, stacks: def?.extraCharge ? 2 : 1, eIdx: i,
    });
    if (d > 0) {
      dealt += d;
      if (apply && selfEl) ownApplied = true;
      // Aguante: damage to the secondary bar
      const life = Math.max(0, hpBefore - foe.hp);
      if (applyAguante(w, foe, life, aguanteOf(def))) {
        if (def?.cancels === "break" && foe.intent === "charge") cancelIntent(w, foe, "el Quiebre interrumpe su Carga");
      }
      // Colossus armor: breakers take extra bite out of the shield
      if (ruleOf(foe) === "armadura" && (foe.shield ?? 0) > 0 && aguanteOf(def) > AGUANTE_HIT_FRACTION) {
        const bite = Math.round(d * (aguanteOf(def) - AGUANTE_HIT_FRACTION));
        foe.shield = Math.max(0, (foe.shield ?? 0) - bite);
        if ((foe.shield ?? 0) <= 0 && foe.boss && foe.boss.broken === 0) {
          const brokenFor = armorBrokenRounds(foe.boss.ascension);
          foe.boss = { ...foe.boss, broken: brokenFor, regrow: Math.max(armorRegrow(foe.boss.ascension), brokenFor + 1) };
          w.log.push(`¡La armadura de ${foe.char.name} se rompe! Queda Roto.`);
        }
      }
      if (def?.cancels === "interruptible" && foe.intent === "channeling")
        cancelIntent(w, foe, "su ritual es interrumpido");
    }
    if (def?.consume && d > 0 && !selfEl) consumeElement(w, p, foe, def.id);
  }
  if (def?.consume && dealt > 0 && (p.char.element === "viento" || p.char.element === "rayo")) {
    const tgt = targets.length ? w.es[targets[0]] : undefined;
    consumeElement(w, p, tgt ?? null, def.id);
  }
  // resources
  if (action === "attack1") {
    if (dealt > 0) addRes(w, p, 1);
  } else if (def) {
    if (def.gen && dealt > 0) addRes(w, p, def.gen);
    if (def.shield) addShield(w, p, def.shield);
    if (def.heal) healActive(w, p, def.heal);
    if (def.healIfDamage && dealt > 0) healActive(w, p, def.healIfDamage);
    if (def.cleanse) {
      const before = p.statuses?.length ?? 0;
      p.statuses = cleanse(p.statuses);
      if ((p.statuses?.length ?? 0) < before) w.log.push(`${p.char.name} se purifica de un estado negativo.`);
    }
    if (def.reduceNextHit) {
      p.nextHitReduction = def.reduceNextHit;
      w.log.push(`${p.char.name} esquiva: el próximo impacto recibido hace ${Math.round(def.reduceNextHit * 100)} % menos.`);
    }
    if (def.selfDamage) {
      const cost = Math.round(p.char.stats.hp * def.selfDamage);
      p.hp = Math.max(1, p.hp - cost);
      w.log.push(`${p.char.name} se desgarra: pierde ${cost} de vida.`);
    }
    if (def.cooldown) p.cds = { ...p.cds, [def.id]: def.cooldown };
    emit(w, "skillResolved", 0, { skillId: def.id, value: dealt });
  }
  if (dealt > 0) p.guardedLast = false;
  // Vigía memory
  for (const e of w.es)
    if (e.boss && ruleOf(e) === "aprende")
      e.boss = { ...e.boss, last: [...e.boss.last, action].slice(-adaptAfter(e.boss.ascension)) };
}

// ---- turn lifecycle ---------------------------------------------------------------------------

function checkEnd(w: Work): boolean {
  if (w.status !== "ongoing") return true;
  const foesDead = w.es.every((e) => e.hp <= 0);
  if (foesDead && w.p.hp <= 0 && w.humanFoe) w.status = "draw";
  else if (foesDead) w.status = "won";
  else if (w.p.hp <= 0) w.status = "lost";
  if (w.status !== "ongoing") {
    if (w.status === "lost") w.log.push(`${w.p.char.name} cae.`);
    emit(w, "combatEnded", 0, { detail: w.status });
    return true;
  }
  return false;
}

function markFallen(w: Work, fallen: boolean[]) {
  w.es.forEach((e, i) => {
    if (e.hp <= 0 && !fallen[i]) {
      fallen[i] = true;
      w.log.push(`${e.char.name} cae.`);
      const kh = rulesOf(w.p).killHeal;
      if (kh > 0 && w.p.hp > 0) {
        const hp = Math.min(w.p.char.stats.hp, w.p.hp + Math.round(w.p.char.stats.hp * kh * healMult(w.p)));
        if (hp > w.p.hp) w.log.push(`${w.p.char.name} se alimenta: recupera ${hp - w.p.hp}.`);
        w.p.hp = hp;
      }
    }
  });
}

/** Start of a combatant's own turn: stance drops, burn ticks. Returns false if it died. */
function beginTurn(w: Work, c: Combatant): boolean {
  const id = idOf(w, c);
  c.defending = false;
  c.guard = false;
  c.nextHitReduction = undefined;
  c.activeHeal = 0;
  emit(w, "turnStarted", id);
  const burn = Math.min(burnDamage(c.statuses), Math.round(c.char.stats.hp * BURN_CAP));
  if (burn > 0) {
    c.hp = Math.max(0, c.hp - burn);
    w.log.push(`${c.char.name} se quema: ${burn} de daño.`);
  }
  return c.hp > 0;
}

/** End of a combatant's own turn: cooldowns, durations, passives, boss counters. */
function closeTurn(w: Work, c: Combatant, usedSkill?: SkillId) {
  const id = idOf(w, c);
  const defended = c.defending;
  // cooldowns that existed before this action
  if (c.cds) {
    const next: Partial<Record<SkillId, number>> = {};
    for (const [k, v] of Object.entries(c.cds) as [SkillId, number][]) {
      const nv = k === usedSkill ? v : Math.max(0, v - 1);
      if (nv > 0) next[k] = nv;
    }
    c.cds = next;
  }
  if (c.cooldown > 0) c.cooldown -= 1;
  const had = c.statuses?.length ?? 0;
  c.statuses = tickStatuses(c.statuses);
  if ((c.statuses?.length ?? 0) < had) emit(w, "statusExpired", id);
  c.exposed = false;
  c.frostDelayed = false;
  c.quiebreResist = Math.max(0, (c.quiebreResist ?? 0) - 1);
  c.healCut = Math.max(0, (c.healCut ?? 0) - 1);
  c.guardedLast = defended;
  if (c.bypassFresh) c.bypassFresh = false;
  else if (c.nextAttackDefenseBypass) c.nextAttackDefenseBypass = undefined;
  // passive recovery
  const rate = passiveHealRate(c);
  if (rate > 0 && c.hp > 0) {
    const hp = Math.min(c.char.stats.hp, c.hp + Math.round(c.char.stats.hp * rate * healMult(c)));
    if (hp > c.hp) w.log.push(`${c.char.name} se recupera ${hp - c.hp}.`);
    c.hp = hp;
  }
  c.ownTurns += 1;
  if (c.boss) bossTurnEnd(w, c);
  if (c !== w.p && c.hp > 0) enemyTurnEnd(w, c);
}

function enemyTurnEnd(w: Work, c: Combatant) {
  if (w.mods?.includes("regeneracion")) {
    const hp = Math.min(c.char.stats.hp, c.hp + Math.round(c.char.stats.hp * REGEN_FRACTION));
    if (hp > c.hp) w.log.push(`${c.char.name} se regenera.`);
    c.hp = hp;
  }
  if (w.mods?.includes("elementoCambiante") && c.ownTurns % ELEMENT_SHIFT_EVERY === 0) {
    const element = w.rng.pick(ELEMENTS.filter((x) => x !== c.char.element));
    c.char = { ...c.char, element };
    w.log.push(`${c.char.name} cambia a ${ELEMENT_LABEL[element]}.`);
  }
  if (c.ownTurns > ENRAGE_AFTER_OWN_TURN) {
    c.char = { ...c.char, stats: { ...c.char.stats, atk: c.char.stats.atk * (1 + ENRAGE_STEP) } };
    w.log.push(`${c.char.name} se enfurece.`);
  }
}

function bossTurnEnd(w: Work, c: Combatant) {
  if (!c.boss) return;
  const rule = ruleOf(c);
  const boss = { ...c.boss, turns: c.boss.turns + 1 };
  if (rule === "presion") {
    if (boss.pressureReset) boss.pressureReset = false;
    else boss.pressure = Math.min(PRESSURE_MAX, boss.pressure + pressureGain(boss.ascension));
  }
  if (rule === "velocidad" && boss.turns % rampInterval(boss.ascension) === 0 && boss.ramp < RAMP_MAX) {
    boss.ramp += 1;
    w.log.push(`${c.char.name} se acelera.`);
  }
  if (rule === "armadura") {
    boss.broken = Math.max(0, boss.broken - 1);
    if (boss.regrow > 0) boss.regrow -= 1;
  }
  if (rule === "posturas") {
    const next = stanceFor(boss.turns + 1, boss.ascension);
    if (next !== boss.stance) {
      boss.stance = next;
      w.log.push(`${c.char.name} adoptará la postura ${next} en su próximo turno.`);
      emit(w, "bossPhaseChanged", idOf(w, c), { detail: next });
    }
  }
  if (rule === "plaga" && w.p.hp > 0) {
    const loss = Math.round(w.p.char.stats.hp * plagueLoss(boss.ascension));
    w.p.hp = Math.max(0, w.p.hp - loss);
    w.log.push(`La plaga te consume ${loss} de vida.`);
  }
  c.boss = boss;
}

// ---- enemy brain ------------------------------------------------------------------------------

function pickIntent(w: Work, c: Combatant) {
  const i = w.es.indexOf(c);
  const rule = ruleOf(c);
  const view: BrainView = {
    self: c,
    index: i,
    player: w.p,
    allies: w.es.flatMap((e, k) => (k !== i && e.hp > 0 ? [{ index: k, c: e }] : [])),
    strongCommitted: w.es.some((e, k) => k !== i && e.hp > 0 && e.intent !== undefined && isStrongIntent(e.intent)),
    ev: (att, def, intent) => hitChance(att, intent as HitKey) * estimateDamage(att, def, intent as HitKey),
    ritualDue: rule === "marchitar" && c.ownTurns > 0 && c.ownTurns % ritualEvery(c.boss?.ascension ?? 0) === 0,
    rebuildDue: rule === "armadura" && !!c.boss && c.boss.regrow === 1 && (c.shield ?? 0) <= 0,
    chargeReady: c.char.name === COLOSSAL_GOLEM && !!c.chargePending,
    prepareCharge: c.char.name === COLOSSAL_GOLEM && !c.chargeUsed && !c.chargePending && c.cooldown <= 0,
  };
  const choice = chooseIntent(view, w.rng);
  if (DEV) w.trace.push({ enemy: i, candidates: [choice] });
  c.intent = choice.intent;
  c.intentAlly = choice.ally;
  c.intentAnswered = false;
  if (choice.intent === "defend" && view.prepareCharge) {
    c.chargeUsed = true;
    c.chargePending = true;
    w.log.push(`${c.char.name} prepara una Carga cancelable por Quiebre.`);
  }
  if (isStrongIntent(choice.intent) || choice.intent === "rebuild") {
    const what =
      choice.intent === "channeling" ? "canaliza un ritual (se puede interrumpir)"
      : choice.intent === "charge" ? "anuncia una Carga (Defender la mitiga; Quiebre la cancela)"
      : choice.intent === "rebuild" ? "anuncia que reconstruirá su armadura"
      : "anuncia un golpe fuerte";
    w.log.push(`${c.char.name} ${what}: tendrás un turno para responder.`);
    emit(w, "telegraphStarted", idOf(w, c), { detail: choice.intent });
  }
}

function enemyTurn(w: Work, c: Combatant) {
  const intent = c.intent ?? "attack1";
  const i = w.es.indexOf(c);
  emit(w, "actionCommitted", i + 1, { detail: intent });
  if (intent === "defend") {
    c.defending = true;
    w.log.push(`${c.char.name} se defiende.`);
  } else if (intent === "protect") {
    const ally = c.intentAlly !== undefined ? w.es[c.intentAlly] : undefined;
    if (ally && ally.hp > 0) {
      const add = Math.round(c.char.stats.hp * PROTECT_SHIELD);
      ally.shield = (ally.shield ?? 0) + add;
      w.log.push(`${c.char.name} protege a ${ally.char.name} con un escudo de ${add}.`);
      emit(w, "shieldChanged", i + 1, { target: w.es.indexOf(ally) + 1, value: ally.shield });
    } else {
      c.defending = true;
      w.log.push(`${c.char.name} se defiende.`);
    }
  } else if (intent === "rebuild") {
    if (c.boss) c.boss = { ...c.boss, broken: 0, regrow: 0 };
    c.shield = Math.round(c.char.stats.hp * ARMOR_FRACTION);
    w.log.push(`${c.char.name} recompone su armadura.`);
    emit(w, "bossPhaseChanged", i + 1, { detail: "armadura" });
  } else if (intent === "channeling") {
    w.log.push(`${c.char.name} completa su ritual.`);
    w.p.statuses = addStatus(w.p.statuses, "ruptura", 1, undefined, w.p.char.stats.resist)
      .map((st) => (st.id === "ruptura" ? { ...st, turns: Math.min(st.turns, RITUAL_EFFECT_TURNS) } : st));
    if (ruleOf(c) === "marchitar") {
      w.p.healCut = RITUAL_ROUNDS;
      w.log.push("El ritual te marchita: Ruptura y curas a la mitad.");
    } else w.log.push("El ritual te deja Ruptura.");
  } else {
    enemyAttack(w, c, i, intent);
  }
  c.mem = [...(c.mem ?? []), intent].slice(-3);
}

function enemyAttack(w: Work, c: Combatant, i: number, intent: "attack1" | "attack2" | "charge") {
  const key: HitKey = intent;
  if (intent === "charge") w.log.push(`${c.char.name} lanza su Carga.`);
  const strong = intent !== "attack1";
  const guarded = w.p.defending && !!w.p.guard;
  c.chargePending = false;
  const dmg = strike(w, c, w.p, key, {
    eIdx: i, defenseBypass: intent === "charge" ? CHARGE_DEFENSE_BYPASS : 0,
  });
  if (strong) c.cooldown = Math.max(2, attackOf(c, "attack2").cooldown) + 1;
  if (w.p.hp > 0 && c.hp > 0 && dmg > 0) {
    // Hidra heads / starving Devorador: extra impacts, no extra turn, effects once per use
    const rule = ruleOf(c);
    let extra = 0;
    if (rule === "cabezas") extra = Math.min(MAX_EXTRA_IMPACTS, c.boss?.heads ?? 0);
    if (rule === "hambre" && c.hp < c.char.stats.hp * hungerBelow(c.boss?.ascension ?? 0)) extra = 1;
    for (let k = 0; k < extra && w.p.hp > 0; k++)
      strike(w, c, w.p, "attack1", { eIdx: i, factor: EXTRA_IMPACT, applyElement: false });
    if (rule === "cabezas" && extra > 0 && c.boss) c.boss = { ...c.boss, heads: 0 };
    if (w.mods?.includes("dobleAtaque") && w.p.hp > 0 && c.hp > 0)
      strike(w, c, w.p, "attack1", { eIdx: i, factor: DOUBLE_ATTACK_FACTOR });
  }
  if (c.boss && ruleOf(c) === "presion" && strong && guarded && c.boss.pressure > 0) {
    c.boss = { ...c.boss, pressure: 0, pressureReset: true };
    w.log.push(`La guardia perfecta apaga la presión de ${c.char.name}.`);
  }
}

// ---- scheduler --------------------------------------------------------------------------------

/** Advances virtual time to the next actor (docs/ideal/01 §3.1) and returns its id. */
function schedule(w: Work): number {
  const ids = [0, ...w.es.map((_, i) => i + 1)];
  const rank = (id: number) => w.order.indexOf(id);
  for (let guard = 0; guard < 10_000; guard++) {
    const live = ids.filter((id) => actorOf(w, id).hp > 0);
    const held = (id: number) => id !== 0 && !(w.humanFoe && id === 1) && isHeld(actorOf(w, id));
    const eligible = live.filter((id) => !held(id));
    const ready = eligible.filter((id) => actorOf(w, id).progress >= TURN_THRESHOLD);
    if (ready.length) {
      ready.sort((x, y) => {
        const cx = actorOf(w, x);
        const cy = actorOf(w, y);
        return cy.progress - cx.progress || rateOf(cy) - rateOf(cx) || rank(x) - rank(y);
      });
      const id = ready[0];
      actorOf(w, id).progress -= TURN_THRESHOLD;
      return id;
    }
    const t = Math.max(1, Math.min(...eligible.map((id) => {
      const c = actorOf(w, id);
      return Math.ceil((TURN_THRESHOLD - c.progress) / rateOf(c));
    })));
    for (const id of eligible) {
      const c = actorOf(w, id);
      c.progress += t * rateOf(c);
    }
  }
  return 0;
}

/** Runs enemy turns until a human is up (or the fight ends). */
function runUntilHuman(w: Work, fallen: boolean[]) {
  for (let guard = 0; guard < 2_000; guard++) {
    if (checkEnd(w)) return;
    if (w.turn >= TURN_WARN && !w.warned) {
      w.warned = true;
      w.log.push("El combate se alarga: si nadie gana pronto, terminará en empate.");
    }
    if (w.turn >= TURN_CAP) {
      w.status = "draw";
      w.log.push("Tiempo agotado: el combate termina en empate.");
      emit(w, "combatEnded", 0, { detail: "draw" });
      return;
    }
    const id = schedule(w);
    const c = actorOf(w, id);
    if (id === 0 || (w.humanFoe && id === 1)) {
      w.awaiting = id;
      if (!beginTurn(w, c)) {
        markFallen(w, fallen);
        checkEnd(w);
      }
      return;
    }
    if (!beginTurn(w, c)) {
      markFallen(w, fallen);
      w.turn++;
      continue;
    }
    enemyTurn(w, c);
    closeTurn(w, c);
    if (c.hp > 0) pickIntent(w, c);
    markFallen(w, fallen);
    w.turn++;
  }
}

// ---- public API -------------------------------------------------------------------------------

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
    if (opts.humanFoe && i === 0) {
      e.res = 0;
      e.loadout = opts.foeLoadout ?? defaultLoadout(c.classId);
      return e;
    }
    if (opts.enemyStatus) e.applies = true;
    const rule = ruleOf(e);
    if ((opts.enemyAguante && i === 0) || (c.bossId && rule !== "armadura") || c.name === COLOSSAL_GOLEM) {
      e.aguanteMax = Math.max(1, Math.round(c.stats.hp * AGUANTE_FRACTION));
      e.aguante = e.aguanteMax;
    }
    if (rule) e.boss = { ...NEW_BOSS, ascension: Math.max(0, Math.min(5, Math.floor(opts.ascension ?? 0))) };
    if (rule === "armadura") e.shield = Math.round(c.stats.hp * ARMOR_FRACTION);
    if (mods.includes("escudo")) e.shield = Math.round(c.stats.hp * SHIELD_FRACTION);
    return e;
  });
  const p = newCombatant(player);
  p.res = 0;
  p.loadout = opts.loadout ?? defaultLoadout(player.classId);
  if (opts.playerHp !== undefined) p.hp = opts.playerHp;
  if (opts.playerShield) p.shield = opts.playerShield;
  if (opts.freeHits) p.freeHits = opts.freeHits;
  if (opts.perks) p.perks = opts.perks;
  const ids = [0, ...es.map((_, i) => i + 1)];
  const order = opts.swapOrder && ids.length >= 2 ? [1, 0, ...ids.slice(2)] : ids;
  const b: Battle = {
    ...(mods.length ? { mods } : {}),
    ...(opts.humanFoe ? { humanFoe: true } : {}),
    player: p,
    enemies: es,
    order,
    awaiting: 0,
    turn: 0,
    actions: 0,
    status: "ongoing",
    events: [],
    cev: [],
    seq: 0,
    log: [
      ...(list.length === MAX_ENEMIES && !list.some((c) => c.bossId) ? ["¡Emboscada! Tres enemigos te rodean."] : []),
      ...list.slice(0, MAX_ENEMIES).map((c) => `${c.name} (${ELEMENT_LABEL[c.element]}) aparece.`),
      `${list[0].name}: «${list[0].catchphrase}»`,
      `${player.name}: «${player.catchphrase}»`,
    ],
  };
  const w = toWork(b, rng);
  if (!opts.humanFoe) w.es.forEach((e) => pickIntent(w, e));
  else w.es.slice(1).forEach((e) => pickIntent(w, e));
  runUntilHuman(w, w.es.map((e) => e.hp <= 0));
  return toBattle(b, w);
}

/** Legality of a human action in the current state (no side effects). */
export function actionError(b: Battle, action: Action, target?: number): string | null {
  if (b.status !== "ongoing") return "El combate terminó.";
  const actor = b.awaiting === 0 ? b.player : b.enemies[b.awaiting - 1];
  const foes = b.awaiting === 0 ? b.enemies : [b.player];
  const alive = foes.flatMap((e, i) => (e.hp > 0 ? [i] : []));
  if (target !== undefined && (!Number.isInteger(target) || target < 0 || target >= alive.length))
    return "Objetivo inválido.";
  if (action === "defend") return null;
  if (action === "attack1") return alive.length ? null : "Sin objetivos.";
  if (!isSkillId(action)) return "Acción desconocida.";
  return skillBlockReason(actor, action);
}

/**
 * Resolves the awaiting human's action, then every enemy turn up to the next human turn.
 * `target` indexes the LIVING foes (default: the first). Illegal action => returns `b` itself.
 */
export function step(b: Battle, action: BattleAction, rng: Rng, target?: number): Battle {
  if (b.status !== "ongoing") return b;
  if (b.awaiting !== 0) {
    if (!b.humanFoe) return b;
    const m = mirror(b);
    const r = step(m, action, rng, target);
    return r === m ? b : mirror(r);
  }
  if (actionError(b, action, target) !== null) return b;
  const w = toWork(b, rng);
  const alive = w.es.flatMap((e, i) => (e.hp > 0 ? [i] : []));
  const tIdx = alive[target ?? 0];
  const fallen = w.es.map((e) => e.hp <= 0);
  const usedSkill = action === "attack1" || action === "defend" ? undefined : action;
  heroAction(w, action, tIdx);
  w.actions += 1;
  for (const e of w.es) e.intentAnswered = true;
  markFallen(w, fallen);
  w.turn += 1;
  if (!checkEnd(w)) {
    closeTurn(w, w.p, usedSkill);
    if (!checkEnd(w)) runUntilHuman(w, fallen);
  }
  return toBattle(b, w);
}
