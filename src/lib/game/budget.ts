// Dungeon loot budget: a dungeon hands out a fixed amount of loot points that
// grows with its rank and length. Every node takes a random share of what is
// left and splits it at random into pieces, parts and cores. The final boss
// takes all that remains, so the budget is (almost) always spent by the end.
import { DUNGEONS } from "./dungeons";
import type { Element } from "./elements";
import { ELEMENTS } from "./elements";
import { ELEMENT_LABEL } from "./elements";
import type { ClassId } from "./characters";
import { dropRank, FINAL_UP_CHANCE, type RunPiece } from "./loot";
import {
  addParts,
  coreKey,
  partKey,
  type DropSource,
  type Parts,
} from "./parts";
import { RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import {
  CLASS_WEAPONS,
  GEAR_TYPES,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type Slot,
  type WeaponType,
} from "./weapons";

// Tune here.
export const LOOT_COST = { part: 1, core: 1, piece: 2 } as const;
export const BUDGET_PER_FLOOR = 1.5;
export const BUDGET_RANK_BONUS = 0.1; // x (1 + bonus * rank index)
// Fraction of the remaining budget a node can take (before the random factor).
export const EVENT_SHARE: Record<DropSource, number> = {
  easy: 0.05,
  hard: 0.05, // same pool share: the bonus below is what rewards the risk
  chest: 0.15,
  boss: 0.2,
  finalBoss: 1,
};
// Riskier choices pay better: chance of a drop one rank above the dungeon's...
export const SOURCE_UP: Record<DropSource, number> = {
  easy: 0.06,
  hard: 0.16,
  chest: 0.1,
  boss: 0.18,
  finalBoss: FINAL_UP_CHANCE,
};
// ...and they add FREE loot on top of the share (not taken from the pool):
// extra points = share x (RISK_BONUS + GROUP_BONUS), so a hard fight or a bigger
// group really pays more instead of just spending the budget sooner.
export const RISK_BONUS: Record<DropSource, number> = {
  easy: 0,
  hard: 0.6,
  chest: 0,
  boss: 0.3,
  finalBoss: 0.3,
};
export const GROUP_BONUS = [0, 0.3, 0.6] as const;
export const GROUP_UP = [0, 0.04, 0.08] as const;
export const SHARE_JITTER = [0.5, 1.6] as const;
export const CORE_SHARE = 0.2; // of the material rolls
export const PIECE_OFFER = { chest: 0.4, boss: 2, finalBoss: 3 } as const;

export const dungeonBudget = (rank: RarityId) =>
  Math.round(
    DUNGEONS[rank].floors *
      BUDGET_PER_FLOOR *
      (1 + BUDGET_RANK_BONUS * RARITY_IDS.indexOf(rank)),
  );

export interface EventLoot {
  parts: Parts;
  pieces: RunPiece[]; // candidates: the player takes at most one
  spent: number; // points taken from the pool
}

function pieceFor(
  rng: Rng,
  classId: ClassId,
  rank: RarityId,
  up: number,
): RunPiece {
  const slot = rng.pick<Slot>(["arma", ...GEAR_TYPES]);
  const type: WeaponType =
    slot === "arma" ? rng.pick(CLASS_WEAPONS[classId]) : slot;
  const element = rng.pick(ELEMENTS);
  return {
    type,
    element,
    rarity: dropRank(rng, rank, up),
    name: `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]}`,
  };
}

// What one node drops. Deterministic in (seed, floor, salt); `pool` is what is left.
export function rollEvent(
  source: DropSource,
  seed: number,
  floor: number,
  salt: number,
  rank: RarityId,
  classId: ClassId,
  pool: number,
  worldElement: Element,
  group = 1, // enemies in the fight (1..3)
): EventLoot {
  const rng = createRng(hashSeed(seed, floor, 90, salt));
  const none: EventLoot = { parts: {}, pieces: [], spent: 0 };
  if (pool <= 0) return none;
  const g = Math.min(3, Math.max(1, group)) - 1;
  const up = Math.min(0.5, SOURCE_UP[source] + GROUP_UP[g]);
  let share =
    source === "finalBoss"
      ? pool
      : Math.min(
          pool,
          pool *
            EVENT_SHARE[source] *
            (SHARE_JITTER[0] +
              rng.next() * (SHARE_JITTER[1] - SHARE_JITTER[0])),
        );
  if (source === "chest")
    share = Math.min(pool, Math.max(share, LOOT_COST.part)); // a chest is never empty
  // Free extra points for risk (see RISK_BONUS): spent first, never taken from the pool.
  const extra = share * (RISK_BONUS[source] + GROUP_BONUS[g]);
  let left = share + extra;
  const pieces: RunPiece[] = [];
  const offer =
    source === "chest"
      ? rng.chance(PIECE_OFFER.chest)
        ? 1
        : 0
      : source === "boss"
        ? PIECE_OFFER.boss
        : source === "finalBoss"
          ? PIECE_OFFER.finalBoss
          : 0;
  if (offer > 0 && left >= LOOT_COST.piece) {
    for (let i = 0; i < offer; i++)
      pieces.push(pieceFor(rng, classId, rank, up));
    left -= LOOT_COST.piece; // only one candidate can be taken
  }
  let parts: Parts = {};
  for (let guard = 0; left >= LOOT_COST.part && guard < 200; guard++) {
    if (rng.chance(CORE_SHARE)) {
      parts = addParts(parts, {
        [coreKey(rng.chance(0.6) ? worldElement : rng.pick(ELEMENTS))]: 1,
      });
      left -= LOOT_COST.core;
    } else {
      parts = addParts(parts, {
        [partKey(rng.pick(WEAPON_TYPES), dropRank(rng, rank, up))]: 1,
      });
      left -= LOOT_COST.part;
    }
  }
  const used = share + extra - left;
  return { parts, pieces, spent: Math.min(share, Math.max(0, used - extra)) };
}
