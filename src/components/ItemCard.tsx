import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import { RARITIES, type RarityId } from "@/lib/game/rarity";
import type { TraitId } from "@/lib/game/traits";
import type { WeaponType } from "@/lib/game/weapons";
import { ElementIcon } from "./ElementIcon";
import { RarityFrame } from "./RarityFrame";
import { Sprite } from "./Sprite";
import { StarRow } from "./StarRow";
import { WeaponSprite } from "./WeaponSprite";

// Plain display model: pages map their game objects to this.
type Base = {
  name: string;
  rarity: RarityId;
  stars: number;
  element: Element;
  lines?: string[]; // small stat lines, e.g. "VID 120 · ATQ 18"
  badge?: string; // "NUEVO", "+1 ★", "REEMBOLSO"
};
export type ItemView =
  | (Base & { kind: "character"; classId: ClassId; traits?: TraitId[] })
  | (Base & { kind: "weapon"; type?: WeaponType });

type Props = {
  item: ItemView;
  size?: number; // frame size in px
  selected?: boolean;
  className?: string;
};

export function ItemCard({
  item,
  size = 96,
  selected = false,
  className = "",
}: Props) {
  const r = RARITIES[item.rarity];
  return (
    <div
      className={`relative flex flex-col items-center gap-1 text-center ${className}`}
      style={{ width: size + 24 }}
    >
      {item.badge && (
        <span className="absolute -right-1 -top-2 z-10 border-2 border-[var(--edge)] bg-[var(--trim)] px-1 text-[10px] font-bold leading-4 text-white">
          {item.badge}
        </span>
      )}
      <RarityFrame rarity={item.rarity} size={size} selected={selected}>
        {item.kind === "character" ? (
          <Sprite
            classId={item.classId}
            element={item.element}
            traits={item.traits}
            className="w-[85%]"
          />
        ) : (
          <WeaponSprite
            type={item.type}
            element={item.element}
            rarity={item.rarity}
            className="w-[90%]"
          />
        )}
        <span className="absolute bottom-0.5 right-0.5 z-10">
          <ElementIcon element={item.element} className="h-4" />
        </span>
      </RarityFrame>
      <StarRow stars={item.stars} className="h-2.5" />
      <div className="w-full truncate text-xs font-bold">{item.name}</div>
      <div className="text-[11px]" style={{ color: r.color }}>
        {r.label}
      </div>
      {item.lines?.map((l) => (
        <div key={l} className="text-[10px] text-[#b5aea7]">
          {l}
        </div>
      ))}
    </div>
  );
}
