// Dungeon routes are thematic identities; difficulty is selected independently.
import { ELEMENTS, type Element } from "./elements";
import { RARITY_IDS, type Difficulty } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { SLOTS, type Slot } from "./weapons";
import type { EnemyFamily } from "./worlds";

export const ROUTE_IDS = [
  "lord_of_flies", "ash_king", "eternal_watcher", "hollow_colossus",
  "thunder_king", "mother_hydra", "withered_queen", "faceless_one", "great_devourer",
] as const;
export type RouteId = (typeof ROUTE_IDS)[number];
export const isRouteId = (value: unknown): value is RouteId =>
  typeof value === "string" && (ROUTE_IDS as readonly string[]).includes(value);
export const LEVELS_PER_ROUTE = 4 as const;
export const MAX_ASCENSION = 5;
export type Step = { difficulty: Difficulty; asc: 0 | 1 | 2 | 3 | 4 | 5 };
export type LevelLength = 2 | 3;
export const FINAL_LENGTH: LevelLength = 3;
export type DropSlot = Slot;
export const DROP_SLOTS: readonly DropSlot[] = SLOTS;

export interface DungeonTheme {
  name: string;
  world: number;
  bossId: RouteId;
  bossName: string;
  bossElement: Element;
  families: readonly [EnemyFamily, EnemyFamily];
  guest: EnemyFamily | null;
}
export const DUNGEON_THEMES: Readonly<Record<RouteId, DungeonTheme>> = {
  lord_of_flies: { name: "Pantano de Niebla", world: 0, bossId: "lord_of_flies", bossName: "Señor de las Moscas", bossElement: "agua", families: ["limo", "espectro"], guest: "diablillo" },
  ash_king: { name: "Cumbres Ardientes", world: 1, bossId: "ash_king", bossName: "Rey de Ceniza", bossElement: "fuego", families: ["diablillo", "golem"], guest: "limo" },
  eternal_watcher: { name: "Cañón del Viento", world: 2, bossId: "eternal_watcher", bossName: "Vigía Eterno", bossElement: "viento", families: ["arpia", "diablillo"], guest: "golem" },
  hollow_colossus: { name: "Cavernas de Roca", world: 3, bossId: "hollow_colossus", bossName: "Coloso Hueco", bossElement: "tierra", families: ["golem", "limo"], guest: "espectro" },
  thunder_king: { name: "Tormenta Eterna", world: 4, bossId: "thunder_king", bossName: "Rey del Trueno", bossElement: "rayo", families: ["espectro", "arpia"], guest: "golem" },
  mother_hydra: { name: "Abismo del Pantano", world: 0, bossId: "mother_hydra", bossName: "Madre Hidra", bossElement: "agua", families: ["diablillo", "espectro"], guest: "golem" },
  withered_queen: { name: "Corazón del Volcán", world: 1, bossId: "withered_queen", bossName: "Reina Marchita", bossElement: "tierra", families: ["golem", "arpia"], guest: "limo" },
  faceless_one: { name: "Cielo Roto", world: 2, bossId: "faceless_one", bossName: "El Sin Rostro", bossElement: "fuego", families: ["espectro", "limo"], guest: "diablillo" },
  great_devourer: { name: "Trono de la Tormenta", world: 4, bossId: "great_devourer", bossName: "Gran Devorador", bossElement: "viento", families: ["limo", "diablillo"], guest: null },
};
export interface LevelSpec {
  route: RouteId;
  difficulty: Difficulty;
  index: number;
  length: LevelLength;
  final: boolean;
  element: Element;
  drop: DropSlot;
}
export const DOMINANT_SHARE = 0.5;
function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cache = new Map<string, readonly LevelSpec[]>();
export function levelsOf(route: RouteId, difficulty: Difficulty): readonly LevelSpec[] {
  const key = `${route}:${difficulty}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const routeIndex = ROUTE_IDS.indexOf(route);
  const diffIndex = RARITY_IDS.indexOf(difficulty);
  const seed = hashSeed(routeIndex, diffIndex, 9102);
  const rng = createRng(seed);
  const template: LevelLength[] = [2, 2, 3, FINAL_LENGTH];
  const lengths = template;
  const slots: DropSlot[] = [];
  while (slots.length < LEVELS_PER_ROUTE) slots.push(...shuffle(rng, DROP_SLOTS));
  const theme = DUNGEON_THEMES[route];
  const specs = lengths.map((length, index): LevelSpec => ({
    route, difficulty, index, length, final: index === LEVELS_PER_ROUTE - 1,
    element: theme.bossElement, drop: slots[index],
  }));
  cache.set(key, specs);
  return specs;
}
export function levelElement(spec: LevelSpec, ascension: number): Element {
  let element = spec.element;
  for (let asc = 1; asc <= ascension; asc++) {
    const rng = createRng(hashSeed(ROUTE_IDS.indexOf(spec.route), RARITY_IDS.indexOf(spec.difficulty), spec.index, asc, 9103));
    element = rng.pick(ELEMENTS.filter((candidate) => candidate !== element));
  }
  return element;
}
