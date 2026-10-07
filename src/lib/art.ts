import ids from "./artIds.json";
import type { Element } from "@/lib/game/elements";
import type { DoorKind } from "@/lib/game/run";
import type { GearType } from "@/lib/game/weapons";

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

export const icon = (name: string) => `/art/icons/icon_${name}.webp`;
export const elementIconSrc = (e: Element) => icon(`element_${ELEMENT_ART[e]}`);
export const gearIconSrc = (t: GearType, e: Element) =>
  `/art/equipment/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.webp`;

type ArtCategory = keyof typeof ids;
// Icon name for a game id (trait, relic, passive, skill, upgrade, event, enemy_modifier, stat, class), if one exists.
export const iconFor = (cat: ArtCategory, id: string | number) =>
  (ids[cat] as Record<string, string>)[String(id)] &&
  `${cat}_${(ids[cat] as Record<string, string>)[String(id)]}`;
