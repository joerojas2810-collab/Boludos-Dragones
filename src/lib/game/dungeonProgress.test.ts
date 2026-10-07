import { describe, expect, it } from "vitest";
import {
  isLevelUnlocked,
  isRankUnlocked,
  maxAscension,
  recordClear,
  type DungeonProgress,
} from "./dungeonProgress";
import { LEVELS_PER_RANK } from "./levels";

describe("dungeon progress", () => {
  it("levels unlock in order and ranks after the previous rank is done", () => {
    let p: DungeonProgress = {};
    expect(isLevelUnlocked(p, "f", 0)).toBe(true);
    expect(isLevelUnlocked(p, "f", 1)).toBe(false);
    expect(isRankUnlocked(p, "e")).toBe(false);
    for (let i = 0; i < LEVELS_PER_RANK.f; i++) {
      const r = recordClear(p, "f", i)!;
      expect(r.firstTime).toBe(true);
      expect(r.dungeonFirstClear).toBe(i === LEVELS_PER_RANK.f - 1);
      p = r.progress;
    }
    expect(isRankUnlocked(p, "e")).toBe(true);
    expect(maxAscension(p, "f")).toBe(1);
    expect(recordClear(p, "f", 0)!.firstTime).toBe(false);
    expect(recordClear(p, "f", 3, 1)).toBeNull(); // asc 1 level 3 not reachable yet
    expect(recordClear(p, "f", 0, 1)!.firstTime).toBe(true);
  });
});
