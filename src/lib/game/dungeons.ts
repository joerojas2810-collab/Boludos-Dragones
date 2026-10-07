// Dungeons: fixed-length runs with a rank F..SSR (docs/DUNGEONS_FORJA.md).
// Rank sets the length, where the bosses are, how hard the enemies hit
// (`offset` shifts the difficulty floor) and how good the loot is.
import { CLASSES } from "./characters";
import { RARITY_IDS, scaleStats, type RarityId } from "./rarity";

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

// Ascension: optional harder levels 1-5 of a cleared dungeon. Rules stack (level N has
// every rule up to N); each level also pays more coins and loot budget.
export const MAX_ASCENSION = 5;
// Every level: enemy hp and atk/def grow by these steps (L1 = +12% hp, +5% atk).
export const ASC_HP_STEP = 0.12;
export const ASC_ATK_STEP = 0.05;
export const ASC_REST_HEAL = 0.5; // L2: campfire heals this fraction of normal
// L3: hard fights get one more enemy (max 3). L4: bosses gain double attack.
export const ASC_LIVES = 2; // L5: starting lives
export const ASC_COIN_STEP = 0.2; // victory coins per level
export const ASC_LOOT_STEP = 0.1; // loot budget per level
export const ASC_RULES: readonly string[] = [
  "Enemigos +12% vida y +5% ataque por nivel",
  "Las fogatas curan la mitad",
  "Peleas difíciles con un enemigo más",
  "Los jefes atacan dos veces",
  "Empiezas con 2 vidas",
];

export const FINAL_BOSS_MULT = 1.25; // the last boss hits harder than the others
// Clearing a dungeon pays this many coins (on top of what the run earned). It grows
// ~1.6x per rank so that attempting S, SS and SSR is not a coin sink (their normal
// runs pay less because most die early). Keep MAX in sync with the allowance in
// bank_run (0017: +20000 when a clear is submitted).
export const VICTORY_COINS: Record<RarityId, number> = {
  f: 30,
  e: 45,
  d: 65,
  c: 100,
  b: 150,
  a: 230,
  s: 350,
  ss: 600,
  ssr: 1000,
};
// First time a dungeon rank / ascension level is cleared: a one-off bonus chest of coins.
export const FIRST_CLEAR_MULT = 4; // x victory coins, first clear of a rank
export const FIRST_ASC_MULT = 2; // x victory coins x (level + 1), first clear of an ascension level
export const firstClearCoins = (
  rank: RarityId,
  ascension = 0,
  firstRank = true,
) =>
  Math.round(
    VICTORY_COINS[rank] *
      ((firstRank ? FIRST_CLEAR_MULT : 0) +
        (ascension > 0 ? FIRST_ASC_MULT * (ascension + 1) : 0)),
  );
export const victoryCoins = (rank: RarityId, ascension = 0) =>
  Math.round(VICTORY_COINS[rank] * (1 + ASC_COIN_STEP * ascension));

export const isDungeonRank = (v: unknown): v is RarityId =>
  typeof v === "string" && Object.hasOwn(DUNGEONS, v);

// Best lives left per cleared dungeon (profile.dungeons).
export type Clears = Partial<Record<RarityId, number>>;
// Highest ascension level cleared per dungeon (profile.ascensions); clearing N opens N+1.
export type Ascensions = Partial<Record<RarityId, number>>;

// Highest ascension the player may start in `rank`: 0 until it is cleared once.
export const maxAscension = (
  clears: Clears,
  asc: Ascensions,
  rank: RarityId,
): number =>
  (clears[rank] ?? 0) > 0 ? Math.min(MAX_ASCENSION, (asc[rank] ?? 0) + 1) : 0;

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

// Power (same formula as heroPower) of an average hero of the dungeon's rank with 3 stars and
// no gear: the hero the dungeon was calibrated with (scripts/run-sim.ts, HERO_STARS=3).
export const recommendedPower = (rank: RarityId): number => {
  const cs = Object.values(CLASSES).map((c) => {
    const s = scaleStats(c.stats, rank, 3);
    return (s.hp * (s.atk + s.def * 0.5)) / 50;
  });
  return Math.round(cs.reduce((a, b) => a + b, 0) / cs.length);
};

export type PowerVerdict = "ok" | "low" | "danger";
// danger: under half of the recommended power (fights become unwinnable walls).
export const powerVerdict = (power: number, rank: RarityId): PowerVerdict => {
  const r = power / recommendedPower(rank);
  return r < 0.5 ? "danger" : r < 0.8 ? "low" : "ok";
};
