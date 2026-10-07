import type { GearLine } from "./gear";
import type { ClassId } from "./characters";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { itemMult, RARITY_IDS, type RarityId } from "./rarity";
import type { Rng } from "./rng";

// Hand weapons (the "arma" slot) and armor/jewel pieces (one slot each).
export const HAND_TYPES = [
  "espada",
  "hacha",
  "lanza",
  "arco",
  "baston",
  "daga",
  "maza",
  "varita",
  "libro",
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

// Which hand weapon types each class can equip (2-3 per class). Gear has no class limit.
export const CLASS_WEAPONS: Record<ClassId, readonly HandType[]> = {
  caballero: ["espada", "hacha", "lanza"],
  mago: ["baston", "varita", "libro"],
  picaro: ["daga", "arco"],
  clerigo: ["maza", "baston", "libro"],
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
}

// Tune here.
export const WEAPON_TYPE_DATA: Record<WeaponType, WeaponTypeInfo> = {
  espada: {
    label: "Espada",
    description: "Equilibrada, sin extras.",
    atkMult: 1,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Espada",
  },
  hacha: {
    label: "Hacha",
    description: "Golpea fuerte, pero es menos precisa.",
    atkMult: 1.2,
    accuracy: -0.05,
    crit: 0,
    speedMult: 1,
    noun: "Hacha",
  },
  lanza: {
    label: "Lanza",
    description: "Alcance largo: más precisión.",
    atkMult: 1,
    accuracy: 0.05,
    crit: 0,
    speedMult: 1,
    noun: "Lanza",
  },
  arco: {
    label: "Arco",
    description: "Menos daño, más crítico.",
    atkMult: 0.9,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1,
    noun: "Arco",
  },
  baston: {
    label: "Bastón",
    description: "Menos daño, más velocidad.",
    atkMult: 0.9,
    accuracy: 0,
    crit: 0,
    speedMult: 1.1,
    noun: "Bastón",
  },
  daga: {
    label: "Daga",
    description: "Poco daño, crítico y velocidad.",
    atkMult: 0.85,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1.05,
    noun: "Daga",
  },
  maza: {
    label: "Maza",
    description: "Golpe pesado y firme: más daño, algo más lenta.",
    atkMult: 1.1,
    accuracy: 0,
    crit: 0,
    speedMult: 0.95,
    noun: "Maza",
  },
  varita: {
    label: "Varita",
    description: "Hechizos certeros: más precisión y velocidad.",
    atkMult: 0.85,
    accuracy: 0.05,
    crit: 0,
    speedMult: 1.05,
    noun: "Varita",
  },
  libro: {
    label: "Libro",
    description: "Saber arcano: más crítico y precisión.",
    atkMult: 0.8,
    accuracy: 0.03,
    crit: 0.04,
    speedMult: 1,
    noun: "Libro",
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
    description: "Más defensa y algo de esquive.",
    atkMult: 0,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Grebas",
  },
  zapatos: {
    label: "Zapatos",
    description: "Más velocidad y algo de esquive.",
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
  legacy?: boolean; // existed before profile v5 (burns at the legacy rate)
}

const ADJECTIVES = [
  "Ardiente",
  "Antigua",
  "Radiante",
  "Maldita",
  "Temible",
  "Olvidada",
  "Sagrada",
  "Salvaje",
  "Silenciosa",
  "Eterna",
];

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

export const weaponName = (type: WeaponType, element: Element, adj: string) =>
  `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]} ${adj}`;

// Rarity is rolled by the gacha; this rolls type, element and name.
export function generateWeapon(rng: Rng, rarity: RarityId): Weapon {
  const type = rng.pick(WEAPON_TYPES);
  const element = rng.pick(ELEMENTS);
  return {
    id: weaponKey(type, element, rarity),
    name: weaponName(type, element, rng.pick(ADJECTIVES)),
    type,
    element,
    rarity,
    stars: 0,
    atkBonus: weaponAtk(rarity, 0, type),
  };
}
