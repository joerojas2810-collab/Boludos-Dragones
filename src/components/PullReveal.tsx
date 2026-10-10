"use client";

import { CLASSES } from "@/lib/game/characters";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RARITIES, RARITY_IDS, isTopRank } from "@/lib/game/rarity";
import { playPullSound } from "@/lib/sfx";
import { Vfx } from "@/components/fx/Vfx";
import { ItemCard, type ItemView } from "./ItemCard";
import { ELEMENT_LABEL } from "@/lib/game/elements";
import { WEAPON_TYPE_DATA } from "@/lib/game/weapons";
import "./fx.css";
import "./pull-reveal.css";

// Light rays behind a Legendario reveal (CSS-rotated SVG, no image files).
function Rays({ color }: { color: string }) {
  return (
    <div className="b-rays pointer-events-none absolute inset-0 m-auto h-72 w-72 max-w-[90vw]">
      <svg viewBox="-50 -50 100 100" className="h-full w-full">
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d="M0 0 L-6 -50 L6 -50Z"
            fill={color}
            opacity="0.55"
            transform={`rotate(${i * 30})`}
          />
        ))}
      </svg>
    </div>
  );
}

// Pixel chest that shakes while the pull is summoned; glow tint = best rarity.
function Chest({ color }: { color: string }) {
  return (
    <div className="b-chest relative h-24 w-28">
      <div
        className="b-chest-glow absolute -inset-4 rounded-full blur-xl"
        style={{ background: color }}
      />
      <svg
        viewBox="0 0 14 12"
        shapeRendering="crispEdges"
        className="relative h-full w-full"
      >
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

type Props = { items: ItemView[]; onDone: () => void; legacy?: boolean }; // legacy: pixel chest, no painted effects

const SUMMON_MS = 1100;
const STEP_MS = 450;

function FittedCard({ item }: { item: ItemView }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(96);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(24, Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height * 0.75, 240))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="pull-card-fit"><ItemCard item={{ ...item, badge: undefined, lines: undefined }} size={width - 24} className="pull-result-card" /></div>;
}

const best = (items: ItemView[]) =>
  items.reduce((a, b) =>
    RARITY_IDS.indexOf(b.rarity) > RARITY_IDS.indexOf(a.rarity) ? b : a,
  ).rarity;

export function PullReveal({ items, onDone, legacy = false }: Props) {
  const [shown, setShown] = useState(-1); // -1 = summoning
  const continueButton = useRef<HTMLButtonElement>(null);
  const bestId = best(items);
  const color = RARITIES[bestId].color;
  const finished = shown >= items.length - 1;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

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
  const legendNow = shown >= 0 && isTopRank(items[shown].rarity);
  // Portal: an ancestor stacking context would leave the overlay under the top bar.
  const ui = (
    <div className="pull-overlay fixed inset-0 z-50 flex bg-[#050b16]/90" role="dialog" aria-modal="true" aria-labelledby="pull-results-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (finished) onDone();
          else setShown(items.length - 1);
        }
        if (event.key === "Tab") {
          event.preventDefault();
          continueButton.current?.focus();
        }
      }}>
      {legendNow && (
        <div
          key={shown}
          className="fx-flash pointer-events-none fixed inset-0 bg-yellow-300/50"
        />
      )}
      <section className="pull-panel relative m-auto flex w-full max-w-[1040px] flex-col border-2 border-[#637f9b] bg-[#101c2e] text-white shadow-[0_0_0_3px_#050b16,0_24px_80px_#000]">
      <header className="pull-header shrink-0 border-b border-[#40546c] text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#c2a66c]">Boludos & Dragones</p>
        <h2 id="pull-results-title" className="text-xl font-bold text-[#ffe0a3] sm:text-2xl">{shown < 0 ? "Abriendo la invocación" : "Tu botín de invocación"}</h2>
        <p className="mt-1 text-xs text-[#bdcce0]">{shown < 0 ? "La próxima aventura empieza acá." : finished ? `${items.length} ${single ? "resultado" : "resultados"} · Mejor rango: ${RARITIES[bestId].label}` : `Revelando ${shown + 1} de ${items.length}...`}</p>
      </header>
      {shown < 0 ? (
        <div className="relative m-auto flex h-40 w-40 items-center justify-center">
          {isTopRank(bestId) && <Rays color={color} />}
          {legacy ? (
            <Chest color={color} />
          ) : (
            <Vfx id={`gacha_open_${bestId}`} className="h-44 w-44 max-w-none" />
          )}
          <p className="absolute -bottom-6 text-sm">Invocando...</p>
        </div>
      ) : (
        <div
          className={`pull-grid ${single ? "pull-grid-single" : ""}`}
        >
          {items.slice(0, shown + 1).map((it, i) => (
            <article key={i} className="pull-result fx-flip relative flex min-h-0 min-w-0 flex-col items-center gap-1 text-center">
              <div className="pull-card-space relative isolate overflow-hidden">
              {isTopRank(it.rarity) && i === shown && <Rays color={color} />}
              {isTopRank(it.rarity) && (
                <div
                  className="fx-burst pointer-events-none absolute inset-0 m-auto h-24 w-24 rounded-full"
                  style={{ background: RARITIES[it.rarity].color }}
                />
              )}
              {!legacy && i === shown && (
                <Vfx
                  id={`gacha_reveal_${it.rarity}`}
                  className="pointer-events-none absolute inset-0 -z-10 w-full max-w-none opacity-40"
                />
              )}
              {!legacy && i === shown && it.pity && (
                <Vfx
                  id={`gacha_pity_${it.pity}`}
                  className="pointer-events-none absolute inset-0 -z-10 w-full max-w-none opacity-40"
                />
              )}
                <FittedCard item={it} />
              </div>
              <h3 className="sr-only">{it.name}</h3>
              <p className="pull-detail w-full truncate text-[#bdcce0]">{it.kind === "character" ? CLASSES[it.classId].name : WEAPON_TYPE_DATA[it.type ?? "espada"].label} · {ELEMENT_LABEL[it.element]}</p>
              <p className="pull-detail font-bold" style={{ color: RARITIES[it.rarity].color }}>Rango {RARITIES[it.rarity].label}{it.pity ? " · Garantizado" : ""}</p>
              <span className={`pull-outcome w-full border font-bold ${it.badge?.startsWith("REEMBOLSO") ? "border-[#aa8747] bg-[#382c16] text-[#ffe0a3]" : it.badge?.startsWith("+1") ? "border-[#567faa] bg-[#1c3454] text-[#d3e8ff]" : "border-[#43846b] bg-[#15362d] text-[#baf3d9]"}`}>
                <span className="pull-outcome-rank" style={{ color: RARITIES[it.rarity].color }}>{RARITIES[it.rarity].label} · </span>
                {it.badge?.startsWith("REEMBOLSO") ? it.badge.replace("REEMBOLSO", "Reembolso") + " monedas" : it.badge === "+1 COPIA" ? "Duplicado · copia guardada" : it.badge?.startsWith("+1") ? "Duplicado · +1 estrella" : it.badge === "NUEVO" ? "Nuevo" : it.badge ?? "Obtenido"}
              </span>
            </article>
          ))}
        </div>
      )}
      <footer className="pull-footer flex shrink-0 justify-center border-t border-[#40546c] bg-[#101c2e]">
      <button ref={continueButton}
        className="btn min-w-40 text-center"
        onClick={() => (finished ? onDone() : setShown(items.length - 1))}
      >
        {finished ? "Continuar" : "Saltar"}
      </button>
      </footer>
      </section>
    </div>
  );
  return typeof document === "undefined" ? ui : createPortal(ui, document.body);
}
