import ids from "./artIds.json";
import { isPixel, isPixelIcon } from "./art/pixel";
import type { Element } from "@/lib/game/elements";
import type { ClassId } from "@/lib/game/characters";
import type { GearType, HandType } from "@/lib/game/weapons";

// Spanish game ids -> English file names of the painted art in public/art.
export const ELEMENT_ART: Record<Element, string> = {
  fuego: "fire",
  agua: "water",
  tierra: "earth",
  rayo: "lightning",
  viento: "wind",
};
export const GEAR_ART: Record<GearType, string> = {
  casco: "helmet",
  peto: "chest",
  piernas: "legs",
  zapatos: "boots",
  collar: "necklace",
};

// ?v= busts the 7-day static cache when art files are replaced under the same name.
export const ART_V = 2;
const PIXEL_ICON_V = 3;
export const uiAsset = (name: string) =>
  `/art/${isPixel() ? "ui-px" : "ui"}/${name}.${isPixel() ? "png" : "webp"}?v=${ART_V}`;
export const icon = (name: string) => isPixelIcon(name)
  ? `/art/icons-px/icon_${name}.png?v=${PIXEL_ICON_V}`
  : `/art/icons/icon_${name}.webp?v=${ART_V}`;
export const elementIconSrc = (e: Element) => icon(`element_${ELEMENT_ART[e]}`);
export const gearIconSrc = (t: GearType, e: Element) =>
  isPixel()
    ? `/art/equipment-px/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.png`
    : `/art/equipment/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.webp`;

// Forge materials: painted icon names (Escamas, Dado cargado).
export const MATERIAL_ICON = { escamas: "material_scales", dado: "material_loaded_die" } as const;

type ArtCategory = keyof typeof ids;
// Icon name for a game id (trait, relic, passive, skill, upgrade, event, enemy_modifier, stat, class), if one exists.
export const iconFor = (cat: ArtCategory, id: string | number) =>
  (ids[cat] as Record<string, string>)[String(id)] &&
  `${cat}_${(ids[cat] as Record<string, string>)[String(id)]}`;

export const CLASS_ART: Record<ClassId, string> = {
  caballero: "knight",
  mago: "mage",
  picaro: "rogue",
  clerigo: "cleric",
  berserker: "knight", // provisional: Knight sheets until the Berserker has its own
};
export const HAND_ART: Record<HandType, string> = {
  espada: "sword",
  hacha: "axe",
  arco: "bow",
  baston: "staff",
  daga: "dagger",
  maza: "mace",
  varita: "wand",
  libro: "book",
  mandoble: "sword", // provisional icons
  martillo: "axe",
};
export const handIconSrc = (t: HandType, e: Element) =>
  isPixel()
    ? `/art/weapons-px/icon_weapon_${HAND_ART[t]}_${ELEMENT_ART[e]}.png`
    : `/art/weapons/icon_weapon_${HAND_ART[t]}_${ELEMENT_ART[e]}.webp`;
