import { DOOR_ART, icon } from "@/lib/art";
import type { DoorKind } from "@/lib/game/run";

export function DoorIcon({
  kind,
  className = "h-12",
}: {
  kind: DoorKind;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon(`door_${DOOR_ART[kind]}`)}
      alt=""
      draggable={false}
      className={`aspect-square ${className}`}
    />
  );
}
