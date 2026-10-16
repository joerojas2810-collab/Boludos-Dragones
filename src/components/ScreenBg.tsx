import { bgSrc, isPixelBackground, pixelBackgroundSize } from "@/lib/art/backgrounds";
import { paintedBackground } from "@/lib/art/painted-backgrounds";
import { isPixel } from "@/lib/art/pixel";
import type { CSSProperties } from "react";
import "./bg.css";

// Full-screen backdrop (menu, gacha, collection, market, forge, lobby).
// `dim` darkens it behind dense UI so panels stay legible.
export function ScreenBg({ scene, dim = 0 }: { scene: string; dim?: number }) {
  const pixelMode = isPixel();
  const px = isPixelBackground(scene, "composite");
  const size = pixelBackgroundSize(scene, "composite");
  const painted = pixelMode ? undefined : paintedBackground(scene);
  const paintedMobile = painted && paintedBackground(scene, true);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {painted ? (
        <picture>
          <source media="(max-width: 767px) and (orientation: portrait)" srcSet={paintedMobile?.src ?? painted.src} />
          <img src={painted.src} alt="" className="bg-painted-scene" />
        </picture>
      ) : (
        <picture>
          <source media="(max-width: 767px)" srcSet={bgSrc(scene, "composite", true)} />
          <img
            src={bgSrc(scene, "composite")}
            alt=""
            className={px ? "bg-px-int" : "h-full w-full object-cover object-bottom"}
            style={px ? { imageRendering: "pixelated", "--pixel-screen-width": `${size?.width ?? 320}px` } as CSSProperties : undefined}
          />
        </picture>
      )}
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}
