import { icon } from "@/lib/art";
import type { DoorKind } from "@/lib/game/room";

// The door-frame art is not used: each room kind shows its own painted symbol, larger and evenly sized.
const DOOR_SYMBOL: Record<DoorKind, string> = {
  easy: "stat_attack",
  hard: "skill_double_strike",
  boss: "relic_titan_crown",
  chest: "system_chest",
  merchant: "relic_bottomless_purse",
  rest: "event_abandoned_campfire",
  event: "event_whispering_book",
};

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
      src={icon(DOOR_SYMBOL[kind])}
      alt=""
      draggable={false}
      className={`aspect-square ${className}`}
    />
  );
}
