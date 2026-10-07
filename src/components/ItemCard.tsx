import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import { RARITIES, type RarityId } from "@/lib/game/rarity";
import type { TraitId } from "@/lib/game/traits";
import type { WeaponType } from "@/lib/game/weapons";
import { ElementIcon } from "./ElementIcon";
import { RarityFrame } from "./RarityFrame";
import { HeroSprite } from "./HeroSprite";
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
  pity?: "ss" | "ssr"; // this pull was the pity guarantee
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
  const S = size + 24; // everything lives inside the frame
  const big = S >= 100;
  const title = [`${item.name} · Rango ${r.label}`, ...(item.lines ?? [])].join(
    "\n",
  );
  return (
    <div
      className={`relative ${className}`}
      style={{ width: S, height: S }}
      title={title}
    >
      <RarityFrame rarity={item.rarity} size={S} selected={selected}>
        <div className="absolute inset-0">
          {item.kind === "character" ? (
            <HeroSprite
              classId={item.classId}
              element={item.element}
              traits={item.traits}
              className="h-full w-full"
              crop
            />
          ) : (
            // Pieces: keep the icon above the info strip so the text never covers it.
            <div className="absolute inset-x-0 bottom-[34%] top-[8%] flex items-center justify-center">
              <WeaponSprite
                type={item.type}
                element={item.element}
                rarity={item.rarity}
                className="h-full w-auto max-w-[86%]"
              />
            </div>
          )}
        </div>
        <span className="absolute right-0.5 top-0.5 z-10 drop-shadow-[0_1px_0_#000]">
          <ElementIcon
            element={item.element}
            className={big ? "h-6" : "h-4"}
            bare
          />
        </span>
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-px bg-gradient-to-t from-black/85 via-black/60 to-transparent px-1 pb-1 pt-4 text-center text-white [text-shadow:0_1px_0_#000,0_0_3px_#000]">
          <div
            className={`w-full truncate font-bold ${big ? "text-xs" : "text-[10px]"}`}
          >
            {item.name}
          </div>
          <StarRow stars={item.stars} className={big ? "h-3" : "h-2"} />
          {big &&
            item.lines
              ?.filter((l) => l.length <= 22)
              .slice(0, 1)
              .map((l) => (
                <div
                  key={l}
                  className="w-full truncate text-[10px] text-[#d8d0c8]"
                >
                  {l}
                </div>
              ))}
        </div>
        {item.badge && (
          <span className="absolute left-1/2 top-0.5 z-20 -translate-x-1/2 border-2 border-[var(--edge)] bg-[var(--trim)] px-1 text-[10px] font-bold leading-4 text-white">
            {item.badge}
          </span>
        )}
      </RarityFrame>
    </div>
  );
}
