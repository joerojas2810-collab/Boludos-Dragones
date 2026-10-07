import type { Element } from "@/lib/game/elements";
import { RARITIES, type RarityId } from "@/lib/game/rarity";
import { shadePixels } from "@/sprites/shade";
import { gearIconSrc } from "@/lib/art";
import { isGearType, type WeaponType } from "@/lib/game/weapons";
import { WEAPON_SIZE, WEAPON_SPRITES_BY_TYPE } from "@/sprites/weapons";

type Props = {
  type?: WeaponType;
  element: Element;
  rarity?: RarityId;
  className?: string;
};

export function WeaponSprite({
  type = "espada",
  element,
  rarity = "f",
  className = "",
}: Props) {
  if (isGearType(type)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={gearIconSrc(type, element)}
        alt=""
        draggable={false}
        className={`aspect-square ${className}`}
      />
    );
  }
  const grid = WEAPON_SPRITES_BY_TYPE[type][element];
  const gem = RARITIES[rarity].color;
  return (
    <svg
      viewBox={`0 0 ${WEAPON_SIZE} ${WEAPON_SIZE}`}
      shapeRendering="crispEdges"
      className={`aspect-square ${className}`}
    >
      {shadePixels(grid, element).map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
      {grid.flatMap((row, y) =>
        [...row].map(
          (ch, x) =>
            ch === "p" && (
              <rect
                key={`p${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill={gem}
              />
            ),
        ),
      )}
    </svg>
  );
}
