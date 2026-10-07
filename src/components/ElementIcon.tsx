import { Tooltip } from "@/components/Tooltip";
import { ELEMENT_LABEL, type Element } from "@/lib/game/elements";
import { elementTip, type Tip } from "@/lib/game/explain";
import { elementIconSrc } from "@/lib/art";

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
  return (
    <Tooltip
      tip={bare ? null : (tip ?? elementTip(element))}
      className="inline-block align-middle"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={elementIconSrc(element)}
        alt={`Elemento ${ELEMENT_LABEL[element]}`}
        draggable={false}
        className={`aspect-square cursor-help ${className}`}
      />
    </Tooltip>
  );
}
