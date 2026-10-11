"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { isPixel } from "@/lib/art/pixel";
import { preloadImages } from "@/lib/preload";
import { sheetImageSource } from "@/lib/art/atlas-image";
import { enemyAnim, PX_ASPECT, PX_FRAME_HEIGHT, type EnemyAction } from "@/lib/art/enemies";
import type { Element } from "@/lib/game/elements";
import type { EnemyFamily } from "@/lib/game/worlds";
import "./pixel-sprites.css";

// Action requested by the arena for the enemy it wraps: plays after `delay` ms
// (the arena staggers events like the sfx), then returns to idle.
export type EnemyCue = { action: EnemyAction; delay: number; held?: boolean }; // held: already defeated, show the last frame
export const EnemyCueContext = createContext<EnemyCue | null>(null);

type Props = {
  family: EnemyFamily;
  element: Element;
  boss?: boolean;
  elite?: boolean; // "hard" fights use the elite design
  finalRank?: string | null; // unique final boss, keyed by route id
  action?: EnemyAction; // overrides the arena's cue
  flip?: boolean;
  className?: string;
  artStyle?: "painted" | "pixel";
};

export function EnemySprite({
  family,
  element,
  boss = false,
  elite = false,
  finalRank,
  action,
  flip,
  className = "",
  artStyle,
}: Props) {
  const pixel = artStyle ? artStyle === "pixel" : isPixel();
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
  const anim = enemyAnim(family, tier, element, shown, finalRank, artStyle);
  // Pixel golems face right in their sheets; opponents face the hero on the left.
  const facingFlip = flip ?? anim.src.startsWith("/art/enemies-px/enemy_golem_");
  useEffect(() => {
    preloadImages(
      (["idle", "attack", "hit", "defeat", "entrance"] as const).map(
        (a) => sheetImageSource(enemyAnim(family, tier, element, a, finalRank, artStyle)),
      ),
    );
  }, [family, tier, element, finalRank, artStyle]);
  return (
    <div
      className={`h-full w-full origin-bottom ${pixel ? "pixel-sprite-box" : ""} ${className}`}
      // --es set by BattleArena by group size (1.35 alone, smaller with 2-3 so neighbours don't overlap)
      style={pixel
        ? { "--pixel-size": `calc(100cqh * var(--es, 1.35) * ${boss ? 1.26 : 1})`, "--pixel-frame-height": `${PX_FRAME_HEIGHT}px` } as React.CSSProperties
        : { transform: `scale(calc(var(--es, 1.35) * ${boss ? 1.26 : 1}))` }}
    >
      <div
        className={pixel ? "pixel-sprite-frame" : "h-full w-full"}
        style={pixel ? { aspectRatio: PX_ASPECT, imageRendering: "pixelated" } : undefined}
      >
        <AnimSheet
          key={shown}
          anim={anim}
          flip={facingFlip}
          last={cue?.held && !action && shown === "defeat"}
          className="h-full w-full"
          onDone={() => setDone(true)}
        />
      </div>
    </div>
  );
}
