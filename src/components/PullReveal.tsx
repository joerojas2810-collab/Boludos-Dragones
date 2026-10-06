"use client";

import { useEffect, useState } from "react";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import { playPullSound } from "@/lib/sfx";
import { ItemCard, type ItemView } from "./ItemCard";

type Props = { items: ItemView[]; onDone: () => void };

const SUMMON_MS = 1100;
const STEP_MS = 450;

const best = (items: ItemView[]) =>
  items.reduce((a, b) =>
    RARITY_IDS.indexOf(b.rarity) > RARITY_IDS.indexOf(a.rarity) ? b : a,
  ).rarity;

export function PullReveal({ items, onDone }: Props) {
  const [shown, setShown] = useState(-1); // -1 = summoning
  const color = RARITIES[best(items)].color;
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
          <div
            className="fx-shake h-16 w-16 border-4 border-[var(--edge)]"
            style={{ background: color, boxShadow: `0 0 40px 10px ${color}` }}
          />
          <div
            className="fx-flash absolute inset-0"
            style={{ background: color, animationDelay: "0.6s" }}
          />
          <p className="absolute -bottom-6 text-sm">Invocando...</p>
        </div>
      ) : (
        <div
          className={`${legendNow ? "fx-bigshake-a" : ""} grid gap-x-2 gap-y-4 ${single ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-5"}`}
        >
          {items.slice(0, shown + 1).map((it, i) => (
            <div key={i} className="relative fx-flip">
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
