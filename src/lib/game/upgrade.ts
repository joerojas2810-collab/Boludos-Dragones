// Mejorar (+1..+10, docs/FORJA_V9.md): Escamas (and an optional Dado cargado) raise a piece's +N.
// Only equipment of rank S or above with 5 stars. A failure costs the Escamas (and the die) but
// never the piece. Pure over the Profile; the server rolls with its own Rng and persists the result.
import { PLUS_BONUS_PER_LEVEL } from "./gear";
import type { Profile } from "./profile";
import { MAX_STARS, RARITY_IDS } from "./rarity";
import type { Rng } from "./rng";
import type { Weapon } from "./weapons";

export { PLUS_BONUS_PER_LEVEL };
export const MAX_PLUS = 10;
export const MIN_UPGRADE_RANK = "s";
// Key = the level you upgrade TO. chance is a percent; escamas is the cost of one attempt.
export const UPGRADE_TABLE: Record<number, { chance: number; escamas: number }> = {
  1: { chance: 100, escamas: 1 },
  2: { chance: 90, escamas: 2 },
  3: { chance: 80, escamas: 3 },
  4: { chance: 70, escamas: 4 },
  5: { chance: 60, escamas: 5 },
  6: { chance: 50, escamas: 6 },
  7: { chance: 45, escamas: 7 },
  8: { chance: 40, escamas: 8 },
  9: { chance: 35, escamas: 9 },
  10: { chance: 30, escamas: 10 },
};
export const DADO_BONUS = 0.2;
export const STREAK_BONUS = 0.05;

type Piece = Pick<Weapon, "rarity" | "stars" | "plus" | "plusStreak">;

export function canUpgrade(piece: Piece): { ok: true } | { ok: false; reason: string } {
  if (RARITY_IDS.indexOf(piece.rarity) < RARITY_IDS.indexOf(MIN_UPGRADE_RANK))
    return { ok: false, reason: "Solo se mejora equipo de rango S o superior." };
  if (piece.stars < MAX_STARS) return { ok: false, reason: "Necesita las 5 estrellas." };
  if ((piece.plus ?? 0) >= MAX_PLUS) return { ok: false, reason: "Ya está en +10." };
  return { ok: true };
}

/** Success chance (0..1) of the next attempt on this piece. */
export function upgradeChance(piece: Piece, useDado: boolean): number {
  const row = UPGRADE_TABLE[(piece.plus ?? 0) + 1];
  if (!row) return 0;
  return Math.min(1, row.chance / 100 + (piece.plusStreak ?? 0) * STREAK_BONUS + (useDado ? DADO_BONUS : 0));
}

export type UpgradeResult =
  | { ok: true; success: boolean; piece: Weapon; profile: Profile; chance: number; spent: number }
  | { ok: false; error: string };

export function upgradePiece(p: Profile, pieceId: string, useDado: boolean, rng: Rng): UpgradeResult {
  const piece = p.weapons.find((w) => w.id === pieceId);
  if (!piece) return { ok: false, error: "Esa pieza no es tuya." };
  const can = canUpgrade(piece);
  if (!can.ok) return { ok: false, error: can.reason };
  const spent = UPGRADE_TABLE[(piece.plus ?? 0) + 1].escamas;
  if (p.escamas < spent) return { ok: false, error: `Te faltan ${spent - p.escamas} Escamas.` };
  if (useDado && p.dados < 1) return { ok: false, error: "No tienes Dados cargados." };
  const chance = upgradeChance(piece, useDado);
  const success = rng.chance(chance);
  const next: Weapon = success
    ? { ...piece, plus: (piece.plus ?? 0) + 1, plusStreak: 0 }
    : { ...piece, plusStreak: (piece.plusStreak ?? 0) + 1 };
  const profile: Profile = {
    ...p,
    escamas: p.escamas - spent,
    dados: p.dados - (useDado ? 1 : 0),
    weapons: p.weapons.map((w) => (w.id === pieceId ? next : w)),
  };
  return { ok: true, success, piece: next, profile, chance, spent };
}
