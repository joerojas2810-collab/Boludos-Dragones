import { describe, expect, it } from "vitest";
import { BG_COMBAT_SCENES, BG_SCREEN_SCENES } from "./backgrounds.generated";
import generatedCatalog from "./painted-backgrounds.generated.json";
import { paintedBackground, paintedSceneStyle } from "./painted-backgrounds";

type Variant = { src: string; width: number; height: number };
type Entry = { desktop: Variant; mobile?: Variant };
const catalog = generatedCatalog as Record<string, Entry>;

describe("painted backgrounds", () => {
  it("resolves desktop assets and falls back to desktop when a mobile asset is absent", () => {
    for (const [scene, entry] of Object.entries(catalog)) {
      expect(paintedBackground(scene)).toEqual(entry.desktop);
      expect(paintedBackground(scene, true)).toEqual(entry.mobile ?? entry.desktop);
    }
  });

  it("covers all 24 registered scenes with valid native image metadata", () => {
    const sceneIds = [...BG_SCREEN_SCENES, ...BG_COMBAT_SCENES];
    expect(sceneIds).toHaveLength(24);
    expect(Object.keys(catalog).sort()).toEqual([...sceneIds].sort());

    for (const [scene, entry] of Object.entries(catalog)) {
      expect(entry.mobile, `${scene} must have its own mobile composition`).toBeDefined();
      for (const variant of [entry.desktop, entry.mobile].filter((item): item is Variant => Boolean(item))) {
        expect(variant.src).toMatch(new RegExp(`^/art/backgrounds-painted-v2/${scene}_(desktop|mobile)\\.webp$`));
        expect(Number.isInteger(variant.width) && variant.width > 0).toBe(true);
        expect(Number.isInteger(variant.height) && variant.height > 0).toBe(true);
      }
    }
  });

  it("returns undefined for scenes outside the painted catalog", () => {
    expect(paintedBackground("unknown_scene")).toBeUndefined();
    expect(paintedBackground("unknown_scene", true)).toBeUndefined();
    expect(Object.values(paintedSceneStyle("unknown_scene"))).toEqual(["none", "none"]);
  });
});
