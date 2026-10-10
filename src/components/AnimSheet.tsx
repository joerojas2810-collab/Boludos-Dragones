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
// component by action to restart it. Reduced motion holds a static pose.
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
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  // The strip is `frames` cells wide inside a clipping box; showing frame i is a translateX of the
  // strip by i cells. Transforms run on the compositor, so frames keep their pace even while React
  // is busy rendering (background-position animations repaint on the main thread and stutter).
  const at = (i: number) => `translateX(${(-i / frames) * 100}%)`;
  const move = (i: number) =>
    shift
      ? `translate(${shift[Math.min(i, shift.length - 1)][0]}%, ${shift[Math.min(i, shift.length - 1)][1]}%)`
      : "none";
  useEffect(() => {
    const el = strip.current;
    const outer = box.current;
    if (!el || !outer || last) return;
    if (frames < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Keep a static pose, but complete its visual lifecycle at the normal time.
      if (loop) return;
      el.style.transform = at(frames - 1);
      outer.style.transform = move(frames - 1);
      const timer = setTimeout(() => onDone?.(), fps > 0 ? (frames / fps) * 1000 : 0);
      return () => clearTimeout(timer);
    }
    const duration = (frames / fps) * 1000;
    const opts: KeyframeAnimationOptions = { duration, iterations: loop ? Infinity : 1, fill: "forwards" };
    const frame = (f: (i: number) => string, prop: "transform") =>
      Array.from({ length: frames + 1 }, (_, i) => ({
        [prop]: f(Math.min(i, frames - 1)),
        offset: i / frames,
        easing: "step-end",
      })) as Keyframe[];
    const run = el.animate(frame(at, "transform"), opts);
    const shifted = shift ? outer.animate(frame(move, "transform"), opts) : null;
    if (!loop) run.onfinish = () => onDone?.();
    return () => {
      run.cancel();
      shifted?.cancel();
    };
  }, [anim.src, frames, fps, loop, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const f0 = last ? frames - 1 : 0;
  return (
    <div
      ref={box}
      role="img"
      aria-hidden="true"
      className={`${flip ? "-scale-x-100" : ""} ${className}`}
      style={{
        aspectRatio: anim.aspect ?? 1,
        overflow: "hidden",
        transform: shift ? move(f0) : undefined,
      }}
    >
      <div
        ref={strip}
        style={{
          width: `${frames * 100}%`,
          height: "100%",
          willChange: "transform",
          transform: at(f0),
          backgroundImage: `url(${anim.src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
        }}
      />
    </div>
  );
}
