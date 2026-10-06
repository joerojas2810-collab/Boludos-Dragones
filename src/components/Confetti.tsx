"use client";

import { usePrefersReducedMotion } from "@/lib/motion";
import "./fx.css";

const COLORS = ["#f5c542", "#e4572e", "#4cb963", "#3fa9f5", "#c77dff", "#fff"];
const N = 48;

// Pixel confetti: fixed pseudo-random layout (no Math.random), pure CSS fall.
export function Confetti() {
  if (usePrefersReducedMotion()) return null;
  return (
    <div aria-hidden>
      {Array.from({ length: N }, (_, i) => (
        <span
          key={i}
          className="b-confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${3 + ((i * 7) % 30) / 10}s`,
            animationDelay: `${((i * 13) % 25) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}
