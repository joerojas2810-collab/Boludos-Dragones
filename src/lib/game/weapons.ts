import type { GearLine } from "./gear";
import type { ClassId } from "./characters";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { itemMult, RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";

// Hand weapons (the "arma" slot) and armor/jewel pieces (one slot each).
export const HAND_TYPES = [
  "espada",
  "hacha",
  "arco",
  "baston",
  "daga",
  "maza",
  "varita",
  "libro",
  "mandoble",
  "martillo",
] as const;
export const GEAR_TYPES = [
  "casco",
  "peto",
  "piernas",
  "zapatos",
  "collar",
] as const;
export type HandType = (typeof HAND_TYPES)[number];
export type GearType = (typeof GEAR_TYPES)[number];
// Every item the gacha / market / collection handles ("weapon" kind in the DB).
export const WEAPON_TYPES = [...HAND_TYPES, ...GEAR_TYPES] as const;
export type WeaponType = HandType | GearType;

export type Slot = "arma" | GearType;
export const SLOTS = ["arma", ...GEAR_TYPES] as const;
export const isGearType = (t: WeaponType): t is GearType =>
  (GEAR_TYPES as readonly string[]).includes(t);
export const slotOf = (t: WeaponType): Slot => (isGearType(t) ? t : "arma");

// Which hand weapon types each class can equip (2 per class). Gear has no class limit.
export const CLASS_WEAPONS: Record<ClassId, readonly HandType[]> = {
  caballero: ["espada", "hacha"],
  mago: ["baston", "varita"],
  picaro: ["daga", "arco"],
  clerigo: ["maza", "libro"],
  berserker: ["mandoble", "martillo"],
};
export const canUseWeapon = (classId: ClassId, type: WeaponType) =>
  isGearType(type) || CLASS_WEAPONS[classId].includes(type);

export const WEAPON_BASE_ATK = 4;

export interface WeaponTypeInfo {
  label: string;
  description: string;
  atkMult: number; // multiplies the base weapon attack
  accuracy: number; // additive to Stats.accuracy
  crit: number; // additive to Stats.crit
  speedMult: number; // multiplies Stats.speed
  noun: string; // used in generated names (with article: "Hacha de ...")
  basic?: { name: string; power: number; crit?: number; heal?: number };
}

// Tune here.
export const WEAPON_TYPE_DATA: Record<WeaponType, WeaponTypeInfo> = {
  espada: {
    label: "Espada",
    description: "Hoja equilibrada, fiable en cada ataque básico.",
    atkMult: 1,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Espada",
    basic: { name: "Tajo", power: 1 },
  },
  hacha: {
    label: "Hacha",
    description: "Hacha pesada: básico contundente con gran potencia de arma.",
    atkMult: 1.1,
    accuracy: -0.05,
    crit: 0,
    speedMult: 1,
    noun: "Hacha",
    basic: { name: "Hachazo", power: 1 },
  },
  arco: {
    label: "Arco",
    description: "Arma de precisión con probabilidad crítica adicional.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1,
    noun: "Arco",
    basic: { name: "Disparo", power: 1 },
  },
  baston: {
    label: "Bastón",
    description: "Canalizador rúnico que acelera al Mago.",
    atkMult: 1,
    accuracy: 0,
    crit: 0,
    speedMult: 1.1,
    noun: "Bastón",
    basic: { name: "Golpe rúnico", power: 1 },
  },
  daga: {
    label: "Daga",
    description: "Arma veloz que favorece los críticos y la velocidad.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1.05,
    noun: "Daga",
    basic: { name: "Corte rápido", power: 1 },
  },
  maza: {
    label: "Maza",
    description: "Arma pesada con gran poder básico.",
    atkMult: 1.1,
    accuracy: 0,
    crit: 0,
    speedMult: 0.95,
    noun: "Maza",
    basic: { name: "Golpe de maza", power: 1 },
  },
  varita: {
    label: "Varita",
    description: "Foco ligero que favorece la precisión y la velocidad.",
    atkMult: 0.9,
    accuracy: 0.05,
    crit: 0,
    speedMult: 1.05,
    noun: "Varita",
    basic: { name: "Chispa", power: 1 },
  },
  libro: {
    label: "Libro",
    description: "Libro de apoyo con precisión y crítico adicionales.",
    atkMult: 0.8,
    accuracy: 0.03,
    crit: 0.04,
    speedMult: 1,
    noun: "Libro",
    basic: { name: "Sello arcano", power: 1 },
  },
  mandoble: {
    label: "Mandoble",
    description: "Hoja larga y equilibrada para un golpe básico pesado.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Mandoble",
    basic: { name: "Tajo pesado", power: 1 },
  },
  martillo: {
    label: "Martillo",
    description: "Martillo de impacto, sólido y lento.",
    atkMult: 1,
    accuracy: -0.05,
    crit: 0,
    speedMult: 0.95,
    noun: "Martillo",
    basic: { name: "Impacto de martillo", power: 1 },
  },
  casco: {
    label: "Casco",
    description: "Más vida y algo de defensa.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Casco",
  },
  peto: {
    label: "Peto",
    description: "Más defensa y algo de vida.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Peto",
  },
  piernas: {
    label: "Piernas",
    description: "Más defensa y algo de resistencia a estados.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Grebas",
  },
  zapatos: {
    label: "Zapatos",
    description: "Más velocidad y algo de resistencia a estados.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Botas",
  },
  collar: {
    label: "Collar",
    description: "Más crítico y algo de precisión.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Collar",
  },
};

// One spare copy of a piece: its own roll and extra lines (the copy a duplicate pull left behind).
export interface PieceRoll {
  roll?: number;
  lines?: GearLine[];
}

export interface Weapon {
  id: string; // = weaponKey: unique per type + element + rarity
  name: string;
  type: WeaponType;
  element: Element;
  rarity: RarityId;
  stars: number;
  atkBonus: number; // flat ATQ (already includes the type multiplier)
  // Per-piece roll (+-15%) and extra lines, see gear.ts. Absent on pieces saved before Run v2.
  roll?: number;
  lines?: GearLine[];
  legacy?: boolean; // existed before profile v5
  plus?: number; // Mejorar level 0..10 (upgrade.ts); absent = 0
  plusStreak?: number; // consecutive failed upgrades at the current level (+5% each)
  copies?: PieceRoll[]; // spare copies (profile.ts MAX_COPIES): each keeps its own roll and lines
}

// Rank epithet [masculine, feminine]: every item name is "<Noun> <epithet> de <Element>".
const RANK_EPITHET: Record<RarityId, readonly [string, string]> = {
  f: ["Oxidado", "Oxidada"],
  e: ["Gastado", "Gastada"],
  d: ["Corriente", "Corriente"],
  c: ["Templado", "Templada"],
  b: ["Noble", "Noble"],
  a: ["Heroico", "Heroica"],
  s: ["Legendario", "Legendaria"],
};
const FEMININE: readonly WeaponType[] = ["espada", "hacha", "daga", "maza", "varita", "piernas", "zapatos"];
const PLURAL: readonly WeaponType[] = ["piernas", "zapatos"]; // Grebas, Botas

export const isWeaponType = (v: unknown): v is WeaponType =>
  typeof v === "string" && (WEAPON_TYPES as readonly string[]).includes(v);

export const WEAPON_KEY_SPACE =
  WEAPON_TYPES.length * ELEMENTS.length * RARITY_IDS.length;

export const weaponKey = (
  type: WeaponType,
  element: Element,
  rarity: RarityId,
) => `w-${type}-${element}-${rarity}`;

export const weaponAtk = (
  rarity: RarityId,
  stars: number,
  type: WeaponType = "espada",
  roll = 1, // per-piece roll (+-15%), see gear.rollGear
) =>
  Math.round(
    WEAPON_BASE_ATK *
      WEAPON_TYPE_DATA[type].atkMult *
      itemMult(rarity, stars) *
      roll *
      10,
  ) / 10;

// Secondary effect of a type; fixed (not scaled by rarity/stars).
export const weaponSecondary = (type: WeaponType) => {
  const { accuracy, crit, speedMult } = WEAPON_TYPE_DATA[type];
  return { accuracy, crit, speedMult };
};

export const weaponName = (type: WeaponType, element: Element, rarity: RarityId) => {
  const [m, f] = RANK_EPITHET[rarity];
  const epithet = (FEMININE.includes(type) ? f : m) + (PLURAL.includes(type) ? "s" : "");
  return `${WEAPON_TYPE_DATA[type].noun} ${epithet} de ${ELEMENT_LABEL[element]}`;
};

// Rarity is rolled by the gacha; this rolls type, element and name.
export function generateWeapon(rng: Rng, rarity: RarityId): Weapon {
  const type = rng.pick(WEAPON_TYPES);
  const element = rng.pick(ELEMENTS);
  return {
    id: weaponKey(type, element, rarity),
    name: weaponName(type, element, rarity),
    type,
    element,
    rarity,
    stars: 0,
    atkBonus: weaponAtk(rarity, 0, type),
  };
}
