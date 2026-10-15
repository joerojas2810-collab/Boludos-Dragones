"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { isPixel } from "@/lib/art/pixel";
import { STATUS_ANCHORS, type StatusAnchorFamily } from "@/lib/art/statusAnchors";
import {
  diffLayers, layerOpacities, statusLayers, statusLayerSrc, type StatusLayer, LAYER_KINDS,
} from "@/lib/art/statusLayers";
import type { Combatant } from "@/lib/game/combat";
import { reducedMotion } from "@/components/fx/motion";
import "./status-overlay.css";

const FADE_MS = 150; // within the 120-180 ms of the contract; keep in sync with status-overlay.css

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const hidden = () => document.hidden;

interface Leaving {
  key: string;
  layer: StatusLayer;
  delayMs: number;
}

/**
 * Elemental status envelopes over one combatant: a single static image per state, derived from the
 * rendered Combatant (never a parallel state). Mount inside the sprite's visible box (position: relative).
 * The only local state is the short fade of a layer that just left; on mount the right layers show directly.
 */
export function ElementalStatusOverlay({
  c, family = "foe", artStyle, ended = false, delayMs = 0, debug,
}: {
  c: Pick<Combatant, "hp" | "statuses" | "charge">;
  family?: StatusAnchorFamily;
  artStyle?: "painted" | "pixel";
  ended?: boolean; // fight over: loops stop
  delayMs?: number; // wait before a change shows (lands with the impact that causes it)
  debug?: string;
}) {
  const pixel = artStyle ? artStyle === "pixel" : isPixel();
  const next = statusLayers(c);
  const sig = next.map((l) => l.id).join(",");
  const [seen, setSeen] = useState({ sig, layers: next });
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set());
  const away = useSyncExternalStore(subscribeVisibility, hidden, () => false);

  // Compare with the previous render (set during render, like useBattleFx): no effect, no extra frame.
  if (seen.sig !== sig) {
    setSeen({ sig, layers: next });
    if (reducedMotion()) {
      setLeaving([]);
      setEntering(new Set());
    } else {
      const d = diffLayers(seen.layers, next);
      setLeaving((l) => [...l, ...d.leaving.map((layer) => ({ key: `${layer.id}>${sig}`, layer, delayMs }))]);
      setEntering(new Set(d.entering.map((l) => l.id)));
    }
  }

  // One timer for the batch; any new departure restarts it, unmount cancels it.
  useEffect(() => {
    if (!leaving.length) return;
    const wait = Math.max(...leaving.map((l) => l.delayMs)) + FADE_MS + 60;
    const id = setTimeout(() => setLeaving([]), wait);
    return () => clearTimeout(id);
  }, [leaving]);

  if (!next.length && !leaving.length) return null;
  const anchor = STATUS_ANCHORS[family][pixel ? "pixel" : "painted"];
  const opacity = layerOpacities(next);
  const rows = [
    ...leaving.map((l) => ({ key: l.key, layer: l.layer, out: true, delay: l.delayMs })),
    ...next.map((layer) => ({ key: layer.id, layer, out: false, delay: delayMs })),
  ].sort((x, y) => LAYER_KINDS.indexOf(x.layer.kind) - LAYER_KINDS.indexOf(y.layer.kind));
  const [ct, cr, cb, cl] = anchor.clip;
  return (
    <div
      aria-hidden="true"
      className="est-root"
      data-art={pixel ? "pixel" : "painted"}
      data-paused={ended || away ? "true" : undefined}
      data-debug={debug}
      style={{
        "--est-ax": anchor.anchorX, "--est-ay": anchor.anchorY,
        "--est-ox": anchor.offsetX, "--est-oy": anchor.offsetY,
        "--est-ws": anchor.widthScale, "--est-hs": anchor.heightScale,
        clipPath: `inset(${ct * 100}% ${cr * 100}% ${cb * 100}% ${cl * 100}%)`,
      } as CSSProperties}
    >
      {rows.map(({ key, layer, out, delay }) => (
        <span
          key={key}
          className={`est-layer ${out ? "est-out" : entering.has(layer.id) ? "est-in" : ""}`}
          style={{ "--est-delay": `${delay}ms`, "--est-o": out ? 1 : opacity[layer.kind] } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={statusLayerSrc(layer.id, pixel)}
            alt=""
            draggable={false}
            decoding="async"
            className={`est-img est-${layer.kind} ${layer.kind === "charge" && layer.stacks === 3 ? "est-strong" : ""}`}
          />
        </span>
      ))}
    </div>
  );
}
