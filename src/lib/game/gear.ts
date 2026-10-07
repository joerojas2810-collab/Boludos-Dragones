import type { Stats } from "./characters";
import type { Element } from "./elements";
import { itemMult, type RarityId } from "./rarity";
import { isGearType, type GearType, type WeaponType } from "./weapons";

// Bonus from worn gear. hp/def/speed are fractions of the hero's stat;
// dodge/crit/accuracy are added points. All scale with rank x stars (itemMult).
export interface GearBonus {
  atk: number;
  hp: number;
  def: number;
  speed: number;
  dodge: number;
  crit: number;
  accuracy: number;
}
export const NO_GEAR: GearBonus = {
  atk: 0,
  hp: 0,
  def: 0,
  speed: 0,
  dodge: 0,
  crit: 0,
  accuracy: 0,
};

// Tune here: bonus of one piece at rank F, no stars.
export const GEAR_BASE: Record<GearType, Partial<GearBonus>> = {
  casco: { hp: 0.1, def: 0.05 },
  peto: { def: 0.1, hp: 0.05 },
  piernas: { def: 0.08, dodge: 0.015 },
  zapatos: { speed: 0.06, dodge: 0.015 },
  collar: { crit: 0.02, accuracy: 0.02 },
};
// Caps on the sum of all pieces (so full gear is about +40-50% at high rank).
export const GEAR_CAP: GearBonus = {
  atk: 0.15,
  hp: 0.5,
  def: 0.5,
  speed: 0.25,
  dodge: 0.1,
  crit: 0.15,
  accuracy: 0.1,
};

export interface WornPiece {
  type: WeaponType;
  rarity: RarityId;
  stars: number;
}

export function gearBonus(pieces: readonly WornPiece[]): GearBonus {
  const sum = { ...NO_GEAR };
  for (const p of pieces) {
    if (!isGearType(p.type)) continue;
    const m = itemMult(p.rarity, p.stars);
    for (const k of Object.keys(sum) as (keyof GearBonus)[])
      sum[k] += (GEAR_BASE[p.type][k] ?? 0) * m;
  }
  for (const k of Object.keys(sum) as (keyof GearBonus)[])
    sum[k] = Math.round(Math.min(sum[k], GEAR_CAP[k]) * 1000) / 1000;
  return sum;
}

export const applyGear = (s: Stats, g: GearBonus): Stats => ({
  ...s,
  atk: Math.round(s.atk * (1 + (g.atk ?? 0)) * 10) / 10,
  hp: Math.max(1, Math.round(s.hp * (1 + g.hp))),
  def: Math.round(s.def * (1 + g.def) * 10) / 10,
  speed: Math.round(s.speed * (1 + g.speed) * 10) / 10,
  dodge: Math.round(Math.min(0.6, s.dodge + g.dodge) * 1000) / 1000,
  crit: Math.round(Math.min(0.6, s.crit + g.crit) * 1000) / 1000,
  accuracy: Math.round((s.accuracy + g.accuracy) * 1000) / 1000,
});

const bonusText = (g: GearBonus): string => {
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return [
    g.atk && `+${pct(g.atk)} ATQ`,
    g.hp && `+${pct(g.hp)} vida`,
    g.def && `+${pct(g.def)} DEF`,
    g.speed && `+${pct(g.speed)} velocidad`,
    g.dodge && `+${pct(g.dodge)} esquive`,
    g.crit && `+${pct(g.crit)} crítico`,
    g.accuracy && `+${pct(g.accuracy)} precisión`,
  ]
    .filter(Boolean)
    .join(" · ");
};

// Short Spanish description of one piece, e.g. "+10% vida · +5% DEF".
export const gearLine = (p: WornPiece): string => bonusText(gearBonus([p]));

// Sum of two gear bonuses, capped like gearBonus (worn gear + run loot).
export function combineGear(a: GearBonus, b: GearBonus): GearBonus {
  const out = { ...NO_GEAR };
  for (const k of Object.keys(out) as (keyof GearBonus)[])
    out[k] =
      Math.round(Math.min((a[k] ?? 0) + (b[k] ?? 0), GEAR_CAP[k]) * 1000) /
      1000;
  return out;
}

