import { describe, expect, it } from "vitest";
import { dropRank, UP_CHANCE } from "./loot";
import { createRng } from "./rng";

describe("loot rank", () => {
  it("loot rank: the dungeon's rank or lower, rarely one above ", () => {
    const count = (up: number) => {
      const rng = createRng(7);
      const n: Record<string, number> = {};
      for (let i = 0; i < 6000; i++) {
        const r = dropRank(rng, "c", up);
        n[r] = (n[r] ?? 0) + 1;
      }
      return n;
    };
    const n = count(UP_CHANCE);
    expect(Object.keys(n).sort()).toEqual(["b", "c", "d", "e", "f"]); // never above rank+1
    expect(n.c).toBeGreaterThan(n.d);
    expect(n.d).toBeGreaterThan(n.e);
    expect(n.e).toBeGreaterThan(n.f);
    expect(n.b / 6000).toBeGreaterThan(0.06);
    expect(n.b / 6000).toBeLessThan(0.14);
    // SSR cannot go above itself; F cannot go below itself
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      expect(dropRank(rng, "ssr", 0.5)).toMatch(/^(f|e|d|c|b|a|s|ss|ssr)$/);
      expect(dropRank(rng, "f", 0)).toBe("f");
    }
  });
});
