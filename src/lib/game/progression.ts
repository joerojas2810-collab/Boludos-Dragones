import type { Character, Stats } from "./characters";
import { makePow } from "./powTable";
import type { Rng } from "./rng";

export const XP_PER_WIN = 35;
export const SCALE_PER_LEVEL = 1.12; // sandbox enemies (scaleForLevel)
// Run enemies: power = base * FLOOR_SCALE ^ floor * multiplier.
export const FLOOR_SCALE = 1.21;
export const UPGRADE_CHOICES = 3;

// xp for the next level grows geometrically while fight xp only grows with the
// floor, so levels (and hero power) slow down as the run gets deeper.
export const XP_BASE = 165; // level 2 costs >= 3 easy fights (~57 xp each at floor 1)
export const XP_GROWTH = 1.2; // each level costs 28% more than the previous one
const xpGrowthPow = makePow(XP_GROWTH);
const levelScalePow = makePow(SCALE_PER_LEVEL);
const floorScalePow = makePow(FLOOR_SCALE);
export const xpToNext = (level: number) =>
  Math.round(XP_BASE * xpGrowthPow(level - 1));

type Fx = { k: keyof Stats; v: number };
const PCT_STATS: readonly (keyof Stats)[] = ["hp", "atk", "def", "speed"];
const STAT_LABEL: Record<keyof Stats, string> = {
  hp: "vida",
  atk: "ATQ",
  def: "DEF",
  speed: "velocidad",
  crit: "crítico",
  dodge: "esquive",
  accuracy: "precisión",
  flee: "huida",
};

export interface Upgrade {
  name: string;
  tier: 1 | 2;
  fx: readonly Fx[];
}

const tier1 = (name: string, ...fx: Fx[]): Upgrade => ({ name, tier: 1, fx });
const tier2 = (name: string, ...fx: Fx[]): Upgrade => ({ name, tier: 2, fx });

export const UPGRADES = {
  vida: tier1("Piel de roble", { k: "hp", v: 0.12 }),
  ataque: tier1("Filo afilado", { k: "atk", v: 0.1 }),
  defensa: tier1("Escudo firme", { k: "def", v: 0.12 }),
  critico: tier1("Ojo de águila", { k: "crit", v: 0.05 }),
  esquive: tier1("Pies ligeros", { k: "dodge", v: 0.05 }),
  precision: tier1("Pulso firme", { k: "accuracy", v: 0.05 }),
  velocidad: tier1("Sangre fría", { k: "speed", v: 0.1 }),
  huida: tier1("Buen corredor", { k: "flee", v: 0.1 }),
  furia: tier1("Furia", { k: "atk", v: 0.18 }, { k: "def", v: -0.06 }),
  coloso: tier1("Coloso", { k: "hp", v: 0.2 }, { k: "speed", v: -0.05 }),
  // Tier 2: only offered from TIER2_LEVEL on.
  sed: tier2("Sed de sangre", { k: "atk", v: 0.3 }, { k: "crit", v: 0.06 }),
  dragon: tier2("Piel de dragón", { k: "hp", v: 0.3 }, { k: "def", v: 0.15 }),
  maestria: tier2(
    "Maestría",
    { k: "atk", v: 0.12 },
    { k: "crit", v: 0.08 },
    { k: "accuracy", v: 0.08 },
  ),
  sombra: tier2(
    "Danza de sombras",
    { k: "dodge", v: 0.1 },
    { k: "speed", v: 0.2 },
    { k: "flee", v: 0.05 },
  ),
  hierro: tier2(
    "Voluntad de hierro",
    { k: "def", v: 0.25 },
    { k: "hp", v: 0.15 },
  ),
} as const satisfies Record<string, Upgrade>;

export type UpgradeId = keyof typeof UPGRADES;
const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
const asUpgrade = (u: Upgrade): Upgrade => u;
const tierIds = (t: 1 | 2) =>
  UPGRADE_IDS.filter((id) => asUpgrade(UPGRADES[id]).tier === t);

