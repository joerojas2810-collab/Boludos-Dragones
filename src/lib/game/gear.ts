import type { Stats } from "./characters";
import { itemMult, type RarityId } from "./rarity";
import { isGearType, type GearType, type WeaponType } from "./weapons";

// Bonus from worn gear. hp/def/speed are fractions of the hero's stat;
// dodge/crit/accuracy are added points. All scale with rank x stars (itemMult).
export interface GearBonus {
  hp: number;
  def: number;
  speed: number;
  dodge: number;
  crit: number;
  accuracy: number;
}
export const NO_GEAR: GearBonus = {
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
  hp: Math.max(1, Math.round(s.hp * (1 + g.hp))),
  def: Math.round(s.def * (1 + g.def) * 10) / 10,
  speed: Math.round(s.speed * (1 + g.speed) * 10) / 10,
  dodge: Math.round(Math.min(0.6, s.dodge + g.dodge) * 1000) / 1000,
  crit: Math.round(Math.min(0.6, s.crit + g.crit) * 1000) / 1000,
  accuracy: Math.round((s.accuracy + g.accuracy) * 1000) / 1000,
});

// Short Spanish description of one piece, e.g. "+10% vida · +5% DEF".
export function gearLine(p: WornPiece): string {
  const g = gearBonus([p]);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return [
    g.hp && `+${pct(g.hp)} vida`,
    g.def && `+${pct(g.def)} DEF`,
    g.speed && `+${pct(g.speed)} velocidad`,
    g.dodge && `+${pct(g.dodge)} esquive`,
    g.crit && `+${pct(g.crit)} crítico`,
    g.accuracy && `+${pct(g.accuracy)} precisión`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Sum of two gear bonuses, capped like gearBonus (worn gear + run loot).
export function combineGear(a: GearBonus, b: GearBonus): GearBonus {
  const out = { ...NO_GEAR };
  for (const k of Object.keys(out) as (keyof GearBonus)[])
    out[k] = Math.round(Math.min(a[k] + b[k], GEAR_CAP[k]) * 1000) / 1000;
  return out;
}

// Stats already include `base` gear; swap it for `total` (run loot adds to it).
export const applyGearDelta = (
  s: Stats,
  base: GearBonus,
  total: GearBonus,
): Stats => ({
  ...s,
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
