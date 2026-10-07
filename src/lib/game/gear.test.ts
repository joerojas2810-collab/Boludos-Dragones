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
    const five = activeSets(Array(5).fill("rayo"), "fuego");
    expect(five[0].tier).toBe(4);
    const six = activeSets(Array(6).fill("rayo"), "fuego");
    expect(six[0].tier).toBe(6);
    expect(six[0].bonus.crit).toBe(SET_BONUS.rayo[2].crit);
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
    expect(setLine(s)).toBe("Set de Rayo (2): +4.5% crítico · +4.5% daño crítico (afinidad ×1.5)");
  });
});

import { buildLabel, resonances, rollGear, gearBonus as gb, GEAR_CAP as CAP, NO_GEAR as NG } from "./gear";
import { createRng } from "./rng";

describe("gear rolls and resonance (Run v2)", () => {
  it("rolls vary +-15% and the rank decides the number of distinct extra lines", () => {
    const rng = createRng(5);
    expect(rollGear(rng, "casco", "f").lines).toHaveLength(0);
    expect(rollGear(rng, "casco", "c").lines).toHaveLength(1);
    expect(rollGear(rng, "casco", "a").lines).toHaveLength(2);
    const ss = rollGear(rng, "peto", "ss");
    expect(ss.lines).toHaveLength(3);
    expect(new Set(ss.lines.map((l) => l.stat)).size).toBe(3);
    for (const r of [ss.roll, ...ss.lines.map((l) => l.roll)]) {
      expect(r).toBeGreaterThanOrEqual(0.85);
      expect(r).toBeLessThanOrEqual(1.15);
    }
  });

  it("a better roll gives a bigger bonus and totals stay under the caps", () => {
    const base = { type: "casco" as const, rarity: "b" as const, stars: 0, lines: [] };
    expect(gb([{ ...base, roll: 1.15 }]).hp).toBeGreaterThan(gb([{ ...base, roll: 0.85 }]).hp);
    const full = (["casco", "peto", "piernas", "zapatos", "collar"] as const).map((type) => ({
      type, rarity: "ssr" as const, stars: 5, ...rollGear(createRng(9), type, "ssr"),
    }));
    const b = gb(full);
    for (const k of Object.keys(NG) as (keyof typeof NG)[]) expect(b[k]).toBeLessThanOrEqual(CAP[k]);
  });

  it("resonance needs a dominant group of lines; style multiplies; label reads the build", () => {
    const tank = (["casco", "peto"] as const).map((type) => ({
      type, rarity: "c" as const, stars: 0, roll: 1,
      lines: [{ stat: "hp" as const, roll: 1 }],
    }));
    const rs = resonances(tank, "tanque");
    expect(rs[0].group).toBe("tanque");
    expect(rs[0].styled).toBe(true);
    expect(rs[0].bonus.dmgTaken).toBeCloseTo(0.12, 3); // tier 2 (0.08) x1.5
    expect(resonances(tank, "dano")[0].bonus.dmgTaken).toBeCloseTo(0.08, 3);
    expect(resonances([{ type: "casco", rarity: "f", stars: 0, roll: 1, lines: [] }])).toHaveLength(0);
    expect(buildLabel(tank)).toBe("tanque");
    expect(buildLabel([])).toBeNull();
  });
});
