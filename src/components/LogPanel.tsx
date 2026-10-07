"use client";

import { useState, type ReactNode } from "react";

// Colour semantics: damage orange, heal green, danger red, misses grey, support cyan.
function lineClass(l: string): string {
  if (l.startsWith("—")) return "log-round";
  if (/crítico/.test(l)) return "text-orange-300 font-semibold";
  if (/cae\.|derrota|no logra huir/i.test(l)) return "text-red-300";
  if (/de daño/.test(l)) return "text-orange-200";
  if (/recupera|bendice|regenera|cura/i.test(l)) return "text-green-300";
  if (/falla|esquiva|se defiende|absorbe/.test(l)) return "text-[#aeb8c4]";
  if (/veloz|actúa de nuevo|cambia a|enfurece/.test(l)) return "text-cyan-300";
  return "text-[var(--text)]";
}

export function LogPanel({
  lines,
  children,
}: {
  lines: string[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const recent = lines.slice(-4).reverse();
  const row = (l: string, i: number, n: number) => (
    <div
      key={n - i}
      className={`log-line ${lineClass(l)} ${i === 0 ? "log-new" : ""} ${!open && i === 2 ? "[@media(max-height:800px)]:hidden" : ""}`}
    >
      {l}
    </div>
  );
  return (
    <section className="relative shrink-0 rounded-sm border-2 border-[var(--edge)] bg-[#1b1410]/90 px-3 py-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-yellow-300">Registro</span>
        <button
          type="button"
          className="text-[13px] text-[#d9d2ca] hover:text-white"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Compactar ▾" : "Ver todo ▴"}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2 [&>*]:!mt-0 [&>*]:!w-auto [&>*]:!min-h-0 [&>*]:!py-0.5 [&>*]:text-sm">
          {children}
        </div>
      </div>
      <div aria-live="polite" aria-label="Registro de la pelea">
        {!open && recent.slice(0, 3).map((l, i) => row(l, i, lines.length))}
      </div>
      {open && (
        <div className="panel-art absolute inset-x-0 bottom-full z-40 mb-1 h-64 overflow-y-auto !p-3">
          {[...lines].reverse().map((l, i) => row(l, i, lines.length))}
        </div>
      )}
    </section>
  );
}
