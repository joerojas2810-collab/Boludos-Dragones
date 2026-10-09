import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import registry from "./pixel-icons.generated.json";
import { PIXEL_ICON_NAMES, pixelIconSize, setPixel, isPixelIcon } from "./pixel";
import { icon } from "../art";

describe("HD system icons", () => {
  it("registers 238 system icons and preserves the 19 forge components", () => {
    expect(registry).toHaveLength(257);
    expect(new Set(PIXEL_ICON_NAMES).size).toBe(257);
    const forge = registry.filter((entry) => /^(part|core)_/.test(entry.name));
    expect(forge).toHaveLength(19);
    expect(registry.length - forge.length).toBe(238);
  });

  it("uses actual 64px PNG dimensions throughout the registered catalog", () => {
    for (const entry of registry) {
      const bytes = readFileSync(join(process.cwd(), "public/art/icons-px", `icon_${entry.name}.png`));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([64, 64]);
      expect(pixelIconSize(entry.name)).toEqual({ width: 64, height: 64 });
    }
  });

  it("keeps unavailable icons on their fallback and respects the art switch", () => {
    try {
      setPixel(true);
      expect(isPixelIcon("trait_stubborn")).toBe(true);
      expect(icon("trait_stubborn")).toBe("/art/icons-px/icon_trait_stubborn.png?v=3");
      expect(isPixelIcon("material_loaded_die")).toBe(false);
      expect(pixelIconSize("material_loaded_die")).toBeUndefined();
      setPixel(false);
      expect(isPixelIcon("trait_stubborn")).toBe(false);
      expect(icon("trait_stubborn")).toBe("/art/icons/icon_trait_stubborn.webp?v=2");
    } finally {
      setPixel(process.env.NEXT_PUBLIC_ART === "pixel");
    }
  });
});
