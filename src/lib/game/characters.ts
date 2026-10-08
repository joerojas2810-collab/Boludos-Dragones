import { ELEMENTS, type Element } from "./elements";
import type { RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import type { GearBonus } from "./gear";
import type { SkillId } from "./skills";
import type { EnemyFamily } from "./worlds";
import {
  CATCHPHRASES,
  rollRuleTrait,
  rollTraits,
  traitPlan,
  TRAITS,
  type Trait,
  type TraitId,
  type TraitMods,
} from "./traits";

export type ClassId = "caballero" | "mago" | "picaro" | "clerigo";
export const CLASS_IDS: readonly ClassId[] = [
  "caballero",
  "mago",
  "picaro",
  "clerigo",
];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  accuracy: number; // additive to attack accuracy
  speed: number; // initiative
  critDmg: number; // crit damage multiplier (base x1.5, Pícaro x2.0)
  regen: number; // gear line: fraction of max hp healed per round (capped in combat)
  lifesteal: number; // gear line: fraction of damage dealt healed (capped in combat)
}

export interface Attack {
  name: string;
  power: number;
  accuracy: number;
  cooldown: number;
  heal: number; // fraction of max hp restored on use
}

export type PassiveId = "muralla" | "focoArcano" | "filoMortal" | "bendicion";

export interface Passive {
  id: PassiveId;
  name: string;
  description: string;
}

// Class passive strengths (tuned with scripts/balance.ts).
export const CLASS_PASSIVE_DMG_REDUCTION = 0.18; // Caballero: incoming damage
export const CLASS_PASSIVE_ADVANTAGE_BONUS = 0.55; // Mago: replaces ADVANTAGE_BONUS
export const CLASS_PASSIVE_CRIT_MULT = 2; // Pícaro: base crit damage multiplier
export const CLASS_PASSIVE_MAGE_CRIT = 0.1; // Mago: extra crit chance
export const CLASS_PASSIVE_MAGE_REDUCTION = 0.05; // Mago: incoming damage
export const BASE_CRIT_DMG = 1.5;
export const CLASS_PASSIVE_REGEN = 0.005; // Clérigo: max hp per turn

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;

export interface ClassTemplate {
  name: string;
  passive: Passive;
  stats: Stats;
  attack1: Attack;
  attack2: Attack;
}

export const STAT_VARIANCE = 0.15;

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
      dodge: 0.05,
      accuracy: 0,
      speed: 9.5,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: { name: "Tajo", power: 1, accuracy: 0.95, cooldown: 0, heal: 0 },
    attack2: {
      name: "Golpe de escudo",
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
      description: `Con ventaja elemental su daño sube ${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de 25%, tiene +${pct(CLASS_PASSIVE_MAGE_CRIT)} de crítico y recibe ${pct(CLASS_PASSIVE_MAGE_REDUCTION)} menos daño.`,
    },
    stats: {
      hp: 85,
      atk: 23,
      def: 3,
      crit: 0.1,
      dodge: 0.05,
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
      name: "Cataclismo",
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
      atk: 16.2,
      def: 4,
      crit: 0.25,
      dodge: 0.2,
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
      dodge: 0.05,
      accuracy: 0,
      speed: 10,
      critDmg: BASE_CRIT_DMG,
      regen: 0,
      lifesteal: 0,
    },
    attack1: { name: "Maza", power: 1, accuracy: 0.95, cooldown: 0, heal: 0 },
    attack2: {
      name: "Plegaria",
      power: 0.6,
      accuracy: 0.9,
      cooldown: 2,
      heal: 0.09,
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
  // Equipped weapon snapshot: element replaces the hero's ATTACK element in
  // combat. atkBonus is informational: heroFromOwned already adds it to stats.atk.
  weapon?: { element: Element; atkBonus: number; type?: string };
  // Worn gear bonus, already folded into stats (kept so nivelado can undo it).
  gear?: GearBonus;
  // Third skill: the hero's pick (saved in the collection; see skills.heroSkill).
  skill?: SkillId;
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

function rollStat(rng: Rng, base: number): number {
  return base * (1 - STAT_VARIANCE + rng.next() * 2 * STAT_VARIANCE);
}

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
    dodge: clamp(stats.dodge + sum("dodge"), 0, 0.6),
    accuracy: sum("accuracy"),
    speed: Math.round(stats.speed * mult("speed") * 10) / 10,
    critDmg: stats.critDmg,
    regen: 0,
    lifesteal: 0,
  };
}

// Adds the stat mods of extra traits to stats that already carry the mods of their old ones
// (hero fusion). ponytail: the +-25% cap applies to the new traits alone, so a stack can
// overshoot the single-roll cap by a little; fine for a rank-up that grants 1-2 traits.
export function addTraitMods(stats: Stats, ids: readonly TraitId[]): Stats {
  const s = applyTraits(stats, ids);
  return {
    ...s,
    accuracy: stats.accuracy + s.accuracy,
    critDmg: stats.critDmg,
    regen: stats.regen,
    lifesteal: stats.lifesteal,
  };
}

export function generateCharacter(
  rng: Rng,
  classId: ClassId = rng.pick(CLASS_IDS),
  rank: RarityId = "f",
): Character {
  const base = CLASSES[classId].stats;
  // Roll order matters for seeds: keep it equal to the Stats declaration order.
  const raw: Stats = {
    hp: rollStat(rng, base.hp),
    atk: rollStat(rng, base.atk),
    def: rollStat(rng, base.def),
    crit: rollStat(rng, base.crit),
    dodge: rollStat(rng, base.dodge),
    accuracy: rollStat(rng, base.accuracy),
    speed: rollStat(rng, base.speed),
    critDmg: base.critDmg,
    regen: 0,
    lifesteal: 0,
  };
  const plan = traitPlan(rank);
  const classic = rollTraits(rng, plan.classic);
  // Rule traits use their own RNG derived from the raw rolls, so the main stream
  // (name, element, catchphrase, later characters) is not disturbed.
  const traits = plan.rule
    ? [
        ...classic,
        rollRuleTrait(
          createRng(
            hashSeed(
              Math.round(raw.hp * 1e4),
              Math.round(raw.atk * 1e4),
              Math.round(raw.speed * 1e4),
            ),
          ),
          classId,
        ),
      ]
    : classic;
  const stats = applyTraits({ ...raw, accuracy: 0 }, traits);
  const name = Array.from({ length: rng.int(2, 3) }, () =>
    rng.pick(SYLLABLES),
  ).join("");
  return {
    name: name[0].toUpperCase() + name.slice(1),
    classId,
    element: rng.pick(ELEMENTS),
    stats,
    traits,
    catchphrase: rng.pick(CATCHPHRASES),
    level: 1,
    xp: 0,
  };
}
