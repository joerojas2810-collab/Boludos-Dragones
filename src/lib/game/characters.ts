import { ELEMENTS, type Element } from "./elements";
import type { RarityId } from "./rarity";
import type { Rng } from "./rng";
import type { GearBonus } from "./gear";
import type { EnemyFamily } from "./worlds";
import {
  CATCHPHRASES,
  rollTrait,
  TRAITS,
  type Trait,
  type TraitId,
  type TraitMods,
} from "./traits";

export type ClassId = "caballero" | "mago" | "picaro" | "clerigo" | "berserker";
export const CLASS_IDS: readonly ClassId[] = [
  "caballero",
  "mago",
  "picaro",
  "clerigo",
  "berserker",
];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  crit: number;
  resist: number;
  accuracy: number; // additive to attack accuracy
  speed: number; // turn rate (see combat.ts rateOf)
  critDmg: number; // crit damage multiplier (base x1.5, Pícaro x2.0)
  regen: number; // gear line: fraction of max hp healed per own turn (capped in combat)
  lifesteal: number; // gear line: fraction of damage dealt healed (capped in combat)
}

/** Per-hero multipliers for the five attributes affected by the H1 factor. */
export interface HeroFactors {
  hp: number;
  atk: number;
  def: number;
  crit: number;
  speed: number;
}

export const FACTOR_MIN = 0.85;
export const FACTOR_MAX = 1.15;
export const FACTOR_POWER_CAP = 0.10;

export interface Attack {
  name: string;
  power: number;
  accuracy: number;
  cooldown: number;
  heal: number; // fraction of max hp restored on use
  crit?: number; // additive critical chance for weapon-defined basics
  selfCost?: number; // fraction of CURRENT hp the user pays (never kills)
}

export type PassiveId =
  | "muralla"
  | "focoArcano"
  | "filoMortal"
  | "bendicion"
  | "furia";

export interface Passive {
  id: PassiveId;
  name: string;
  description: string;
}

// Class passive strengths (tuned with scripts/balance.ts).
export const CLASS_PASSIVE_DMG_REDUCTION = 0.1; // Caballero: incoming damage
export const CLASS_PASSIVE_ADVANTAGE_BONUS = 0.55; // Mago: replaces ADVANTAGE_BONUS
export const CLASS_PASSIVE_CRIT_MULT = 2; // Pícaro: base crit damage multiplier
export const CLASS_PASSIVE_MAGE_CRIT = 0.1; // Mago: extra crit chance
export const CLASS_PASSIVE_MAGE_CONSUME_MULT = 1.25;
export const CLASS_PASSIVE_MAGE_REDUCTION = 0.05; // Mago: incoming damage
// Berserker Furia: damage bonus by thresholds of missing hp (highest threshold met wins).
export const CLASS_PASSIVE_FURY: readonly { below: number; bonus: number }[] = [
  { below: 0.33, bonus: 0.3 },
  { below: 0.66, bonus: 0.15 },
];
export const BASE_CRIT_DMG = 1.5;
export const CLASS_PASSIVE_REGEN = 0.008; // Clérigo: max hp per turn

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;

export interface ClassTemplate {
  name: string;
  passive: Passive;
  stats: Stats;
  attack1: Attack;
  // Enemy-only strong strike profile. Heroes cannot select this as an action.
  attack2: Attack;
}

export const STAT_VARIANCE = 0.15;

const FACTOR_KEYS = ["hp", "atk", "def", "crit", "speed"] as const;

/** Clamp aggregate attribute power without additional random draws. */
export function capFactors(factors: HeroFactors): HeroFactors {
  const mean = (factors.hp + factors.atk + factors.def + factors.speed) / 4;
  const excess = Math.abs(mean - 1);
  if (excess <= FACTOR_POWER_CAP) return { ...factors };
  const scale = FACTOR_POWER_CAP / excess;
  return Object.fromEntries(
    FACTOR_KEYS.map((key) => [key, 1 + (factors[key] - 1) * scale]),
  ) as unknown as HeroFactors;
}

/** Roll in contract order; seeded callers get stable factors and no extra draws. */
export function rollFactors(rng: Rng): HeroFactors {
  const rolled = Object.fromEntries(
    FACTOR_KEYS.map((key) => [
      key,
      FACTOR_MIN + rng.next() * (FACTOR_MAX - FACTOR_MIN),
    ]),
  ) as unknown as HeroFactors;
  return capFactors(rolled);
}

