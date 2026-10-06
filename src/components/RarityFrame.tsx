import type { ReactNode } from "react";
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
    </div>
  );
}
