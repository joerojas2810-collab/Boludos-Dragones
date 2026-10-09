import type { Stats } from "./characters";
import { ELEMENTS, type Element } from "./elements";
import { RARITY_IDS, starMult, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import {
  isGearType,
  WEAPON_TYPES,
  type GearType,
  type WeaponType,
} from "./weapons";

// Bonus from worn gear. hp/def/speed/atk are fractions of the hero's stat; the rest are
// added points. dmgTaken / dmgDealt come from the style resonance only.
export interface GearBonus {
  atk: number;
  hp: number;
  def: number;
  speed: number;
  resist: number;
  crit: number;
  accuracy: number;
  critDmg: number; // added to the crit multiplier
  regen: number; // fraction of max hp per round
  lifesteal: number; // fraction of damage dealt
  dmgTaken: number; // fraction of incoming damage ignored (resonance)
  dmgDealt: number; // extra damage dealt (resonance)
}
export const NO_GEAR: GearBonus = {
  atk: 0,
  hp: 0,
  def: 0,
  speed: 0,
  resist: 0,
  crit: 0,
  accuracy: 0,
  critDmg: 0,
  regen: 0,
  lifesteal: 0,
  dmgTaken: 0,
  dmgDealt: 0,
};
type GearKey = keyof GearBonus;
type LineStat = GearKey; // includes the S capstone stats (dmgTaken / dmgDealt)

// Main stat of each piece: fixed by type, its value varies +-ROLL_SPREAD per piece.
export const GEAR_BASE: Record<GearType, Partial<GearBonus>> = {
  casco: { hp: 0.16 },
  peto: { def: 0.14 },
  piernas: { atk: 0.08 },
  zapatos: { speed: 0.07 },
  collar: { crit: 0.035 },
};
// Extra lines: value of one line at rank F, no stars (before GEAR_SCALE).
export const LINE_BASE: Record<LineStat, number> = {
  atk: 0.04,
  hp: 0.06,
  def: 0.06,
  speed: 0.04,
  resist: 0.015,
  crit: 0.015,
  accuracy: 0.02,
  critDmg: 0.06,
  regen: 0.004,
  lifesteal: 0.02,
  dmgTaken: 0.02, // capstone only
  dmgDealt: 0.02, // capstone only
};
// Which extra lines each piece can roll (the weapon has none).
export const LINE_POOL: Record<GearType, readonly LineStat[]> = {
  casco: ["accuracy", "crit", "critDmg", "def", "resist"],
  peto: ["hp", "regen", "resist", "lifesteal", "speed"],
  piernas: ["crit", "critDmg", "accuracy", "speed", "lifesteal"],
  zapatos: ["resist", "hp", "atk", "regen", "crit"],
  collar: ["critDmg", "accuracy", "atk", "speed", "lifesteal"],
};
export const ROLL_SPREAD = 0.1; // new rolls are 1 +- 10%
export const ROLL_ACCEPT = 0.15; // saved pieces (and the database) may hold up to +-15%
export interface GearLine {
  stat: LineStat;
  roll: number; // 1 +- ROLL_SPREAD
}
const EXTRA_FROM = ["c", "a", "s"] as const;
export const extraLines = (rarity: RarityId): number =>
  EXTRA_FROM.filter((r) => RARITY_IDS.indexOf(rarity) >= RARITY_IDS.indexOf(r))
    .length;
// S pieces carry one more line, their own "capstone", that no lower rank can roll.
export const CAPSTONE: Record<GearType, "dmgTaken" | "dmgDealt"> = {
  casco: "dmgTaken",
  peto: "dmgTaken",
  piernas: "dmgDealt",
  zapatos: "dmgDealt",
  collar: "dmgDealt",
};
export const hasCapstone = (rarity: RarityId): boolean => rarity === "s";
export const maxLines = (rarity: RarityId): number =>
  extraLines(rarity) + (hasCapstone(rarity) ? 1 : 0);
const rollOne = (rng: Rng) =>
  Math.round((1 - ROLL_SPREAD + rng.next() * 2 * ROLL_SPREAD) * 1000) / 1000;

// A new piece's own roll and extra lines (distinct stats from the pool).
export function rollGear(
  rng: Rng,
  type: GearType,
  rarity: RarityId,
): { roll: number; lines: GearLine[] } {
  const roll = rollOne(rng);
  const pool = [...LINE_POOL[type]];
  const lines: GearLine[] = Array.from({ length: extraLines(rarity) }, () => ({
    stat: pool.splice(rng.int(0, pool.length - 1), 1)[0],
    roll: rollOne(rng),
  }));
  if (hasCapstone(rarity)) lines.push({ stat: CAPSTONE[type], roll: rollOne(rng) });
  return { roll, lines };
}
// A piece that ranks up keeps its lines and rolls only the ones the new rank adds (distinct stats;
// the S capstone last). Hand weapons have none.
export function growLines(
  rng: Rng,
  type: WeaponType,
  rarity: RarityId,
  have: readonly GearLine[] = [],
): GearLine[] | undefined {
  if (!isGearType(type)) return undefined;
  const lines = [...have];
  const pool = LINE_POOL[type].filter((s) => !lines.some((l) => l.stat === s));
  let normal = lines.filter((l) => l.stat !== CAPSTONE[type]).length;
  while (normal < extraLines(rarity) && pool.length) {
    lines.push({ stat: pool.splice(rng.int(0, pool.length - 1), 1)[0], roll: rollOne(rng) });
    normal++;
  }
  if (hasCapstone(rarity) && !lines.some((l) => l.stat === CAPSTONE[type]))
    lines.push({ stat: CAPSTONE[type], roll: rollOne(rng) });
  return lines;
}

// Roll for any piece: hand weapons only get the main roll, armour also gets lines.
export const rollPiece = (
  rng: Rng,
  type: WeaponType,
  rarity: RarityId,
): { roll: number; lines?: GearLine[] } =>
  isGearType(type)
    ? rollGear(rng, type, rarity)
    : { roll: rollGear(rng, "casco", "f").roll };

// Validates untrusted roll data of a saved piece. Both absent = legacy piece.
export function parseRoll(
  type: WeaponType,
  rarity: RarityId,
  roll: unknown,
  lines: unknown,
): { roll?: number; lines?: GearLine[] } {
  if (typeof roll !== "number" || !Number.isFinite(roll)) return {};
  const clamp = (n: number) =>
    Math.round(Math.min(1 + ROLL_ACCEPT, Math.max(1 - ROLL_ACCEPT, n)) * 1000) / 1000;
  if (!isGearType(type)) return { roll: clamp(roll) };
  const seen = new Set<string>();
  const out: GearLine[] = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const stat = (l as GearLine | null)?.stat;
    const r = (l as GearLine | null)?.roll;
    if (
      stat === undefined ||
      out.length >= maxLines(rarity) ||
      !(
        (LINE_POOL[type] as readonly string[]).includes(stat) ||
        (hasCapstone(rarity) && stat === CAPSTONE[type])
      ) ||
      seen.has(stat) ||
      typeof r !== "number" ||
      !Number.isFinite(r)
    )
      continue;
    seen.add(stat);
    out.push({ stat, roll: clamp(r) });
  }
  return { roll: clamp(roll), lines: out };
}

