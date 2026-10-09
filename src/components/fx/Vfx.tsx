"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { usePrefersReducedMotion } from "@/lib/motion";
import { effectMeta, effectSrc, isPixelEffect } from "@/lib/art/effects";
import "./effects.css";

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
  const m = effectMeta(id);
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
  if (isPixelEffect(id)) {
    const style = {
      aspectRatio: aspect,
      "--pixel-cell-w": `${m.cell[0]}px`,
      "--pixel-cell-h": `${m.cell[1]}px`,
      "--pixel-cell-aspect": aspect,
    } as CSSProperties;
    return <div className={`${className} pixel-effect-vfx-box${m.cell[0] >= 384 ? " pixel-effect-vfx-wide" : ""}`} style={style}>
      {reduced ? <img src={effectSrc(id, true)} alt="" className="pixel-effect-vfx-native" /> : <AnimSheet
        anim={{ src: effectSrc(id, false), frames: m.frames, fps: m.fps, loop: m.loop, aspect }}
        className="pixel-effect-vfx-native"
        onDone={() => {
          onDone?.();
          if (m.finish === "remove") setGone(true);
        }}
      />}
    </div>;
  }
  if (reduced)
    return (
      <img src={effectSrc(id, true)} alt="" className={className} style={{ aspectRatio: aspect, imageRendering: isPixelEffect(id) ? "pixelated" : undefined }} />
    );
  return (
    <AnimSheet
      anim={{ src: effectSrc(id, false), frames: m.frames, fps: m.fps, loop: m.loop, aspect }}
      className={`${className}${isPixelEffect(id) ? " pixel-effect" : ""}`}
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
  const m = effectMeta(kind);
  const glyphSize = isPixelEffect(kind) ? Math.max(m.cell[1], Math.round(size / m.cell[1]) * m.cell[1]) : size;
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
  const w = (glyphSize * m.cell[0]) / m.cell[1];
  const step = (m.advance ?? m.cell[0] / 2) * (glyphSize / m.cell[1]);
  const cols = reduced ? 1 : m.frames;
  return (
    <span role="img" aria-label={text} className="inline-flex" style={{ height: glyphSize, imageRendering: isPixelEffect(kind) ? "pixelated" : undefined }}>
      {[...text].map((ch, i) => {
        const row = m.glyphRow?.[ch];
        if (row === undefined) return null;
        return (
          <span
            key={i}
            style={{
              width: step,
              height: glyphSize,
              flex: "none",
              backgroundImage: `url(${effectSrc(kind, reduced)})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${cols * w}px ${rows * glyphSize}px`,
              // center the glyph cell inside its advance
              backgroundPosition: `${(step - w) / 2 - (reduced ? 0 : frame * w)}px ${-row * glyphSize}px`,
              overflow: "visible",
            }}
          />
        );
      })}
    </span>
  );
}
