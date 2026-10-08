import { RELICS, type RelicId } from "@/lib/game/relics";
import ids from "./artIds.json";
import { isPixelIcon, PIXEL } from "./art/pixel";
import type { Element } from "@/lib/game/elements";
import type { DoorKind } from "@/lib/game/run";
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
export const DOOR_ART: Record<DoorKind, string> = {
  easy: "easy_fight",
  hard: "hard_fight",
  boss: "boss",
  chest: "chest",
  merchant: "merchant",
  rest: "rest",
  event: "event",
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
export const uiAsset = (name: string) =>
  `/art/${PIXEL ? "ui-px" : "ui"}/${name}.${PIXEL ? "png" : "webp"}?v=${ART_V}`;
export const icon = (name: string) => isPixelIcon(name)
  ? `/art/icons-px/icon_${name}.png?v=${ART_V}`
  : `/art/icons/icon_${name}.webp?v=${ART_V}`;
export const elementIconSrc = (e: Element) => icon(`element_${ELEMENT_ART[e]}`);
export const gearIconSrc = (t: GearType, e: Element) =>
  PIXEL
    ? `/art/equipment-px/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.png`
    : `/art/equipment/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.webp`;

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
};
export const HAND_ART: Record<HandType, string> = {
  espada: "sword",
  hacha: "axe",
  lanza: "spear",
  arco: "bow",
  baston: "staff",
  daga: "dagger",
  maza: "mace",
  varita: "wand",
  libro: "book",
};
export const handIconSrc = (t: HandType, e: Element) =>
  PIXEL
    ? `/art/weapons-px/icon_weapon_${HAND_ART[t]}_${ELEMENT_ART[e]}.png`
    : `/art/weapons/icon_weapon_${HAND_ART[t]}_${ELEMENT_ART[e]}.webp`;

const RELIC_RARITY_ART = {
  comun: "common",
  rara: "rare",
  legendaria: "legendary",
} as const;
// Relic icon with its rarity badge baked in (falls back to the plain icon).
export const relicIcon = (id: RelicId) => {
  const base = iconFor("relic", id);
  return base
    ? base.replace("relic_", "relic_variant_") +
        "_" +
        RELIC_RARITY_ART[RELICS[id].rarity]
    : "system_chest";
};
