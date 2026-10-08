import { BG_DUNGEON, BG_LAYERS, BG_PARALLAX } from "./backgrounds.generated";
import { isPixel } from "./pixel";
import pixelBackgrounds from "./pixel-backgrounds.generated.json";

const pixelFiles = new Set((pixelBackgrounds as { file: string }[]).map((entry) => entry.file));
export const isPixelBackground = (scene: string, part: string) =>
  isPixel() && pixelFiles.has(`${scene}_desktop_${part}.png`);

export { BG_LAYERS, BG_PARALLAX };
const WORLD_SCENES = ["swamp", "peaks", "canyon", "caverns", "storm"];

// Combat scene id for a world index (0-4) or a dungeon rank (F-SSR, which also
// picks the deeper A/S/SS/SSR variants), normal or boss room.
export function combatScene(
  world: number,
  boss: boolean,
  rank?: string | null,
) {
  const d = rank ? BG_DUNGEON[rank] : undefined;
  return d
    ? boss
      ? d.boss
      : d.normal
    : `${WORLD_SCENES[world % 5]}_${boss ? "boss" : "normal"}`;
}

export const bgSrc = (scene: string, part: string, mobile = false) =>
  isPixelBackground(scene, part)
    ? `/art/backgrounds-px/${scene}_desktop_${part}.png`
    : `/art/backgrounds/${scene}_${mobile ? "mobile" : "desktop"}_${part}.webp`;
