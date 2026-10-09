import { describe, expect, it } from "vitest";
import {
  addHeroXp,
  gapMult,
  levelCap,
  levelMult,
  xpToNextLevel,
} from "./heroLevel";
import { heroSkill } from "./skills";

describe("hero level", () => {
  it("cap is 20 + 10 per star", () => {
    expect([0, 1, 5].map(levelCap)).toEqual([20, 30, 70]);
  });
  it("power is +1% per level above 1", () => {
    expect(levelMult(1)).toBe(1);
    expect(levelMult(0)).toBe(1);
    expect(levelMult(21)).toBeCloseTo(1.2, 10);
  });
  it("cumulative EXP to level 20 is 24700", () => {
    let total = 0;
    for (let l = 1; l < 20; l++) total += xpToNextLevel(l);
    expect(total).toBe(24700);
  });
  it("gap bands: >=20 x3, >=10 x2, else x1", () => {
    expect([0, 9, 10, 19, 20, 40].map((g) => gapMult(1, 1 + g))).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });
  it("addHeroXp levels up, carries the rest and keeps none at the cap", () => {
    const r = addHeroXp({ level: 1, xp: 0 }, 0, 10 + 40 + 5);
    expect(r).toEqual({ level: 3, xp: 5, gained: 2 });
    const top = addHeroXp({ level: 19, xp: 0 }, 0, 1_000_000);
    expect(top).toEqual({ level: 20, xp: 0, gained: 1 });
    expect(addHeroXp({ level: 20, xp: 0 }, 0, 999)).toEqual({
      level: 20,
      xp: 0,
      gained: 0,
    });
  });
});

describe("class skill", () => {
  it("heroSkill: pick if valid, else class default (any rank)", () => {
    expect(heroSkill("mago")).toBe("tormenta");
    expect(heroSkill("mago", "drenarMana")).toBe("drenarMana");
    expect(heroSkill("mago", "castigo")).toBe("tormenta");
  });
});
