import names from "./pixel-icons.generated.json";

// Only delivered pixel icons participate; other families keep the painted art.
// Build default comes from NEXT_PUBLIC_ART; ArtScope overrides it from the player's saved choice.
let pixel = process.env.NEXT_PUBLIC_ART === "pixel";
export const isPixel = () => pixel;
export const setPixel = (v: boolean) => {
  pixel = v;
};
// Accept the historical name-only registry and the native-dimension registry.
const icons = (names as readonly (string | { name: string; width: number; height: number })[])
  .map((entry) => typeof entry === "string" ? { name: entry, width: 32, height: 32 } : entry);
export const PIXEL_ICON_NAMES: readonly string[] = icons.map((entry) => entry.name);
const sizes = new Map(icons.map(({ name, width, height }) => [name, { width, height }]));
export const pixelIconSize = (name: string) => sizes.get(name);
const available = new Set(PIXEL_ICON_NAMES);
export const isPixelIcon = (name: string) => pixel && available.has(name);
export const pixelCardOpening = [16.25, (8 / 60) * 100, 11.25] as const;