// Overall quality of a roll set (to keep the best of two duplicates).
export const rollQuality = (r: { roll?: number; lines?: GearLine[] }): number =>
  (r.roll ?? 1) + (r.lines ?? []).reduce((s, l) => s + l.roll, 0);

// Pieces saved before rolls existed: stable lines derived from their identity.
function legacyRoll(p: WornPiece): { roll: number; lines: GearLine[] } {
  if (!isGearType(p.type)) return { roll: 1, lines: [] };
  const rng = createRng(
    hashSeed(
      WEAPON_TYPES.indexOf(p.type),
      RARITY_IDS.indexOf(p.rarity),
      ELEMENTS.indexOf(p.element ?? "fuego"),
      9301,
    ),
  );
  const { lines } = rollGear(rng, p.type, p.rarity);
  return { roll: 1, lines: lines.map((l) => ({ ...l, roll: 1 })) };
}

// Gear grows faster with rank than heroes do (the old rank mult ^ 1.25, as a table so no `**`
// runs in the engine) and SSR stands clearly above SS: worst SSR roll beats best SS roll.
// Stars add milestones: +10% at 3 stars, +20% at 5.
export const GEAR_RANK_MULT: Record<RarityId, number> = {
  f: 1,
  e: 1.191,
  d: 1.388,
  c: 1.66,
  b: 2.013,
  a: 2.378,
  s: 3.4,
};
// Global knob for patches: scales every piece bonus (base and extra lines).
export const GEAR_SCALE = 0.5;
export const gearMult = (rarity: RarityId, stars: number): number =>
  GEAR_RANK_MULT[rarity] *
  starMult(stars) *
  (stars >= 5 ? 1.2 : stars >= 3 ? 1.1 : 1);
