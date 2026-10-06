import type { Stats } from "./characters";
import type { Rng } from "./rng";

// Fractions (0.15 = +15%) for hp/atk/def/speed; additive for the rest.
export interface RelicMods {
  hp?: number;
  atk?: number;
  def?: number;
  speed?: number;
  crit?: number;
  dodge?: number;
  accuracy?: number;
  flee?: number;
}

export type RelicRarity = "comun" | "rara" | "legendaria";
export const RELIC_RARITIES: readonly RelicRarity[] = [
  "comun",
  "rara",
  "legendaria",
];
// Offer weights per slot; legendaries get RELIC_LEGENDARY_PER_FLOOR extra
// weight per floor (up to RELIC_LEGENDARY_MAX), so deep offers get juicier.
export const RELIC_WEIGHTS: Record<RelicRarity, number> = {
  comun: 62,
  rara: 30,
  legendaria: 6,
};
export const RELIC_LEGENDARY_PER_FLOOR = 0.3;
export const RELIC_LEGENDARY_MAX = 15;

export interface Relic {
  name: string;
  description: string;
  rarity: RelicRarity;
  mods?: RelicMods;
  healAfterFight?: number; // fraction of max hp
  coinBonus?: number; // fraction extra coins
  xpBonus?: number; // fraction extra xp
  startShield?: number; // fraction of max hp as shield at battle start
  freeHits?: number; // enemy attacks evaded at battle start
  lifesteal?: number; // fraction of damage dealt that heals
  critDamage?: number; // added to the crit multiplier
  regen?: number; // fraction of max hp healed per turn in battle
  dmgReduction?: number; // fraction of incoming damage ignored
  dmgMult?: number; // multiplicative: 1.3 = +30% damage dealt
}

export const RELICS = {
  // ---- comunes ----
  colmillo: {
    name: "Colmillo de dragón",
    description: "+15% ATQ",
    rarity: "comun",
    mods: { atk: 0.15 },
  },
  corazon: {
    name: "Corazón de oso",
    description: "+15% vida",
    rarity: "comun",
    mods: { hp: 0.15 },
  },
  coraza: {
    name: "Coraza de bronce",
    description: "+20% DEF",
    rarity: "comun",
    mods: { def: 0.2 },
  },
  lente: {
    name: "Lente del cazador",
    description: "+8 crítico",
    rarity: "comun",
    mods: { crit: 0.08 },
  },
  capa: {
    name: "Capa de sombras",
    description: "+8 esquive",
    rarity: "comun",
    mods: { dodge: 0.08 },
  },
  botas: {
    name: "Botas aladas",
    description: "+15% velocidad, +10 huida",
    rarity: "comun",
    mods: { speed: 0.15, flee: 0.1 },
  },
  piedra: {
    name: "Piedra de afilar",
    description: "+10 precisión",
    rarity: "comun",
    mods: { accuracy: 0.1 },
  },
  bolsa: {
    name: "Bolsa sin fondo",
    description: "+25% monedas",
    rarity: "comun",
    coinBonus: 0.25,
  },
  libro: {
    name: "Libro viejo",
    description: "+30% XP",
    rarity: "comun",
    xpBonus: 0.3,
  },
  guante: {
    name: "Guante de duelista",
    description: "Esquivas el primer golpe de cada pelea",
    rarity: "comun",
    freeHits: 1,
  },
  // ---- raras ----
  caliz: {
    name: "Cáliz sediento",
    description: "Cura 10% de vida tras cada pelea",
    rarity: "rara",
    healAfterFight: 0.1,
  },
  escudo: {
    name: "Escudo rúnico",
    description: "Empiezas cada pelea con escudo (20% de vida)",
    rarity: "rara",
    startShield: 0.2,
  },
  viper: {
    name: "Colmillo de víbora",
    description: "+6 crítico, los críticos pegan +30%",
    rarity: "rara",
    mods: { crit: 0.06 },
    critDamage: 0.3,
  },
  sangre: {
    name: "Anillo de sangre",
    description: "Curas 12% del daño que haces",
    rarity: "rara",
    lifesteal: 0.12,
  },
  placas: {
    name: "Armadura de placas",
    description: "+30% DEF, +10% vida",
    rarity: "rara",
    mods: { def: 0.3, hp: 0.1 },
  },
  estandarte: {
    name: "Estandarte de guerra",
    description: "+25% ATQ, +10% velocidad",
    rarity: "rara",
    mods: { atk: 0.25, speed: 0.1 },
  },
  musgo: {
    name: "Amuleto de musgo",
    description: "Recuperas 3% de vida cada turno",
    rarity: "rara",
    regen: 0.03,
  },
  sabio: {
    name: "Sello del erudito",
    description: "+40% XP, +10% ATQ",
    rarity: "rara",
    xpBonus: 0.4,
    mods: { atk: 0.1 },
  },
  // ---- legendarias ----
  titan: {
    name: "Corona del Titán",
    description: "+40% vida, +20% DEF, -10% daño recibido",
    rarity: "legendaria",
    mods: { hp: 0.4, def: 0.2 },
    dmgReduction: 0.1,
  },
  vorpal: {
    name: "Hoja vorpal",
    description: "+35% ATQ, +15 crítico, los críticos pegan +50%",
    rarity: "legendaria",
    mods: { atk: 0.35, crit: 0.15 },
    critDamage: 0.5,
  },
  fenix: {
    name: "Corazón de fénix",
    description: "+30% vida, recuperas 4% por turno, cura 15% tras pelear",
    rarity: "legendaria",
    mods: { hp: 0.3 },
    regen: 0.04,
    healAfterFight: 0.15,
  },
  vampiro: {
    name: "Gema del vampiro",
    description: "+20% ATQ, curas 25% del daño que haces",
    rarity: "legendaria",
    mods: { atk: 0.2 },
    lifesteal: 0.25,
  },
  reloj: {
    name: "Reloj roto",
    description: "x1.35 daño total, +20% velocidad",
    rarity: "legendaria",
    mods: { speed: 0.2 },
    dmgMult: 1.35,
  },
  aegis: {
    name: "Égida del alba",
    description: "Escudo inicial 40%, esquivas 2 golpes, -15% daño recibido",
    rarity: "legendaria",
    startShield: 0.4,
    freeHits: 2,
    dmgReduction: 0.15,
  },
} as const satisfies Record<string, Relic>;

