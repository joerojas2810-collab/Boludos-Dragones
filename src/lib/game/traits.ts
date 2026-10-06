import type { Rng } from "./rng";

// Multipliers are fractions (0.25 = +25%); crit/dodge/accuracy/flee are additive.
export interface TraitMods {
  hp?: number;
  atk?: number;
  def?: number;
  crit?: number;
  dodge?: number;
  accuracy?: number;
  flee?: number;
  speed?: number;
}

export interface Trait {
  name: string;
  description: string;
  mods: TraitMods;
  // effects that need runs/levels (stage 2), stored but not applied yet
  tag?: "healOnWin" | "xpOnLoss";
}

export const TRAITS = {
  terco: {
    name: "Terco",
    description: "+25% DEF, -3 esquive",
    mods: { def: 0.25, dodge: -0.03 },
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
    description: "+10 esquive, +5% velocidad, -5% ATQ",
    mods: { dodge: 0.1, atk: -0.05, speed: 0.05 },
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
    description: "+20 huida, -2% ATQ",
    mods: { flee: 0.2, atk: -0.02 },
  },
  certero: {
    name: "Certero",
    description: "+10 precisión, -10% vida",
    mods: { accuracy: 0.1, hp: -0.1 },
  },
  glotón: {
    name: "Glotón",
    description: "+12% vida, -5 esquive",
    mods: { hp: 0.12, dodge: -0.05 },
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
    description: "+12 esquive, +6% velocidad, -10% vida",
    mods: { dodge: 0.12, hp: -0.1, speed: 0.06 },
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
    description: "+8% vida y ATQ, -5 esquive, -10% velocidad",
    mods: { hp: 0.08, atk: 0.08, dodge: -0.05, speed: -0.1 },
  },
  cauteloso: {
    name: "Cauteloso",
    description: "+15% DEF, +10 huida",
    mods: { def: 0.15, flee: 0.1 },
  },
  tenaz: {
    name: "Tenaz",
    description: "+10% vida, -15 huida, -5% velocidad",
    mods: { hp: 0.1, flee: -0.15, speed: -0.05 },
  },
  lucido: {
    name: "Lúcido",
    description: "+3 crítico, +3 precisión, +2% ATQ",
    mods: { crit: 0.03, accuracy: 0.03, atk: 0.02 },
  },
} as const satisfies Record<string, Trait>;

export type TraitId = keyof typeof TRAITS;
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export function rollTraits(rng: Rng): TraitId[] {
  const pool = [...TRAIT_IDS];
  return Array.from(
    { length: rng.int(1, 2) },
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
