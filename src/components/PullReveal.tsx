"use client";

import { useEffect, useState } from "react";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import { playPullSound } from "@/lib/sfx";
import { ItemCard, type ItemView } from "./ItemCard";
import "./fx.css";

// Light rays behind a Legendario reveal (CSS-rotated SVG, no image files).
function Rays({ color }: { color: string }) {
  return (
    <div className="b-rays pointer-events-none absolute inset-0 m-auto h-72 w-72 max-w-[90vw]">
      <svg viewBox="-50 -50 100 100" className="h-full w-full">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M0 0 L-6 -50 L6 -50Z" fill={color} opacity="0.55" transform={`rotate(${i * 30})`} />
        ))}
      </svg>
    </div>
  );
}

// Pixel chest that shakes while the pull is summoned; glow tint = best rarity.
function Chest({ color }: { color: string }) {
  return (
    <div className="b-chest relative h-24 w-28">
      <div className="b-chest-glow absolute -inset-4 rounded-full blur-xl" style={{ background: color }} />
      <svg viewBox="0 0 14 12" shapeRendering="crispEdges" className="relative h-full w-full">
        <rect x="1" y="1" width="12" height="5" fill="#8a5a2b" />
        <rect x="1" y="6" width="12" height="5" fill="#6b4220" />
        <rect x="0" y="0" width="14" height="1" fill="#3a2410" />
        <rect x="0" y="11" width="14" height="1" fill="#3a2410" />
        <rect x="0" y="0" width="1" height="12" fill="#3a2410" />
        <rect x="13" y="0" width="1" height="12" fill="#3a2410" />
        <rect x="1" y="5" width="12" height="1" fill="#3a2410" />
        <rect x="3" y="1" width="1" height="10" fill="#c9b037" />
        <rect x="10" y="1" width="1" height="10" fill="#c9b037" />
        <rect x="6" y="4" width="2" height="3" fill={color} />
      </svg>
    </div>
  );
}

type Props = { items: ItemView[]; onDone: () => void };

const SUMMON_MS = 1100;
const STEP_MS = 450;

const best = (items: ItemView[]) =>
  items.reduce((a, b) =>
    RARITY_IDS.indexOf(b.rarity) > RARITY_IDS.indexOf(a.rarity) ? b : a,
  ).rarity;

export function PullReveal({ items, onDone }: Props) {
  const [shown, setShown] = useState(-1); // -1 = summoning
  const bestId = best(items);
  const color = RARITIES[bestId].color;
  const finished = shown >= items.length - 1;

  useEffect(() => {
    if (finished) return;
    const id = setTimeout(
      () => setShown((n) => n + 1),
      shown < 0 ? SUMMON_MS : STEP_MS,
    );
    return () => clearTimeout(id);
  }, [shown, finished]);

  useEffect(() => {
    if (shown >= 0) playPullSound(items[shown].rarity);
  }, [shown, items]);

  const single = items.length === 1;
  const legendNow = shown >= 0 && items[shown].rarity === "legendario";
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center gap-4 overflow-y-auto bg-black/95 p-4 [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
      {legendNow && (
        <div
          key={shown}
          className="fx-flash pointer-events-none fixed inset-0 bg-yellow-300/50"
        />
      )}
      {shown < 0 ? (
        <div className="relative flex h-40 w-40 items-center justify-center">
          {bestId === "legendario" && <Rays color={color} />}
          <Chest color={color} />
          <p className="absolute -bottom-6 text-sm">Invocando...</p>
        </div>
      ) : (
        <div
          className={`${legendNow ? "fx-bigshake-a" : ""} grid gap-x-2 gap-y-4 ${single ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-5"}`}
        >
          {items.slice(0, shown + 1).map((it, i) => (
            <div key={i} className="relative fx-flip">
              {it.rarity === "legendario" && i === shown && <Rays color={color} />}
              {it.rarity === "legendario" && (
                <div
                  className="fx-burst pointer-events-none absolute inset-0 m-auto h-24 w-24 rounded-full"
                  style={{ background: RARITIES.legendario.color }}
                />
              )}
              <ItemCard item={it} size={single ? 144 : 76} />
            </div>
          ))}
        </div>
      )}
      <button
        className="btn btn-gray text-center"
        onClick={() => (finished ? onDone() : setShown(items.length - 1))}
      >
        {finished ? "Continuar" : "Saltar"}
      </button>
    </div>
  );
}
