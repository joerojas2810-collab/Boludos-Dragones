import type { Stats } from "./characters";
import type { Rng } from "./rng";

export const RARITY_IDS = [
  "comun",
  "pococomun",
  "raro",
  "epico",
  "legendario",
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
  comun: {
    label: "Común",
    color: "#9ca3af",
    probability: 0.5,
    multiplier: 1.0,
  },
  pococomun: {
    label: "Poco común",
    color: "#4ade80",
    probability: 0.28,
    multiplier: 1.15,
  },
  raro: { label: "Raro", color: "#60a5fa", probability: 0.14, multiplier: 1.3 },
  epico: {
    label: "Épico",
    color: "#a78bfa",
    probability: 0.06,
    multiplier: 1.5,
  },
  legendario: {
    label: "Legendario",
    color: "#fbbf24",
    probability: 0.02,
    multiplier: 1.8,
  },
};

export const MAX_STARS = 5;
export const STAR_BONUS = 0.1; // per star, multiplicative over the rarity mult
// Pulls without a Legendario before the next one is guaranteed.
// Counter semantics: pity = pulls since the last Legendario; when pity >= 30
// the pull (the 31st) is a guaranteed Legendario.
export const PITY_THRESHOLD = 30;

export const isRarity = (v: unknown): v is RarityId =>
  typeof v === "string" && (RARITY_IDS as readonly string[]).includes(v);

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
): { rarity: RarityId; pityTriggered: boolean } {
  const r = rng.next();
  if (pity >= PITY_THRESHOLD)
    return { rarity: "legendario", pityTriggered: true };
  let acc = 0;
  for (const id of RARITY_IDS) {
    acc += RARITIES[id].probability;
    if (r < acc) return { rarity: id, pityTriggered: false };
  }
  return { rarity: "comun", pityTriggered: false };
}
