import names from "./pixel-icons.generated.json";

// Only delivered pixel icons participate; other families keep the painted art.
export const PIXEL = process.env.NEXT_PUBLIC_ART === "pixel";
export const PIXEL_ICON_NAMES: readonly string[] = names;
const available = new Set(PIXEL_ICON_NAMES);
export const isPixelIcon = (name: string) => PIXEL && available.has(name);
export const pixelCardOpening = [16.25, (8 / 60) * 100, 11.25] as const;
