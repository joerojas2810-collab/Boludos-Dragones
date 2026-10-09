import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EFFECTS } from "./effects.generated";
import { PIXEL_EFFECTS, effectMeta, effectSrc, isPixelEffect, pixelEffectSrc } from "./effects";
import { isPixel, setPixel } from "./pixel";

const imageRoot = join(process.cwd(), "public/art/effects-px");

describe("HD effects integration", () => {
  it("delivers the complete existing catalog in both motion modes", () => {
    const ids = Object.keys(EFFECTS).sort();
    expect(ids).toHaveLength(71);
    expect(Object.keys(PIXEL_EFFECTS).sort()).toEqual(ids);
    for (const folder of [imageRoot, join(imageRoot, "reduced")]) {
      expect(readdirSync(folder).filter((file) => file.endsWith(".png")).sort())
        .toEqual(ids.map((id) => `${id}.png`).sort());
    }
  });

  it("matches all 142 physical sheets to their native cell and glyph geometry", () => {
    let frames = 0;
    let cells = 0;
    for (const [id, meta] of Object.entries(PIXEL_EFFECTS)) {
      frames += meta.frames;
      cells += meta.frames * meta.rows;
      for (const reduced of [false, true]) {
        const bytes = readFileSync(join(imageRoot, reduced ? "reduced" : "", `${id}.png`));
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)])
          .toEqual([meta.cell[0] * (reduced ? 1 : meta.frames), meta.cell[1] * meta.rows]);
      }
    }
    expect(frames).toBe(426);
    expect(cells).toBe(642);
    expect(PIXEL_EFFECTS.hit_fire.cell).toEqual([128, 128]);
    expect(PIXEL_EFFECTS.boss_entrance_ssr.cell).toEqual([384, 192]);
    expect(PIXEL_EFFECTS.damage_normal.cell).toEqual([32, 48]);
    expect(PIXEL_EFFECTS.damage_normal.advance).toBe(16);
  });

  it("preserves animation timing, completion policy and glyph meanings", () => {
    for (const [id, original] of Object.entries(EFFECTS)) {
      const native = PIXEL_EFFECTS[id];
      expect({ frames: native.frames, fps: native.fps, loop: native.loop, rows: native.rows, finish: native.finish })
        .toEqual({ frames: original.frames, fps: original.fps, loop: original.loop, rows: original.rows, finish: original.finish });
      expect(native.glyphRow).toEqual(original.glyphRow);
    }
  });

  it("versions pixel replacements while retaining the painted fallback and art switch", () => {
    const previous = isPixel();
    try {
      setPixel(true);
      expect(isPixelEffect("hit_fire")).toBe(true);
      expect(effectMeta("hit_fire")).toBe(PIXEL_EFFECTS.hit_fire);
      expect(effectSrc("hit_fire")).toBe("/art/effects-px/hit_fire.png?v=1");
      expect(effectSrc("hit_fire", true)).toBe("/art/effects-px/reduced/hit_fire.png?v=1");
      expect(pixelEffectSrc("hit_fire", true)).toBe(effectSrc("hit_fire", true));
      expect(isPixelEffect("unavailable_effect")).toBe(false);
      expect(effectMeta("unavailable_effect")).toBeUndefined();
      expect(effectSrc("unavailable_effect")).toBe("/art/effects/unavailable_effect.webp");
      setPixel(false);
      expect(isPixelEffect("hit_fire")).toBe(false);
      expect(effectMeta("hit_fire")).toBe(EFFECTS.hit_fire);
      expect(effectSrc("hit_fire")).toBe("/art/effects/hit_fire.webp");
      expect(effectSrc("hit_fire", true)).toBe("/art/effects/reduced/hit_fire.webp");
      expect(pixelEffectSrc("hit_fire")).toBe("/art/effects-px/hit_fire.png?v=1");
    } finally {
      setPixel(previous);
    }
  });
});
