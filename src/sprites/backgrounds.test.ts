import { describe, expect, it } from "vitest";
import {
  GROUND_H,
  GROUND_TOP_PCT,
  SKY_H,
  WORLD_COUNT,
  buildScene,
} from "./backgrounds";

describe("backgrounds", () => {
  it("ground top is 70% and the two grids add up to the full scene", () => {
    expect(GROUND_TOP_PCT).toBe(70);
    expect(SKY_H / (SKY_H + GROUND_H)).toBeCloseTo(GROUND_TOP_PCT / 100, 5);
  });

  it("defines all 10 scenes, deterministic and inside their grids", () => {
    for (let w = 0; w < WORLD_COUNT; w++)
      for (const boss of [false, true]) {
        const a = buildScene(w, boss);
        expect(JSON.stringify(a), `${w}/${boss}`).toBe(
          JSON.stringify(buildScene(w, boss)),
        );
        expect(a.sky.length).toBeGreaterThan(20);
        expect(a.ground.length).toBeGreaterThan(20);
        for (const [x, y, wd, h, fill] of a.sky) {
          expect(fill).toMatch(/^#[0-9a-f]{6}$/);
          expect(y + h).toBeLessThanOrEqual(SKY_H);
          expect(x + wd).toBeGreaterThan(0);
        }
        for (const [, y, , h] of a.ground)
          expect(y + h).toBeLessThanOrEqual(GROUND_H);
      }
  });
});
