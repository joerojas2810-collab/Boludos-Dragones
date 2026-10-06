"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True when the user asked for less motion. Server render assumes true (no flash of motion). */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
