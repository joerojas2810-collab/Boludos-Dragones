"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isPixel, setPixel } from "@/lib/art/pixel";

const KEY = "art";
const Ctx = createContext<{ pixel: boolean; set: (v: boolean) => void }>({ pixel: false, set: () => {} });
export const useArt = () => useContext(Ctx);

// Art style chosen by the player (saved in this browser). The subtree is keyed so every sprite remounts with the new style.
export function ArtScope({ children }: { children: ReactNode }) {
  const [pixel, setState] = useState(isPixel());
  const set = (v: boolean) => {
    setPixel(v);
    document.body.dataset.art = v ? "pixel" : "painted";
    try {
      localStorage.setItem(KEY, v ? "pixel" : "painted");
    } catch {}
    setState(v);
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) set(saved === "pixel");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Ctx.Provider value={{ pixel, set }}>
      <div key={String(pixel)} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  );
}
