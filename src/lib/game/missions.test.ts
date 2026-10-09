import { describe, expect, it } from "vitest";
import {
  addProgress,
  claimTiers,
  freshState,
  isEventDay,
  missionDeltas,
  missionsFor,
  SCOPE_TIERS,
  reroll,
  weekKey,
} from "./missions";

describe("missions", () => {
  it("rotates deterministically: same day same missions, other days differ", () => {
    const a = missionsFor("daily", "2026-10-06").map((m) => m.key);
    expect(missionsFor("daily", "2026-10-06").map((m) => m.key)).toEqual(a);
    expect(new Set(a).size).toBe(3);
    const days = Array.from({ length: 10 }, (_, i) =>
      missionsFor("daily", `2026-10-${10 + i}`)
        .map((m) => m.key)
        .join(),
    );
    expect(new Set(days).size).toBeGreaterThan(5);
  });

  it("weeks start on Monday and the event runs Fri-Sat", () => {
    expect(weekKey("2026-10-06")).toBe("2026-10-05"); // Tuesday
    expect(weekKey("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(isEventDay("2026-10-09")).toBe(true); // Friday
    expect(isEventDay("2026-10-07")).toBe(false);
    expect(missionsFor("weekly", "2026-10-06")).toEqual(
      missionsFor("weekly", "2026-10-11"),
    );
  });

  it("pays tiers once and only for completed missions", () => {
    const day = "2026-10-06";
    const ms = missionsFor("daily", day);
    let s = freshState("daily", day);
    expect(claimTiers("daily", s, ms).coins).toBe(0);
    for (const m of ms.slice(0, 2))
      s = addProgress(s, m.kind, m.target, m.param);
    const first = claimTiers("daily", s, ms);
    expect(first.coins).toBe(400); // tiers 1 + 2: 150 + 250
    expect(first.dados).toBe(0);
    expect(claimTiers("daily", first.state, ms).coins).toBe(0);
    s = first.state;
    s = addProgress(s, ms[2].kind, ms[2].target, ms[2].param);
    expect(claimTiers("daily", s, ms).coins).toBe(700);
  });

  it("rerolls once, swaps one slot and refuses a finished mission", () => {
    const day = "2026-10-06";
    const base = missionsFor("daily", day);
    const s = reroll("daily", day, freshState("daily", day), 1)!;
    const after = missionsFor("daily", day, s.rerolled);
    expect(after[0].key).toBe(base[0].key);
    expect(after[1].key).not.toBe(base[1].key);
    expect(reroll("daily", day, s, 0)).toBeNull();
    const done = addProgress(
      freshState("daily", day),
      base[0].kind,
      base[0].target,
      base[0].param,
    );
    expect(reroll("daily", day, done, 0)).toBeNull();
  });

  it("reward table matches the design (daily 1100, weekly 2800, event 1800 coins)", () => {
    const sum = (k: "daily" | "weekly" | "event") =>
      SCOPE_TIERS[k].reduce((a, t) => a + t.coins, 0);
    expect([sum("daily"), sum("weekly"), sum("event")]).toEqual([1100, 2800, 1800]);
    expect(SCOPE_TIERS.weekly[1].pieces).toBe(1);
  });

  it("missionDeltas counts fights, bosses, element, levels and dungeon", () => {
    const d = missionDeltas({
      status: "cleared",
      won: { normal: 3, elite: 0, final: 1 },
      heroElement: "agua",
      finalLevel: true,
    });
    expect(d).toEqual({ fights: 4, "element:agua": 4, bosses: 1, levels: 1, dungeon: 1 });
    const lost = missionDeltas({
      status: "lost",
      won: { normal: 2, elite: 0, final: 0 },
      heroElement: "fuego",
    });
    expect(lost).toEqual({ fights: 2, "element:fuego": 2 });
  });
});
