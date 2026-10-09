import { RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";

// Multipliers are fractions (0.25 = +25%); crit/resist/accuracy are additive.
export interface TraitMods {
  hp?: number;
  atk?: number;
  def?: number;
  crit?: number;
  resist?: number;
  accuracy?: number;
  speed?: number;
}

// "Run rules": behavior effects that the combat engine reads (engine v3). All
// are additive across a character's traits and read through traitTotals.
export interface TraitRules {
  critDamage?: number; // added to the crit multiplier (shares TRAIT_CAPS.critDamage)
  nonCritPenalty?: number; // fraction of damage lost on NON-critical hits
  lowHpReduction?: number; // extra damage reduction at 0 hp, scaled by missing hp
  healPenalty?: number; // fraction lost on every heal / regen / lifesteal
  thorns?: number; // fraction of damage received returned to the attacker
  spread?: number; // every hit deals x(1 +- spread), same mean
}

export interface Trait {
  name: string;
  description: string;
  mods: TraitMods;
  rules?: TraitRules;
  // not in the classic random pool; see rollRuleTrait
  noClass?: readonly string[]; // classes that can never roll it
  // effects that need runs/levels (stage 2), stored but not applied yet
  tag?: "healOnWin" | "xpOnLoss";
}

export const TRAITS = {
  terco: {
    name: "Terco",
    description: "+25% DEF, -3 resistencia",
    mods: { def: 0.25, resist: -0.03 },
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
  veloz: {
    name: "Veloz",
    description: "+10 resistencia, +5% velocidad, -5% ATQ",
    mods: { resist: 0.1, atk: -0.05, speed: 0.05 },
  },
  furioso: {
    name: "Furioso",
    description: "+10% ATQ, -15% DEF",
    mods: { atk: 0.1, def: -0.15 },
  },
  afortunado: {
    name: "Afortunado",
    description: "+10 crítico",
    mods: { crit: 0.1 },
  },
  robusto: {
    name: "Robusto",
    description: "+20% vida, -10 precisión, -10% velocidad",
    mods: { hp: 0.2, accuracy: -0.1 },
  },
  cobarde: {
    name: "Cobarde",
    description: "+10 resistencia, -2% ATQ",
    mods: { resist: 0.1, atk: -0.02 },
  },
  certero: {
    name: "Certero",
    description: "+10 precisión, -10% vida",
    mods: { accuracy: 0.1, hp: -0.1 },
  },
  glotón: {
    name: "Glotón",
    description: "+12% vida, -5 resistencia",
    mods: { hp: 0.12, resist: -0.05 },
  },
  fragil: {
    name: "Frágil",
    description: "-8% vida, +10 crítico",
    mods: { hp: -0.08, crit: 0.1 },
  },
  blindado: {
    name: "Blindado",
    description: "+25% DEF, -5% ATQ, -5% velocidad",
    mods: { def: 0.25, atk: -0.05, speed: -0.05 },
  },
  escurridizo: {
    name: "Escurridizo",
    description: "+12 resistencia, +6% velocidad, -10% vida",
    mods: { resist: 0.12, hp: -0.1, speed: 0.06 },
  },
  sanguinario: {
    name: "Sanguinario",
    description: "+12 crítico, -10% DEF",
    mods: { crit: 0.12, def: -0.1 },
  },
  paciente: {
    name: "Paciente",
    description: "+5 precisión, +8% DEF",
    mods: { accuracy: 0.05, def: 0.08 },
  },
  temerario: {
    name: "Temerario",
    description: "+20% ATQ, -15% vida",
    mods: { atk: 0.2, hp: -0.15 },
  },
  fornido: {
    name: "Fornido",
    description: "+8% vida y ATQ, -5 resistencia, -10% velocidad",
    mods: { hp: 0.08, atk: 0.08, resist: -0.05, speed: -0.1 },
  },
  cauteloso: {
    name: "Cauteloso",
    description: "+15% DEF, +5 resistencia",
    mods: { def: 0.15, resist: 0.05 },
  },
  tenaz: {
    name: "Tenaz",
    description: "+10% vida, -5% velocidad",
    mods: { hp: 0.1, speed: -0.05 },
  },
  lucido: {
    name: "Lúcido",
    description: "+3 crítico, +3 precisión, +2% ATQ",
    mods: { crit: 0.03, accuracy: 0.03, atk: 0.02 },
  },
  // ---- run-rule traits (engine v3): cost/commitment, rolled via rollRuleTrait ----
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
// The original 20: the only pool rollTraits draws from, so existing seeds keep
// producing the same characters.
export const CLASSIC_TRAIT_IDS = TRAIT_IDS.slice(0, 20);
export const RULE_TRAIT_IDS = TRAIT_IDS.slice(20);
// Traits by rank (Run v2): F-D 1 trait; C-A 2; S-SSR 2 with a guaranteed rule trait.
export function traitPlan(rank: RarityId): { classic: number; rule: boolean } {
  const i = RARITY_IDS.indexOf(rank);
  if (i >= RARITY_IDS.indexOf("s")) return { classic: 1, rule: true };
  return { classic: i >= RARITY_IDS.indexOf("c") ? 2 : 1, rule: false };
}

// Rolled from its own RNG (seeded from values the caller already has), so the
// main generation stream is never consumed. Respects noClass.
export function rollRuleTrait(rng: Rng, classId: string): TraitId {
  const pool = RULE_TRAIT_IDS.filter(
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
  };
};

export function rollTraits(rng: Rng, count: number): TraitId[] {
  const pool = [...CLASSIC_TRAIT_IDS];
  return Array.from(
    { length: count },
    () => pool.splice(rng.int(0, pool.length - 1), 1)[0],
  );
}

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
