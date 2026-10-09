// Boss mechanics (pure data + helpers; combat.ts applies them). Each dungeon boss is
// keyed by Character.bossId. Patterns: bar (armadura, cabezas), ramp (presion,
// velocidad, hambre) and phases (aprende, posturas, marchitar, plaga). Test values.

export type BossRule =
  | "plaga"
  | "presion"
  | "aprende"
  | "armadura"
  | "velocidad"
  | "cabezas"
  | "marchitar"
  | "posturas"
  | "hambre";

export const BOSS_RULE: Record<string, BossRule> = {
  lord_of_flies: "plaga",
  ash_king: "presion",
  eternal_watcher: "aprende",
  hollow_colossus: "armadura",
  thunder_king: "velocidad",
  mother_hydra: "cabezas",
  withered_queen: "marchitar",
  faceless_one: "posturas",
  great_devourer: "hambre",
};

export type Stance = "ofensiva" | "defensiva";

export interface BossState {
  pressure: number; // presion: stacks (+PRESSURE_STEP damage each)
  ramp: number; // velocidad: stacks (+RAMP_STEP speed each)
  broken: number; // armadura: rounds left of Roto
  regrow: number; // armadura: rounds until the armor is back
  heads: number; // cabezas: extra actions per round
  stance: Stance; // posturas
  last: string[]; // aprende: the hero's last actions (most recent last)
}

export const NEW_BOSS: BossState = {
  pressure: 0,
  ramp: 0,
  broken: 0,
  regrow: 0,
  heads: 0,
  stance: "ofensiva",
  last: [],
};

export const PLAGUE_LOSS = 0.015; // plaga: share of the hero's max hp lost each round
export const PRESSURE_STEP = 0.06; // presion
export const PRESSURE_MAX = 5;
export const ADAPT_AFTER = 2; // aprende: same action this many times in a row...
export const ADAPT_FACTOR = 0.75; // ...and the next one deals this much
export const ARMOR_FRACTION = 0.3; // armadura: bar as a share of max hp
export const ARMOR_TAKEN = 0.5; // damage taken while the armor holds
export const BROKEN_TAKEN = 1.25; // damage taken while Roto
export const BROKEN_ROUNDS = 3;
export const ARMOR_REGROW = 6;
export const RAMP_STEP = 0.1; // velocidad: every 2 rounds
export const RAMP_MAX = 4;
export const HEAD_THRESHOLDS = [0.75, 0.5, 0.25] as const; // cabezas
export const HEAD_HEAL = 0.1;
export const RITUAL_EVERY = 3; // marchitar
export const RITUAL_HEAL_CUT = 0.5; // the hero's heals are multiplied by this...
export const RITUAL_ROUNDS = 2; // ...for this many rounds
export const STANCES: Record<Stance, { dmg: number; def: number }> = {
  ofensiva: { dmg: 1.3, def: 0.8 },
  defensiva: { dmg: 0.7, def: 1.3 },
};
export const HUNGER_STEAL = 0.1; // hambre: share of the damage dealt that heals
export const HUNGER_BELOW = 0.3; // hambre: under this hp fraction it acts one more time

export const ruleOf = (c: { char: { bossId?: string } }): BossRule | undefined =>
  c.char.bossId ? BOSS_RULE[c.char.bossId] : undefined;

// Stance of a round: 2 offensive, 2 defensive, ...
export const stanceFor = (turn: number): Stance =>
  Math.floor((turn - 1) / 2) % 2 === 0 ? "ofensiva" : "defensiva";
