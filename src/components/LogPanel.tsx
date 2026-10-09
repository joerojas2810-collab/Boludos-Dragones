"use client";

import { useState, type ReactNode } from "react";

// The fight is told by the arena effects (numbers, misses, status icons); the written log is
// optional: a "Registro" button opens it over the arena. The latest line stays for screen readers.
export function LogPanel({
  lines,
  children,
  className = "",
  compact,
}: {
  lines: string[];
  children?: ReactNode;
  className?: string;
  compact?: boolean; // small tools for the command bar
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${compact ? "" : "shrink-0 py-1"} ${className}`}>
      <div className={`flex items-center ${compact ? "gap-1.5 [&>*]:!px-2 [&>*]:text-xs" : "flex-wrap justify-center gap-3 [&>*]:text-sm"} [&>*]:!mt-0 [&>*]:!w-auto [&>*]:!min-h-0 [&>*]:!py-0.5`}>
        {children}
        <button className="btn btn-gray text-center" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Cerrar registro" : "Registro"}
        </button>
      </div>
      {open && (
        <ul className="action-inset panel-float fixed bottom-20 right-3 z-40 max-h-[45vh] w-[min(26rem,calc(100vw-1.5rem))] space-y-0.5 overflow-y-auto p-2 text-[13px] leading-5 text-[#d9d2ca]">
          {[...lines].reverse().map((l, i) => (
            <li key={lines.length - i} className={i === 0 ? "text-[#f6ead6]" : "opacity-75"}>
              {l}
            </li>
          ))}
        </ul>
      )}
      <div className="sr-only" aria-live="polite">
        {lines[lines.length - 1]}
      </div>
    </section>
  );
}
