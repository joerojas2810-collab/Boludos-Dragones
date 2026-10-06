import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { itemMult, type RarityId } from "./rarity";
import type { Rng } from "./rng";

export const WEAPON_TYPES = [
  "espada",
  "hacha",
  "lanza",
  "arco",
  "baston",
  "daga",
] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

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
};

export interface Weapon {
  id: string; // = weaponKey: unique per type + element + rarity
  name: string;
  type: WeaponType;
  element: Element;
  rarity: RarityId;
  stars: number;
  atkBonus: number; // flat ATQ (already includes the type multiplier)
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

export const WEAPON_KEY_SPACE = WEAPON_TYPES.length * ELEMENTS.length * 5;

export const weaponKey = (
  type: WeaponType,
  element: Element,
  rarity: RarityId,
) => `w-${type}-${element}-${rarity}`;

export const weaponAtk = (
  rarity: RarityId,
  stars: number,
  type: WeaponType = "espada",
) =>
  Math.round(
    WEAPON_BASE_ATK *
      WEAPON_TYPE_DATA[type].atkMult *
      itemMult(rarity, stars) *
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
