"use client";

import { useEffect, useState } from "react";

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
};

// Keyed by src so a new animation always restarts at frame 0.
export const AnimSheet = (props: Props) => (
  <Sheet key={props.anim.src} {...props} />
);

function Sheet({ anim, flip = false, className = "", onDone }: Props) {
  const [frame, setFrame] = useState(0);
  const { frames, fps, loop } = anim;
  useEffect(() => {
    if (
      frames < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= frames) {
        if (loop) i = 0;
        else {
          clearInterval(id);
          onDone?.();
          return;
        }
      }
      setFrame(i);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [anim.src, frames, fps, loop]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      role="img"
      aria-hidden="true"
      className={`${flip ? "-scale-x-100" : ""} ${className}`}
      style={{
        aspectRatio: anim.aspect ?? 1,
        backgroundImage: `url(${anim.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${frames * 100}% 100%`,
        backgroundPosition: `${frames > 1 ? (frame / (frames - 1)) * 100 : 0}% 0`,
      }}
    />
  );
}
