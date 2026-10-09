import type { ClassId } from "./characters";
import { RARITY_IDS, type RarityId } from "./rarity";

// Third skill ("Ataque 3"): the hero picks (and can change) 1 of the 2 skills of
// its class. Unlocked by rank (C and above) or by 3 stars (F-D). Data-driven: combat.ts reads these fields only.
export const SKILL_LEVEL = 5;

// ---- tuning (scripts/run-sim.ts) ----
export const SWEEP_POWER = 1; // Barrido: damage vs EACH enemy
export const STORM_POWER = 1.3; // Tormenta: damage vs EACH enemy
export const COUNTER_ROUNDS = 2; // Contraataque lasts this many round ends
export const COUNTER_TAKEN = 0.5; // damage taken by the hero while it is up
export const COUNTER_REFLECT = 1.2; // x the unreduced hit, sent back
export const DRAIN_POWER = 1; // Drenar maná: single-target strike
export const DRAIN_LIFESTEAL = 0.25; // fraction of damage dealt healed
export const DOUBLE_STRIKE_POWER = 0.95; // per hit (two hits)
export const EXECUTE_POWER = 1.6;
export const EXECUTE_BELOW = 0.4; // target hp fraction
export const EXECUTE_MULT = 2;
export const SANCTUARY_HEAL = 0.10; // fraction of max hp
export const SMITE_POWER = 1.55;
export const SMITE_LIFESTEAL = 0.5; // fraction of damage dealt

export type SkillId =
  | "barrido"
  | "contraataque"
  | "tormenta"
  | "drenarMana"
  | "golpeDoble"
  | "ejecutar"
  | "santuario"
  | "castigo";

export interface Skill {
  id: SkillId;
  classId: ClassId;
  name: string;
  description: string;
  blurb: string; // button subtitle
  cooldown: number; // rounds, same convention as Attack.cooldown
  power: number; // 0 = pure utility (no strike)
  accuracy: number;
  area?: boolean; // hits every living enemy
  hits?: number; // separate strikes against the target (default 1)
  executeBelow?: number; // target hp fraction under which executeMult applies
  executeMult?: number;
  heal?: number; // fraction of max hp, on use
  shield?: number; // fraction of max hp, on use
  guard?: boolean; // acts as Defender this round (also perfect guard)
  counter?: boolean; // reflect the next hit
  lifesteal?: number; // fraction of damage dealt healed
}

const pc = (v: number) => `${Math.round(v * 100)}%`;

export const SKILLS: Record<SkillId, Skill> = {
  barrido: {
    id: "barrido",
    classId: "caballero",
    name: "Barrido",
    blurb: "Golpea a todos",
    description: `Golpea a todos los enemigos con ${pc(SWEEP_POWER)} de tu Tajo.`,
    cooldown: 2,
    power: SWEEP_POWER,
    accuracy: 0.9,
    area: true,
  },
  contraataque: {
    id: "contraataque",
    classId: "caballero",
    name: "Contraataque",
    blurb: "Devuelve el próximo golpe",
    description: `Recibes ${pc(1 - COUNTER_TAKEN)} menos del próximo golpe y lo devuelves al atacante (dura ${COUNTER_ROUNDS} rondas).`,
    cooldown: 3,
    power: 0,
    accuracy: 1,
    counter: true,
  },
  tormenta: {
    id: "tormenta",
    classId: "mago",
    name: "Tormenta",
    blurb: "Daño a todos",
    description: `Un temporal golpea a todos los enemigos (${pc(STORM_POWER)} de poder). Enfriamiento largo.`,
    cooldown: 3,
    power: STORM_POWER,
    accuracy: 0.9,
    area: true,
  },
  drenarMana: {
    id: "drenarMana",
    classId: "mago",
    name: "Drenar maná",
    blurb: "Daño y cura",
    description: `Arrancas energía al rival (${pc(DRAIN_POWER)} de poder) y recuperas ${pc(DRAIN_LIFESTEAL)} del daño que haces.`,
    cooldown: 3,
    power: DRAIN_POWER,
    accuracy: 0.95,
    lifesteal: DRAIN_LIFESTEAL,
  },
  golpeDoble: {
    id: "golpeDoble",
    classId: "picaro",
    name: "Golpe doble",
    blurb: "Dos golpes",
    description: `Dos golpes seguidos al mismo objetivo, cada uno con ${pc(DOUBLE_STRIKE_POWER)} de poder y su propio crítico.`,
    cooldown: 2,
    power: DOUBLE_STRIKE_POWER,
    accuracy: 0.85,
    hits: 2,
  },
  ejecutar: {
    id: "ejecutar",
    classId: "picaro",
    name: "Ejecutar",
    blurb: "Remata a los heridos",
    description: `Golpe certero; hace x${EXECUTE_MULT} de daño si el objetivo tiene menos de ${pc(EXECUTE_BELOW)} de vida.`,
    cooldown: 3,
    power: EXECUTE_POWER,
    accuracy: 0.85,
    executeBelow: EXECUTE_BELOW,
    executeMult: EXECUTE_MULT,
  },
  santuario: {
    id: "santuario",
    classId: "clerigo",
    name: "Santuario",
    blurb: "Cura y protege",
    description: `Recuperas ${pc(SANCTUARY_HEAL)} de tu vida y te proteges como si defendieras (con guardia perfecta si corresponde).`,
    cooldown: 4,
    power: 0,
    accuracy: 1,
    heal: SANCTUARY_HEAL,
    guard: true,
  },
  castigo: {
    id: "castigo",
    classId: "clerigo",
    name: "Castigo",
    blurb: "Daño y cura",
    description: `Golpe sagrado (${pc(SMITE_POWER)} de poder) que te cura ${pc(SMITE_LIFESTEAL)} del daño que hace.`,
    cooldown: 3,
    power: SMITE_POWER,
    accuracy: 0.9,
    lifesteal: SMITE_LIFESTEAL,
  },
};

export const SKILLS_BY_CLASS: Record<ClassId, readonly [SkillId, SkillId]> = {
  caballero: ["barrido", "contraataque"],
  mago: ["tormenta", "drenarMana"],
  picaro: ["golpeDoble", "ejecutar"],
  clerigo: ["santuario", "castigo"],
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const isSkillId = (s: string): s is SkillId => s in SKILLS;

// The hero still owes the skill pick (reached SKILL_LEVEL without one).
export const needsSkill = (c: { skill?: SkillId; level: number }): boolean =>
  !c.skill && c.level >= SKILL_LEVEL;

export const SKILL_UNLOCK_STARS = 3;
export const skillUnlocked = (rank: RarityId, stars: number): boolean =>
  RARITY_IDS.indexOf(rank) >= RARITY_IDS.indexOf("c") ||
  stars >= SKILL_UNLOCK_STARS;
// The skill a hero fights with: its saved pick, else the class's first option.
export const heroSkill = (
  classId: ClassId,
  rank: RarityId,
  stars: number,
  picked?: SkillId,
): SkillId | undefined =>
  !skillUnlocked(rank, stars)
    ? undefined
    : picked && SKILLS_BY_CLASS[classId].includes(picked)
      ? picked
      : SKILLS_BY_CLASS[classId][0];
