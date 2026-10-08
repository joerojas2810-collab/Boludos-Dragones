import type { ReactNode } from "react";
import { Vfx } from "@/components/fx/Vfx";
import { RankIcon } from "@/components/RankIcon";
import { isPixel } from "@/lib/art/pixel";
import { RARITIES, type RarityId } from "@/lib/game/rarity";

type Props = {
  rarity: RarityId;
  size?: number;
  painted?: boolean; // painted 3:4 card frame (public/art/frames/card_<rank>.webp); height = size × 4/3
  selected?: boolean;
  className?: string;
  children?: ReactNode;
};

const corners = [
  "-left-px -top-px",
  "-right-px -top-px",
  "-left-px -bottom-px",
  "-right-px -bottom-px",
];

export function RarityFrame({
  rarity,
  size = 96,
  painted = false,
  selected = false,
  className = "",
  children,
}: Props) {
  return (
    <div
      data-rarity={rarity}
      data-selected={selected}
      className={`rarity-frame flex items-center justify-center ${painted ? "rarity-frame-art" : ""} ${className}`}
      style={
        {
          "--rc": RARITIES[rarity].color,
          width: size,
          height: painted ? Math.round((size * 4) / 3) : size,
        } as React.CSSProperties
      }
    >
      {corners.map((c) => (
        <span key={c} className={`rarity-notch ${c}`} />
      ))}
      {children}
      {painted && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={isPixel() ? `/art/frames-px/card_${rarity}.png?v=2` : `/art/frames/card_${rarity}.webp?v=2`}
          style={isPixel() ? { imageRendering: "pixelated" } : undefined}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 z-[15] h-full w-full"
        />
      )}
      {size >= 64 &&
        (rarity === "s" || rarity === "ss" || rarity === "ssr") && (
          <Vfx
            id={`rank_glint_${rarity}`}
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 h-full -translate-x-1/2"
          />
        )}
      {size >= 64 && (
        <span className="absolute left-[1%] top-[0.5%] z-20 drop-shadow-[0_1px_2px_#000]">
          <RankIcon
            rank={rarity}
            letter
            className=""
            style={{ width: Math.round(size * 0.3), height: Math.round(size * 0.3) }}
          />
        </span>
      )}
    </div>
  );
}
