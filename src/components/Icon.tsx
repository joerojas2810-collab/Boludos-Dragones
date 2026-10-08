import type { CSSProperties } from "react";
import { icon } from "@/lib/art";
import { isPixelIcon } from "@/lib/art/pixel";

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon(name)}
      alt=""
      draggable={false}
      style={{ ...style, ...(isPixelIcon(name) ? { imageRendering: "pixelated" } : {}) }}
      className={`inline-block aspect-square align-middle ${className}`}
    />
  );
}
