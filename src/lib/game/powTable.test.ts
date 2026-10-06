import { describe, expect, it } from "vitest";
import { makePow } from "./powTable";
import {
  FLOOR_SCALE,
  SCALE_PER_LEVEL,
  XP_BASE,
  XP_GROWTH,
  xpToNext,
} from "./progression";

const BASES = [3.5, 7, 12.3, 18, 27.7, 40, 55, 72, 96.4, 120, 150];
const near = (v: number) => Math.abs(v - Math.floor(v) - 0.5) < 1e-9 * v;

describe("makePow", () => {
  it("matches ** to 1e-12 relative for 0..200", () => {
    for (const b of [FLOOR_SCALE, SCALE_PER_LEVEL, XP_GROWTH]) {
      const pw = makePow(b);
      for (let n = 0; n <= 200; n++)
        expect(Math.abs(pw(n) / b ** n - 1)).toBeLessThan(1e-12);
    }
  });
  it("is exactly reproducible and handles bad input", () => {
    const a = makePow(1.21);
    expect(a(37)).toBe(makePow(1.21)(37));
    expect(a(0)).toBe(1);
    expect(a(-3)).toBe(1);
  });
  it("xpToNext equals the old formula for levels 1..200", () => {
    for (let l = 1; l <= 200; l++) {
      const old = XP_BASE * XP_GROWTH ** (l - 1);
      if (!near(old)) expect(xpToNext(l)).toBe(Math.round(old));
    }
  });
  it("floor / level scaling rounds the same as the old formula, floors 1..200", () => {
    const fp = makePow(FLOOR_SCALE);
    const lp = makePow(SCALE_PER_LEVEL);
    for (let f = 1; f <= 200; f++)
      for (const b of BASES)
        for (const m of [0.27, 0.3, 0.4, 0.54, 0.8]) {
          const o = b * FLOOR_SCALE ** f * m;
          if (!near(o)) expect(Math.round(b * fp(f) * m)).toBe(Math.round(o));
          const o10 = b * FLOOR_SCALE ** f * m * 10;
          if (!near(o10))
            expect(Math.round(b * fp(f) * m * 10)).toBe(Math.round(o10));
          const ol = b * SCALE_PER_LEVEL ** (f - 1);
          if (!near(ol)) expect(Math.round(b * lp(f - 1))).toBe(Math.round(ol));
        }
  });
});
