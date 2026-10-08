import { bgSrc, isPixelBackground } from "@/lib/art/backgrounds";

// Full-screen backdrop (menu, gacha, collection, market, forge, lobby).
// `dim` darkens it behind dense UI so panels stay legible.
export function ScreenBg({ scene, dim = 0 }: { scene: string; dim?: number }) {
  const px = isPixelBackground(scene, "composite");
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <picture>
        <source media="(max-width: 767px)" srcSet={bgSrc(scene, "composite", true)} />
        <img
          src={bgSrc(scene, "composite")}
          alt=""
          className={px ? "bg-px-int" : "h-full w-full object-cover object-bottom"}
          style={px ? { imageRendering: "pixelated" } : undefined}
        />
      </picture>
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}
