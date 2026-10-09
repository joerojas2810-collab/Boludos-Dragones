import { EFFECTS, type EffectMeta } from "./effects.generated";
import pixelEffects from "./pixel-effects.generated.json";
import { isPixel } from "./pixel";

// The importer validates the JSON cell tuples, glyph rows and animation metadata.
export const PIXEL_EFFECTS = pixelEffects as unknown as Record<string, EffectMeta & { label?: string }>;
export const isPixelEffect = (id: string) => isPixel() && Object.hasOwn(PIXEL_EFFECTS, id);
export const effectMeta = (id: string) => isPixelEffect(id) ? PIXEL_EFFECTS[id] : EFFECTS[id];
// Replaced pixel sheets must bypass the long-lived static-art cache.
export const pixelEffectSrc = (id: string, reduced = false) =>
  `/art/effects-px/${reduced ? "reduced/" : ""}${id}.png?v=1`;
export const effectSrc = (id: string, reduced = false) =>
  isPixelEffect(id) ? pixelEffectSrc(id, reduced) : `/art/effects/${reduced ? "reduced/" : ""}${id}.webp`;
