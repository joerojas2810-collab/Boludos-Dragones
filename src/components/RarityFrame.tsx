import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { RARITIES, type RarityId } from "@/lib/game/rarity";

type Props = {
  rarity: RarityId;
  size?: number;
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
  selected = false,
  className = "",
  children,
}: Props) {
  return (
    <div
      data-rarity={rarity}
      data-selected={selected}
      className={`rarity-frame flex items-center justify-center ${className}`}
      style={
        {
          "--rc": RARITIES[rarity].color,
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      {corners.map((c) => (
        <span key={c} className={`rarity-notch ${c}`} />
      ))}
      {children}
      {size >= 64 && (
        <span className="absolute left-0.5 top-0.5 z-10">
          <Icon name={`rank_${rarity}`} className="h-[30%] w-auto" />
        </span>
      )}
    </div>
  );
}
