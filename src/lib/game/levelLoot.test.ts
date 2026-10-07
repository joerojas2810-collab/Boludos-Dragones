import { describe, expect, it } from "vitest";
import { levelLoot, levelPoints } from "./levelLoot";
import { firstClearChest, levelCoins, levelDecay } from "./levelPay";
import { levelsOf } from "./levels";

describe("level loot", () => {
  const ls = levelsOf("c");
  const three = ls.find((l) => l.length === 3)!;
  const two = ls.find((l) => l.length === 2)!;

  it("first clear: levels of 3+ guarantee a piece of the level slot and element; 2-fight levels none", () => {
    for (let s = 0; s < 20; s++) {
      const l = levelLoot(three, 0, "mago", s, { repeat: false });
      expect(l.pieces.length).toBeGreaterThanOrEqual(1);
      expect(l.pieces[0].element).toBe(three.element);
      expect(levelLoot(two, 0, "mago", s, { repeat: false }).pieces).toHaveLength(0);
    }
  });

  it("repeats rarely give a piece and fewer materials", () => {
    let first = 0;
    let rep = 0;
    let fp = 0;
    let rp = 0;
    for (let s = 0; s < 400; s++) {
      const a = levelLoot(three, 0, "mago", s, { repeat: false });
      const b = levelLoot(three, 0, "mago", s, { repeat: true });
      first += Object.values(a.parts).reduce((x, y) => x + y, 0);
      rep += Object.values(b.parts).reduce((x, y) => x + y, 0);
      fp += a.pieces.length;
      rp += b.pieces.length;
    }
    expect(rp).toBeLessThan(fp / 2);
    expect(rep).toBeLessThan(first);
    expect(levelPoints(three, 3)).toBeGreaterThan(levelPoints(three, 0));
  });

  it("pays flat coins, repeats 60% with daily decay", () => {
    expect(levelCoins("f", 0, false)).toBe(25);
    expect(levelCoins("f", 0, true, 1)).toBe(15);
    expect(levelCoins("f", 0, true, 30)).toBeLessThan(levelCoins("f", 0, true, 1));
    expect(levelDecay(100)).toBe(0.1);
    expect(firstClearChest("d", 0)).toBe(2500);
    expect(firstClearChest("d", 2)).toBe(1250);
  });
});
