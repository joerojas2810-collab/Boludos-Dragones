"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
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
const HOLD_MS = 450; // long press on touch for buttons

type Props = {
  tip: Tip | null | undefined;
  children: ReactNode;
  className?: string; // wrapper layout, e.g. "block" or "inline-flex"
  // false when the child is itself focusable (button): the child gets the aria
  // link and a long press (touch) opens the tip instead of a tap.
  focusable?: boolean;
};

// Opens on mouse hover, keyboard focus and tap (touch). Rendered in a portal
// with fixed position, so it also works inside overflow-hidden containers and
// is clamped/flipped to stay inside the viewport.
export function Tooltip({
  tip,
  children,
  className = "inline-flex",
  focusable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suppressClick = useRef(false);
  const lastPointer = useRef("mouse");
  const dismissed = useRef(false); // mouse click closed it; stay shut until the pointer leaves

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
  }, []);

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

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  if (!tip) return <>{children}</>;

  const isTouch = (e: PointerEvent) => e.pointerType !== "mouse";
  const onPointerDown = (e: PointerEvent) => {
    lastPointer.current = e.pointerType;
    if (!isTouch(e)) {
      // a click means "do it": hide the tip so it never covers the animation
      dismissed.current = true;
      setOpen(false);
      return;
    }
    if (focusable) return;
    suppressClick.current = false;
    holdTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setOpen(true);
    }, HOLD_MS);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const linked = open ? id : undefined;
  const child =
    !focusable && isValidElement(children)
      ? cloneElement(
          children as ReactElement<{ "aria-describedby"?: string }>,
          {
            "aria-describedby": linked,
          },
        )
      : children;

  return (
    <span
      ref={wrapRef}
      className={className}
      {...(focusable
        ? { tabIndex: 0, "aria-describedby": linked, role: "group" }
        : {})}
      onPointerEnter={(e) => {
        if (isTouch(e)) return;
        dismissed.current = false;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (!isTouch(e)) setOpen(false);
        dismissed.current = false;
        endHold();
      }}
      onPointerDown={onPointerDown}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onFocus={(e) => {
        if (!dismissed.current && e.target.matches(":focus-visible"))
          setOpen(true);
      }}
      onBlur={() => setOpen(false)}
      onContextMenu={(e) => !focusable && e.preventDefault()}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={() => {
        // tap on a non-button anchor toggles; mouse clicks leave hover alone
        if (focusable && lastPointer.current !== "mouse") setOpen((o) => !o);
      }}
    >
      {child}
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
            {tip.source && <p className="tip-source">Fuente: {tip.source}</p>}
          </div>,
          document.body,
        )}
    </span>
  );
}
