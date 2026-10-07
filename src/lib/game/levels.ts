// Dungeon level lists (Run v2 / Modo Progreso). Each rank is a dungeon with its own
// list of levels; a level is a short sequence of fights (2, 3 or 5) that ends in an
// elite, and the last level of a rank is a 5-fight level closed by a named boss.
// Everything is generated from fixed seeds (no hand-written levels).
import { ELEMENTS, type Element } from "./elements";
import { RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { SLOTS, type Slot } from "./weapons";
import type { EnemyFamily } from "./worlds";

export const LEVELS_PER_RANK: Readonly<Record<RarityId, number>> = {
  f: 6,
  e: 6,
  d: 7,
  c: 8,
  b: 8,
  a: 9,
  s: 10,
  ss: 11,
  ssr: 12,
};

export const MAX_ASCENSION = 5;
export type LevelLength = 2 | 3 | 5;
export const FINAL_LENGTH: LevelLength = 5;

// Piece the level drops on clear (fixed per level, shown before entering).
export type DropSlot = Slot;
export const DROP_SLOTS: readonly DropSlot[] = SLOTS;

export interface DungeonTheme {
  name: string;
  world: number; // index into WORLDS (scenery)
  bossId: string; // art id (public/art/enemies/boss_<id>_*)
  bossName: string;
  bossElement: Element;
  families: readonly [EnemyFamily, EnemyFamily]; // main families
  guest: EnemyFamily | null; // appears now and then; null = all five equal
}

export const DUNGEON_THEMES: Readonly<Record<RarityId, DungeonTheme>> = {
  f: { name: "Pantano de Niebla", world: 0, bossId: "lord_of_flies", bossName: "Señor de las Moscas", bossElement: "agua", families: ["limo", "espectro"], guest: "diablillo" },
  e: { name: "Cumbres Ardientes", world: 1, bossId: "ash_king", bossName: "Rey de Ceniza", bossElement: "fuego", families: ["diablillo", "golem"], guest: "limo" },
  d: { name: "Cañón del Viento", world: 2, bossId: "eternal_watcher", bossName: "Vigía Eterno", bossElement: "viento", families: ["arpia", "diablillo"], guest: "golem" },
  c: { name: "Cavernas de Roca", world: 3, bossId: "hollow_colossus", bossName: "Coloso Hueco", bossElement: "tierra", families: ["golem", "limo"], guest: "espectro" },
  b: { name: "Tormenta Eterna", world: 4, bossId: "thunder_king", bossName: "Rey del Trueno", bossElement: "rayo", families: ["espectro", "arpia"], guest: "golem" },
  a: { name: "Abismo del Pantano", world: 0, bossId: "mother_hydra", bossName: "Madre Hidra", bossElement: "agua", families: ["diablillo", "espectro"], guest: "golem" },
  s: { name: "Corazón del Volcán", world: 1, bossId: "withered_queen", bossName: "Reina Marchita", bossElement: "tierra", families: ["golem", "arpia"], guest: "limo" },
  ss: { name: "Cielo Roto", world: 2, bossId: "faceless_one", bossName: "El Sin Rostro", bossElement: "fuego", families: ["espectro", "limo"], guest: "diablillo" },
  ssr: { name: "Trono de la Tormenta", world: 4, bossId: "great_devourer", bossName: "Gran Devorador", bossElement: "viento", families: ["limo", "diablillo"], guest: null },
};

export interface LevelSpec {
  rank: RarityId;
  index: number; // 0-based
  length: LevelLength;
  final: boolean; // last level of the rank: named boss
  element: Element; // dominant element at ascension 0
  drop: DropSlot;
}

const rankIndex = (rank: RarityId) => RARITY_IDS.indexOf(rank);

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ~30% two-fight levels, ~40% three, ~30% five; the order is fixed per rank.
function lengthsFor(rank: RarityId, n: number): LevelLength[] {
  const rng = createRng(hashSeed(rankIndex(rank), 9101));
  const m = n - 1;
  const twos = Math.round(m * 0.3);
  const fives = Math.round(m * 0.3);
  const pool: LevelLength[] = [
    ...Array<LevelLength>(twos).fill(2),
    ...Array<LevelLength>(fives).fill(5),
    ...Array<LevelLength>(m - twos - fives).fill(3),
  ];
  return [...shuffle(rng, pool), FINAL_LENGTH];
}

const cache = new Map<RarityId, readonly LevelSpec[]>();

// The levels of a rank (ascension 0). Deterministic.
export function levelsOf(rank: RarityId): readonly LevelSpec[] {
  const hit = cache.get(rank);
  if (hit) return hit;
  const n = LEVELS_PER_RANK[rank];
  const theme = DUNGEON_THEMES[rank];
  const rng = createRng(hashSeed(rankIndex(rank), 9102));
  const lengths = lengthsFor(rank, n);
  const slots: DropSlot[] = [];
  while (slots.length < n) slots.push(...shuffle(rng, DROP_SLOTS));
  const elements: Element[] = [];
  let bag: Element[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (bag.length === 0)
      bag = shuffle(rng, ELEMENTS).filter(
        (e) => e !== elements[elements.length - 1],
      );
    elements.push(bag.shift() as Element);
  }
  elements.push(theme.bossElement);
  const out = lengths.map(
    (length, index): LevelSpec => ({
      rank,
      index,
      length,
      final: index === n - 1,
      element: elements[index],
      drop: slots[index],
    }),
  );
  cache.set(rank, out);
  return out;
}

// Dominant element of a level at an ascension: changes every ascension (never the
// same as the previous one). The drop slot of a level never changes.
export function levelElement(spec: LevelSpec, ascension: number): Element {
  let el = spec.element;
  for (let a = 1; a <= ascension; a++) {
    const rng = createRng(hashSeed(rankIndex(spec.rank), spec.index, a, 9103));
    el = rng.pick(ELEMENTS.filter((e) => e !== el));
  }
  return el;
}

// Share of fights using the level's dominant element: 60% (F) -> 80% (SSR).
export const dominantShare = (rank: RarityId) => 0.6 + 0.025 * rankIndex(rank);
