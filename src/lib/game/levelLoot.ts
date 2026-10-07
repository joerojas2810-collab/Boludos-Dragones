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
  CLASS_WEAPONS,
  isGearType,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type WeaponType,
} from "./weapons";

// Tune here (starting values, measured in phase 6).
export const EXTRA_PIECE_CHANCE = [0.3, 0.05] as const; // 2nd and 3rd piece
export const UP_CHANCE = { normal: 0.1, final: 0.25 } as const; // piece one rank above
export const REPEAT_PIECE_CHANCE = 0.25; // repeat clears: no guaranteed piece
export const REPEAT_PART_MULT = 0.6;
export const ASC_LOOT_STEP = 0.1; // +10% points per ascension level
export const ROLE_POINTS = { normal: 1, elite: 2, final: 4 } as const;
export const CORE_SHARE = 0.2;
export const piecesOnClear = (length: number) => (length >= 3 ? 1 : 0);

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
  classId: ClassId,
  up: number,
): RunPiece {
  const element = levelElement(spec, asc);
  const type: WeaponType =
    spec.drop === "arma" ? rng.pick(CLASS_WEAPONS[classId]) : spec.drop;
  const rarity = dropRank(rng, spec.rank, up);
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
  classId: ClassId,
  seed: number,
  opts: { repeat: boolean; payMult?: number },
): LevelLoot {
  const rng = createRng(hashSeed(seed, spec.index, asc, 9201));
  const mult = (opts.payMult ?? 1) * (opts.repeat ? REPEAT_PART_MULT : 1);
  const up = spec.final ? UP_CHANCE.final : UP_CHANCE.normal;
  const pieces: RunPiece[] = [];
  if (piecesOnClear(spec.length) > 0) {
    const first = opts.repeat
      ? rng.chance(REPEAT_PIECE_CHANCE * (opts.payMult ?? 1))
      : (rng.next(), true);
    if (first) {
      pieces.push(pieceOf(rng, spec, asc, classId, up));
      EXTRA_PIECE_CHANCE.forEach((c) => {
        if (rng.chance(c)) pieces.push(pieceOf(rng, spec, asc, classId, up));
      });
    }
  }
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
