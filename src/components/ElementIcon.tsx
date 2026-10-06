import { Tooltip } from "@/components/Tooltip";
import { ELEMENT_LABEL, type Element } from "@/lib/game/elements";
import { elementTip, type Tip } from "@/lib/game/explain";
import { ELEMENT_ICONS } from "@/sprites/elementIcons";
import { ELEMENT_COLORS } from "@/sprites/palettes";

export function ElementIcon({
  element,
  className = "h-6",
  tip,
  bare,
}: {
  element: Element;
  className?: string;
  bare?: boolean; // no tooltip of its own (parent has one)
  tip?: Tip; // contextual tip (fight numbers); defaults to the generic one
}) {
  const [a, b, c] = ELEMENT_COLORS[element];
  const color = { a, b, c } as Record<string, string>;
  return (
    <Tooltip
      tip={bare ? null : (tip ?? elementTip(element))}
      className="inline-block align-middle"
    >
      <svg
        viewBox="0 0 8 8"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Elemento ${ELEMENT_LABEL[element]}`}
        className={`aspect-square cursor-help ${className}`}
      >
        {ELEMENT_ICONS[element].flatMap((row, y) =>
          [...row].map(
            (ch, x) =>
              color[ch] && (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={color[ch]}
                />
              ),
          ),
        )}
      </svg>
    </Tooltip>
  );
}
