"use client";

import { useState } from "react";
import { AnimSheet, type SheetAnim } from "@/components/AnimSheet";
import { CLASS_ART, ELEMENT_ART } from "@/lib/art";
import {
  ACCESSORY_SHEETS,
  HERO_ACTIONS,
  TRAIT_ASSET,
  type HeroAction,
} from "@/lib/art/heroes";
import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import type { TraitId } from "@/lib/game/traits";

type Props = {
  classId: ClassId;
  element: Element;
  traits?: TraitId[];
  flip?: boolean;
  className?: string;
  action?: HeroAction; // default idle
  // false (lists, cards): one static idle frame, no timers. true: plays `action`.
  animated?: boolean;
};

const sheet = (src: string, action: HeroAction): SheetAnim => ({
  src,
  ...HERO_ACTIONS[action],
});

// Painted hero: base sheet + the transparent accessory layer of each trait.
// Falls back to idle once a one-shot action ends (hold actions keep their last frame).
export function HeroSprite({ action = "idle", ...p }: Props) {
  // Keyed by action so the "finished" state resets whenever the action changes.
  return <Hero key={action} action={action} {...p} />;
}

function Hero({
  classId,
  element,
  traits = [],
  flip = false,
  className = "",
  action = "idle",
  animated = false,
}: Props & { action: HeroAction }) {
  const [done, setDone] = useState(false);
  const a: HeroAction = animated && !done ? action : "idle";
  const cls = CLASS_ART[classId];
  const layers = [
    `/art/heroes/hero_${cls}_${ELEMENT_ART[element]}_${a}.webp`,
    ...traits
      .map((t) => `${cls}_${TRAIT_ASSET[t]}_${a}`)
      .filter((k) => ACCESSORY_SHEETS.has(k))
      .map((k) => `/art/heroes/acc/${k}.webp`),
  ];
  const root = `relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`;
  const notHold = !HERO_ACTIONS[action].loop && !("hold" in HERO_ACTIONS[action] && HERO_ACTIONS[action].hold);
  if (!animated) {
    const n = HERO_ACTIONS.idle.frames;
    return (
      <div role="img" aria-hidden="true" className={root}>
        {layers.map((src) => (
          <div
            key={src}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${src})`,
              backgroundSize: `${n * 100}% 100%`,
              backgroundRepeat: "no-repeat",
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div role="img" aria-hidden="true" className={root}>
      {layers.map((src, i) => (
        <div key={src} className={i ? "absolute inset-0" : ""}>
          <AnimSheet
            anim={sheet(src, a)}
            onDone={i === 0 && notHold ? () => setDone(true) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