// Caps on the sum of all pieces (a full SSR 5-star set saturates a little).
export const GEAR_CAP: GearBonus = {
  atk: 0.75,
  hp: 1.25,
  def: 0.8,
  speed: 0.45,
  resist: 0.2,
  crit: 0.3,
  accuracy: 0.2,
  critDmg: 0.5,
  regen: 0.02,
  lifesteal: 0.15,
  dmgTaken: 0.25,
  dmgDealt: 0.25,
};

// Mejorar (+N): each level adds this share of a piece's own stats (docs/FORJA_V9.md).
export const PLUS_BONUS_PER_LEVEL = 0.04;
export const plusFactor = (plus = 0) => 1 + PLUS_BONUS_PER_LEVEL * plus;

export interface WornPiece {
  type: WeaponType;
  rarity: RarityId;
  stars: number;
  element?: Element;
  roll?: number;
  lines?: GearLine[];
  plus?: number; // Mejorar level: x(1 + PLUS_BONUS_PER_LEVEL * plus) before the cap
}

const KEYS = Object.keys(NO_GEAR) as GearKey[];
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Sum of one piece's lines (uncapped), including its Mejorar (+N) bonus.
function pieceBonus(p: WornPiece): GearBonus {
  const out = { ...NO_GEAR };
  if (!isGearType(p.type)) return out;
  const m = gearMult(p.rarity, p.stars) * GEAR_SCALE;
  const own = p.roll !== undefined || p.lines ? p : { ...p, ...legacyRoll(p) };
  for (const [k, v] of Object.entries(GEAR_BASE[p.type]))
    out[k as GearKey] += (v as number) * m * (own.roll ?? 1);
  for (const l of own.lines ?? []) out[l.stat] += LINE_BASE[l.stat] * m * l.roll;
  const f = plusFactor(p.plus);
  if (f !== 1) for (const k of KEYS) out[k] *= f;
  return out;
}

export function gearBonus(pieces: readonly WornPiece[]): GearBonus {
  const sum = { ...NO_GEAR };
  for (const p of pieces) {
    const b = pieceBonus(p);
    for (const k of KEYS) sum[k] += b[k];
  }
  for (const k of KEYS) sum[k] = round3(Math.min(sum[k], GEAR_CAP[k]));
  return sum;
}

export const applyGear = (s: Stats, g: GearBonus): Stats => ({
  ...s,
  atk: Math.round(s.atk * (1 + (g.atk ?? 0)) * 10) / 10,
  hp: Math.max(1, Math.round(s.hp * (1 + g.hp))),
  def: Math.round(s.def * (1 + g.def) * 10) / 10,
  speed: Math.round(s.speed * (1 + g.speed) * 10) / 10,
  resist: Math.round(Math.min(0.6, s.resist + g.resist) * 1000) / 1000,
  crit: Math.round(Math.min(0.6, s.crit + g.crit) * 1000) / 1000,
  accuracy: Math.round((s.accuracy + g.accuracy) * 1000) / 1000,
  critDmg: Math.round((s.critDmg + g.critDmg) * 1000) / 1000,
  regen: round3(s.regen + g.regen),
  lifesteal: round3(s.lifesteal + g.lifesteal),
});

