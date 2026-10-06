import type { Stats } from "./characters";
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
  "ss",
  "ssr",
] as const;
export type RarityId = (typeof RARITY_IDS)[number];

export interface RarityInfo {
  label: string;
  color: string; // hex, for UI
  probability: number; // base pull probability (sums to 1)
  multiplier: number; // stat multiplier
}

// Tune here.
export const RARITIES: Record<RarityId, RarityInfo> = {
  f: { label: "F", color: "#9ca3af", probability: 0.3, multiplier: 1.0 },
  e: { label: "E", color: "#4ade80", probability: 0.22, multiplier: 1.1 },
  d: { label: "D", color: "#2dd4bf", probability: 0.16, multiplier: 1.2 },
  c: { label: "C", color: "#60a5fa", probability: 0.12, multiplier: 1.3 },
  b: { label: "B", color: "#818cf8", probability: 0.09, multiplier: 1.45 },
  a: { label: "A", color: "#c084fc", probability: 0.06, multiplier: 1.6 },
  s: { label: "S", color: "#fbbf24", probability: 0.03, multiplier: 1.8 },
  ss: { label: "SS", color: "#fb923c", probability: 0.015, multiplier: 2.05 },
  ssr: { label: "SSR", color: "#f43f5e", probability: 0.005, multiplier: 2.3 },
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
// Pity counters (per banner): `pity` = pulls since the last SS or better, and
// at PITY_THRESHOLD the pull is guaranteed to be at least SS; `pitySsr` = pulls
// since the last SSR, guaranteeing SSR at PITY_SSR_THRESHOLD.
export const PITY_THRESHOLD = 100;
export const PITY_SSR_THRESHOLD = 200;

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
export function scaleStats(s: Stats, rarity: RarityId, stars: number): Stats {
  const m = itemMult(rarity, stars);
  return {
    ...s,
    hp: Math.max(1, Math.round(s.hp * m)),
    atk: Math.round(s.atk * m * 10) / 10,
    def: Math.round(s.def * m * 10) / 10,
  };
}

// Always consumes exactly one rng value (stable streams). Resolve server-side.
export function rollRarity(
  rng: Rng,
  pity: number,
  pitySsr = 0,
): { rarity: RarityId; pityTriggered: boolean } {
  const r = rng.next();
  if (pitySsr >= PITY_SSR_THRESHOLD)
    return { rarity: "ssr", pityTriggered: true };
  let rolled: RarityId = "f";
  let acc = 0;
  for (const id of RARITY_IDS) {
    acc += RARITIES[id].probability;
    if (r < acc) {
      rolled = id;
      break;
    }
  }
  if (
    pity >= PITY_THRESHOLD &&
    RARITY_IDS.indexOf(rolled) < RARITY_IDS.indexOf("ss")
  )
    return { rarity: "ss", pityTriggered: true };
  return { rarity: rolled, pityTriggered: false };
}
