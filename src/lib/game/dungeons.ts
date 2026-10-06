// Dungeons: fixed-length runs with a rank F..SSR (docs/DUNGEONS_FORJA.md).
// Rank sets the length, where the bosses are, how hard the enemies hit
// (`offset` shifts the difficulty floor) and how good the loot is.
import { RARITY_IDS, type RarityId } from "./rarity";

export interface DungeonSpec {
  rank: RarityId;
  name: string;
  floors: number; // the last floor is the final boss
  bosses: readonly number[]; // boss floors, incl. the last
  world: number; // index into WORLDS (enemy family, element, scenery)
  offset: number; // difficulty floor = floor + offset
}

// Tune here (offsets by simulation, scripts/run-sim.ts with DUNGEON=<rank>).
export const DUNGEONS: Readonly<Record<RarityId, DungeonSpec>> = {
  f: {
    rank: "f",
    name: "Pantano de Niebla",
    floors: 8,
    bosses: [4, 8],
    world: 0,
    offset: 0,
  },
  e: {
    rank: "e",
    name: "Cumbres Ardientes",
    floors: 10,
    bosses: [5, 10],
    world: 1,
    offset: 1,
  },
  d: {
    rank: "d",
    name: "Cañón del Viento",
    floors: 12,
    bosses: [6, 12],
    world: 2,
    offset: 1,
  },
  c: {
    rank: "c",
    name: "Cavernas de Roca",
    floors: 14,
    bosses: [5, 9, 14],
    world: 3,
    offset: 2,
  },
  b: {
    rank: "b",
    name: "Tormenta Eterna",
    floors: 16,
    bosses: [5, 11, 16],
    world: 4,
    offset: 3,
  },
  a: {
    rank: "a",
    name: "Abismo del Pantano",
    floors: 18,
    bosses: [5, 9, 14, 18],
    world: 0,
    offset: 4,
  },
  s: {
    rank: "s",
    name: "Corazón del Volcán",
    floors: 20,
    bosses: [5, 10, 15, 20],
    world: 1,
    offset: 5,
  },
  ss: {
    rank: "ss",
    name: "Cielo Roto",
    floors: 22,
    bosses: [6, 11, 17, 22],
    world: 2,
    offset: 6,
  },
  ssr: {
    rank: "ssr",
    name: "Trono de la Tormenta",
    floors: 25,
    bosses: [5, 10, 15, 20, 25],
    world: 4,
    offset: 8,
  },
};

// Lives left (of 3) the PREVIOUS rank must have been cleared with to enter this one.
export const UNLOCK_MIN_LIVES: Partial<Record<RarityId, number>> = {
  a: 2,
  s: 2,
  ss: 2,
  ssr: 3,
};

export const FINAL_BOSS_MULT = 1.25; // the last boss hits harder than the others
// Clearing a dungeon pays this many coins (on top of what the run earned). It grows
// ~1.6x per rank so that attempting S, SS and SSR is not a coin sink (their normal
// runs pay less because most die early). Keep MAX in sync with the allowance in
// bank_run (0017: +20000 when a clear is submitted).
export const VICTORY_COINS: Record<RarityId, number> = {
  f: 400,
  e: 640,
  d: 1020,
  c: 1640,
  b: 2620,
  a: 4190,
  s: 6710,
  ss: 10740,
  ssr: 17180,
};
export const victoryCoins = (rank: RarityId) => VICTORY_COINS[rank];

export const isDungeonRank = (v: unknown): v is RarityId =>
  typeof v === "string" && Object.hasOwn(DUNGEONS, v);

// Best lives left per cleared dungeon (profile.dungeons).
export type Clears = Partial<Record<RarityId, number>>;

export type LockReason =
  | { kind: "needs"; rank: RarityId; lives: number } // clear `rank` with >= `lives`
  | null;

export function lockReason(clears: Clears, rank: RarityId): LockReason {
  const i = RARITY_IDS.indexOf(rank);
  if (i === 0) return null;
  const prev = RARITY_IDS[i - 1];
  const need = UNLOCK_MIN_LIVES[rank] ?? 1;
  return (clears[prev] ?? 0) >= need
    ? null
    : { kind: "needs", rank: prev, lives: need };
}

export const isUnlocked = (clears: Clears, rank: RarityId) =>
  lockReason(clears, rank) === null;

export const bossCount = (rank: RarityId) => DUNGEONS[rank].bosses.length;
