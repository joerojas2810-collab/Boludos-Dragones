import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import type { TraitId } from "@/lib/game/traits";
import { applyAccessories } from "@/sprites/accessories";
import { FULL_SPRITES, SPRITE_SIZE } from "@/sprites/classes";
import { shadePixels } from "@/sprites/shade";

type Props = {
  classId: ClassId;
  element: Element;
  traits?: TraitId[];
  flip?: boolean;
  className?: string;
};

export function Sprite({
  classId,
  element,
  traits = [],
  flip = false,
  className = "",
}: Props) {
  return (
    <svg
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      className={`aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
    >
      {shadePixels(
        applyAccessories(FULL_SPRITES[classId], classId, traits),
        element,
      ).map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}
