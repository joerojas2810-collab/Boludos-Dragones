import type { Rng } from "./rng";

// One personality trait per hero (rank no longer decides how many). Multipliers are
// fractions (0.25 = +25%); crit/resist/accuracy are additive.
export interface TraitMods {
  hp?: number;
  atk?: number;
  def?: number;
  crit?: number;
  resist?: number;
  accuracy?: number;
  speed?: number;
}

// Behavior rules the combat engine reads. All are additive across a character's traits
// and read through traitTotals.
export interface TraitRules {
  critDamage?: number; // added to the crit multiplier (shares TRAIT_CAPS.critDamage)
  nonCritPenalty?: number; // fraction of damage lost on NON-critical hits
  lowHpReduction?: number; // extra damage reduction at 0 hp, scaled by missing hp
  healPenalty?: number; // fraction lost on every heal / regen / lifesteal
  thorns?: number; // fraction of damage received returned to the attacker
  spread?: number; // every hit deals x(1 +- spread), same mean
  retryAccuracy?: number; // Terco: extra accuracy on the hit right after a miss
  pride?: number; // Orgulloso: +atk above half hp, -atk below
  executeBonus?: number; // Sanguinario: extra damage vs targets under EXECUTE_HP
  guardedBonus?: number; // Paciente: extra damage on the hit after a round spent defending
  killHeal?: number; // Glotón: share of max hp healed when it takes down an enemy
  openingBonus?: number; // Fanfarrón: extra damage on the first hit of a fight
  statusBonus?: number; // Curioso: extra damage vs a target carrying a status
  highHpReduction?: number; // Cauteloso: damage reduction while above HIGH_HP
  rageStep?: number; // Furioso: extra damage per hit taken (up to RAGE_MAX hits)
}
export const EXECUTE_HP = 0.4;
export const HIGH_HP = 0.8;
export const RAGE_MAX = 5;

export interface Trait {
  name: string;
  description: string;
  mods: TraitMods;
  rules?: TraitRules;
  noClass?: readonly string[]; // classes that can never roll it
  // effects that need runs/levels, read by the dungeon code
  tag?: "healOnWin" | "xpOnLoss";
}

