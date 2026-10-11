export type SpriteAtlas = {
  width: number;
  height: number;
  canvas: number;
  anchorRight?: boolean;
  frameRects: { x: number; y: number; width: number; height: number }[];
};

export function atlasFrameStyle(atlas: SpriteAtlas, frame: number, src: string) {
  const rect = atlas.frameRects[frame];
  return {
    position: "absolute" as const,
    bottom: "5%",
    width: `${rect.width / atlas.canvas * 100}%`,
    height: `${rect.height / atlas.canvas * 100}%`,
    left: atlas.anchorRight ? undefined : "50%",
    right: atlas.anchorRight ? "5%" : undefined,
    transform: atlas.anchorRight ? undefined : "translateX(-50%)",
    backgroundImage: `url(${src})`,
    backgroundSize: `${atlas.width / rect.width * 100}% ${atlas.height / rect.height * 100}%`,
    backgroundPosition: `${atlas.width === rect.width ? 0 : rect.x / (atlas.width - rect.width) * 100}% ${atlas.height === rect.height ? 0 : rect.y / (atlas.height - rect.height) * 100}%`,
    backgroundRepeat: "no-repeat",
  };
}