/** Derive the complete base stats from class, factors, and trait. */
export function buildStats(
  classId: ClassId,
  factors: HeroFactors,
  traits: readonly TraitId[],
): Stats {
  const base = CLASSES[classId].stats;
  return applyTraits(
    {
      ...base,
      hp: base.hp * factors.hp,
      atk: base.atk * factors.atk,
      def: base.def * factors.def,
      crit: base.crit * factors.crit,
      accuracy: 0,
      speed: base.speed * factors.speed,
    },
    traits,
  );
}

const FACTOR_NAMES: Record<keyof HeroFactors, string> = {
  hp: "VIDA",
  atk: "ATQ",
  def: "DEF",
  crit: "CRIT",
  speed: "VEL",
};

export function factorLabel(factors: HeroFactors): {
  perStat: Record<keyof HeroFactors, string>;
  summary: "bajo" | "estándar" | "alto";
} {
  const perStat = Object.fromEntries(
    FACTOR_KEYS.map((key) => {
      const delta = Math.round((factors[key] - 1) * 100);
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
      return [key, `${FACTOR_NAMES[key]} ${sign}${Math.abs(delta)} %`];
    }),
  ) as Record<keyof HeroFactors, string>;
  const mean = FACTOR_KEYS.reduce((sum, key) => sum + factors[key] - 1, 0) / 5;
  return {
    perStat,
    summary: mean < -0.03 ? "bajo" : mean > 0.03 ? "alto" : "estándar",
  };
}

