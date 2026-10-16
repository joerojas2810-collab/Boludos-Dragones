import backgrounds from "./painted-backgrounds.generated.json";

export type PaintedBackgroundVariant = {
  src: string;
  width: number;
  height: number;
};

type PaintedBackground = {
  desktop: PaintedBackgroundVariant;
  mobile?: PaintedBackgroundVariant;
};

const catalog = backgrounds as Record<string, PaintedBackground>;

/** Return the native-resolution painted asset, falling back to desktop on mobile. */
export function paintedBackground(
  scene: string,
  mobile = false,
): PaintedBackgroundVariant | undefined {
  const entry = catalog[scene];
  if (!entry) return undefined;
  return mobile ? entry.mobile ?? entry.desktop : entry.desktop;
}

/** CSS chooses a composition before requesting an image; no viewport effect or double load. */
export function paintedSceneStyle(scene: string) {
  const desktop = paintedBackground(scene);
  const mobile = paintedBackground(scene, true);
  return {
    "--painted-scene-desktop": desktop ? `url("${desktop.src}")` : "none",
    "--painted-scene-mobile": mobile ? `url("${mobile.src}")` : "none",
  };
}
