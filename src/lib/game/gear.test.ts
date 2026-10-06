import { describe, expect, it } from "vitest";
import {
  activeSets,
  GEAR_CAP,
  NO_GEAR,
  SET_AFFINITY,
  SET_BONUS,
  setBonus,
  setLine,
} from "./gear";

describe("element sets", () => {
  it("need 2 pieces of the same element; 4 give the bigger tier", () => {
    expect(
      activeSets(["rayo", "fuego", "agua", "tierra", "viento"], "agua"),
    ).toEqual([]);
    const two = activeSets(["rayo", "rayo", "agua"], "fuego");
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({
      element: "rayo",
      tier: 2,
      pieces: 2,
      affinity: false,
    });
    expect(two[0].bonus.crit).toBe(SET_BONUS.rayo[0].crit);
    const four = activeSets(["rayo", "rayo", "rayo", "rayo", "agua"], "fuego");
    expect(four[0].tier).toBe(4);
    expect(four[0].bonus.crit).toBe(SET_BONUS.rayo[1].crit);
  });
  it("multiplies by affinity when the set matches the hero's element", () => {
    const [s] = activeSets(["fuego", "fuego"], "fuego");
    expect(s.affinity).toBe(true);
    expect(s.bonus.atk).toBeCloseTo(
      (SET_BONUS.fuego[0].atk ?? 0) * SET_AFFINITY,
      3,
    );
  });
  it("two different sets stack (4 + 2) and never pass the gear caps", () => {
    const sets = activeSets(
      ["fuego", "fuego", "fuego", "fuego", "tierra", "tierra"],
      "fuego",
    );
    expect(sets).toHaveLength(2);
    const b = setBonus(sets);
    expect(b.atk).toBeGreaterThan(0);
    expect(b.def).toBeGreaterThan(0);
    for (const k of Object.keys(NO_GEAR) as (keyof typeof NO_GEAR)[])
      expect(b[k]).toBeLessThanOrEqual(GEAR_CAP[k]);
  });
  it("describes the active set in Spanish", () => {
    const [s] = activeSets(["rayo", "rayo"], "rayo");
    expect(setLine(s)).toBe("Set de Rayo (2): +4.5% crítico (afinidad ×1.5)");
  });
});
