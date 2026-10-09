import { describe, expect, it } from "vitest";
import { levelLoot } from "./levelLoot";
import { levelsOf } from "./levels";
import { dropRank, gachaDropRank, UP_CHANCE } from "./loot";
import { RARITY_IDS, type RarityId } from "./rarity";
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

describe("gachaDropRank (dungeon loot rarity)", () => {
  const share = (rank: RarityId, n = 40000) => {
    const rng = createRng(77);
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = gachaDropRank(rng, rank);
      c[r] = (c[r] ?? 0) + 1;
    }
    return (r: RarityId) => (c[r] ?? 0) / n;
  };
  it("never drops above the dungeon rank, and F is always F", () => {
    const rng = createRng(5);
    for (const rank of RARITY_IDS)
      for (let i = 0; i < 2000; i++)
        expect(RARITY_IDS.indexOf(gachaDropRank(rng, rank))).toBeLessThanOrEqual(
          RARITY_IDS.indexOf(rank),
        );
    for (let i = 0; i < 50; i++) expect(gachaDropRank(rng, "f")).toBe("f");
  });
  it("its own rank is as rare as in a pull (S dungeon ~3 %, SSR ~0.5 %)", () => {
    const s = share("s");
    expect(s("s")).toBeGreaterThan(0.02);
    expect(s("s")).toBeLessThan(0.045);
    expect(s("f")).toBeGreaterThan(0.25); // mostly low ranks
    const ssr = share("ssr", 200000);
    expect(ssr("ssr")).toBeLessThan(0.01);
    expect(ssr("s") + ssr("ss") + ssr("ssr")).toBeLessThan(0.07);
  });
  it("tilt leans toward the top", () => {
    const rng = createRng(9);
    let hi = 0;
    for (let i = 0; i < 20000; i++) if (gachaDropRank(rng, "s", 1.8) === "s") hi++;
    expect(hi / 20000).toBeGreaterThan(0.1);
  });
});

describe("levelLoot: the top rank is one roll per level", () => {
  const spec = (rank: RarityId) => levelsOf(rank)[2];
  it("S dungeon: ~5 % of levels give exactly one S piece, never two, never above S", () => {
    let withTop = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const l = levelLoot(spec("s"), 0, "mago", i, { repeat: false });
      const tops = l.pieces.filter((p) => p.rarity === "s").length;
      expect(tops).toBeLessThanOrEqual(1);
      expect(l.pieces.every((p) => RARITY_IDS.indexOf(p.rarity) <= RARITY_IDS.indexOf("s"))).toBe(true);
      if (tops === 1) withTop++;
    }
    expect(withTop / N).toBeGreaterThan(0.035);
    expect(withTop / N).toBeLessThan(0.065);
  });
  it("repeats scale the chance down; the rest of the pieces stay below the dungeon", () => {
    let top = 0;
    for (let i = 0; i < 6000; i++) {
      const l = levelLoot(spec("ssr"), 0, "mago", i, { repeat: true, payMult: 0.5 });
      top += l.pieces.filter((p) => p.rarity === "ssr").length;
    }
    expect(top / 6000).toBeLessThan(0.025);
  });
});
