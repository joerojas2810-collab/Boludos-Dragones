import { describe, expect, it } from "vitest";
import { computeAwards, type AwardInput } from "./awards";
import { interfereCostFor, ROOM_K } from "./room";

const P = (id: string, o: Partial<AwardInput> = {}): AwardInput => ({
  id, chips: 100, maxFloor: 5, wins: 2, losses: 1, betNet: 0, interferences: 0, ...o,
});

describe("computeAwards", () => {
  it("works with 2 players and caps awards per player", () => {
    const r = computeAwards([P("a", { betNet: 40 }), P("b", { betNet: -40, interferences: 2 })]);
    expect(r.length).toBeGreaterThan(0);
    for (const id of ["a", "b"]) expect(r.filter((x) => x.player === id).length).toBeLessThanOrEqual(ROOM_K.maxAwardsPerPlayer);
    expect(r.find((x) => x.id === "apostador")?.player).toBe("a");
    expect(r.find((x) => x.id === "mecenas")?.player).toBe("b");
  });
  it("spreads awards across 7 players without repeats", () => {
    const ps = Array.from({ length: 7 }, (_, i) =>
      P(`p${i}`, { betNet: (i - 3) * 10, losses: i, interferences: 7 - i, wins: i, maxFloor: i + 1, chips: 50 + i * 20 }),
    );
    const r = computeAwards(ps);
    const per = new Map<string, number>();
    for (const a of r.slice(0, 7)) per.set(a.player, (per.get(a.player) ?? 0) + 1);
    expect(Math.max(...per.values())).toBe(1);
  });
  it("skips awards whose data is missing and handles empty input", () => {
    expect(computeAwards([]).length).toBe(0);
    expect(computeAwards([P("a")]).some((x) => x.id === "murio")).toBe(false);
    expect(computeAwards([P("a", { deaths: 3 })]).some((x) => x.id === "murio")).toBe(true);
  });
});

describe("interfereCostFor", () => {
  it("discounts only the clear last place in 3+ rooms", () => {
    expect(interfereCostFor({ a: 200, b: 120, c: 90 }, "c")).toBe(ROOM_K.interfereCost - ROOM_K.catchUpDiscount);
    expect(interfereCostFor({ a: 200, b: 120, c: 90 }, "b")).toBe(ROOM_K.interfereCost);
    expect(interfereCostFor({ a: 200, b: 170, c: 180 }, "b")).toBe(ROOM_K.interfereCost);
    expect(interfereCostFor({ a: 200, b: 10 }, "b")).toBe(ROOM_K.interfereCost);
  });
});
