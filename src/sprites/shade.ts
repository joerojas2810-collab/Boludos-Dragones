import type { Element } from "@/lib/game/elements";
import { colorFor } from "./palettes";

const SHADEABLE = new Set(["a", "m", "s", "w", "y", "h", "p", "l"]);

function adjust(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const t = amount > 0 ? 255 : 0;
    return Math.round(v + (t - v) * Math.abs(amount));
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export interface Pixel {
  x: number;
  y: number;
  fill: string;
}

// Light comes from the top-left: pixels on a top/left edge are lightened,
// pixels on a bottom/right edge are darkened.
export function shadePixels(
  grid: readonly string[],
  element: Element,
): Pixel[] {
  const edge = (x: number, y: number) => {
    const c = grid[y]?.[x];
    return c === undefined || c === "." || c === "o";
  };
  const out: Pixel[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const base = colorFor(ch, element);
      if (!base) return;
      let fill = base;
      if (SHADEABLE.has(ch)) {
        const light = edge(x, y - 1) || edge(x - 1, y);
        const dark = edge(x, y + 1) || edge(x + 1, y);
        if (light && !dark) fill = adjust(base, 0.3);
        else if (dark && !light) fill = adjust(base, -0.3);
      }
      out.push({ x, y, fill });
    }),
  );
  return out;
}
