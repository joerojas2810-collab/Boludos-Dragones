import type { Stats } from "./characters";
import { levelMult } from "./heroLevel";
import type { Rng } from "./rng";

// Ranks, weakest to strongest. Ids are the stored keys (c-mago-fuego-f).
export const RARITY_IDS = [
  "f",
  "e",
  "d",
  "c",
  "b",
  "a",
  "s",
] as const;
export type RarityId = (typeof RARITY_IDS)[number];

// Dungeon tiers: nine difficulty levels. Their ids keep the old rank names (stored in the
// database and in progress), but items only come in RARITY_IDS: tiers above S drop S.
export const DUNGEON_IDS = [...RARITY_IDS, "ss", "ssr"] as const;
export type DungeonId = (typeof DUNGEON_IDS)[number];
export const isDungeonId = (v: unknown): v is DungeonId =>
  typeof v === "string" && (DUNGEON_IDS as readonly string[]).includes(v);
// Label and colour of a dungeon tier (RARITIES covers only the item ranks).
export const DUNGEON_INFO: Record<DungeonId, { label: string; color: string }> = {
  f: { label: "F", color: "#9ca3af" }, e: { label: "E", color: "#4ade80" },
  d: { label: "D", color: "#2dd4bf" }, c: { label: "C", color: "#60a5fa" },
  b: { label: "B", color: "#818cf8" }, a: { label: "A", color: "#c084fc" },
  s: { label: "S", color: "#fbbf24" }, ss: { label: "SS", color: "#fb923c" },
  ssr: { label: "SSR", color: "#f43f5e" },
};
// Rank of the items a dungeon drops.
export const itemRankOf = (d: DungeonId): RarityId =>
  d === "ss" || d === "ssr" ? "s" : d;
// Enemy strength multiplier of a tier (kept from the nine-rank scale: RANK_TUNE is calibrated on it).
export const DUNGEON_MULT: Record<DungeonId, number> = {
  f: 1.0, e: 1.15, d: 1.3, c: 1.5, b: 1.75, a: 2.0, s: 2.35, ss: 2.65, ssr: 3.0,
};

export interface RarityInfo {
  label: string;
  color: string; // hex, for UI
  probability: number; // base pull probability (sums to 1)
  multiplier: number; // stat multiplier
}

// Tune here.
export const RARITIES: Record<RarityId, RarityInfo> = {
  f: { label: "F", color: "#9ca3af", probability: 0.31, multiplier: 1.0 },
  e: { label: "E", color: "#4ade80", probability: 0.225, multiplier: 1.15 },
  d: { label: "D", color: "#2dd4bf", probability: 0.165, multiplier: 1.3 },
  c: { label: "C", color: "#60a5fa", probability: 0.12, multiplier: 1.5 },
  b: { label: "B", color: "#818cf8", probability: 0.09, multiplier: 1.75 },
  a: { label: "A", color: "#c084fc", probability: 0.06, multiplier: 2.0 },
  s: { label: "S", color: "#fbbf24", probability: 0.03, multiplier: 2.6 },
};

// Old 5-rarity ids (saved profiles, DB rows) -> new rank. See docs/DUNGEONS_FORJA.md.
export const LEGACY_RARITY: Record<string, RarityId> = {
  comun: "f",
  pococomun: "d",
  raro: "c",
  epico: "a",
  legendario: "s",
};

export const MAX_STARS = 5;
export const STAR_BONUS = 0.1; // per star, multiplicative over the rarity mult

// Rank at or above S: gets the animated gold frame and the big pull reveal.
export const isTopRank = (r: RarityId) =>
  RARITY_IDS.indexOf(r) >= RARITY_IDS.indexOf("s");

export const isRarity = (v: unknown): v is RarityId =>
  typeof v === "string" && (RARITY_IDS as readonly string[]).includes(v);

// Accepts a rank id or a legacy 5-rarity id; null when unknown.
export const toRank = (v: unknown): RarityId | null =>
  isRarity(v) ? v : typeof v === "string" ? (LEGACY_RARITY[v] ?? null) : null;

export const starMult = (stars: number) => 1 + STAR_BONUS * stars;
export const itemMult = (rarity: RarityId, stars: number) =>
  RARITIES[rarity].multiplier * starMult(stars);

// Effective stats of an item: only hp/atk/def scale; the rest is unchanged.
export function scaleStats(
  s: Stats,
  rarity: RarityId,
  stars: number,
  level = 1,
): Stats {
  const m = itemMult(rarity, stars) * levelMult(level);
  return {
    ...s,
    hp: Math.max(1, Math.round(s.hp * m)),
    atk: Math.round(s.atk * m * 10) / 10,
    def: Math.round(s.def * m * 10) / 10,
  };
}

// Always consumes exactly one rng value (stable streams). Resolve server-side. No pity.
export function rollRarity(rng: Rng): RarityId {
  const r = rng.next();
  let acc = 0;
  for (const id of RARITY_IDS) {
    acc += RARITIES[id].probability;
    if (r < acc) return id;
  }
  return "f";
}
