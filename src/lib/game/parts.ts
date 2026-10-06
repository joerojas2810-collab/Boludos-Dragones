// Forge materials (docs/DUNGEONS_FORJA.md): one part per item type and rank
// ("Hoja de espada" F, "Placa de peto" S...) and one core per element.
// Dungeons drop them; the forge (next stage) turns them into gear.
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { lootRank } from "./loot";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
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
const one = (k: string): Parts => ({ [k]: 1 });

// Tune here.
export const PART_DROPS = {
  easy: { chance: 0.25, parts: 1, cores: 0 },
  hard: { chance: 0.4, parts: 1, cores: 0 },
  boss: { chance: 1, parts: 2, cores: 1 },
  finalBoss: { chance: 1, parts: 3, cores: 2 }, // + one rank step
  chest: { chance: 1, parts: 1, coreChance: 0.25 },
} as const;

function rollPart(
  rng: Rng,
  floor: number,
  rank: RarityId | null,
  bonus: number,
) {
  return partKey(rng.pick(WEAPON_TYPES), lootRank(rng, floor, bonus, rank));
}

function rollCore(rng: Rng, worldElement: Element): Parts {
  return one(coreKey(rng.chance(0.6) ? worldElement : rng.pick(ELEMENTS)));
}

export type DropSource = "easy" | "hard" | "boss" | "finalBoss" | "chest";

// What a node drops. Deterministic in (seed, floor, salt).
export function rollDrops(
  source: DropSource,
  seed: number,
  floor: number,
  salt: number,
  rank: RarityId | null,
  worldElement: Element,
): Parts {
  const rng = createRng(hashSeed(seed, floor, 80, salt));
  const bonus = source === "finalBoss" ? 1 : 0;
  let out: Parts = {};
  if (source === "chest") {
    const d = PART_DROPS.chest;
    out = addParts(out, one(rollPart(rng, floor, rank, bonus)));
    if (rng.chance(d.coreChance))
      out = addParts(out, rollCore(rng, worldElement));
    return out;
  }
  const d = PART_DROPS[source];
  if (!rng.chance(d.chance)) return out;
  for (let i = 0; i < d.parts; i++)
    out = addParts(out, one(rollPart(rng, floor, rank, bonus)));
  const cores = "cores" in d ? d.cores : 0;
  for (let i = 0; i < cores; i++)
    out = addParts(out, rollCore(rng, worldElement));
  return out;
}
