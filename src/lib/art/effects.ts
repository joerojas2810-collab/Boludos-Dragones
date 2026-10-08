import { EFFECTS, type EffectMeta } from "./effects.generated";
import pixelEffects from "./pixel-effects.generated.json";
import { isPixel } from "./pixel";

// The importer validates the JSON cell tuples, glyph rows and animation metadata.
export const PIXEL_EFFECTS = pixelEffects as unknown as Record<string, EffectMeta & { label?: string }>;
export const isPixelEffect = (id: string) => isPixel() && Object.hasOwn(PIXEL_EFFECTS, id);
export const effectMeta = (id: string) => isPixelEffect(id) ? PIXEL_EFFECTS[id] : EFFECTS[id];
export const effectSrc = (id: string, reduced = false) =>
  `/art/${isPixelEffect(id) ? "effects-px" : "effects"}/${reduced ? "reduced/" : ""}${id}.${isPixelEffect(id) ? "png" : "webp"}`;
