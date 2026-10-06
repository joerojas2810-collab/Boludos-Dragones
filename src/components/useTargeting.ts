"use client";

import { useCallback, useEffect, useState } from "react";
import { livingEnemies, type Battle } from "@/lib/game/combat";

// Target choice for group fights. `enemy` is the highlighted index in
// Battle.enemies (the first living one unless the player clicked another);
// `target` is what step() expects: the index among the LIVING enemies.
// Keys: 1-3 pick the n-th card; Tab (with nothing focused) cycles.
export function useTargeting(b: Battle | null, enabled = true) {
  const [picked, setPicked] = useState(0);
  const living = b ? livingEnemies(b) : [];
  const enemy = living.includes(picked) ? picked : (living[0] ?? 0);
  const target = Math.max(0, living.indexOf(enemy));
  const select = useCallback((i: number) => setPicked(i), []);

  useEffect(() => {
    if (!enabled || !b || b.status !== "ongoing") return;
    const alive = livingEnemies(b);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^[1-3]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (alive.includes(i)) setPicked(i);
      } else if (
        e.key === "Tab" &&
        !e.shiftKey &&
        alive.length > 1 &&
        document.activeElement === document.body
      ) {
        e.preventDefault();
        const at = alive.indexOf(enemy);
        setPicked(alive[(at + 1) % alive.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [b, enabled, enemy]);

  return { enemy, target, select };
}