export type RelicId = keyof typeof RELICS;
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const RELIC_CHOICES = 3;

const asRelic = (r: Relic): Relic => r;
export const rarityOf = (id: RelicId): RelicRarity =>
  asRelic(RELICS[id]).rarity;

// Owning every relic in `needs` activates `bonus` (a pseudo-relic).
export interface Synergy {
  name: string;
  needs: readonly RelicId[];
  bonus: Relic;
}

export const SYNERGIES: readonly Synergy[] = [
  {
    name: "Cazador implacable",
    needs: ["lente", "viper"],
    bonus: {
      name: "Cazador implacable",
      description: "+10 crítico, los críticos pegan +40%",
      rarity: "rara",
      mods: { crit: 0.1 },
      critDamage: 0.4,
    },
  },
  {
    name: "Muralla",
    needs: ["escudo", "coraza"],
    bonus: {
      name: "Muralla",
      description: "+20% escudo inicial, -8% daño recibido",
      rarity: "rara",
      startShield: 0.2,
      dmgReduction: 0.08,
    },
  },
  {
    name: "Ciclo de vida",
    needs: ["caliz", "musgo"],
    bonus: {
      name: "Ciclo de vida",
      description: "Cura 10% tras pelear y 2% más por turno",
      rarity: "rara",
      healAfterFight: 0.1,
      regen: 0.02,
    },
  },
  {
    name: "Sed de sangre",
    needs: ["colmillo", "sangre"],
    bonus: {
      name: "Sed de sangre",
      description: "+8% ATQ, curas 8% más del daño",
      rarity: "rara",
      mods: { atk: 0.08 },
      lifesteal: 0.08,
    },
  },
  {
    name: "Reflejos",
    needs: ["capa", "guante"],
    bonus: {
      name: "Reflejos",
      description: "+8 esquive, esquivas 1 golpe más",
      rarity: "rara",
      mods: { dodge: 0.08 },
      freeHits: 1,
    },
  },
];

export const activeSynergies = (ids: readonly RelicId[]): Synergy[] =>
  SYNERGIES.filter((s) => s.needs.every((n) => ids.includes(n)));

