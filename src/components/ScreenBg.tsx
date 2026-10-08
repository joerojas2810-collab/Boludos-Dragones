import { bgSrc, isPixelBackground, pixelBackgroundSize } from "@/lib/art/backgrounds";
import type { CSSProperties } from "react";

// Full-screen backdrop (menu, gacha, collection, market, forge, lobby).
// `dim` darkens it behind dense UI so panels stay legible.
export function ScreenBg({ scene, dim = 0 }: { scene: string; dim?: number }) {
  const px = isPixelBackground(scene, "composite");
  const size = pixelBackgroundSize(scene, "composite");
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <picture>
        <source media="(max-width: 767px)" srcSet={bgSrc(scene, "composite", true)} />
        <img
          src={bgSrc(scene, "composite")}
          alt=""
          className={px ? "bg-px-int" : "h-full w-full object-cover object-bottom"}
          style={px ? { imageRendering: "pixelated", "--pixel-screen-width": `${size?.width ?? 320}px` } as CSSProperties : undefined}
        />
      </picture>
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}
