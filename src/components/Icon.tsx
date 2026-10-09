import type { CSSProperties } from "react";
import { icon } from "@/lib/art";
import { isPixelIcon, pixelIconSize } from "@/lib/art/pixel";

// Painted system icon (public/art/icons/icon_<name>.webp), sized by className.
export function Icon({
  name,
  className = "h-4",
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  const native = isPixelIcon(name) ? pixelIconSize(name) : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon(name)}
      alt=""
      draggable={false}
      data-native-width={native?.width}
      data-native-height={native?.height}
      style={{ ...style, ...(native ? { imageRendering: "pixelated", aspectRatio: style?.aspectRatio ?? `${native.width} / ${native.height}` } : {}) }}
      className={`inline-block aspect-square align-middle ${className}`}
    />
  );
}