export const CLASSES: Record<ClassId, ClassTemplate> = {
  caballero: {
    name: "Caballero",
    passive: {
      id: "muralla",
      name: "Muralla",
      description: `Recibe ${pct(CLASS_PASSIVE_DMG_REDUCTION)} menos daño de todos los golpes.`,
    },
    stats: {
      hp: 120,
      atk: 15,
      def: 8,
      crit: 0.05,
      resist: 0,
      accuracy: 0,
      speed: 9.5,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: { name: "Tajo", power: 1, accuracy: 0.95, cooldown: 0, heal: 0 },
    attack2: {
      name: "Estocada",
      power: 2.1,
      accuracy: 0.75,
      cooldown: 2,
      heal: 0,
    },
  },
  mago: {
    name: "Mago",
    passive: {
      id: "focoArcano",
      name: "Foco arcano",
      description: `Con ventaja elemental su daño sube ${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de 25%, tiene +${pct(CLASS_PASSIVE_MAGE_CRIT)} de crítico y recibe ${pct(CLASS_PASSIVE_MAGE_REDUCTION)} menos daño. Sus consumos elementales son un ${pct(CLASS_PASSIVE_MAGE_CONSUME_MULT - 1)} más potentes.`,
    },
    stats: {
      hp: 85,
      atk: 23,
      def: 3,
      crit: 0.1,
      resist: 0,
      accuracy: 0,
      speed: 10,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: {
      name: "Chispa",
      power: 1,
      accuracy: 0.95,
      cooldown: 0,
      heal: 0,
    },
    attack2: {
      name: "Estallido",
      power: 2.6,
      accuracy: 0.7,
      cooldown: 2,
      heal: 0,
    },
  },
  picaro: {
    name: "Pícaro",
    passive: {
      id: "filoMortal",
      name: "Filo mortal",
      description: `Sus críticos hacen x${CLASS_PASSIVE_CRIT_MULT.toFixed(1)} de daño (los demás x1.5).`,
    },
    stats: {
      hp: 85,
      atk: 17.5,
      def: 4,
      crit: 0.25,
      resist: 0,
      accuracy: 0,
      speed: 10.5,
      critDmg: CLASS_PASSIVE_CRIT_MULT,
      regen: 0,
      lifesteal: 0,
    },
    attack1: {
      name: "Puñalada",
      power: 1,
      accuracy: 0.95,
      cooldown: 0,
      heal: 0,
    },
    attack2: {
      name: "Golpe bajo",
      power: 2.1,
      accuracy: 0.75,
      cooldown: 2,
      heal: 0,
    },
  },
  clerigo: {
    name: "Clérigo",
    passive: {
      id: "bendicion",
      name: "Bendición",
      description: `Recupera ${pct(CLASS_PASSIVE_REGEN)} de su vida máxima al final de cada turno.`,
    },
    stats: {
      hp: 106,
      atk: 14.5,
      def: 5,
      crit: 0.05,
      resist: 0,
      accuracy: 0,
      speed: 10,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: { name: "Maza", power: 1, accuracy: 0.95, cooldown: 0, heal: 0 },
    attack2: {
      name: "Rezo",
      power: 0.6,
      accuracy: 0.9,
      cooldown: 2,
      heal: 0.09,
    },
  },
  berserker: {
    name: "Berserker",
    passive: {
      id: "furia",
      name: "Furia",
      description: `Hace ${pct(CLASS_PASSIVE_FURY[1].bonus)} más de daño con menos del 66% de vida y ${pct(CLASS_PASSIVE_FURY[0].bonus)} más con menos del 33%.`,
    },
    stats: {
      hp: 105,
      atk: 17,
      def: 5,
      crit: 0.05,
      resist: 0,
      accuracy: 0,
      speed: 10,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: { name: "Tajo salvaje", power: 1, accuracy: 0.95, cooldown: 0, heal: 0 },
    attack2: {
      name: "Embestida",
      power: 2,
      accuracy: 0.8,
      cooldown: 2,
      heal: 0,
    },
  },
};

export interface Character {
  name: string;
  classId: ClassId;
  element: Element;
  stats: Stats;
  traits: TraitId[];
  catchphrase: string;
  level: number;
  xp: number;
  // Gacha fields; absent means común / 0 stars / no weapon.
  rarity?: RarityId;
  stars?: number;
  // Equipped weapon snapshot: the weapon type defines the basic; its element only counts for sets
  // (attacks use the hero's own element). atkBonus is informational: heroFromOwned already adds it to stats.atk.
  weapon?: { element: Element; atkBonus: number; type?: string };
  // Worn gear bonus, already folded into stats (kept so nivelado can undo it).
  gear?: GearBonus;
  // Enemies only: art family and named-boss art id (public/art/enemies/boss_<id>_*).
  family?: EnemyFamily;
  bossId?: string;
}

const SYLLABLES = [
  "ka",
  "lo",
  "mir",
  "tha",
  "zu",
  "ren",
  "bo",
  "vel",
  "dra",
  "sin",
  "gor",
  "elu",
];

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Total trait bonus/penalty on a multiplicative stat is capped so combos of
// two traits cannot produce extreme characters.
export const TRAIT_MULT_CAP = 0.25;

const asTrait = (t: Trait): Trait => t;

function applyTraits(stats: Stats, ids: readonly TraitId[]): Stats {
  const sum = (k: keyof TraitMods) =>
    ids.reduce((acc, id) => acc + (asTrait(TRAITS[id]).mods[k] ?? 0), 0);
  const mult = (k: keyof TraitMods) =>
    1 + clamp(sum(k), -TRAIT_MULT_CAP, TRAIT_MULT_CAP);
  return {
    hp: Math.max(1, Math.round(stats.hp * mult("hp"))),
    atk: Math.round(stats.atk * mult("atk") * 10) / 10,
    def: Math.round(stats.def * mult("def") * 10) / 10,
    crit: clamp(stats.crit + sum("crit"), 0, 0.6),
    resist: clamp(stats.resist + sum("resist"), 0, 0.6),
    accuracy: sum("accuracy"),
    speed: Math.round(stats.speed * mult("speed") * 10) / 10,
    critDmg: stats.critDmg,
    regen: 0,
    lifesteal: 0,
  };
}

export function generateCharacter(
  rng: Rng,
  classId: ClassId = rng.pick(CLASS_IDS),
): Character & { factors: HeroFactors } {
  // Preserve the legacy discarded accuracy draw after crit so names and later
  // random fields keep their seeded sequence. Accuracy is not a hero factor.
  const factors: HeroFactors = {
    hp: FACTOR_MIN + rng.next() * 2 * STAT_VARIANCE,
    atk: FACTOR_MIN + rng.next() * 2 * STAT_VARIANCE,
    def: FACTOR_MIN + rng.next() * 2 * STAT_VARIANCE,
    crit: FACTOR_MIN + rng.next() * 2 * STAT_VARIANCE,
    speed: 1,
  };
  rng.next(); // Historical accuracy roll, intentionally discarded.
  factors.speed = FACTOR_MIN + rng.next() * 2 * STAT_VARIANCE;
  const cappedFactors = capFactors(factors);
  const traits = [rollTrait(rng, classId)];
  const stats = buildStats(classId, cappedFactors, traits);
  const name = Array.from({ length: rng.int(2, 3) }, () =>
    rng.pick(SYLLABLES),
  ).join("");
  return {
    name: name[0].toUpperCase() + name.slice(1),
    classId,
    element: rng.pick(ELEMENTS),
    stats,
    traits,
    factors: cappedFactors,
    catchphrase: rng.pick(CATCHPHRASES),
    level: 1,
    xp: 0,
  };
}