const bonusText = (g: GearBonus): string => {
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return [
    g.atk && `+${pct(g.atk)} ATQ`,
    g.hp && `+${pct(g.hp)} vida`,
    g.def && `+${pct(g.def)} DEF`,
    g.speed && `+${pct(g.speed)} velocidad`,
    g.resist && `+${pct(g.resist)} resistencia a estados`,
    g.crit && `+${pct(g.crit)} crítico`,
    g.accuracy && `+${pct(g.accuracy)} precisión`,
    g.critDmg && `+${pct(g.critDmg)} daño crítico`,
    g.regen && `+${pct(g.regen)} regeneración`,
    g.lifesteal && `+${pct(g.lifesteal)} robo de vida`,
    g.dmgTaken && `-${pct(g.dmgTaken)} daño recibido`,
    g.dmgDealt && `+${pct(g.dmgDealt)} daño`,
  ]
    .filter(Boolean)
    .join(" · ");
};

// Short Spanish description of one piece, e.g. "+10% vida · +5% DEF".
export const gearLine = (p: WornPiece): string => bonusText(gearBonus([p]));

// Sum of two gear bonuses, capped like gearBonus (worn gear + run loot).
export function combineGear(a: GearBonus, b: GearBonus): GearBonus {
  const out = { ...NO_GEAR };
  for (const k of KEYS) out[k] = round3(Math.min((a[k] ?? 0) + (b[k] ?? 0), GEAR_CAP[k]));
  return out;
}

