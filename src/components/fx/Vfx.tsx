"use client";

import { useEffect, useState } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { usePrefersReducedMotion } from "@/lib/motion";
import { EFFECTS } from "@/lib/art/effects.generated";

const src = (id: string, reduced: boolean) =>
  `/art/effects/${reduced ? "reduced/" : ""}${id}.webp`;

// Painted one-row effect sheet (id = file name without "vfx_", e.g. "hit_fire").
// Plays after `delay` s; "remove" effects vanish when done, "hold" keep the last
// frame, "loop" repeats. Reduced motion shows the static version (and nothing
// for the purely decorative ones, which ship as transparent images).
export function Vfx({
  id,
  delay = 0,
  className = "",
  onDone,
}: {
  id: string;
  delay?: number;
  className?: string;
  onDone?: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const m = EFFECTS[id];
  const [go, setGo] = useState(delay <= 0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setGo(true), delay * 1000);
    return () => clearTimeout(t);
  }, [delay]);
  // Reduced motion shows a still image; "remove" effects must still leave after their
  // normal duration (otherwise the still stays on screen forever).
  const stillMs = m ? Math.max(1200, (m.frames / m.fps) * 1000) : 0;
  const stillOnScreen = !!m && go && reduced && m.finish === "remove";
  useEffect(() => {
    if (!stillOnScreen) return;
    const t = setTimeout(() => setGone(true), stillMs);
    return () => clearTimeout(t);
  }, [stillOnScreen, stillMs]);
  if (!m || !go || gone) return null;
  const aspect = m.cell[0] / m.cell[1];
  if (reduced)
    return (
      <img src={src(id, true)} alt="" className={className} style={{ aspectRatio: aspect }} />
    );
  return (
    <AnimSheet
      anim={{ src: src(id, false), frames: m.frames, fps: m.fps, loop: m.loop, aspect }}
      className={className}
      onDone={() => {
        onDone?.();
        if (m.finish === "remove") setGone(true);
      }}
    />
  );
}

// Damage / heal numbers from the animated glyph atlas (13 rows: 0-9 + - .).
// `size` = rendered glyph height in px; characters outside the atlas are skipped.
export function VfxNumber({
  text,
  kind,
  delay = 0,
  size = 40,
}: {
  text: string;
  kind: "damage_normal" | "damage_critical" | "heal_number";
  delay?: number;
  size?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const m = EFFECTS[kind];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let i = 0;
    let iv: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      iv = setInterval(() => {
        if (++i >= m.frames) clearInterval(iv);
        else setFrame(i);
      }, 1000 / m.fps);
    }, delay * 1000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [reduced, delay, m.frames, m.fps]);
  const rows = m.rows;
  const w = (size * m.cell[0]) / m.cell[1];
  const step = (m.advance ?? m.cell[0] / 2) * (size / m.cell[1]);
  const cols = reduced ? 1 : m.frames;
  return (
    <span role="img" aria-label={text} className="inline-flex" style={{ height: size }}>
      {[...text].map((ch, i) => {
        const row = m.glyphRow?.[ch];
        if (row === undefined) return null;
        return (
          <span
            key={i}
            style={{
              width: step,
              height: size,
              flex: "none",
              backgroundImage: `url(${src(kind, reduced)})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${cols * w}px ${rows * size}px`,
              // center the glyph cell inside its advance
              backgroundPosition: `${(step - w) / 2 - (reduced ? 0 : frame * w)}px ${-row * size}px`,
              overflow: "visible",
            }}
          />
        );
      })}
    </span>
  );
}