// Repeating an upgrade compounds: the n-th repeat gets
// min(UPGRADE_STACK_CAP, 1 + UPGRADE_STACK_STEP * n) times its positive effects.
export const UPGRADE_STACK_STEP = 0.15;
export const UPGRADE_STACK_CAP = 1.75;
export const stackMult = (stacks: number) =>
  Math.min(UPGRADE_STACK_CAP, 1 + UPGRADE_STACK_STEP * stacks);
export const TIER2_LEVEL = 5;
export const TIER2_CHANCE = 0.3; // per offer slot, once level >= TIER2_LEVEL

// Fewer level-ups, each one stronger: every upgrade effect is scaled by UPGRADE_POWER.
export const UPGRADE_POWER = 5.0;
const fxValue = (v: number, stacks: number) =>
  UPGRADE_POWER * (v > 0 ? v * stackMult(stacks) : v);

// Card text: the value the pick gives now, prefixed "xN:" once stacked.
export const upgradeLabel = (id: UpgradeId, stacks = 0): string =>
  `${stacks > 0 ? `x${stacks + 1}: ` : ""}${describeUpgrade(id, stacks)}`;

// UI text with the value the pick would give right now.
export function describeUpgrade(id: UpgradeId, stacks = 0): string {
  return asUpgrade(UPGRADES[id])
    .fx.map(({ k, v }) => {
      const x = fxValue(v, stacks);
      const n = Math.round(Math.abs(x) * 100);
      return `${x < 0 ? "-" : "+"}${n}${PCT_STATS.includes(k) ? "%" : ""} ${STAT_LABEL[k]}`;
    })
    .join(", ");
}

// n distinct upgrades; from `level` TIER2_LEVEL each slot may be a tier 2.
export function rollUpgrades(
  rng: Rng,
  n = UPGRADE_CHOICES,
  level = 1,
): UpgradeId[] {
  const pools = { 1: tierIds(1), 2: tierIds(2) };
  return Array.from({ length: n }, () => {
    const t = level >= TIER2_LEVEL && rng.chance(TIER2_CHANCE) ? 2 : 1;
    const pool = pools[t].length > 0 ? pools[t] : pools[1];
    return pool.splice(rng.int(0, pool.length - 1), 1)[0];
  });
}

export function applyUpgrade(
  char: Character,
  id: UpgradeId,
  stacks = 0,
): Character {
  const stats = { ...char.stats };
  for (const { k, v } of asUpgrade(UPGRADES[id]).fx) {
    const x = fxValue(v, stacks);
    stats[k] = PCT_STATS.includes(k)
      ? k === "hp"
        ? Math.max(1, Math.round(stats[k] * (1 + x))) // hp is always whole
        : Math.round(stats[k] * (1 + x) * 10) / 10
      : Math.min(0.6, Math.max(0, stats[k] + x));
  }
  return { ...char, stats };
}

// Adds xp and levels up as needed. Each level gained means one upgrade pick.
export function gainXp(
  char: Character,
  xp: number,
): { char: Character; levelsGained: number } {
  let level = char.level;
  let total = char.xp + xp;
  while (total >= xpToNext(level)) {
    total -= xpToNext(level);
    level++;
  }
  return {
    char: { ...char, level, xp: total },
    levelsGained: level - char.level,
  };
}

// Enemy power grows 12% per level above 1 (same curve as run floors).
export function scaleForLevel(char: Character, level: number): Character {
  const f = levelScalePow(level - 1);
  const s = char.stats;
  return {
    ...char,
    level,
    stats: {
      ...s,
      hp: Math.round(s.hp * f),
      atk: Math.round(s.atk * f * 10) / 10,
      def: Math.round(s.def * f * 10) / 10,
    },
  };
}

// Run enemies: power = base * FLOOR_SCALE ^ floor * multiplier (hp can take
// its own multiplier to lengthen fights without hitting harder).
export function scaleForFloor(
  char: Character,
  floor: number,
  mult = 1,
  hpMult = mult,
): Character {
  const f = floorScalePow(floor);
  const s = char.stats;
  return {
    ...char,
    level: floor,
    stats: {
      ...s,
      hp: Math.round(s.hp * f * hpMult),
      atk: Math.round(s.atk * f * mult * 10) / 10,
      def: Math.round(s.def * f * mult * 10) / 10,
    },
  };
}
