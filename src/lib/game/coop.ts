// Coop final boss of a room (pure, shared by client play and server replay).
// Everybody fights the SAME boss on their own screen, one life, with the normal
// battle engine. The boss each player faces has a huge hp pool (nobody kills it
// alone); the damage each player deals is replayed by the server and summed into
// one shared bar. The party wins when the sum reaches the pool, which scales with
// the number of players (2 to 7).
import { step, type Battle } from "./combat";
import { floorFight, type Climb } from "./floorFights";
import type { RarityId } from "./rarity";
import type { RoomMode } from "./room";
import { hashSeed, type Rng } from "./rng";
import { createStage, startFight, type FightSpec } from "./stage";
import type { StageAction } from "./stageReplay";

export const COOP_K = {
  bossFloor: 11, // [K] strength of a floor-10 boss at the room's rank
  bossHpMult: 12, // [K] hp of the boss each player fights (keeps it unkillable alone)
  poolPerPlayer: 1.3, // [K] shared bar = this many normal-boss hp per player present
  maxActions: 400,
} as const;

// A Clérigo boss regenerates a share of its (huge) max hp every round: nobody
// could ever hurt it, so those seeds are skipped (deterministically).
function pickBoss(seed: number, rank: RarityId | null) {
  for (let k = 0; ; k++) {
    const f = floorFight(k === 0 ? seed : hashSeed(seed, k), COOP_K.bossFloor, {
      kind: "boss",
      rank,
      power: 1, // fixed design: the room rank only shifts the depth
    });
    if (f.enemies[0].classId !== "clerigo" || k >= 12) return f;
  }
}

/**
 * Difficulty rank of the boss. Levelled rooms ignore the room rank (heroes are
 * level-1 and equal, so the boss is the same at every rank); full-power rooms
 * scale it like the rest of the night.
 */
export const coopRank = (mode: RoomMode, rank: RarityId): RarityId | null =>
  mode === "nivelado" ? null : rank;

/** Fight node of the coop boss: one enemy, same stream for everybody. */
export function coopNode(seed: number, rank: RarityId | null): FightSpec {
  const f = pickBoss(seed, rank);
  const boss = {
    ...f.enemies[0],
    name: `${f.enemies[0].name} Supremo`,
    stats: {
      ...f.enemies[0].stats,
      hp: Math.round(f.enemies[0].stats.hp * COOP_K.bossHpMult),
    },
  };
  return { role: "elite", enemies: [boss], mods: f.mods, battleSeed: f.battleSeed };
}

/** Hp of a normal boss at this seed/rank: the unit the shared bar is measured in. */
export const bossUnit = (seed: number, rank: RarityId | null): number =>
  pickBoss(seed, rank).enemies[0].stats.hp;

/** Shared bar size for `players` present players. */
export const coopPool = (
  seed: number,
  rank: RarityId | null,
  players: number,
) =>
  Math.round(
    bossUnit(seed, rank) * COOP_K.poolPerPlayer * Math.max(1, players),
  );

/** Opens the fight of `run` (its hero at full hp) against `node`. */
export function startCoop(
  run: Climb,
  node: FightSpec,
): { battle: Battle; rng: Rng } {
  const f = startFight(
    createStage(hashSeed(run.seed, 2), run.hero, [node]),
  );
  return { battle: f.battle, rng: f.rng };
}

/** Hp the boss has lost in this battle. */
export const damageDealt = (b: Battle): number =>
  Math.max(0, b.enemies[0].char.stats.hp - Math.max(0, b.enemies[0].hp));

export interface CoopReplay {
  damage: number;
  finished: boolean; // hero dead (or fled): this player is done
  actions: number; // how many actions were applied
  rejectedAt: number | null; // first illegal action
}

/** Server replay: only plain `act` actions are legal (no quick resolve). */
export function replayCoop(
  start: Climb,
  node: FightSpec,
  actions: readonly StageAction[],
): CoopReplay {
  const f = startCoop(start, node);
  let b = f.battle;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.t !== "act" || i >= COOP_K.maxActions)
      return {
        damage: damageDealt(b),
        finished: b.status !== "ongoing",
        actions: i,
        rejectedAt: i,
      };
    if (b.status !== "ongoing")
      return {
        damage: damageDealt(b),
        finished: true,
        actions: i,
        rejectedAt: i,
      };
    const n = step(b, a.a, f.rng, a.target);
    if (n === b)
      return {
        damage: damageDealt(b),
        finished: false,
        actions: i,
        rejectedAt: i,
      };
    b = n;
  }
  return {
    damage: damageDealt(b),
    finished: b.status !== "ongoing",
    actions: actions.length,
    rejectedAt: null,
  };
}

export interface CoopTally {
  pool: number;
  total: number; // damage dealt by everybody (capped at pool)
  won: boolean;
  mvp: string | null; // player with the most damage
}

/** Shared bar state from per-player damage. */
export function coopTally(
  pool: number,
  damage: Readonly<Record<string, number>>,
): CoopTally {
  const entries = Object.entries(damage);
  const sum = entries.reduce((a, [, d]) => a + d, 0);
  const mvp = entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return {
    pool,
    total: Math.min(pool, sum),
    won: sum >= pool,
    mvp: mvp && mvp[1] > 0 ? mvp[0] : null,
  };
}

// ---- prizes ----
// Everybody who hurt the boss is paid, win or lose (keeps light players level);
// a win pays more and the MVP gets an extra Dado cargado. Coins and dice go to the account
// (forge), chips to the night ranking. Daily limit per account: see rooms.ts.
export const COOP_REWARD = {
  winCoins: 150,
  winChips: 50,
  loseCoins: 30,
  loseChips: 10,
  winDados: 1,
  mvpDados: 1,
} as const;

export interface CoopPrize {
  id: string;
  coins: number;
  chips: number;
  dados: number;
  mvp: boolean;
}

/** Prize of every player with damage . */
export function coopPrizes(
  tally: CoopTally,
  damage: Readonly<Record<string, number>>,
): CoopPrize[] {
  const k = COOP_REWARD;
  return Object.entries(damage)
    .filter(([, d]) => d > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id]) => {
      const mvp = tally.won && tally.mvp === id;
      const n = tally.won ? k.winDados + (mvp ? k.mvpDados : 0) : 0;
      return {
        id,
        coins: tally.won ? k.winCoins : k.loseCoins,
        chips: tally.won ? k.winChips : k.loseChips,
        dados: n,
        mvp,
      };
    });
}
