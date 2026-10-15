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
// Painted skills now have their own identities; Pixel retains the approved existing drawings.
const PIXEL_SKILL_ALIASES: Record<string, string> = {
  skill_rogue_sabotage: "relic_broken_clock",
  skill_knight_bastion: "passive_wall",
  skill_rogue_step: "relic_winged_boots",
  skill_cleric_restore: "skill_prayer",
};
export const pixelIconName = (name: string) => PIXEL_SKILL_ALIASES[name] ?? name;
export const pixelIconSize = (name: string) => sizes.get(pixelIconName(name));
const available = new Set(PIXEL_ICON_NAMES);
export const isPixelIcon = (name: string) => pixel && available.has(pixelIconName(name));
export const pixelCardOpening = [16.25, (8 / 60) * 100, 11.25] as const;
