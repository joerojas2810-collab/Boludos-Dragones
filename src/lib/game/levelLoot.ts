// Directed loot of a dungeon level (Run v2): paid on clear, never during the level.
// Levels of 3 or 5 fights (and the final) hand out 1 guaranteed piece of the
// level's slot and element, plus rare extras. Parts and cores come from points.
import type { ClassId } from "./characters";
import { ELEMENT_LABEL, ELEMENTS } from "./elements";
import { rollGear } from "./gear";
import { levelDecay } from "./levelPay";
import { levelElement, type LevelSpec } from "./levels";
import { gachaDropRank, type RunPiece } from "./loot";
import { RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { FIGHT_XP } from "./stage";
import {
  HAND_TYPES,
  isGearType,
  SLOTS,
  WEAPON_TYPE_DATA,
  type WeaponType,
} from "./weapons";

// Tune here. Every piece is random: slot (6), element and rank. A level rolls
// PIECE_ROLLS_PER_FIGHT per fight (quantity stays generous); the RANK is what is delicate and it is
// resolved for the LEVEL as a whole, not piece by piece:
//  - one roll per level (TOP_PIECE_CHANCE) decides if the level hands out ONE piece of the dungeon's
//    own rank (the "premio mayor"); it never gives two;
//  - every other piece follows the gacha odds capped one rank BELOW the dungeon (gachaDropRank), so the
//    dungeon's own rank only comes from that single roll and nothing is ever above it.
// Escamas and the Dado cargado (Mejorar, docs/FORJA_V9.md) drop only in dungeons S and above.
export const PIECE_ROLLS_PER_FIGHT = 3;
export const PIECE_CHANCE = 0.6; // per roll
export const TOP_PIECE_CHANCE = 0.05; // per level (first clear); repeats scale it like the piece count
export const PIECE_RANK_TILT = 1.3; // 1 = gacha odds for the rest; > 1 leans toward the cap (1.3: best piece of an S sweep is an A ~6 times in 10)
export const PIECE_ELEMENT_LEVEL_SHARE = 0.4; // else any element
export const REPEAT_PIECE_MULT = 0.75; // repeat clears (and sweeps) keep most of the piece drops; no daily decay
// Keep in sync with bank_level / level_escamas in SQL (0041).
export const ESCAMAS_PER_LEVEL: Partial<Record<RarityId, number>> = { s: 2, ss: 3, ssr: 4 };
export const ESCAMAS_ASC_STEP = 0.1; // +10% per ascension level
export const DADO_CHANCE = 0.05; // last level of a dungeon S+, first clear and repeats
export const DADO_DAILY_MAX = 2;

export interface LevelLoot {
  escamas: number;
  dados: number;
  pieces: RunPiece[];
}

// Escamas of a cleared level: only S+. A first clear rounds; a repeat takes the coin repeat factor and the
// daily decay and FLOORS (so a heavily decayed repeat reaches 0). Keep in sync with level_escamas (0042).
export const ESCAMAS_REPEAT_MULT = 0.6;
export function levelEscamas(rank: RarityId, asc: number, repeat = false, payMult = 1): number {
  const x = (ESCAMAS_PER_LEVEL[rank] ?? 0) * (1 + ESCAMAS_ASC_STEP * asc);
  return repeat ? Math.floor(x * ESCAMAS_REPEAT_MULT * payMult + 1e-9) : Math.round(x);
}

/**
 * Dado cargado roll for a cleared level: last level of a dungeon S+, 5%, only while the account has room today.
 * The caller rolls it at bank time with a SERVER rng (never from the run seed, which the client knows).
 */
export function rollDado(spec: LevelSpec, rng: Rng, dadoLeft: number): number {
  const eligible = spec.final && RARITY_IDS.indexOf(spec.rank) >= RARITY_IDS.indexOf("s") && dadoLeft > 0;
  return eligible && rng.chance(DADO_CHANCE) ? 1 : 0;
}

function roundRandom(rng: Rng, x: number): number {
  const n = Math.floor(x);
  return n + (rng.chance(x - n) ? 1 : 0);
}

function pieceOf(rng: Rng, spec: LevelSpec, asc: number, rarity: RarityId): RunPiece {
  const lvEl = levelElement(spec, asc);
  const element = rng.chance(PIECE_ELEMENT_LEVEL_SHARE) ? lvEl : rng.pick(ELEMENTS);
  const slot = rng.pick(SLOTS);
  // Any weapon type: the hero you run with does not decide what drops.
  const type: WeaponType = slot === "arma" ? rng.pick(HAND_TYPES) : slot;
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

// payMult in 0..1 is the daily decay (economy.ts); repeat = level already cleared; dados stay 0 here.
export function levelLoot(
  spec: LevelSpec,
  asc: number,
  _classId: ClassId, // kept for callers: drops no longer depend on the hero
  seed: number,
  opts: { repeat: boolean; payMult?: number },
): LevelLoot {
  const rng = createRng(hashSeed(seed, spec.index, asc, 9201));
  const pieces: RunPiece[] = [];
  // Pieces ignore the daily decay (payMult): only coins and Escamas decay (SQL computes those).
  const pieceMult = opts.repeat ? REPEAT_PIECE_MULT : 1;
  // Counts are the expected value with random rounding (no per-roll variance).
  const count = roundRandom(rng, spec.length * PIECE_ROLLS_PER_FIGHT * PIECE_CHANCE * pieceMult);
  // The level's single roll for a piece of the dungeon's own rank (replaces one of the pieces).
  const topAt = count > 0 && rng.chance(TOP_PIECE_CHANCE * pieceMult) ? rng.int(0, count - 1) : -1;
  const below = RARITY_IDS[Math.max(0, RARITY_IDS.indexOf(spec.rank) - 1)];
  for (let i = 0; i < count; i++)
    pieces.push(
      pieceOf(rng, spec, asc, i === topAt ? spec.rank : gachaDropRank(rng, below, PIECE_RANK_TILT)),
    );
  return {
    escamas: levelEscamas(spec.rank, asc, opts.repeat, opts.payMult ?? 1),
    dados: 0, // rolled by the caller at bank time (rollDado)
    pieces,
  };
}

// EXP of a level if every fight is won (kept in sync with stage.finishFight).
export function levelXp(spec: LevelSpec): number {
  const base =
    (spec.length - 1) * FIGHT_XP.normal +
    (spec.final ? FIGHT_XP.final : FIGHT_XP.elite);
  return Math.round(base * 1.25);
}
