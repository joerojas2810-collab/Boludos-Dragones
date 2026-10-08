"use client";
import { GameSelect } from "@/components/GameSelect";
import { CLASS_IDS, CLASSES } from "@/lib/game/characters";
import { ELEMENTS, ELEMENT_LABEL } from "@/lib/game/elements";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import { SLOTS, WEAPON_TYPE_DATA } from "@/lib/game/weapons";
import { isFiltering, NO_PIECE_FILTER, type PieceFilter } from "@/lib/pieceFilter";

// Selects for filtering equipment lists. `slot` / `freeOnly` can be hidden where the list
// is already a single slot or only shows free pieces.
export function PieceFilterBar({
  value,
  onChange,
  showSlot = true,
  showClass = true,
  showFree = true,
  shown,
  total,
}: {
  value: PieceFilter;
  onChange: (f: PieceFilter) => void;
  showSlot?: boolean;
  showClass?: boolean;
  showFree?: boolean;
  shown: number;
  total: number;
}) {
  const set = (p: Partial<PieceFilter>) => onChange({ ...value, ...p });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <GameSelect
        label="Rango"
        value={value.rank}
        onChange={(rank) => set({ rank })}
        options={[
          { value: "all", label: "Todos los rangos" },
          ...[...RARITY_IDS].reverse().map((id) => ({ value: id, label: RARITIES[id].label })),
        ]}
      />
      <GameSelect
        label="Elemento"
        value={value.element}
        onChange={(element) => set({ element })}
        options={[
          { value: "all", label: "Todos los elementos" },
          ...ELEMENTS.map((el) => ({ value: el, label: ELEMENT_LABEL[el] })),
        ]}
      />
      {showSlot && (
        <GameSelect
          label="Casilla"
          value={value.slot}
          onChange={(slot) => set({ slot })}
          options={[
            { value: "all", label: "Todas las casillas" },
            ...SLOTS.map((sl) => ({
              value: sl,
              label: sl === "arma" ? "Arma" : WEAPON_TYPE_DATA[sl].label,
            })),
          ]}
        />
      )}
      {showClass && (
        <GameSelect
          label="Usable por"
          value={value.classId}
          onChange={(classId) => set({ classId })}
          options={[
            { value: "all", label: "Usable por: todas" },
            ...CLASS_IDS.map((id) => ({ value: id, label: `Usable por: ${CLASSES[id].name}` })),
          ]}
        />
      )}
      {showFree && (
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={value.freeOnly}
            onChange={(e) => set({ freeOnly: e.target.checked })}
          />
          Solo sin equipar
        </label>
      )}
      {isFiltering(value) && (
        <>
          <span className="text-sm text-[#d9d2ca]">
            {shown} de {total}
          </span>
          <button className="btn btn-gray text-center" onClick={() => onChange(NO_PIECE_FILTER)}>
            Limpiar
          </button>
        </>
      )}
    </div>
  );
}
