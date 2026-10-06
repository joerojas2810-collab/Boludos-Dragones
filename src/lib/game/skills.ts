import type { ClassId } from "./characters";

// Third skill ("Ataque 3"): unlocked at SKILL_LEVEL, the player picks 1 of the
// 2 skills of their class. Data-driven: combat.ts reads these fields only.
export const SKILL_LEVEL = 5;

// ---- tuning (scripts/run-sim.ts) ----
export const SWEEP_POWER = 0.65; // Barrido: damage vs EACH enemy
export const STORM_POWER = 1.1; // Tormenta: damage vs EACH enemy
export const COUNTER_ROUNDS = 2; // Contraataque lasts this many round ends
export const COUNTER_TAKEN = 0.5; // damage taken by the hero while it is up
export const COUNTER_REFLECT = 1; // x the unreduced hit, sent back
export const ARCANE_SHIELD = 0.4; // Escudo arcano: shield, fraction of max hp
export const DOUBLE_STRIKE_POWER = 0.85; // per hit (two hits)
export const EXECUTE_POWER = 1.4;
export const EXECUTE_BELOW = 0.4; // target hp fraction
export const EXECUTE_MULT = 2;
export const SANCTUARY_HEAL = 0.3; // fraction of max hp
export const SMITE_POWER = 1.3;
export const SMITE_LIFESTEAL = 0.5; // fraction of damage dealt

export type SkillId =
  | "barrido"
  | "contraataque"
  | "tormenta"
  | "escudoArcano"
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
    cooldown: 4,
    power: STORM_POWER,
    accuracy: 0.8,
    area: true,
  },
  escudoArcano: {
    id: "escudoArcano",
    classId: "mago",
    name: "Escudo arcano",
    blurb: "Escudo mágico",
    description: `Te cubres con un escudo de ${pc(ARCANE_SHIELD)} de tu vida máxima.`,
    cooldown: 3,
    power: 0,
    accuracy: 1,
    shield: ARCANE_SHIELD,
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
  mago: ["tormenta", "escudoArcano"],
  picaro: ["golpeDoble", "ejecutar"],
  clerigo: ["santuario", "castigo"],
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const isSkillId = (s: string): s is SkillId => s in SKILLS;

// The hero still owes the skill pick (reached SKILL_LEVEL without one).
export const needsSkill = (c: { skill?: SkillId; level: number }): boolean =>
  !c.skill && c.level >= SKILL_LEVEL;
