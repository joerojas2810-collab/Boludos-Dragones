// Shared motion switch for JS-driven effects. CSS effects use the same query
// in fx.css, so every effect honours prefers-reduced-motion.
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
