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
  ascension: number;
  pressure: number; // presion: stacks (+PRESSURE_STEP damage each)
  ramp: number; // velocidad: stacks (+RAMP_STEP speed each)
  broken: number; // armadura: rounds left of Roto
  regrow: number; // armadura: rounds until the armor is back
  heads: number; // cabezas: extra impacts of the next multi-hit action
  turns: number; // own turns completed (rituals, ramp, stances)
  pressureReset: boolean; // presion: guard reset already applied this close
  crossed: number; // cabezas: bitmask of hp thresholds already resolved
  stance: Stance; // posturas
  last: string[]; // aprende: the hero's last actions (most recent last)
}

export const NEW_BOSS: BossState = {
  ascension: 0,
  pressure: 0,
  ramp: 0,
  broken: 0,
  regrow: 0,
  heads: 0,
  turns: 0,
  pressureReset: false,
  crossed: 0,
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
export const BROKEN_ROUNDS = 3; // own turns
export const ARMOR_REGROW = 6; // own turns after the break
export const RAMP_STEP = 0.1; // velocidad: every 2 own turns
export const RAMP_MAX = 4;
export const HEAD_THRESHOLDS = [0.75, 0.5, 0.25] as const; // cabezas
export const HEAD_HEAL = 0.1;
export const RITUAL_EVERY = 3; // marchitar
export const RITUAL_HEAL_CUT = 0.5; // the hero's heals are multiplied by this...
export const RITUAL_ROUNDS = 2; // ...for this many of the hero's turns
export const STANCES: Record<Stance, { dmg: number; def: number }> = {
  ofensiva: { dmg: 1.3, def: 0.8 },
  defensiva: { dmg: 0.7, def: 1.3 },
};
export const HUNGER_STEAL = 0.1; // hambre: share of the damage dealt that heals
export const HUNGER_BELOW = 0.3; // hambre: under this hp fraction its next attack adds an impact
export const EXTRA_IMPACT = 0.35; // hidra heads / hambre: each extra impact, share of the basic
export const MAX_EXTRA_IMPACTS = 3;
export const ENRAGE_AFTER_OWN_TURN = 30; // personal turns before +5 % ATQ per turn
export const ENRAGE_STEP = 0.05;
export const RITUAL_EFFECT_TURNS = 2; // marchitar: own turns of the afflicted

// Existing boss parameters intensify predictably with dungeon ascension. Keep
// these helpers pure so seeded fights and replays use the same values.
const asc = (value: number) => Math.max(0, Math.min(5, Math.floor(value)));
export const plagueLoss = (a: number) => PLAGUE_LOSS + 0.003 * asc(a);
export const pressureGain = (a: number) => 1 + Math.floor(asc(a) / 2);
export const adaptAfter = (a: number) => Math.max(1, ADAPT_AFTER - Math.floor(asc(a) / 3));
export const armorBrokenRounds = (a: number) => Math.max(1, BROKEN_ROUNDS - Math.floor(asc(a) / 2));
export const armorRegrow = (a: number) => Math.max(2, ARMOR_REGROW - asc(a));
export const rampInterval = (a: number) => Math.max(1, 2 - Math.floor(asc(a) / 3));
export const headThresholds = (a: number) => HEAD_THRESHOLDS.map((t) => Math.min(0.95, t + 0.02 * asc(a)));
// A ritual replaces an attack slot; keep at least one ordinary attack between
// rituals so increasing its frequency cannot accidentally make the Queen safer.
export const ritualEvery = (a: number) => Math.max(2, RITUAL_EVERY - Math.floor(asc(a) / 2));
export const stanceLength = (a: number) => Math.max(1, 2 - Math.floor(asc(a) / 3));
export const hungerBelow = (a: number) => Math.min(0.5, HUNGER_BELOW + 0.03 * asc(a));

export function bossAscensionNotice(route: string, level: number): string {
  const a = asc(level);
  if (a === 0) return "Mecánica del jefe: valores base.";
  switch (route) {
    case "lord_of_flies": return `Plaga: ${Math.round(plagueLoss(a) * 1000) / 10}% de daño por turno propio.`;
    case "ash_king": return `Presión: acumula ${pressureGain(a)} nivel${pressureGain(a) === 1 ? "" : "es"} por turno propio.`;
    case "eternal_watcher": return `Aprende: se adapta tras ${adaptAfter(a)} repetición${adaptAfter(a) === 1 ? "" : "es"}.`;
    case "hollow_colossus": return `Armadura: queda Roto ${armorBrokenRounds(a)} turno(s) propio(s) y vuelve en ${armorRegrow(a)}.`;
    case "thunder_king": return `Velocidad: acelera cada ${rampInterval(a)} turno(s) propio(s).`;
    case "mother_hydra": return `Cabezas: cura al ${headThresholds(a).map((t) => `${Math.round(t * 100)}%`).join(", ")} de vida.`;
    case "withered_queen": return `Marchitar: ritual cada ${ritualEvery(a)} turno(s) propio(s).`;
    case "faceless_one": return `Posturas: cambia cada ${stanceLength(a)} turno(s) propio(s).`;
    case "great_devourer": return `Hambre: impacto extra bajo ${Math.round(hungerBelow(a) * 100)}% de vida.`;
    default: return "Mecánica del jefe intensificada.";
  }
}

export const ruleOf = (c: { char: { bossId?: string } }): BossRule | undefined =>
  c.char.bossId ? BOSS_RULE[c.char.bossId] : undefined;

// Stance of the boss's n-th own turn (1-based): 2 offensive, 2 defensive, ...
export const stanceFor = (ownTurn: number, ascension = 0): Stance =>
  Math.floor((ownTurn - 1) / stanceLength(ascension)) % 2 === 0 ? "ofensiva" : "defensiva";
