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
  // Replaces the class's Ataque 2 while this weapon is equipped (combat.attackOf).
  special?: WeaponSpecial;
}

export interface WeaponSpecial {
  name: string;
  power: number;
  accuracy: number;
  cooldown: number; // same convention as Attack.cooldown
  heal: number; // fraction of max hp restored on use
  selfCost?: number; // fraction of CURRENT hp the user pays (never kills)
}

// Tune here.
export const WEAPON_TYPE_DATA: Record<WeaponType, WeaponTypeInfo> = {
  espada: {
    label: "Espada",
    description: "Golpe de escudo: golpe fuerte casi cada turno.",
    atkMult: 1,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Espada",
    special: { name: "Golpe de escudo", power: 1.8, accuracy: 0.9, cooldown: 1, heal: 0 },
  },
  hacha: {
    label: "Hacha",
    description: "Hachazo: golpe enorme, falla más y tarda en recargarse.",
    atkMult: 1.1,
    accuracy: -0.05,
    crit: 0,
    speedMult: 1,
    noun: "Hacha",
    special: { name: "Hachazo", power: 3.2, accuracy: 0.65, cooldown: 3, heal: 0 },
  },
  arco: {
    label: "Arco",
    description: "Disparo certero: golpe fuerte y seguro, con recarga larga. Más crítico.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1,
    noun: "Arco",
    special: { name: "Disparo certero", power: 2.6, accuracy: 0.9, cooldown: 3, heal: 0 },
  },
  baston: {
    label: "Bastón",
    description: "Cataclismo: golpe enorme de magia, falla más y tarda en recargarse. Más velocidad.",
    atkMult: 1,
    accuracy: 0,
    crit: 0,
    speedMult: 1.1,
    noun: "Bastón",
    special: { name: "Cataclismo", power: 2.8, accuracy: 0.7, cooldown: 3, heal: 0 },
  },
  daga: {
    label: "Daga",
    description: "Puñalada rápida: golpe ágil casi cada turno. Más crítico y velocidad.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0.05,
    speedMult: 1.05,
    noun: "Daga",
    special: { name: "Puñalada rápida", power: 1.7, accuracy: 0.95, cooldown: 1, heal: 0 },
  },
  maza: {
    label: "Maza",
    description: "Golpe sagrado: golpe fuerte que además te cura un poco.",
    atkMult: 1.1,
    accuracy: 0,
    crit: 0,
    speedMult: 0.95,
    noun: "Maza",
    special: { name: "Golpe sagrado", power: 2.2, accuracy: 0.85, cooldown: 2, heal: 0.06 },
  },
  varita: {
    label: "Varita",
    description: "Rayo arcano: hechizo certero casi cada turno. Más precisión y velocidad.",
    atkMult: 0.9,
    accuracy: 0.05,
    crit: 0,
    speedMult: 1.05,
    noun: "Varita",
    special: { name: "Rayo arcano", power: 1.8, accuracy: 0.95, cooldown: 1, heal: 0 },
  },
  libro: {
    label: "Libro",
    description: "Plegaria: casi no daña, pero cura mucho. Para sanadores.",
    atkMult: 0.8,
    accuracy: 0.03,
    crit: 0.04,
    speedMult: 1,
    noun: "Libro",
    special: { name: "Plegaria", power: 0.3, accuracy: 1, cooldown: 2, heal: 0.13 },
  },
  mandoble: {
    label: "Mandoble",
    description: "Frenesí: golpe brutal que te cuesta parte de tu vida actual.",
    atkMult: 0.95,
    accuracy: 0,
    crit: 0,
    speedMult: 1,
    noun: "Mandoble",
    special: { name: "Frenesí", power: 2.6, accuracy: 0.9, cooldown: 2, heal: 0, selfCost: 0.08 },
  },
  martillo: {
    label: "Martillo",
    description: "Aplastar: golpe explosivo, recarga larga y sin costo de vida.",
    atkMult: 1,
    accuracy: -0.05,
    crit: 0,
    speedMult: 0.95,
    noun: "Martillo",
    special: { name: "Aplastar", power: 3, accuracy: 0.85, cooldown: 3, heal: 0 },
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
  plus?: number; // Mejorar level 0..10 (upgrade.ts); absent = 0
  plusStreak?: number; // consecutive failed upgrades at the current level (+5% each)
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
  ss: ["Mítico", "Mítica"],
  ssr: ["Divino", "Divina"],
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

export const weaponSpecial = (type: string | undefined): WeaponSpecial | undefined =>
  type && isWeaponType(type) ? WEAPON_TYPE_DATA[type].special : undefined;
