import type { Element } from "@/lib/game/elements";
import type { EnemyFamily } from "@/lib/game/worlds";
import { ENEMY_SIZE, ENEMY_SPRITES } from "@/sprites/enemies";
import { shadePixels } from "@/sprites/shade";

type Props = {
  family: EnemyFamily;
  element: Element;
  boss?: boolean;
  flip?: boolean;
  className?: string;
};

export function EnemySprite({
  family,
  element,
  boss = false,
  flip = false,
  className = "",
}: Props) {
  const grid = ENEMY_SPRITES[family][boss ? "boss" : "normal"];
  return (
    <svg
      viewBox={`0 0 ${ENEMY_SIZE} ${ENEMY_SIZE}`}
      shapeRendering="crispEdges"
      className={`aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
    >
      {shadePixels(grid, element).map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}
