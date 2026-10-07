// Forge materials (docs/DUNGEONS_FORJA.md): one part per item type and rank
// ("Hoja de espada" F, "Placa de peto" S...) and one core per element.
// Dungeons drop them; the forge (next stage) turns them into gear.
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { WEAPON_TYPES, type WeaponType } from "./weapons";

// Stock: key -> quantity. Keys: `p-${type}-${rank}` and `core-${element}`.
export type Parts = Record<string, number>;
export const MAX_STACK = 9999;

export const partKey = (type: WeaponType, rank: RarityId) =>
  `p-${type}-${rank}`;
export const coreKey = (element: Element) => `core-${element}`;

const PART_RE = new RegExp(
  `^p-(${WEAPON_TYPES.join("|")})-(${RARITY_IDS.join("|")})$`,
);
const CORE_RE = new RegExp(`^core-(${ELEMENTS.join("|")})$`);
export const isPartKey = (k: string) => PART_RE.test(k) || CORE_RE.test(k);

export type PartInfo =
  | { kind: "part"; type: WeaponType; rank: RarityId }
  | { kind: "core"; element: Element };
export function parsePartKey(k: string): PartInfo | null {
  const p = PART_RE.exec(k);
  if (p)
    return { kind: "part", type: p[1] as WeaponType, rank: p[2] as RarityId };
  const c = CORE_RE.exec(k);
  return c ? { kind: "core", element: c[1] as Element } : null;
}

const PART_NAME: Record<WeaponType, string> = {
  espada: "Hoja de espada",
  hacha: "Filo de hacha",
  lanza: "Punta de lanza",
  arco: "Cuerda de arco",
  baston: "Mango de bastón",
  daga: "Hoja de daga",
  maza: "Cabeza de maza",
  varita: "Madera de varita",
  libro: "Páginas de libro",
  casco: "Placa de casco",
  peto: "Placa de peto",
  piernas: "Placa de piernas",
  zapatos: "Suela de zapatos",
  collar: "Eslabón de collar",
};

export function partLabel(k: string): string {
  const i = parsePartKey(k);
  if (!i) return k;
  return i.kind === "core"
    ? `Núcleo de ${ELEMENT_LABEL[i.element]}`
    : `${PART_NAME[i.type]} ${RARITIES[i.rank].label}`;
}

export const addParts = (a: Parts, b: Parts): Parts => {
  const out = { ...a };
  for (const [k, n] of Object.entries(b))
    out[k] = Math.min(MAX_STACK, (out[k] ?? 0) + n);
  return out;
};
export const partCount = (p: Parts) =>
  Object.values(p).reduce((s, n) => s + n, 0);
