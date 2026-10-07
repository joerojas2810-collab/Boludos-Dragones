"use client";

import { useEffect, useRef } from "react";

export type SheetAnim = {
  src: string; // horizontal strip: one row, `frames` equal cells
  frames: number;
  fps: number;
  loop: boolean; // false = play once and hold the last frame
  aspect?: number; // cell width / height (default 1)
};

// Plays a one-row sprite sheet. The cell fills the width of the box; `key` the
// component by action to restart it. Honors prefers-reduced-motion (first frame).
type Props = {
  anim: SheetAnim;
  flip?: boolean;
  className?: string;
  onDone?: () => void;
  last?: boolean; // start (and stay) on the final frame
  shift?: readonly (readonly [number, number])[]; // per-frame offset in % of the cell
};

// Keyed by src so a new animation always restarts at frame 0.
export const AnimSheet = (props: Props) => (
  <Sheet key={props.anim.src} {...props} />
);

function Sheet({ anim, flip = false, className = "", onDone, last, shift }: Props) {
  const { frames, fps, loop } = anim;
  const ref = useRef<HTMLDivElement>(null);
  const pos = (i: number) => `${frames > 1 ? (i / (frames - 1)) * 100 : 0}% 0`;
  const move = (i: number) =>
    shift
      ? `translate(${shift[Math.min(i, shift.length - 1)][0]}%, ${shift[Math.min(i, shift.length - 1)][1]}%)`
      : "none";
  // Frames advance on the compositor via one Web Animation (no React render per frame).
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      last ||
      frames < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const keys: Keyframe[] = Array.from({ length: frames }, (_, i) => ({
      backgroundPosition: pos(i),
      transform: move(i),
      offset: i / frames,
      easing: "step-end",
    }));
    keys.push({ backgroundPosition: pos(frames - 1), transform: move(frames - 1), offset: 1 });
    const run = el.animate(keys, {
      duration: (frames / fps) * 1000,
      iterations: loop ? Infinity : 1,
      fill: "forwards",
    });
    if (!loop) run.onfinish = () => onDone?.();
    return () => run.cancel();
  }, [anim.src, frames, fps, loop, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const f0 = last ? frames - 1 : 0;
  return (
    <div
      ref={ref}
      role="img"
      aria-hidden="true"
      className={`${flip ? "-scale-x-100" : ""} ${className}`}
      style={{
        aspectRatio: anim.aspect ?? 1,
        transform: shift ? move(f0) : undefined,
        backgroundImage: `url(${anim.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${frames * 100}% 100%`,
        backgroundPosition: pos(f0),
      }}
    />
  );
}
