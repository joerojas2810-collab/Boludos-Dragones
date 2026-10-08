"use client";
import { useEffect, useId, useRef, useState } from "react";

export interface GameSelectOption<T extends string> {
  value: T;
  label: string;
}

// A select that opens a game-styled list instead of the browser's native popup.
// Same look as the `select` element (the button is a <select>-skinned control).
export function GameSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: GameSelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  const toggle = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((o) => !o);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        className="game-select-btn px-2 py-1.5 text-left text-base"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return toggle();
            setActive((a) =>
              Math.min(options.length - 1, Math.max(0, a + (e.key === "ArrowDown" ? 1 : -1))),
            );
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            choose(options[active].value);
          }
        }}
      >
        {current?.label}
      </button>
      {open && (
        <ul
          id={id}
          role="listbox"
          aria-label={label}
          className="tip-panel absolute left-0 top-full z-30 mt-1 max-h-64 min-w-full overflow-y-auto !p-1"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`cursor-pointer whitespace-nowrap rounded px-2 py-1 text-base ${
                i === active ? "bg-white/15" : ""
              } ${o.value === value ? "text-yellow-300" : ""}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
