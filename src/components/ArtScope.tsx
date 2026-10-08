"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isPixel, setPixel } from "@/lib/art/pixel";

const KEY = "art";
const Ctx = createContext<{ pixel: boolean; set: (v: boolean) => void }>({ pixel: false, set: () => {} });
export const useArt = () => useContext(Ctx);

// Art style chosen by the player (saved in this browser). Nothing renders until the choice is read, so no art of the wrong style is ever requested;
// the subtree is keyed so every sprite remounts when the style changes.
export function ArtScope({ children }: { children: ReactNode }) {
  const [pixel, setState] = useState<boolean | null>(null);
  const apply = (v: boolean) => {
    setPixel(v);
    document.body.dataset.art = v ? "pixel" : "painted";
    setState(v);
  };
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "pixel" : "painted");
    } catch {}
    apply(v);
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) return apply(saved === "pixel");
    } catch {}
    apply(isPixel());
  }, []);
  if (pixel === null) return null;
  return (
    <Ctx.Provider value={{ pixel: !!pixel, set }}>
      <div key={String(pixel)} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  );
}
