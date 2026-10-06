import type { Element } from "./elements";

// PROPOSAL: every block of 10 floors is a "world"; worlds loop after the last.
export const FLOORS_PER_WORLD = 10;
export const WORLD_ELEMENT_BIAS = 0.6; // share of enemies using the theme element

export type EnemyFamily = "limo" | "diablillo" | "arpia" | "golem" | "espectro";

export interface World {
  name: string;
  family: EnemyFamily; // visual family of this world's enemies
  element: Element;
  enemySuffixes: string[]; // flavor appended to enemy names
}

export const WORLDS: readonly World[] = [
  {
    name: "Pantano de Niebla",
    family: "limo",
    element: "agua",
    enemySuffixes: ["del Pantano", "de la Niebla", "Ahogado"],
  },
  {
    name: "Cumbres Ardientes",
    family: "diablillo",
    element: "fuego",
    enemySuffixes: ["de Ceniza", "del Volcán", "Carbonizado"],
  },
  {
    name: "Cañón del Viento",
    family: "arpia",
    element: "viento",
    enemySuffixes: ["del Cañón", "de la Brisa", "Errante"],
  },
  {
    name: "Cavernas de Roca",
    family: "golem",
    element: "tierra",
    enemySuffixes: ["de la Cueva", "de Piedra", "Subterráneo"],
  },
  {
    name: "Tormenta Eterna",
    family: "espectro",
    element: "rayo",
    enemySuffixes: ["de la Tormenta", "del Trueno", "Chispeante"],
  },
];

export function worldOf(floor: number): World {
  return WORLDS[Math.floor((floor - 1) / FLOORS_PER_WORLD) % WORLDS.length];
}
