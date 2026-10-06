import type { ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import type { Tip } from "@/lib/game/explain";

// Colour semantics: passive cyan, trait purple, danger red, gold yellow, heal green.
const TONE = {
  passive: "text-cyan-300",
  trait: "text-purple-300",
  danger: "text-red-300",
  gold: "text-yellow-300",
  heal: "text-green-300",
  info: "text-[var(--text)]",
} as const;

export function Chip({
  tip,
  tone,
  className = "",
  children,
}: {
  tip: Tip | null;
  tone: keyof typeof TONE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip tip={tip}>
      <span className={`chip ${TONE[tone]} ${className}`}>{children}</span>
    </Tooltip>
  );
}
