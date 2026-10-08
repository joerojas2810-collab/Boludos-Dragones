"use client";

import { useState } from "react";
import { AnimSheet, type SheetAnim } from "@/components/AnimSheet";
import { CLASS_ART, ELEMENT_ART } from "@/lib/art";
import { isPixel } from "@/lib/art/pixel";
import {
  ACCESSORY_SHEETS,
  HERO_ACTIONS,
  PAIR_SHIFTS,
  TRAIT_ASSET,
  type HeroAction,
} from "@/lib/art/heroes";
import type { ClassId } from "@/lib/game/characters";
import type { Element } from "@/lib/game/elements";
import type { TraitId } from "@/lib/game/traits";
import "./pixel-sprites.css";

// Alternate art line: NEXT_PUBLIC_ART=pixel swaps the painted heroes for 64x96 pixel art.
const PX_ASPECT = 70 / 96; // 64 px frame + 3 px padding per side

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

type Off = readonly [number, number];
const FRAME = 768; // px of the source cell the pair layouts are measured in

// Offsets (% of the cell, one per frame) for each accessory that must move to
// stay readable next to another one (two-trait heroes), keyed by accessory asset.
function pairShifts(cls: string, assets: string[], action: HeroAction): Map<string, Off[]> {
  const out = new Map<string, Off[]>();
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      for (const [a, b] of [[assets[i], assets[j]], [assets[j], assets[i]]]) {
        const e = PAIR_SHIFTS[`${cls}_${a}__${b}`];
        if (!e) continue;
        const per = typeof e[0] === "number" ? (e as Off) : (e as Record<string, Off | Off[]>)[action];
        const list = (typeof per[0] === "number" ? Array(HERO_ACTIONS[action].frames).fill(per) : per) as Off[];
        out.set(b, list.map(([x, y]) => [(x / FRAME) * 100, (y / FRAME) * 100] as const));
      }
    }
  }
  return out;
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
        style={{ imageRendering: "pixelated" }}
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
  const assets = traits
    .map((t) => TRAIT_ASSET[t])
    .filter((t) => ACCESSORY_SHEETS.has(`${cls}_${t}_${a}`));
  const shifts = pairShifts(cls, assets, a);
  const layers = [
    `/art/heroes/hero_${cls}_${ELEMENT_ART[element]}_${a}.webp`,
    ...assets.map((t) => `/art/heroes/acc/${cls}_${t}_${a}.webp`),
  ];
  // Shift of layer i (0 = body): accessory i-1.
  const shiftOf = (i: number) => (i ? shifts.get(assets[i - 1]) : undefined);
  // Static frames use frame 0 of the idle shift.
  const sh = (i: number) => {
    const o = shiftOf(i)?.[0];
    return o ? { transform: `translate(${o[0]}%, ${o[1]}%)` } : undefined;
  };
  if (big) {
    const srcs = [
      `/art/heroes/big/${cls}_${ELEMENT_ART[element]}.webp`,
      ...assets.map((t) => `/art/heroes/big/acc_${cls}_${t}.webp`),
    ];
    return (
      <div
        role="img"
        aria-hidden="true"
        className={`relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
      >
        {srcs.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            className={`h-full w-full ${i ? "absolute inset-0" : ""}`}
            style={sh(i)}
          />
        ))}
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
        {layers.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0"
            style={{
              transform:
                [sh(i)?.transform, crop && "scale(1.22)"].filter(Boolean).join(" ") || undefined,
              transformOrigin: "50% 94%",
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
            shift={shiftOf(i)}
            onDone={i === 0 && notHold ? () => setDone(true) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