// Stats already include `base` gear; swap it for `total` (run loot adds to it).
export const applyGearDelta = (
  s: Stats,
  base: GearBonus,
  total: GearBonus,
): Stats => ({
  ...s,
  atk:
    Math.round(
      ((s.atk * (1 + (total.atk ?? 0))) / (1 + (base.atk ?? 0))) * 10,
    ) / 10,
  hp: Math.max(1, Math.round((s.hp * (1 + total.hp)) / (1 + base.hp))),
  def: Math.round(((s.def * (1 + total.def)) / (1 + base.def)) * 10) / 10,
  speed:
    Math.round(((s.speed * (1 + total.speed)) / (1 + base.speed)) * 10) / 10,
  dodge:
    Math.round(Math.min(0.6, s.dodge + total.dodge - base.dodge) * 1000) / 1000,
  crit:
    Math.round(Math.min(0.6, s.crit + total.crit - base.crit) * 1000) / 1000,
  accuracy:
    Math.round((s.accuracy + total.accuracy - base.accuracy) * 1000) / 1000,
});

// ---- Element sets ----
// Worn pieces (weapon + armour) of the same element: 2 give a small bonus, 4 a bigger one,
// each with the element's signature stat. If the set matches the HERO's element the bonus
// is multiplied (SET_AFFINITY). Sums into the gear caps like any piece.
export const SET_AFFINITY = 1.5;
export const SET_TIERS = [2, 4, 6] as const;
export const SET_BONUS: Record<
  Element,
  [Partial<GearBonus>, Partial<GearBonus>, Partial<GearBonus>]
> = {
  rayo: [{ crit: 0.03 }, { crit: 0.07 }, { crit: 0.11 }],
  fuego: [{ atk: 0.04 }, { atk: 0.09 }, { atk: 0.15 }],
  agua: [{ hp: 0.05 }, { hp: 0.12 }, { hp: 0.2 }],
  tierra: [{ def: 0.05 }, { def: 0.12 }, { def: 0.2 }],
  viento: [
    { speed: 0.04, dodge: 0.01 },
    { speed: 0.08, dodge: 0.02 },
    { speed: 0.12, dodge: 0.03 },
  ],
};

export interface ActiveSet {
  element: Element;
  pieces: number;
  tier: 2 | 4 | 6;
  affinity: boolean;
  bonus: GearBonus;
}

export function activeSets(
  elements: readonly Element[],
  heroElement: Element,
): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const el of Object.keys(SET_BONUS) as Element[]) {
    const n = elements.filter((e) => e === el).length;
    const tier = n >= 6 ? 6 : n >= 4 ? 4 : n >= 2 ? 2 : null;
    if (!tier) continue;
    const affinity = el === heroElement;
    const mult = affinity ? SET_AFFINITY : 1;
    const bonus = { ...NO_GEAR };
    for (const [k, v] of Object.entries(SET_BONUS[el][SET_TIERS.indexOf(tier)]))
      bonus[k as keyof GearBonus] =
        Math.round((v as number) * mult * 1000) / 1000;
    out.push({ element: el, pieces: n, tier, affinity, bonus });
  }
  return out;
}

export const setBonus = (sets: readonly ActiveSet[]): GearBonus =>
  sets.reduce((acc, s) => combineGear(acc, s.bonus), NO_GEAR);

// Full table line for one element and tier index (no affinity), e.g. "+3% crítico".
export const setTierText = (el: Element, i: number): string =>
  bonusText({ ...NO_GEAR, ...SET_BONUS[el][i] });

// "Set de Rayo (2): +4.5% crítico (afinidad ×1.5)"
export const setLine = (s: ActiveSet): string =>
  `Set de ${s.element[0].toUpperCase()}${s.element.slice(1)} (${s.pieces}): ${bonusText(s.bonus)}${s.affinity ? " (afinidad ×1.5)" : ""}`;
