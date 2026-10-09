// Pure mapping of game objects to display models (no React, relative imports).
import type { ItemView } from "../components/ItemCard";
import { ELEMENT_LABEL } from "./game/elements";
import type { Tip } from "./game/explain";
import type { ClassId, Stats } from "./game/characters";
import type { OwnedCharacter, OwnedWeapon, PullResult } from "./game/profile";
import { RARITIES, RARITY_IDS, scaleStats, type RarityId } from "./game/rarity";
import { gearBonus, gearLine, type GearBonus } from "./game/gear";
import { WEAPON_TYPE_DATA, isGearType, type WeaponType } from "./game/weapons";

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

// Average of a piece's rolls as a percent (100% = neutral); null for pieces saved before rolls.
export const rollPct = (w: OwnedWeapon): number | null =>
  w.roll === undefined
    ? null
    : Math.round(
        ((w.roll + (w.lines ?? []).reduce((s, l) => s + l.roll, 0)) /
          (1 + (w.lines?.length ?? 0))) *
          100,
      );

export const pieceLine = (w: OwnedWeapon) =>
  (isGearType(w.type) ? gearLine(w) : `ATQ +${w.atkBonus}`) +
  (rollPct(w) === null ? "" : ` · tirada ${rollPct(w)}%`);

// Extra lines of a piece with their value, e.g. "+1.9% crítico".
export function extraLinesText(w: OwnedWeapon): string[] {
  if (!isGearType(w.type)) return [];
  const bare = gearBonus([{ ...w, lines: [] }]);
  return (w.lines ?? []).map((l) => {
    const v = gearBonus([{ ...w, lines: [l] }])[l.stat] - bare[l.stat];
    return `+${Math.round(v * 1000) / 10}% ${DIFF_LABEL[l.stat]}`;
  });
}

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
  resist: "resistencia a estados",
  crit: "crítico",
  accuracy: "precisión",
  critDmg: "daño crítico",
  regen: "regeneración",
  lifesteal: "robo de vida",
  dmgTaken: "daño recibido",
  dmgDealt: "daño",
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
      : r.status === "copy"
        ? "+1 COPIA"
        : r.status === "star"
          ? "+1 ★"
          : "NUEVO";
  if (r.character) return characterView(r.character, { badge });
  if (r.weapon) return weaponView(r.weapon, { badge });
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
  const refund = rs.reduce((a, r) => a + r.refund, 0);
  return [
    `${n((r) => r.status === "new")} nuevos`,
    `${n((r) => r.status === "copy")} copias`,
    `${n((r) => r.status === "star")} estrellas`,
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

// Hover/tap card of one piece: what it gives and what sets it apart from the others of its slot.
// "Es tu Ataque 3: ..." for hand weapons; undefined for armor.
export const specialLine = (type: WeaponType): string | undefined => {
  const sp = isGearType(type) ? undefined : WEAPON_TYPE_DATA[type].special;
  return (
    sp &&
    `Es tu Ataque 3: ${sp.name} (poder ×${sp.power}, acierto ${Math.round(sp.accuracy * 100)}%, recarga ${sp.cooldown}${sp.heal ? `, cura ${Math.round(sp.heal * 100)}%` : ""}${sp.selfCost ? `, cuesta ${Math.round(sp.selfCost * 100)}% de tu vida actual` : ""}).`
  );
};

export function pieceTip(w: OwnedWeapon): Tip {
  const info = WEAPON_TYPE_DATA[w.type];
  const sgn = (v: number) => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`);
  const lines: string[] = [];
  if (isGearType(w.type)) {
    lines.push(pieceLine(w));
    for (const l of extraLinesText(w)) lines.push(`Línea extra: ${l}`);
    lines.push(info.description);
  } else {
    lines.push(`Ataque +${w.atkBonus}${rollPct(w) === null ? "" : ` · tirada ${rollPct(w)}%`}`);
    lines.push(`${info.label}: ${info.description}`);
    const sp = specialLine(w.type);
    if (sp) lines.push(sp);
    const mods: string[] = [];
    if (info.atkMult !== 1) mods.push(`daño ×${info.atkMult}`);
    if (info.accuracy) mods.push(`${sgn(info.accuracy)} puntos de precisión`);
    if (info.crit) mods.push(`${sgn(info.crit)} puntos de crítico`);
    if (info.speedMult !== 1) mods.push(`velocidad ×${info.speedMult}`);
    if (mods.length) lines.push(`Efecto del tipo: ${mods.join(", ")}.`);
    lines.push(`Su elemento (${ELEMENT_LABEL[w.element]}) pasa a ser el de tus ataques.`);
  }
  lines.push(`${w.stars}★: cada estrella mejora la pieza. Piezas del mismo elemento forman set (2, 4 y 6).`);
  return { title: `${w.name} · ${RARITIES[w.rarity].label}`, kind: "info", lines, color: RARITIES[w.rarity].color };
}

// Card of a piece TYPE at a given rank and element (forge pickers, before anything exists).
