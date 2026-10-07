// Pure mapping of game objects to display models (no React, relative imports).
import type { ItemView } from "../components/ItemCard";
import type { ClassId, Stats } from "./game/characters";
import type { OwnedCharacter, OwnedWeapon, PullResult } from "./game/profile";
import { RARITIES, RARITY_IDS, scaleStats, type RarityId } from "./game/rarity";
import { gearBonus, gearLine, type GearBonus } from "./game/gear";
import { WEAPON_TYPE_DATA, isGearType } from "./game/weapons";

export const statLine = (s: Stats) =>
  `PV ${Math.round(s.hp)} · ATQ ${s.atk} · DEF ${s.def}`;

export function characterView(
  c: OwnedCharacter,
  opts: { stats?: Stats; badge?: string; lines?: string[] } = {},
): ItemView {
  const stats = opts.stats ?? scaleStats(c.stats, c.rarity, c.stars);
  return {
    kind: "character",
    name: c.name,
    rarity: c.rarity,
    stars: c.stars,
    element: c.element,
    classId: c.classId,
    traits: c.traits,
    lines: [statLine(stats), ...(opts.lines ?? [])],
    badge: opts.badge,
  };
}

export const pieceLine = (w: OwnedWeapon) =>
  isGearType(w.type) ? gearLine(w) : `ATQ +${w.atkBonus}`;

// How a candidate piece differs from the one worn in the same slot (what you gain or
// lose by swapping). Empty when the slot is empty; "same" when every bonus matches.
export interface PieceDiff {
  text: string;
  good: boolean | null;
}
const DIFF_LABEL: Record<keyof GearBonus, string> = {
  atk: "ATQ",
  hp: "vida",
  def: "DEF",
  speed: "velocidad",
  dodge: "esquive",
  crit: "crítico",
  accuracy: "precisión",
};
export function pieceDelta(
  w: OwnedWeapon,
  worn: OwnedWeapon | undefined,
): PieceDiff[] {
  if (!worn) return [];
  const out: PieceDiff[] = [];
  const add = (d: number, label: string, unit = "") => {
    if (d === 0) return;
    out.push({
      text: `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit} ${label}`,
      good: d > 0,
    });
  };
  if (isGearType(w.type) && isGearType(worn.type)) {
    const a = gearBonus([w]);
    const b = gearBonus([worn]);
    for (const k of Object.keys(DIFF_LABEL) as (keyof GearBonus)[])
      add(Math.round((a[k] - b[k]) * 1000) / 10, DIFF_LABEL[k], "%");
  } else if (!isGearType(w.type) && !isGearType(worn.type)) {
    add(Math.round((w.atkBonus - worn.atkBonus) * 10) / 10, "ATQ");
  }
  return out.length ? out : [{ text: "Igual que la equipada", good: null }];
}

export const weaponEffect = (w: OwnedWeapon) =>
  `${WEAPON_TYPE_DATA[w.type].label}: ${WEAPON_TYPE_DATA[w.type].description}`;

export function weaponView(
  w: OwnedWeapon,
  opts: { badge?: string; lines?: string[] } = {},
): ItemView {
  return {
    kind: "weapon",
    name: w.name,
    type: w.type,
    rarity: w.rarity,
    stars: w.stars,
    element: w.element,
    lines: [pieceLine(w), ...(opts.lines ?? [])],
    badge: opts.badge,
  };
}

export function resultView(r: PullResult): ItemView | null {
  const badge =
    r.status === "refund"
      ? `REEMBOLSO +${r.refund}`
      : r.status === "star"
        ? "+1 ★"
        : "NUEVO";
  const lines = r.fragmentGain ? ["+1 fragmento"] : [];
  if (r.character) return characterView(r.character, { badge, lines });
  if (r.weapon) return weaponView(r.weapon, { badge, lines });
  return null;
}

export const resultViews = (rs: PullResult[]): ItemView[] =>
  rs.flatMap((r) => resultView(r) ?? []);

export function summarizePull(rs: PullResult[]): string {
  const n = (f: (r: PullResult) => boolean) => rs.filter(f).length;
  const best = rs.reduce<RarityId>(
    (b, r) =>
      RARITY_IDS.indexOf(r.rarity) > RARITY_IDS.indexOf(b) ? r.rarity : b,
    "f",
  );
  const frags = rs.reduce((a, r) => a + r.fragmentGain, 0);
  const refund = rs.reduce((a, r) => a + r.refund, 0);
  return [
    `${n((r) => r.status === "new")} nuevos`,
    `${n((r) => r.status === "star")} estrellas`,
    ...(frags ? [`${frags} fragmentos`] : []),
    ...(refund ? [`${refund} monedas de reembolso`] : []),
    `Mejor: ${RARITIES[best].label}`,
  ].join(" · ");
}

export interface CollectionFilter {
  classId: ClassId | "all";
  rarity: RarityId | "all";
  sort: "rarity" | "stars";
}

// Highest first; ties by the other key, then name (stable and deterministic).
export function filterSortCharacters(
  list: OwnedCharacter[],
  f: CollectionFilter,
): OwnedCharacter[] {
  const r = (c: OwnedCharacter) => RARITY_IDS.indexOf(c.rarity);
  const key = (c: OwnedCharacter) =>
    f.sort === "rarity" ? r(c) * 10 + c.stars : c.stars * 10 + r(c);
  return list
    .filter(
      (c) =>
        (f.classId === "all" || c.classId === f.classId) &&
        (f.rarity === "all" || c.rarity === f.rarity),
    )
    .sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name));
}
