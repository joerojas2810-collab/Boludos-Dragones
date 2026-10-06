import { describe, expect, it } from "vitest";
import { FULL_SPRITES, HALF_SPRITES, OVERLAYS, SPRITE_SIZE } from "./classes";
import { colorFor } from "./palettes";

describe("sprites", () => {
  it("fit the grid and use only known pixels", () => {
    for (const [id, rows] of Object.entries(HALF_SPRITES)) {
      expect(rows.length, id).toBeLessThanOrEqual(SPRITE_SIZE - 1);
      rows.forEach((r) =>
        expect(r.length, id).toBeLessThanOrEqual(SPRITE_SIZE / 2),
      );
    }
    for (const rows of Object.values(FULL_SPRITES)) {
      expect(rows).toHaveLength(SPRITE_SIZE);
      rows.forEach((r) => expect(r).toHaveLength(SPRITE_SIZE));
      for (const ch of rows.join("")) {
        if (ch !== ".") expect(colorFor(ch, "fuego"), ch).not.toBeNull();
      }
    }
  });

  it("keeps weapon overlays inside the grid", () => {
    for (const [id, patches] of Object.entries(OVERLAYS)) {
      for (const [row, col, px] of patches) {
        expect(row, id).toBeGreaterThanOrEqual(0);
        expect(row, id).toBeLessThan(SPRITE_SIZE);
        expect(col + px.length, id).toBeLessThanOrEqual(SPRITE_SIZE);
      }
    }
  });
});
