import type { Element } from "@/lib/game/elements";

// [main, dark, light] per element
export const ELEMENT_COLORS: Record<
  Element,
  readonly [string, string, string]
> = {
  fuego: ["#e8590c", "#a63d08", "#ffa94d"],
  agua: ["#1c7ed6", "#1864ab", "#74c0fc"],
  tierra: ["#7f6a3a", "#5c4a28", "#b59b5c"],
  rayo: ["#d4a800", "#8f7200", "#fff176"],
  viento: ["#20c997", "#0c8f6b", "#96f2d7"],
};

export const BASE_COLORS: Record<string, string> = {
  o: "#1d1714",
  m: "#c3c8cf",
  n: "#7b828b",
  s: "#f0c8a0",
  d: "#d4a07a",
  h: "#6b4423",
  w: "#f4f1ea",
  y: "#f5c542",
  r: "#e03131",
  g: "#40c057",
  q: "#74c0fc",
  k: "#c9c2b0",
  e: "#4a5059",
  l: "#8a5a2b",
  p: "#ffe08a",
  v: "#3b2a55",
};

export function colorFor(ch: string, element: Element): string | null {
  const [a, b, c] = ELEMENT_COLORS[element];
  if (ch === "a") return a;
  if (ch === "b") return b;
  if (ch === "c") return c;
  return BASE_COLORS[ch] ?? null;
}
