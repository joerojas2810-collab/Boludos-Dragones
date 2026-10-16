"use client";

// The six relic slots with tier, effect, duration and cap notes. On phones it is a bottom sheet that
// scrolls by itself, so it never squeezes the battlefield. Escape closes it.
import { useEffect, useRef } from "react";
import { relicRows, SCOPE, TIER_LABEL } from "@/lib/expeditionView";
import type { OwnedRelic } from "@/lib/game/relics";
import { RelicIcon } from "./parts";

export function RelicRows({ owned, compact }: { owned: readonly OwnedRelic[]; compact?: boolean }) {
  return (
    <ol className={`grid min-w-0 grid-cols-1 gap-1.5 ${compact ? "sm:grid-cols-2" : ""}`}>
      {relicRows(owned).map((r) => (
        <li key={r.slot} className={`tile-art flex min-w-0 items-start gap-2 p-2 text-sm ${r.relic ? "" : "opacity-60"}`}>
          {r.relic ? <RelicIcon id={r.relic.id} className="h-10 w-10 shrink-0" /> : <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded border border-dashed border-white/40 text-lg">+</span>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <b className="break-words">{r.name}</b>
              {r.relic && <span className="rounded bg-black/30 px-1 text-xs">{r.tier}</span>}
              {r.category && <span className="text-xs opacity-80">{r.category}</span>}
            </div>
            <p className="break-words text-xs leading-snug [overflow-wrap:anywhere]">{r.effect}</p>
            {r.relic && !compact && <p className="text-[11px] text-[#d9d2ca]">Duración: {SCOPE.expedicion}</p>}
            {r.cap && !compact && (
              <p className={`text-[11px] ${r.capped ? "font-semibold text-amber-200" : "text-[#d9d2ca]"}`}>
                {r.cap}
                {r.capped ? " · El tope está limitando esta reliquia ahora." : ""}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function BuildPanel({ owned, onClose }: { owned: readonly OwnedRelic[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeAction = useRef(onClose);
  useEffect(() => { closeAction.current = onClose; }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeAction.current();
      }
      if (e.key === "Tab") {
        const stops = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? []);
        const first = stops[0], last = stops[stops.length - 1];
        if (!dialog.current?.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Reliquias de la expedición"
        className="panel-art max-h-[88dvh] w-full overflow-y-auto overscroll-contain p-3 sm:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-art text-lg">
            Reliquias · {owned.length}/6
          </h2>
          <button ref={close} className="btn btn-gray text-center" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="mb-2 text-xs text-[#d9d2ca]">
          Duran {SCOPE.expedicion.toLowerCase()}: se pierden al terminar. {TIER_LABEL[1]} se mejora a {TIER_LABEL[2]} con una mejora; no hay un tercer nivel.
        </p>
        <RelicRows owned={owned} />
      </div>
    </div>
  );
}
