import { ELEMENTS } from "./game/elements";
import { RARITY_IDS } from "./game/rarity";
import { slotOf, type WeaponType } from "./game/weapons";
import type { Element } from "./game/elements";
import type { RarityId } from "./game/rarity";

const SLOT_ORDER = ["arma", "casco", "peto", "piernas", "zapatos", "collar"];

interface Sortable {
  type: WeaponType;
  rarity: RarityId;
  element: Element;
  stars: number;
  plus?: number;
}

// One order for every equipment list: slot > rank desc > element > stars desc > +N desc.
export const compareGear = (a: Sortable, b: Sortable) =>
  SLOT_ORDER.indexOf(slotOf(a.type)) - SLOT_ORDER.indexOf(slotOf(b.type)) ||
  RARITY_IDS.indexOf(b.rarity) - RARITY_IDS.indexOf(a.rarity) ||
  ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element) ||
  b.stars - a.stars ||
  (b.plus ?? 0) - (a.plus ?? 0);
