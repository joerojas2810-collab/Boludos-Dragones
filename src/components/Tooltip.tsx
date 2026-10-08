"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Tip, TipKind } from "@/lib/game/explain";

const KIND_COLOR: Record<TipKind, string> = {
  passive: "#67e8f9",
  trait: "#d8b4fe",
  stat: "#fdba74",
  damage: "#fdba74",
  heal: "#86efac",
  danger: "#fca5a5",
  gold: "#fde047",
  relic: "#67e8f9",
  info: "#f2ebe3",
};

const MARGIN = 8; // min distance to the viewport edge
const GAP = 8; // distance to the anchor

type Props = {
  tip: Tip | null | undefined;
  children: ReactNode;
  className?: string; // wrapper layout, e.g. "block" or "inline-flex"
  // "side": open beside the anchor (left, else right) on wide screens so it never covers
  // the elements stacked above/below it (e.g. the action column).
  placement?: "auto" | "side";
};

// The tip opens only when the small "?" badge in the corner is clicked/tapped (never on hover,
// focus or by pressing the content itself). Rendered in a portal with fixed position, so it also
// works inside overflow-hidden containers and is clamped/flipped to stay inside the viewport.
export function Tooltip({
  tip,
  children,
  className = "inline-flex",
  placement = "auto",
}: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const anchor = wrapRef.current;
    const el = tipRef.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    el.style.maxWidth = `${Math.min(320, vw - 2 * MARGIN)}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (placement === "side" && vw >= 768) {
      const toLeft = a.left - GAP - w;
      const x =
        toLeft >= MARGIN ? toLeft : Math.min(a.right + GAP, vw - w - MARGIN);
      const y = Math.min(
        Math.max(MARGIN, a.top + a.height / 2 - h / 2),
        Math.max(MARGIN, vh - h - MARGIN),
      );
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.visibility = "visible";
      return;
    }
    const left = Math.min(
      Math.max(MARGIN, a.left + a.width / 2 - w / 2),
      vw - w - MARGIN,
    );
    const above = a.top - GAP - h;
    const below = a.bottom + GAP;
    // prefer above; flip below if it does not fit; else the side with more room
    const top =
      above >= MARGIN
        ? above
        : below + h <= vh - MARGIN
          ? below
          : a.top > vh - a.bottom
            ? Math.max(MARGIN, above)
            : Math.min(below, vh - h - MARGIN);
    el.style.left = `${left}px`;
    el.style.top = `${Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - h - MARGIN))}px`;
    el.style.visibility = "visible";
  }, [placement]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, tip]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!tip) return <>{children}</>;

  return (
    <span ref={wrapRef} className={`${className} relative`}>
      {children}
      <button
        type="button"
        className="tip-q"
        aria-label={`Ayuda: ${tip.title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{ visibility: "hidden", left: 0, top: 0 }}
            className="tip-panel pointer-events-none fixed z-50 w-max"
          >
            <div
              className="tip-title"
              style={{ color: tip.color ?? KIND_COLOR[tip.kind] }}
            >
              {tip.title}
            </div>
            {tip.lines.map((l, i) => (
              <p key={i} className="tip-line">
                {l}
              </p>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
