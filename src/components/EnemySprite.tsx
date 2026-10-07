"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { enemyAnim, PIXEL, PX_ASPECT, type EnemyAction } from "@/lib/art/enemies";
import type { Element } from "@/lib/game/elements";
import type { EnemyFamily } from "@/lib/game/worlds";

// Action requested by the arena for the enemy it wraps: plays after `delay` ms
// (the arena staggers events like the sfx), then returns to idle.
export type EnemyCue = { action: EnemyAction; delay: number; held?: boolean }; // held: already defeated, show the last frame
export const EnemyCueContext = createContext<EnemyCue | null>(null);

type Props = {
  family: EnemyFamily;
  element: Element;
  boss?: boolean;
  elite?: boolean; // "hard" fights use the elite design
  finalRank?: string | null; // unique final boss of that dungeon rank
  action?: EnemyAction; // overrides the arena's cue
  flip?: boolean;
  className?: string;
};

export function EnemySprite({
  family,
  element,
  boss = false,
  elite = false,
  finalRank,
  action,
  flip = false,
  className = "",
}: Props) {
  const cue = useContext(EnemyCueContext);
  const want = action ?? cue?.action ?? "idle";
  const delay = action ? 0 : (cue?.delay ?? 0);
  const [playing, setPlaying] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const id = setTimeout(() => setPlaying(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  const cur: EnemyAction = playing ? want : "idle";
  const tier = boss ? "boss" : elite ? "elite" : "normal";
  const [done, setDone] = useState(false);
  // One-shot actions fall back to idle; defeat holds its last frame.
  const shown = done && cur !== "defeat" ? "idle" : cur;
  const anim = enemyAnim(family, tier, element, shown, finalRank);
  useEffect(() => {
    for (const a of ["idle", "attack", "hit", "defeat", "entrance"] as const)
      new Image().src = enemyAnim(family, tier, element, a, finalRank).src;
  }, [family, tier, element, finalRank]);
  return (
    <div
      className={`h-full w-full origin-bottom ${className}`}
      // --es set by BattleArena by group size (1.35 alone, smaller with 2-3 so neighbours don't overlap)
      style={{ transform: `scale(calc(var(--es, 1.35) * ${boss ? 1.26 : 1}))` }}
    >
      <div
        className={PIXEL ? "mx-auto h-full" : "h-full w-full"}
        style={PIXEL ? { aspectRatio: PX_ASPECT, imageRendering: "pixelated" } : undefined}
      >
        <AnimSheet
          key={shown}
          anim={anim}
          flip={flip}
          last={cue?.held && !action && shown === "defeat"}
          className="h-full w-full"
          onDone={() => setDone(true)}
        />
      </div>
    </div>
  );
}
