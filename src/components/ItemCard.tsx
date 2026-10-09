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
import { specialLine } from "@/lib/viewModels";
import { isPixel, pixelCardOpening } from "@/lib/art/pixel";

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

// Opening of each painted card frame as [top, side, bottom] % of the card (measured from the frame alpha).
const OPENING: Record<RarityId, readonly [number, number, number]> = {
  f: [11.5, 15.5, 12],
  e: [13.5, 15.5, 12.5],
  d: [10.5, 12.5, 10],
  c: [12.5, 15.5, 12],
  b: [11, 14, 11.5],
  a: [14, 16.5, 13.5],
  s: [14, 17, 13.5],
  ss: [18.5, 19, 12.5],
  ssr: [17.5, 17.5, 11],
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
  const o = isPixel() ? pixelCardOpening : OPENING[item.rarity];
  const sp = item.kind === "weapon" && item.type ? specialLine(item.type) : undefined;
  const title = [`${item.name} · Rango ${r.label}`, ...(item.lines ?? []), ...(sp ? [sp] : [])].join(
    "\n",
  );
  return (
    <div
      className={`relative ${className}`}
      style={{ width: S, height: Math.round((S * 4) / 3) }}
      title={title}
    >
      <RarityFrame rarity={item.rarity} size={S} selected={selected} painted>
        {/* everything lives inside the painted frame's opening */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${o[1]}%`,
            right: `${o[1]}%`,
            top: `${o[0]}%`,
            bottom: `${o[2]}%`,
          }}
        >
          <div className="absolute inset-0">
            {item.kind === "character" ? (
              <HeroSprite
                classId={item.classId}
                element={item.element}
                traits={item.traits}
                className={isPixel()
                  ? "absolute inset-x-0 bottom-[24%] top-5"
                  : "absolute bottom-0 left-1/2 aspect-square h-full -translate-x-1/2"}
                crop
              />
            ) : (
              // Pieces: keep the icon above the info strip so the text never covers it.
              <div className={`absolute inset-x-0 bottom-[34%] ${isPixel() ? "top-5" : "top-[8%]"} flex items-center justify-center`}>
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
              className={isPixel() ? "h-4 w-4 [image-rendering:pixelated]" : big ? "h-6" : "h-4"}
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
        </div>
      </RarityFrame>
    </div>
  );
}