// Stats already include `base` gear; swap it for `total` (run loot adds to it).

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
  rayo: [
    { crit: 0.03, critDmg: 0.03 },
    { crit: 0.06, critDmg: 0.06 },
    { crit: 0.09, critDmg: 0.09 },
  ],
  fuego: [{ atk: 0.06 }, { atk: 0.12 }, { atk: 0.18 }],
  agua: [
    { hp: 0.08, regen: 0.002 },
    { hp: 0.16, regen: 0.004 },
    { hp: 0.24, regen: 0.006 },
  ],
  tierra: [{ def: 0.08 }, { def: 0.16 }, { def: 0.24 }],
  viento: [
    { speed: 0.05, resist: 0.015 },
    { speed: 0.1, resist: 0.03 },
    { speed: 0.15, resist: 0.045 },
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

// ---- Style resonance ----
// Extra lines of the worn gear are grouped into 4 builds. A group holding a large
// share of the lines gives a bonus (no new pieces or tags needed). x1.5 when the
// group matches the hero's style (its chosen third skill).
export type BuildGroup = "tanque" | "dano" | "critico" | "sosten";
export const BUILD_GROUPS: readonly BuildGroup[] = [
  "tanque",
  "dano",
  "critico",
  "sosten",
];
export const BUILD_LABEL: Record<BuildGroup, string> = {
  tanque: "Tanque",
  dano: "Daño",
  critico: "Crítico y resistencia",
  sosten: "Sostén",
};
export const LINE_GROUP: Record<LineStat, BuildGroup> = {
  hp: "tanque",
  def: "tanque",
  atk: "dano",
  accuracy: "dano",
  speed: "dano",
  crit: "critico",
  critDmg: "critico",
  resist: "critico",
  regen: "sosten",
  lifesteal: "sosten",
  dmgTaken: "tanque",
  dmgDealt: "dano",
};
// Share of lines needed for the small / large bonus, and the bonuses.
export const RESONANCE_SHARE: Record<BuildGroup, [number, number]> = {
  tanque: [0.4, 0.6],
  dano: [0.4, 0.6],
  critico: [0.4, 0.6],
  sosten: [0.3, 0.5],
};
export const RESONANCE_MIN_LINES = 2;
export const RESONANCE_BONUS: Record<BuildGroup, [Partial<GearBonus>, Partial<GearBonus>]> = {
  tanque: [{ dmgTaken: 0.04 }, { dmgTaken: 0.08 }],
  dano: [{ dmgDealt: 0.05 }, { dmgDealt: 0.1 }],
  critico: [{ critDmg: 0.1 }, { critDmg: 0.2 }],
  sosten: [{ regen: 0.005 }, { regen: 0.01 }],
};
export const RESONANCE_STYLE_MULT = 1.5;

const linesOf = (p: WornPiece): GearLine[] =>
  !isGearType(p.type)
    ? []
    : p.roll !== undefined || p.lines
      ? (p.lines ?? [])
      : legacyRoll(p).lines;

export function lineCounts(pieces: readonly WornPiece[]): Record<BuildGroup, number> {
  const out: Record<BuildGroup, number> = { tanque: 0, dano: 0, critico: 0, sosten: 0 };
  for (const p of pieces) for (const l of linesOf(p)) out[LINE_GROUP[l.stat]]++;
  return out;
}

export interface Resonance {
  group: BuildGroup;
  tier: 1 | 2;
  styled: boolean;
  bonus: GearBonus;
}

export function resonances(
  pieces: readonly WornPiece[],
  styleGroup?: BuildGroup,
): Resonance[] {
  const counts = lineCounts(pieces);
  const total = BUILD_GROUPS.reduce((s, g) => s + counts[g], 0);
  const out: Resonance[] = [];
  for (const g of BUILD_GROUPS) {
    if (counts[g] < RESONANCE_MIN_LINES || total === 0) continue;
    const share = counts[g] / total;
    const [lo, hi] = RESONANCE_SHARE[g];
    const tier = share >= hi ? 2 : share >= lo ? 1 : 0;
    if (!tier) continue;
    const styled = g === styleGroup;
    const bonus = { ...NO_GEAR };
    for (const [k, v] of Object.entries(RESONANCE_BONUS[g][tier - 1]))
      bonus[k as GearKey] = round3((v as number) * (styled ? RESONANCE_STYLE_MULT : 1));
    out.push({ group: g, tier: tier as 1 | 2, styled, bonus });
  }
  return out;
}

export const resonanceBonus = (rs: readonly Resonance[]): GearBonus =>
  rs.reduce((acc, r) => combineGear(acc, r.bonus), NO_GEAR);

// Automatic build tag: the group whose stats weigh most in the worn gear (main
// stats and extra lines both count). null with no gear.
export function buildLabel(pieces: readonly WornPiece[]): BuildGroup | null {
  const counts = lineCounts(pieces);
  for (const p of pieces)
    if (isGearType(p.type))
      for (const k of Object.keys(GEAR_BASE[p.type]) as LineStat[])
        counts[LINE_GROUP[k]]++;
  const best = BUILD_GROUPS.reduce((a, g) => (counts[g] > counts[a] ? g : a));
  return counts[best] > 0 ? best : null;
}

// Hero style (third skill) -> build group it favours.
export const SKILL_STYLE_GROUP: Record<string, BuildGroup> = {
  contraataque: "tanque",
  detonar: "dano",
  barrido: "dano",
  tormenta: "dano",
  golpeDoble: "critico",
  ejecutar: "critico",
  santuario: "sosten",
  castigo: "sosten",
};

// "Resonancia Tanque II: -8% daño recibido (estilo ×1.5)"
export const resonanceLine = (r: Resonance): string =>
  `Resonancia ${BUILD_LABEL[r.group]} ${r.tier === 2 ? "II" : "I"}: ${bonusText(r.bonus)}${r.styled ? ` (estilo ×${RESONANCE_STYLE_MULT})` : ""}`;
