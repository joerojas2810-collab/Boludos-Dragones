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
