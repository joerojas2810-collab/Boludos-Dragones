import type { ClassId } from "./characters";

// Class skill ("Ataque 2"): the hero picks (and can change, outside a run) 1 of the 2
// skills of its class from level 1. Data-driven: combat.ts reads these fields only.

// ---- tuning (scripts/run-sim.ts) ----
export const SWEEP_POWER = 1; // Barrido: damage vs EACH enemy
export const STORM_POWER = 1.3; // Tormenta: damage vs EACH enemy
export const COUNTER_ROUNDS = 1; // Contraataque resolves within the round it is used
export const COUNTER_TAKEN = 1; // damage taken by the hero while it is up (1 = full: it is not a guard)
export const COUNTER_REFLECT = 1.5; // x the unreduced hit, sent back
export const DETONATE_POWER = 1.2; // Detonar: single-target strike
export const DETONATE_PER_STACK = 0.35; // extra damage per status stack on the target
export const DOUBLE_STRIKE_POWER = 0.95; // per hit (two hits)
export const EXECUTE_POWER = 1.6;
export const EXECUTE_BELOW = 0.4; // target hp fraction
export const EXECUTE_MULT = 2;
export const SANCTUARY_HEAL = 0.06; // fraction of max hp
export const SMITE_POWER = 1.55;
export const SMITE_LIFESTEAL = 0.3; // fraction of damage dealt
export const RIP_POWER = 1.2; // Desgarro
export const RIP_LIFESTEAL = 0.25;
export const ANNIHILATE_POWER = 1.8; // Aniquilación
export const ANNIHILATE_BELOW = 0.33; // own hp fraction
export const ANNIHILATE_MULT = 2.5 / 1.6; // 250% total

export type SkillId =
  | "barrido"
  | "contraataque"
  | "tormenta"
  | "detonar"
  | "golpeDoble"
  | "ejecutar"
  | "santuario"
  | "castigo"
  | "desgarro"
  | "aniquilacion";

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
  selfBelow?: number; // own hp fraction under which selfMult applies (Aniquilación)
  selfMult?: number;
  detonate?: number; // extra damage per status stack on the target; the stacks are consumed
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
    blurb: "Devuelve el golpe de la ronda",
    description: `Aguantas el golpe de esta ronda sin reducirlo y devuelves ${pc(COUNTER_REFLECT)} del daño al atacante, justo después de recibirlo (también si ya te había golpeado antes de que actuaras). No dura más de una ronda.`,
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
  detonar: {
    id: "detonar",
    classId: "mago",
    name: "Detonar",
    blurb: "Hace estallar los estados",
    description: `Golpe de ${pc(DETONATE_POWER)} de poder que hace +${pc(DETONATE_PER_STACK)} por cada acumulación de estado del objetivo, y se las borra.`,
    cooldown: 3,
    power: DETONATE_POWER,
    accuracy: 0.95,
    detonate: DETONATE_PER_STACK,
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
  desgarro: {
    id: "desgarro",
    classId: "berserker",
    name: "Desgarro",
    blurb: "Sed de sangre",
    description: `Golpe de ${pc(RIP_POWER)} de poder que te cura ${pc(RIP_LIFESTEAL)} del daño que hace.`,
    cooldown: 2,
    power: RIP_POWER,
    accuracy: 0.9,
    lifesteal: RIP_LIFESTEAL,
  },
  aniquilacion: {
    id: "aniquilacion",
    classId: "berserker",
    name: "Aniquilación",
    blurb: "Más fuerte herido",
    description: `Golpe de ${pc(ANNIHILATE_POWER)} de poder; llega a ${pc(ANNIHILATE_POWER * ANNIHILATE_MULT)} si tu vida está por debajo del ${pc(ANNIHILATE_BELOW)}.`,
    cooldown: 3,
    power: ANNIHILATE_POWER,
    accuracy: 0.85,
    selfBelow: ANNIHILATE_BELOW,
    selfMult: ANNIHILATE_MULT,
  },
};

export const SKILLS_BY_CLASS: Record<ClassId, readonly [SkillId, SkillId]> = {
  caballero: ["barrido", "contraataque"],
  mago: ["tormenta", "detonar"],
  picaro: ["golpeDoble", "ejecutar"],
  clerigo: ["santuario", "castigo"],
  berserker: ["desgarro", "aniquilacion"],
};

export const isSkillId = (s: string): s is SkillId => s in SKILLS;

// The skill a hero fights with: its saved pick, else the class's first option.
export const heroSkill = (
  classId: ClassId,
  picked?: SkillId,
): SkillId =>
  picked && SKILLS_BY_CLASS[classId].includes(picked)
    ? picked
    : SKILLS_BY_CLASS[classId][0];
