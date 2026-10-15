import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import registry from "./pixel-icons.generated.json";
import { PIXEL_ICON_NAMES, pixelIconSize, setPixel, isPixelIcon } from "./pixel";
import { icon } from "../art";

describe("HD system icons", () => {
  it("keeps the existing Pixel drawings for the four new painted skills without replacing relic art", () => {
    const pairs = [
      ["skill_rogue_sabotage", "relic_broken_clock"],
      ["skill_knight_bastion", "passive_wall"],
      ["skill_rogue_step", "relic_winged_boots"],
      ["skill_cleric_restore", "skill_prayer"],
    ];
    try {
      for (const [skill, previous] of pairs) {
        setPixel(false);
        expect(icon(skill)).toBe(`/art/icons/icon_${skill}.webp?v=2`);
        expect(icon(previous)).toBe(`/art/icons/icon_${previous}.webp?v=2`);
        setPixel(true);
        expect(icon(skill)).toBe(icon(previous));
        expect(isPixelIcon(skill)).toBe(true);
        expect(pixelIconSize(skill)).toEqual(pixelIconSize(previous));
      }
    } finally {
      setPixel(process.env.NEXT_PUBLIC_ART === "pixel");
    }
  });
  it("registers 244 system icons and preserves the 19 forge components", () => {
    expect(registry).toHaveLength(263);
    expect(new Set(PIXEL_ICON_NAMES).size).toBe(263);
    const forge = registry.filter((entry) => /^(part|core)_/.test(entry.name));
    expect(forge).toHaveLength(19);
    expect(registry.length - forge.length).toBe(244);
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
