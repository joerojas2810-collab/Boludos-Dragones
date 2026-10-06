import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import {
  DUNGEONS,
  isDungeonRank,
  isUnlocked,
  lockReason,
  victoryCoins,
} from "./dungeons";
import { dropRank, FINAL_UP_CHANCE, UP_CHANCE } from "./loot";
import { RARITY_IDS } from "./rarity";
import { createRng } from "./rng";
import {
  createRun,
  depthOf,
  doorsFor,
  enemyFor,
  isBossFloor,
  isVictory,
  nextFloor,
  topFloor,
} from "./run";

const hero = generateCharacter(createRng(3), "caballero");

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
  it("bosses follow the table and the floor before each boss has a campfire", () => {
    for (const r of RARITY_IDS) {
      const d = DUNGEONS[r];
      for (let f = 1; f <= d.floors; f++) {
        expect(isBossFloor(f, r)).toBe(d.bosses.includes(f));
        const doors = doorsFor(11, f, r);
        if (d.bosses.includes(f)) expect(doors).toEqual([{ kind: "boss" }]);
        else if (d.bosses.includes(f + 1))
          expect(
            doors.some((x) => x.kind === "rest"),
            `${r}:${f}`,
          ).toBe(true);
      }
    }
  });

  it("enemies follow the difficulty floor and the final boss hits harder", () => {
    const mean = (rank: "f" | "ssr") => {
      let t = 0;
      for (let seed = 1; seed <= 40; seed++)
        t += enemyFor(seed, 4, "hard", rank).enemy.stats.atk;
      return t / 40;
    };
    expect(mean("ssr")).toBeGreaterThan(mean("f") * 1.5);
    expect(depthOf(4, "ssr")).toBe(4 + DUNGEONS.ssr.offset);
    const last = DUNGEONS.f.floors;
    const normal = enemyFor(5, last - 4, "boss", "f").enemy.stats.hp;
    const final = enemyFor(5, last, "boss", "f").enemy.stats.hp;
    expect(final).toBeGreaterThan(normal);
  });

  it("clearing the last floor is a victory; legacy runs keep the 100-floor cap", () => {
    const r = {
      ...createRun(1, hero, true, "f"),
      floor: DUNGEONS.f.floors,
      maxFloor: DUNGEONS.f.floors,
      floorCleared: true,
    };
    expect(topFloor(r)).toBe(8);
    const won = nextFloor(r);
    expect(won.status).toBe("over");
    expect(isVictory(won)).toBe(true);
    expect(won.coins).toBe(victoryCoins("f"));
    expect(topFloor(createRun(1, hero))).toBe(100);
  });

  it("loot rank: the dungeon's rank or lower, rarely one above (more at the final boss)", () => {
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
    expect(count(FINAL_UP_CHANCE).b).toBeGreaterThan(n.b * 1.8);
    // SSR cannot go above itself; F cannot go below itself
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      expect(dropRank(rng, "ssr", 0.5)).toMatch(/^(f|e|d|c|b|a|s|ss|ssr)$/);
      expect(dropRank(rng, "f", 0)).toBe("f");
    }
  });

  it("room difficulty (rank) shifts enemies but keeps the room layout", () => {
    // layout: bosses stay every 5 floors, doors identical for the same depth-free floors
    expect(isBossFloor(5, null)).toBe(true);
    expect(isBossFloor(10, null)).toBe(true);
    const mean = (difficulty: "f" | "ssr") => {
      let t = 0;
      for (let seed = 1; seed <= 40; seed++)
        t += enemyFor(seed, 4, "hard", null, difficulty).enemy.stats.atk;
      return t / 40;
    };
    expect(mean("ssr")).toBeGreaterThan(mean("f") * 1.5);
    const run = createRun(1, hero, false, null, "ssr");
    expect(run.rank).toBeNull();
    expect(run.difficulty).toBe("ssr");
    expect(topFloor(run)).toBe(100); // rooms keep the endless-style layout
    expect(depthOf(4, null, "ssr")).toBe(4 + DUNGEONS.ssr.offset);
    expect(depthOf(4, "f", "ssr")).toBe(4); // a dungeon rank wins over the room rank
  });
});
