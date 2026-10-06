import type { ReactNode } from "react";
import { Panel } from "@/components/Panel";

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
  return (
    <Panel
      title="Registro"
      className="flex flex-col text-sm md:w-64 md:shrink-0 md:[@media(max-height:760px)]:w-52"
    >
      <div
        className="h-32 overflow-y-auto md:h-0 md:flex-1"
        aria-live="polite"
        aria-label="Registro de la pelea"
      >
        {[...lines].reverse().map((l, i) => (
          <div
            key={lines.length - i}
            className={`log-line ${lineClass(l)} ${i === 0 ? "log-new" : ""}`}
          >
            {l}
          </div>
        ))}
      </div>
      {children}
    </Panel>
  );
}
