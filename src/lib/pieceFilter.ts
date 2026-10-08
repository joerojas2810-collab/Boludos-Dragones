import type { ClassId } from "./game/characters";
import type { Element } from "./game/elements";
import type { RarityId } from "./game/rarity";
import { canUseWeapon, slotOf, type Slot, type WeaponType } from "./game/weapons";

// Filter for lists of equipment pieces (collection, equipment editor).
export interface PieceFilter {
  rank: RarityId | "all";
  element: Element | "all";
  slot: Slot | "all";
  classId: ClassId | "all"; // pieces this class can use (armor fits everyone)
  freeOnly: boolean;
}

export const NO_PIECE_FILTER: PieceFilter = {
  rank: "all",
  element: "all",
  slot: "all",
  classId: "all",
  freeOnly: false,
};

export const isFiltering = (f: PieceFilter) =>
  f.rank !== "all" || f.element !== "all" || f.slot !== "all" || f.classId !== "all" || f.freeOnly;

export function filterPieces<
  T extends { id: string; rarity: RarityId; element: Element; type: WeaponType },
>(pieces: T[], f: PieceFilter, equippedIds: ReadonlySet<string>): T[] {
  return pieces.filter(
    (w) =>
      (f.rank === "all" || w.rarity === f.rank) &&
      (f.element === "all" || w.element === f.element) &&
      (f.slot === "all" || slotOf(w.type) === f.slot) &&
      (f.classId === "all" || canUseWeapon(f.classId, w.type)) &&
      (!f.freeOnly || !equippedIds.has(w.id)),
  );
}
