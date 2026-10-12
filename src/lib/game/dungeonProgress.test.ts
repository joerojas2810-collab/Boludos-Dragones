import { describe, expect, it } from "vitest";
import { emptyDungeonProgress, isLevelUnlocked, isStepUnlocked, recordClear, stepCleared, type DungeonProgress } from "./dungeonProgress";
import { DIFFICULTIES } from "./rarity";
import { LEVELS_PER_ROUTE, ROUTE_IDS, levelsOf } from "./levels";

describe("route and difficulty progress", () => {
  it("has four route levels of 2, 2, 3 and final 3 fights", () => {
    for (const route of ROUTE_IDS) for (const difficulty of DIFFICULTIES) {
      const specs = levelsOf(route, difficulty);
      expect(specs.map((level) => level.length)).toEqual([2, 2, 3, 3]);
      expect(specs.filter((level) => level.final)).toHaveLength(1);
      expect(specs).toHaveLength(LEVELS_PER_ROUTE);
    }
  });
  it("shares unlocked steps between routes but stores route level progress separately", () => {
    let p: DungeonProgress = emptyDungeonProgress();
    expect(isStepUnlocked(p, { difficulty: "f", asc: 0 })).toBe(true);
    expect(isStepUnlocked(p, { difficulty: "f", asc: 1 })).toBe(false);
    expect(isLevelUnlocked(p, ROUTE_IDS[0], "f", 0, 0)).toBe(true);
    for (let i = 0; i < LEVELS_PER_ROUTE; i++) p = recordClear(p, ROUTE_IDS[0], "f", i)!.progress;
    expect(stepCleared(p, "f", 0)).toBe(true);
    expect(isStepUnlocked(p, { difficulty: "f", asc: 1 })).toBe(true);
    expect(isStepUnlocked(p, { difficulty: "e", asc: 0 })).toBe(true);
    expect(isLevelUnlocked(p, ROUTE_IDS[1], "f", 0, 0)).toBe(true);
    expect(isLevelUnlocked(p, ROUTE_IDS[1], "f", 1, 0)).toBe(false);
    expect(p.routes[`${ROUTE_IDS[0]}:f:0`]).toBe(4);
    expect(p.routes[`${ROUTE_IDS[1]}:f:0`]).toBeUndefined();
  });
  it("unlocks the 42-step staircase in order", () => {
    let p = emptyDungeonProgress();
    for (let index = 0; index < DIFFICULTIES.length; index++) {
      const difficulty = DIFFICULTIES[index];
      for (let asc = 0; asc <= 5; asc++) {
        expect(isStepUnlocked(p, { difficulty, asc: asc as 0 | 1 | 2 | 3 | 4 | 5 })).toBe(true);
        for (let level = 0; level < 4; level++) p = recordClear(p, ROUTE_IDS[0], difficulty, level, asc)!.progress;
        expect(stepCleared(p, difficulty, asc)).toBe(true);
      }
    }
    expect(Object.keys(p.steps)).toHaveLength(42);
  });
});
