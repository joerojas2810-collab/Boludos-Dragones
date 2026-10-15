"use client";

// Small shared pieces of the expedition screens: relic icon, scope tags, the explicit
// select-then-confirm list (docs/torre/02) and the keypress guard that stops a held Enter/Space
// from confirming something in the next view.
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { GUARD_MS, keyGuardBlocks, SAVE_LABEL, type SaveStatus } from "@/lib/expeditionSync";
import { SCOPE, type Scope } from "@/lib/expeditionView";
import type { RelicId } from "@/lib/game/relics";

export const RelicIcon = ({ id, className = "h-10" }: { id: RelicId; className?: string }) => (
  <Icon name={`relic_${id}`} className={className} />
);

/** "Cuenta" / "Esta expedición" / "Próximo combate": the scope is always written, never only coloured. */
export function ScopeTag({ scope }: { scope: Scope }) {
  const tone = scope === "cuenta" ? "border-emerald-400/70 text-emerald-200" : scope === "proximo" ? "border-rose-400/70 text-rose-200" : "border-amber-300/70 text-amber-200";
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold uppercase leading-5 tracking-wide ${tone}`}>
      {SCOPE[scope]}
    </span>
  );
}

export const FragmentsChip = ({ value }: { value: number }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <Icon name="system_fragment" className="h-5" />
    <b className="tabular-nums">{value}</b>
    <span className="text-xs text-[#d9d2ca]">fragmentos</span>
  </span>
);

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  const tone = status === "saved" ? "text-emerald-200" : status === "saving" ? "text-amber-200" : "text-rose-200";
  const mark = status === "saved" ? "✓" : status === "saving" ? "…" : "!";
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${tone}`}>
      <span aria-hidden="true">{mark}</span>
      {SAVE_LABEL[status]}
      {(status === "error" || status === "offline") && onRetry && (
        <button className="underline" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </span>
  );
}

/**
 * `guard(fn)` wraps a click handler: for GUARD_MS after the view changed (and for key repeat) a
 * keyboard-originated click does nothing. Mouse and touch clicks are never delayed.
 */
export function useConfirmGuard(viewKey: string) {
  const until = useRef(0);
  useEffect(() => {
    until.current = Date.now() + GUARD_MS;
  }, [viewKey]);
  return useCallback(
    (fn: () => void) => (e: MouseEvent) => {
      if (keyGuardBlocks(Date.now(), until.current, e.detail)) return;
      fn();
    },
    [],
  );
}

/** Held Enter/Space must never repeat a button press (a held key would buy twice or skip a screen). */
export function useNoKeyRepeat() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat && (e.key === "Enter" || e.key === " ") && (e.target as HTMLElement | null)?.closest?.("button, a, [role='button']"))
        e.preventDefault();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);
}

export interface PickOption {
  value: string;
  label: ReactNode;
}
export interface ChoiceItem {
  id: string;
  node: ReactNode;
  disabled?: string | null;
  /** Second step shown when this item is selected (which relic to replace / upgrade). */
  pick?: { title: string; options: PickOption[] };
}

/** One native radio card: arrow keys, focus ring and touch all come from the platform. */
function RadioCard({
  name,
  value,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="radio" className="peer sr-only" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <div
        className={`tile-art relative h-full min-w-0 p-2 text-sm peer-focus-visible:outline peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-300 ${checked ? "ring-4 ring-green-400" : ""} ${disabled ? "opacity-60" : ""}`}
      >
        {checked && <span className="absolute right-1 top-1 z-10 rounded bg-green-400 px-1 text-xs font-bold text-black">✓ Elegido</span>}
        {children}
      </div>
    </label>
  );
}

/**
 * Select first, then confirm: a choice is never committed by selecting it. Remount it (key) when the
 * view changes so the selection and the confirm guard start clean.
 */
export function Choices({
  name,
  items,
  confirmLabel,
  onConfirm,
  guard,
  extra,
  className = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  name: string;
  items: ChoiceItem[];
  confirmLabel: string | null; // null = nothing left to confirm (only `extra` shows)
  onConfirm: (id: string, pick?: string) => void;
  guard: ReturnType<typeof useConfirmGuard>;
  extra?: ReactNode; // secondary buttons beside "confirm" (decline, continue...)
  className?: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const cur = items.find((i) => i.id === sel) ?? null;
  const missing = !cur ? "Elige una opción para continuar." : cur.pick && pick === null ? "Elige también cuál." : null;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Opciones" className={`grid min-w-0 grid-cols-1 gap-2 ${className}`}>
        {items.map((it) => (
          <RadioCard
            key={it.id}
            name={name}
            value={it.id}
            checked={sel === it.id}
            disabled={!!it.disabled}
            onChange={() => {
              setSel(it.id);
              setPick(null);
            }}
          >
            {it.node}
            {it.disabled && <p className="mt-1 text-xs font-semibold text-amber-200">{it.disabled}</p>}
          </RadioCard>
        ))}
      </div>
      {cur?.pick && (
        <fieldset className="rounded border border-white/20 p-2">
          <legend className="px-1 text-sm font-semibold text-yellow-300">{cur.pick.title}</legend>
          <div role="radiogroup" className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
            {cur.pick.options.map((o) => (
              <RadioCard key={o.value} name={`${name}-pick`} value={o.value} checked={pick === o.value} onChange={() => setPick(o.value)}>
                {o.label}
              </RadioCard>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {confirmLabel !== null && (
          <button className="btn text-center" disabled={!!missing} onClick={guard(() => cur && onConfirm(cur.id, pick ?? undefined))}>
            {confirmLabel}
          </button>
        )}
        {extra}
      </div>
      {confirmLabel !== null && missing && <p className="text-center text-xs text-[#d9d2ca]">{missing}</p>}
    </div>
  );
}
