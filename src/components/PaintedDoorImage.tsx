import type { CSSProperties } from "react";
import symbols from "@/lib/art/door-symbols.generated.json";

export const PAINTED_DOORS = {
  door_easy_fight: "stat_attack",
  door_hard_fight: "skill_double_strike",
  door_boss: "relic_titan_crown",
  door_chest: "system_chest",
  door_merchant: "relic_bottomless_purse",
  door_rest: "event_abandoned_campfire",
  door_event: "event_whispering_book",
} as const;

export function isPaintedDoor(name:string):name is keyof typeof PAINTED_DOORS {
  return Object.hasOwn(PAINTED_DOORS,name);
}

// Fit the visible silhouette, not its transparent canvas, inside the approved opening.
export function PaintedDoorImage({name,className="",style}:{name:keyof typeof PAINTED_DOORS;className?:string;style?:CSSProperties}) {
  const image=symbols[PAINTED_DOORS[name]];
  const b=image.bounds;
  return <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false" className={`inline-block aspect-square align-middle ${className}`} style={style}>
    <image href="/art/iconography-painted-v2/door-frame.webp" width="128" height="128" />
    <svg x="38.4" y="43.52" width="51.2" height="57.6" viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`} preserveAspectRatio="xMidYMid meet" overflow="hidden">
      <image href={image.src} width={image.width} height={image.height}/>
    </svg>
  </svg>;
}