export const TRAITS = {
  terco: {
    name: "Terco",
    description: "+10% DEF; si falla un golpe, el siguiente tiene +10 de precisión",
    mods: { def: 0.1 },
    rules: { retryAccuracy: 0.1 },
  },
  temerario: {
    name: "Temerario",
    description: "+10% ATQ, -8% DEF",
    mods: { atk: 0.1, def: -0.08 },
  },
  orgulloso: {
    name: "Orgulloso",
    description: "+8% ATQ con más de la mitad de la vida, -8% ATQ con menos",
    mods: {},
    rules: { pride: 0.08 },
  },
  sanguinario: {
    name: "Sanguinario",
    description: "+8 crítico; +10% de daño contra enemigos con menos del 40% de vida",
    mods: { crit: 0.08 },
    rules: { executeBonus: 0.1 },
  },
  paciente: {
    name: "Paciente",
    description: "+5 precisión; si defendió la ronda anterior, su siguiente golpe hace +8%",
    mods: { accuracy: 0.05 },
    rules: { guardedBonus: 0.08 },
  },
  estoico: {
    name: "Estoico",
    description: "+10 de resistencia a estados, -5% velocidad",
    mods: { resist: 0.1, speed: -0.05 },
  },
  glotón: {
    name: "Glotón",
    description: "+8% vida; se cura 3% de su vida máxima al derrotar a un enemigo",
    mods: { hp: 0.08 },
    rules: { killHeal: 0.03 },
  },
  tenaz: {
    name: "Tenaz",
    description: "+8% vida, -5% velocidad",
    mods: { hp: 0.08, speed: -0.05 },
  },
  veloz: {
    name: "Veloz",
    description: "+6% velocidad, -5 precisión",
    mods: { speed: 0.06, accuracy: -0.05 },
  },
  fanfarron: {
    name: "Fanfarrón",
    description: "El primer golpe de cada pelea hace +20%",
    mods: {},
    rules: { openingBonus: 0.2 },
  },
  lucido: {
    name: "Lúcido",
    description: "+3 crítico, +3 precisión, +2% ATQ",
    mods: { crit: 0.03, accuracy: 0.03, atk: 0.02 },
  },
  curioso: {
    name: "Curioso",
    description: "+10% de daño contra rivales que tengan algún estado elemental",
    mods: {},
    rules: { statusBonus: 0.1 },
  },
  cauteloso: {
    name: "Cauteloso",
    description: "Recibe -10% de daño mientras tenga más del 80% de vida; -5% ATQ",
    mods: { atk: -0.05 },
    rules: { highHpReduction: 0.1 },
  },
  furioso: {
    name: "Furioso",
    description: "Cada golpe que recibe le da +4% de daño (hasta 5 golpes)",
    mods: {},
    rules: { rageStep: 0.04 },
  },
  sediento: {
    name: "Sediento",
    description: "Cura al ganar",
    mods: {},
    tag: "healOnWin",
  },
  gafe: {
    name: "Gafe",
    description: "-5 crítico, más XP al perder",
    mods: { crit: -0.05 },
    tag: "xpOnLoss",
  },
  filoAzar: {
    name: "Filo del azar",
    description:
      "+15 crítico y +0.5 de daño crítico, pero los golpes no críticos pegan 20% menos",
    mods: { crit: 0.15 },
    rules: { critDamage: 0.5, nonCritPenalty: 0.2 },
  },
  ultimoAliento: {
    name: "Último aliento",
    description:
      "Cuanta menos vida, menos daño recibes (hasta -30%), pero toda cura se reduce 60%",
    mods: {},
    rules: { lowHpReduction: 0.3, healPenalty: 0.6 },
  },
  espinas: {
    name: "Espinas",
    description: "Devuelves 5% del daño que recibes (no sale en Caballeros)",
    mods: {},
    rules: { thorns: 0.05 },
    noClass: ["caballero"],
  },
  apostador: {
    name: "Apostador",
    description:
      "Cada golpe pega entre x0.2 y x1.8 de su daño (mismo promedio, misma precisión)",
    mods: {},
    rules: { spread: 0.8 },
  },
} as const satisfies Record<string, Trait>;

export type TraitId = keyof typeof TRAITS;
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

// A hero rolls exactly one trait, uniformly, respecting noClass.
export function rollTrait(rng: Rng, classId: string): TraitId {
  const pool = TRAIT_IDS.filter(
    (id) => !(TRAITS[id] as Trait).noClass?.includes(classId),
  );
  return rng.pick(pool);
}

// Sum of the rule fields of a trait list (additive within each field).
export const traitTotals = (ids: readonly TraitId[]): Required<TraitRules> => {
  const sum = (k: keyof TraitRules) =>
    ids.reduce((a, id) => a + ((TRAITS[id] as Trait).rules?.[k] ?? 0), 0);
  return {
    critDamage: sum("critDamage"),
    nonCritPenalty: Math.min(0.5, sum("nonCritPenalty")),
    lowHpReduction: sum("lowHpReduction"),
    healPenalty: Math.min(0.9, sum("healPenalty")),
    thorns: Math.min(0.3, sum("thorns")),
    spread: Math.min(0.9, sum("spread")),
    retryAccuracy: sum("retryAccuracy"),
    pride: sum("pride"),
    executeBonus: sum("executeBonus"),
    guardedBonus: sum("guardedBonus"),
    killHeal: sum("killHeal"),
    openingBonus: sum("openingBonus"),
    statusBonus: sum("statusBonus"),
    highHpReduction: sum("highHpReduction"),
    rageStep: sum("rageStep"),
  };
};

export const CATCHPHRASES = [
  "¡Que empiece la fiesta!",
  "Hoy no pierdo ni por error.",
  "Prepárate, esto va a doler.",
  "¿Eso es todo lo que tienes?",
  "Mi abuela pega más fuerte.",
  "Vine por la gloria y por la cena.",
  "No me despeinen.",
  "Cada golpe cuenta una historia.",
  "Al que madruga, lo noquean.",
  "Respira hondo, será rápido.",
  "La suerte es para los débiles.",
  "¡Por la noche de juegos!",
];
