// Modo nivelado: everyone fights with comparable power; personality (element,
// traits, weapon element, rarity frame) is kept. Pure and deterministic.
import { CLASSES, type Character, type Stats } from "./characters";
import { RARITIES, starMult, type RarityId } from "./rarity";
import type { RoomMode } from "./room";

export const NIVELADO_MAX_BONUS = 0.15; // rarity + stars, total
export const NIVELADO_VARIATION = 0.075; // personal variation, half of ±15%
export const NIVELADO_WEAPON_CAP = 0.1; // flat weapon ATK, share of class base ATK
const MAX_ITEM_MULT = RARITIES.legendario.multiplier * starMult(5); // 2.7

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Rarity+stars bonus as a fraction (0 .. NIVELADO_MAX_BONUS). */
export function niveladoBonus(rarity: RarityId, stars: number): number {
  const m = RARITIES[rarity].multiplier * starMult(clamp(stars, 0, 5));
  return clamp(
    (NIVELADO_MAX_BONUS * (m - 1)) / (MAX_ITEM_MULT - 1),
    0,
    NIVELADO_MAX_BONUS,
  );
}

const squash = (ratio: number) =>
  1 + clamp((ratio - 1) / 2, -NIVELADO_VARIATION, NIVELADO_VARIATION);

export function normalizeHero(hero: Character, mode: RoomMode): Character {
  if (mode === "completo") return hero;
  const rarity: RarityId = hero.rarity ?? "comun";
  const stars = hero.stars ?? 0;
  const base = CLASSES[hero.classId].stats;
  const m = RARITIES[rarity].multiplier * starMult(stars);
  const weapon = hero.weapon?.atkBonus ?? 0;
  const bonus = 1 + niveladoBonus(rarity, stars);
  // Personal variation = what remains after removing rarity/stars/weapon.
  const vHp = hero.stats.hp / m / base.hp;
  const vAtk = Math.max(0, hero.stats.atk - weapon) / m / base.atk;
  const vDef = hero.stats.def / m / base.def;
  const stats: Stats = {
    hp: Math.max(1, Math.round(base.hp * squash(vHp) * bonus)),
    atk: r1(
      base.atk * squash(vAtk) * bonus +
        Math.min(Math.max(0, weapon), base.atk * NIVELADO_WEAPON_CAP),
    ),
    def: r1(base.def * squash(vDef) * bonus),
    crit: clamp(base.crit * squash(hero.stats.crit / base.crit), 0, 0.6),
    dodge: clamp(base.dodge * squash(hero.stats.dodge / base.dodge), 0, 0.6),
    // additive trait effects stay (traits are style); speed varies like the rest
    accuracy: hero.stats.accuracy,
    flee: hero.stats.flee,
    speed: r1(base.speed * squash(hero.stats.speed / base.speed)),
  };
  return {
    ...hero,
    stats,
    level: 1,
    xp: 0,
    weapon: hero.weapon
      ? {
          element: hero.weapon.element,
          atkBonus: Math.min(
            Math.max(0, weapon),
            base.atk * NIVELADO_WEAPON_CAP,
          ),
        }
      : undefined,
  };
}
