import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  isDungeonRank,
  isUnlocked,
  lockReason,
  maxAscension,
  victoryCoins,
  powerVerdict,
  recommendedPower,
} from "./dungeons";
import { dropRank, UP_CHANCE } from "./loot";
import { levelsOf } from "./levels";
import { RARITY_IDS } from "./rarity";
import { createRng } from "./rng";
import { levelFights } from "./stage";


describe("dungeon table", () => {
  it("matches the design: floors, boss floors and final boss", () => {
    const floors = [8, 10, 12, 14, 16, 18, 20, 22, 25];
    RARITY_IDS.forEach((r, i) => {
      const d = DUNGEONS[r];
      expect(d.floors, r).toBe(floors[i]);
      expect(d.bosses[d.bosses.length - 1], r).toBe(d.floors);
      expect(d.bosses.length, r).toBe(Math.max(2, Math.round(d.floors / 5)));
      expect(
        [...d.bosses].sort((a, b) => a - b),
        r,
      ).toEqual(d.bosses);
    });
    expect(DUNGEONS.c.bosses).toEqual([5, 9, 14]);
    expect(DUNGEONS.ssr.bosses).toEqual([5, 10, 15, 20, 25]);
    expect(isDungeonRank("ssr")).toBe(true);
    expect(isDungeonRank("toString")).toBe(false);
  });

  it("offsets never decrease with rank and victory pays more at higher ranks", () => {
    for (let i = 1; i < RARITY_IDS.length; i++) {
      expect(DUNGEONS[RARITY_IDS[i]].offset).toBeGreaterThanOrEqual(
        DUNGEONS[RARITY_IDS[i - 1]].offset,
      );
      expect(victoryCoins(RARITY_IDS[i])).toBeGreaterThan(
        victoryCoins(RARITY_IDS[i - 1]),
      );
    }
  });
});

describe("unlocking", () => {
  it("F is always open; each rank needs the previous one cleared", () => {
    expect(isUnlocked({}, "f")).toBe(true);
    expect(isUnlocked({}, "e")).toBe(false);
    expect(isUnlocked({ f: 1 }, "e")).toBe(true);
    expect(isUnlocked({ f: 1 }, "d")).toBe(false);
  });
  it("A, S and SS need >= 2 lives left on the previous clear, SSR needs 3", () => {
    expect(isUnlocked({ b: 1 }, "a")).toBe(false);
    expect(isUnlocked({ b: 2 }, "a")).toBe(true);
    expect(lockReason({ a: 1 }, "s")).toEqual({
      kind: "needs",
      rank: "a",
      lives: 2,
    });
    expect(isUnlocked({ ss: 2 }, "ssr")).toBe(false);
    expect(isUnlocked({ ss: 3 }, "ssr")).toBe(true);
  });
});

describe("dungeon runs", () => {
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

describe("recommended power", () => {
  it("grows with rank and flags weak heroes", () => {
    let prev = 0;
    for (const r of RARITY_IDS) {
      const p = recommendedPower(r);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(powerVerdict(recommendedPower("d"), "d")).toBe("ok");
    expect(powerVerdict(Math.round(recommendedPower("d") * 0.6), "d")).toBe(
      "low",
    );
    expect(powerVerdict(40, "d")).toBe("danger");
  });
});

describe("ascension", () => {
  it("a level opens only after clearing the one below it", () => {
    expect(maxAscension({}, {}, "f")).toBe(0);
    expect(maxAscension({ f: 2 }, {}, "f")).toBe(1);
    expect(maxAscension({ f: 2 }, { f: 3 }, "f")).toBe(4);
    expect(maxAscension({ f: 2 }, { f: 5 }, "f")).toBe(5);
    expect(maxAscension({ f: 2 }, { f: 5 }, "e")).toBe(0);
  });

  it("each level stacks its rule and pays more", () => {
    const spec = levelsOf("f")[1];
    const base = levelFights(spec, 0);
    const a1 = levelFights(spec, 1);
    expect(a1[0].enemies[0].stats.hp).toBeGreaterThan(base[0].enemies[0].stats.hp);
    expect(levelFights(spec, 3)[0].enemies.length).toBe(
      Math.min(3, base[0].enemies.length + 1),
    );
    const last = (asc: number) => levelFights(spec, asc).at(-1)!;
    expect(last(3).mods).not.toContain("dobleAtaque");
    expect(last(4).mods).toContain("dobleAtaque");
    expect(victoryCoins("f", 5)).toBe(victoryCoins("f") * 2);
  });
});
