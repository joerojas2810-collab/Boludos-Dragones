import { icon } from "@/lib/art";
import type { DoorKind } from "@/lib/game/room";
import { isPixel } from "@/lib/art/pixel";
import { PaintedDoorImage, type PAINTED_DOORS } from "./PaintedDoorImage";

// Keep the existing pixel presentation; painted doors use the approved common frame.
const DOOR_SYMBOL: Record<DoorKind, string> = {
  easy: "stat_attack",
  hard: "skill_double_strike",
  boss: "relic_titan_crown",
  chest: "system_chest",
  merchant: "relic_bottomless_purse",
  rest: "event_abandoned_campfire",
  event: "event_whispering_book",
};
const PAINTED_KIND:Record<DoorKind,keyof typeof PAINTED_DOORS>={easy:"door_easy_fight",hard:"door_hard_fight",boss:"door_boss",chest:"door_chest",merchant:"door_merchant",rest:"door_rest",event:"door_event"};

export function DoorIcon({
  kind,
  className = "h-12",
}: {
  kind: DoorKind;
  className?: string;
}) {
  if (!isPixel()) return <PaintedDoorImage name={PAINTED_KIND[kind]} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon(DOOR_SYMBOL[kind])}
      alt=""
      draggable={false}
      className={`aspect-square ${className}`}
    />
  );
}
