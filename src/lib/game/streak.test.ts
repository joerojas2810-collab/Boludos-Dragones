import { describe, expect, it } from "vitest";
import {
  addDays,
  claimDaily,
  currentStreak,
  dayKey,
  streakBonus,
} from "./streak";

describe("daily streak", () => {
  it("uses Buenos Aires day, not UTC", () => {
    expect(dayKey(new Date("2026-01-01T02:00:00Z"))).toBe("2025-12-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("counts consecutive days and resets after a gap", () => {
    let d = claimDaily(undefined, "2026-05-01")!.daily;
    expect(d.streak).toBe(1);
    d = claimDaily(d, "2026-05-02")!.daily;
    const third = claimDaily(d, "2026-05-03")!;
    expect(third.daily.streak).toBe(3);
    expect(third.bonus).toBe(streakBonus(3));
    expect(claimDaily(third.daily, "2026-05-03")).toBeNull();
    expect(currentStreak(third.daily, "2026-05-05")).toBe(0);
    expect(claimDaily(third.daily, "2026-05-05")!.daily.streak).toBe(1);
  });
  it("pays on day 3 and 7 and repeats the cycle", () => {
    expect([1, 2, 3, 4, 7, 8, 10, 14].map(streakBonus)).toEqual([
      0, 0, 500, 0, 1500, 0, 500, 1500,
    ]);
  });
});
