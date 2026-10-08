// Directed loot of a dungeon level (Run v2): paid on clear, never during the level.
// Levels of 3 or 5 fights (and the final) hand out 1 guaranteed piece of the
// level's slot and element, plus rare extras. Parts and cores come from points.
import type { ClassId } from "./characters";
import { ELEMENT_LABEL, ELEMENTS } from "./elements";
import { rollGear } from "./gear";
import { levelElement, type LevelSpec } from "./levels";
import { dropRank, type RunPiece } from "./loot";
import { addParts, coreKey, partKey, type Parts } from "./parts";
import { RARITY_IDS } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { FIGHT_XP } from "./stage";
import {
  HAND_TYPES,
  isGearType,
  SLOTS,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type WeaponType,
} from "./weapons";

// Tune here. Every piece is random now: slot (6), element and rank. A level rolls
// PIECE_ROLLS_PER_FIGHT per fight; ranks run from the dungeon's rank down to F with a flat
// decay, and a small chance of one rank above. Parts and cores come from points.
export const PIECE_ROLLS_PER_FIGHT = 3;
export const PIECE_CHANCE = 0.6; // per roll
export const PIECE_RANK_DECAY = 0.7; // flatter than the old directed drop (0.5)
export const UP_CHANCE = { normal: 0.05, final: 0.1 } as const; // piece one rank above
export const PIECE_ELEMENT_LEVEL_SHARE = 0.4; // else any element
export const REPEAT_PIECE_MULT = 0.75; // repeat clears (and sweeps) keep most of the piece drops
export const REPEAT_PART_MULT = 0.6;
export const ASC_LOOT_STEP = 0.1; // +10% points per ascension level
export const ROLE_POINTS = { normal: 1, elite: 2, final: 4 } as const;
export const CORE_SHARE = 0.2;

export interface LevelLoot {
  parts: Parts;
  pieces: RunPiece[];
}

// Material points a level hands out at an ascension (per rank index bonus +10%).
export function levelPoints(spec: LevelSpec, asc: number): number {
  const rankBonus = 1 + 0.1 * RARITY_IDS.indexOf(spec.rank);
  const fights = spec.length - 1;
  const last = spec.final ? ROLE_POINTS.final : ROLE_POINTS.elite;
  return (fights + last) * rankBonus * (1 + ASC_LOOT_STEP * asc);
}

function pieceOf(
  rng: Rng,
  spec: LevelSpec,
  asc: number,
  up: number,
): RunPiece {
  const lvEl = levelElement(spec, asc);
  const element = rng.chance(PIECE_ELEMENT_LEVEL_SHARE) ? lvEl : rng.pick(ELEMENTS);
  const slot = rng.pick(SLOTS);
  // Any weapon type: the hero you run with does not decide what drops.
  const type: WeaponType = slot === "arma" ? rng.pick(HAND_TYPES) : slot;
  const rarity = dropRank(rng, spec.rank, up, PIECE_RANK_DECAY);
  const rolled = isGearType(type)
    ? rollGear(rng, type, rarity)
    : { roll: rollGear(rng, "casco", rarity).roll };
  return {
    type,
    element,
    rarity,
    name: `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]}`,
    ...rolled,
  };
}

// payMult in 0..1 is the daily decay (economy.ts); repeat = level already cleared.
export function levelLoot(
  spec: LevelSpec,
  asc: number,
  _classId: ClassId, // kept for callers: drops no longer depend on the hero
  seed: number,
  opts: { repeat: boolean; payMult?: number },
): LevelLoot {
  const rng = createRng(hashSeed(seed, spec.index, asc, 9201));
  const mult = (opts.payMult ?? 1) * (opts.repeat ? REPEAT_PART_MULT : 1);
  const up = spec.final ? UP_CHANCE.final : UP_CHANCE.normal;
  const pieces: RunPiece[] = [];
  const pieceMult = (opts.repeat ? REPEAT_PIECE_MULT : 1) * (opts.payMult ?? 1);
  for (let i = 0; i < spec.length * PIECE_ROLLS_PER_FIGHT; i++)
    if (rng.chance(PIECE_CHANCE * pieceMult))
      pieces.push(pieceOf(rng, spec, asc, up));
  let points = levelPoints(spec, asc) * mult;
  let parts: Parts = {};
  while (points > 0) {
    // random rounding of the fractional rest keeps expected value exact
    if (points < 1 && !rng.chance(points)) break;
    points -= 1;
    parts = addParts(parts, {
      [rng.chance(CORE_SHARE)
        ? coreKey(rng.chance(0.6) ? levelElement(spec, asc) : rng.pick(ELEMENTS))
        : partKey(rng.pick(WEAPON_TYPES), dropRank(rng, spec.rank, up))]: 1,
    });
  }
  return { parts, pieces };
}

// EXP of a level if every fight is won (kept in sync with stage.finishFight).
export function levelXp(spec: LevelSpec): number {
  const base =
    (spec.length - 1) * FIGHT_XP.normal +
    (spec.final ? FIGHT_XP.final : FIGHT_XP.elite);
  return Math.round(base * 1.25);
}