// Draws up to n distinct relics from `from`, rarity first (weighted by
// RELIC_WEIGHTS, legendaries improve with `floor`), then uniformly inside it.
export function rollRelics(
  rng: Rng,
  n = RELIC_CHOICES,
  from: readonly RelicId[] = RELIC_IDS,
  floor = 0,
): RelicId[] {
  const pool = [...from];
  const out: RelicId[] = [];
  const weight = (r: RelicRarity) =>
    r === "legendaria"
      ? Math.min(
          RELIC_LEGENDARY_MAX,
          RELIC_WEIGHTS.legendaria + RELIC_LEGENDARY_PER_FLOOR * floor,
        )
      : RELIC_WEIGHTS[r];
  while (out.length < n && pool.length > 0) {
    const open = RELIC_RARITIES.filter((r) =>
      pool.some((id) => rarityOf(id) === r),
    );
    let roll = rng.next() * open.reduce((s, r) => s + weight(r), 0);
    const rarity = open.find((r) => (roll -= weight(r)) < 0) ?? open[0];
    const same = pool.filter((id) => rarityOf(id) === rarity);
    const id = same[rng.int(0, same.length - 1)];
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

// Caps on summed effects. Relics are unique per run, so most only bind for
// stacked legendary builds (or hand-built state). Stat fractions are high on
// purpose: a lucky build may more than double its stats.
export const RELIC_CAPS = {
  healAfterFight: 0.4, // fraction of max hp
  coinBonus: 1,
  xpBonus: 1,
  startShield: 0.6, // fraction of max hp
  freeHits: 3,
  statFraction: 1.2, // hp/atk/def
  speedFraction: 0.5,
  accuracy: 0.3,
  flee: 0.3,
  lifesteal: 0.4,
  critDamage: 1.2,
  regen: 0.1,
  dmgReduction: 0.35,
  dmgMult: 2, // product of all dmgMult
} as const;

// Owned relics plus the bonuses of their active synergies.
const expand = (ids: readonly RelicId[]): Relic[] => [
  ...ids.map((id) => asRelic(RELICS[id])),
  ...activeSynergies(ids).map((s) => s.bonus),
];
const sum = (rs: readonly Relic[], f: (r: Relic) => number | undefined) =>
  rs.reduce((acc, r) => acc + (f(r) ?? 0), 0);

const capped = (v: number, cap: number) => Math.min(cap, v);

export const relicTotals = (ids: readonly RelicId[]) => {
  const rs = expand(ids);
  return {
    healAfterFight: capped(
      sum(rs, (r) => r.healAfterFight),
      RELIC_CAPS.healAfterFight,
    ),
    coinBonus: capped(
      sum(rs, (r) => r.coinBonus),
      RELIC_CAPS.coinBonus,
    ),
    xpBonus: capped(
      sum(rs, (r) => r.xpBonus),
      RELIC_CAPS.xpBonus,
    ),
    startShield: capped(
      sum(rs, (r) => r.startShield),
      RELIC_CAPS.startShield,
    ),
    freeHits: capped(
      sum(rs, (r) => r.freeHits),
      RELIC_CAPS.freeHits,
    ),
    lifesteal: capped(
      sum(rs, (r) => r.lifesteal),
      RELIC_CAPS.lifesteal,
    ),
    critDamage: capped(
      sum(rs, (r) => r.critDamage),
      RELIC_CAPS.critDamage,
    ),
    regen: capped(
      sum(rs, (r) => r.regen),
      RELIC_CAPS.regen,
    ),
    dmgReduction: capped(
      sum(rs, (r) => r.dmgReduction),
      RELIC_CAPS.dmgReduction,
    ),
    dmgMult: capped(
      rs.reduce((acc, r) => acc * (r.dmgMult ?? 1), 1),
      RELIC_CAPS.dmgMult,
    ),
  };
};

// Relics stack additively (capped, see RELIC_CAPS).
export function applyRelicStats(stats: Stats, ids: readonly RelicId[]): Stats {
  const rs = expand(ids);
  const m = (k: keyof RelicMods) => sum(rs, (r) => r.mods?.[k]);
  const f = (k: keyof RelicMods) => capped(m(k), RELIC_CAPS.statFraction);
  const clamp = (v: number) => Math.min(0.6, Math.max(0, v));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    hp: Math.round(stats.hp * (1 + f("hp"))),
    atk: r1(stats.atk * (1 + f("atk"))),
    def: r1(stats.def * (1 + f("def"))),
    speed: r1(stats.speed * (1 + capped(m("speed"), RELIC_CAPS.speedFraction))),
    crit: clamp(stats.crit + m("crit")),
    dodge: clamp(stats.dodge + m("dodge")),
    accuracy: stats.accuracy + capped(m("accuracy"), RELIC_CAPS.accuracy),
    flee: stats.flee + capped(m("flee"), RELIC_CAPS.flee),
  };
}
