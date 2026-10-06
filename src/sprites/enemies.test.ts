import { describe, expect, it } from "vitest";
import { ENEMY_ART, ENEMY_SIZE, ENEMY_SPRITES } from "./enemies";
import { colorFor } from "./palettes";

describe("enemy sprites", () => {
  it("every family has normal and boss grids of exactly 32x32 with known pixels", () => {
    for (const [family, variants] of Object.entries(ENEMY_SPRITES)) {
      for (const [kind, rows] of Object.entries(variants)) {
        const id = `${family}/${kind}`;
        expect(rows, id).toHaveLength(ENEMY_SIZE);
        rows.forEach((r) => expect(r, id).toHaveLength(ENEMY_SIZE));
        for (const ch of rows.join("")) {
          if (ch !== ".")
            expect(colorFor(ch, "fuego"), `${id} ${ch}`).not.toBeNull();
        }
        expect(rows.join("").replace(/\./g, "").length, id).toBeGreaterThan(
          100,
        );
      }
    }
  });

  it("half rows fit 16 px and overlays stay inside the grid", () => {
    for (const [family, variants] of Object.entries(ENEMY_ART)) {
      for (const art of Object.values(variants)) {
        expect(art.half.length, family).toBeLessThanOrEqual(ENEMY_SIZE - 1);
        art.half.forEach((r) =>
          expect(r.length, family).toBeLessThanOrEqual(16),
        );
        for (const [row, col, px] of art.overlays) {
          expect(row, family).toBeGreaterThanOrEqual(0);
          expect(row, family).toBeLessThan(ENEMY_SIZE);
          expect(col, family).toBeGreaterThanOrEqual(0);
          expect(col + px.length, family).toBeLessThanOrEqual(ENEMY_SIZE);
        }
      }
    }
  });

  it("boss is bigger than the normal sprite", () => {
    const px = (g: string[]) => g.join("").replace(/\./g, "").length;
    for (const [family, v] of Object.entries(ENEMY_SPRITES))
      expect(px(v.boss), family).toBeGreaterThan(px(v.normal));
  });
});
