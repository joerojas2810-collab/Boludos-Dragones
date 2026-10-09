"use client";

import { useState } from "react";
import { AnimSheet, type SheetAnim } from "@/components/AnimSheet";
import { CLASS_ART, ELEMENT_ART } from "@/lib/art";
import { ACC_BOXES, ACC_SIZE } from "@/lib/art/accBoxes";
import { isPixel } from "@/lib/art/pixel";
import pixelHeroes from "@/lib/art/pixel-heroes.generated.json";
import {
  HERO_ACTIONS,
  TRAIT_ASSET,
  type HeroAction,
} from "@/lib/art/heroes";
import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import type { TraitId } from "@/lib/game/traits";
import "./pixel-sprites.css";

// Hero dimensions are imported independently from the unchanged enemy sprites.
const PX_ASPECT = pixelHeroes.runtime_frame_width / pixelHeroes.frame_height;
// Opaque bounds of the first HD idle frame; thumbnails exclude transparent margins.
const PX_IDLE_BOUNDS: Record<ClassId, readonly [number, number, number, number]> = {
  caballero: [10, 25, 121, 155],
  mago: [13, 13, 113, 167],
  picaro: [16, 33, 112, 147],
  clerigo: [10, 25, 107, 155],
  berserker: [10, 25, 121, 155], // Knight sheets for now
};

type Props = {
  classId: ClassId;
  element: Element;
  traits?: TraitId[];
  flip?: boolean;
  className?: string;
  action?: HeroAction; // default idle
  // false (lists, cards): one static idle frame, no timers. true: plays `action`.
  animated?: boolean;
  // Static only: zoom on the body (feet low) so the hero fills a card frame.
  crop?: boolean;
  // Static, hi-res idle frame (640 px) for large displays such as the hub.
  big?: boolean;
};

const sheet = (src: string, action: HeroAction): SheetAnim => ({
  src,
  ...HERO_ACTIONS[action],
});

// Trait accessories are drawn as small badges in the bottom corner (never over the face):
// each one is its big layer cropped to its opaque box.
const BADGE_H = 13; // % of the hero box
function Badges({ cls, assets, flip }: { cls: string; assets: string[]; flip: boolean }) {
  if (!assets.length) return null;
  return (
    <div
      className={`pointer-events-none absolute bottom-[3%] z-10 flex items-end gap-[2%] ${
        flip ? "left-[3%] -scale-x-100" : "right-[3%]"
      }`}
      style={{ height: `${BADGE_H}%` }}
    >
      {assets.map((t) => {
        const [x, y, w, h] = ACC_BOXES[`${cls}_${t}`];
        return (
          <div
            key={t}
            className="h-full"
            style={{
              aspectRatio: `${w} / ${h}`,
              backgroundImage: `url(/art/heroes/big/acc_${cls}_${t}.webp)`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${(ACC_SIZE / w) * 100}% ${(ACC_SIZE / h) * 100}%`,
              backgroundPosition: `${(x / (ACC_SIZE - w)) * 100}% ${(y / (ACC_SIZE - h)) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

// Painted hero: base sheet + the transparent accessory layer of each trait.
// Falls back to idle once a one-shot action ends (hold actions keep their last frame).
const notHoldOf = (action: HeroAction) =>
  !HERO_ACTIONS[action].loop && !("hold" in HERO_ACTIONS[action] && HERO_ACTIONS[action].hold);

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
  crop = false,
  big = false,
}: Props & { action: HeroAction }) {
  const [done, setDone] = useState(false);
  const a: HeroAction = animated && !done ? action : "idle";
  const cls = CLASS_ART[classId];
  if (isPixel()) {
    // ponytail: no trait accessories in pixel art yet (needs a phase 1b layer set).
    const src = `/art/heroes-px/hero_${cls}_${ELEMENT_ART[element]}_${a}.png`;
    if (crop && !animated) {
      const [x, y, width, height] = PX_IDLE_BOUNDS[classId];
      const sheetWidth = pixelHeroes.runtime_frame_width * HERO_ACTIONS.idle.frames;
      return <div role="img" aria-hidden="true" className={`pixel-hero-thumbnail ${className}`}>
        <div style={{
          aspectRatio: `${width} / ${height}`,
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          backgroundImage: `url(${src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sheetWidth / width * 100}% ${pixelHeroes.frame_height / height * 100}%`,
          backgroundPosition: `${x / (sheetWidth - width) * 100}% ${y / (pixelHeroes.frame_height - height) * 100}%`,
          transform: flip ? "scaleX(-1)" : undefined,
          imageRendering: "pixelated",
        }} />
      </div>;
    }
    const anim = { ...sheet(src, a), aspect: PX_ASPECT };
    const frame = animated ? (
      <AnimSheet anim={anim} onDone={notHoldOf(action) ? () => setDone(true) : undefined} />
    ) : (
      <div
        className="h-full w-full"
        style={{
          backgroundImage: `url(${src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${HERO_ACTIONS.idle.frames * 100}% 100%`,
        }}
      />
    );
    return (
      <div
        role="img"
        aria-hidden="true"
        className={`pixel-sprite-box relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
        style={{ imageRendering: "pixelated", "--pixel-frame-height": `${pixelHeroes.frame_height}px` } as React.CSSProperties}
      >
        <div
          className="pixel-sprite-frame"
          style={{ aspectRatio: PX_ASPECT }}
        >
          {frame}
        </div>
      </div>
    );
  }
  const assets = traits.map((t) => TRAIT_ASSET[t]).filter((t) => `${cls}_${t}` in ACC_BOXES);
  const badges = <Badges cls={cls} assets={assets} flip={flip} />;
  const layers = [`/art/heroes/hero_${cls}_${ELEMENT_ART[element]}_${a}.webp`];
  if (big) {
    return (
      <div
        role="img"
        aria-hidden="true"
        className={`relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/art/heroes/big/${cls}_${ELEMENT_ART[element]}.webp`}
          alt=""
          draggable={false}
          className="h-full w-full"
        />
        {badges}
      </div>
    );
  }
  const root = `relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`;
  const notHold =
    !HERO_ACTIONS[action].loop &&
    !("hold" in HERO_ACTIONS[action] && HERO_ACTIONS[action].hold);
  if (!animated) {
    const n = HERO_ACTIONS.idle.frames;
    return (
      <div
        role="img"
        aria-hidden="true"
        className={`${root} ${crop ? "overflow-hidden" : ""}`}
      >
        {layers.map((src) => (
          <div
            key={src}
            className="absolute inset-0"
            style={{
              transform: crop ? "scale(1.22)" : undefined,
              transformOrigin: "50% 94%",
              backgroundImage: `url(${src})`,
              backgroundSize: `${n * 100}% 100%`,
              backgroundRepeat: "no-repeat",
            }}
          />
        ))}
        {badges}
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
      {badges}
    </div>
  );
}
