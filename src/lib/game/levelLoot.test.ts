import { describe, expect, it } from "vitest";
import { levelLoot, levelPoints } from "./levelLoot";
import { firstClearChest, levelCoins, levelDecay } from "./levelPay";
import { levelsOf } from "./levels";

describe("level loot", () => {
  const ls = levelsOf("c");
  const three = ls.find((l) => l.length === 3)!;
  const two = ls.find((l) => l.length === 2)!;

  it("every piece is random: generous volume, all slots and elements, ranks from the dungeon down", () => {
    const slots = new Set<string>();
    const els = new Set<string>();
    const ranks = new Set<string>();
    let total = 0;
    for (let s = 0; s < 300; s++) {
      const l = levelLoot(three, 0, "mago", s, { repeat: false });
      total += l.pieces.length;
      for (const p of l.pieces) {
        slots.add(p.type);
        els.add(p.element);
        ranks.add(p.rarity);
      }
    }
    expect(total / 300).toBeGreaterThan(4); // 3-fight level: ~5 pieces
    expect(slots.size).toBeGreaterThanOrEqual(8);
    expect(els.size).toBe(5);
    expect(ranks.size).toBeGreaterThanOrEqual(4);
    expect([...ranks].every((r) => ["f", "e", "d", "c", "b"].includes(r))).toBe(true); // c dungeon: up to b
  });

  it("2-fight levels also drop pieces", () => {
    let n = 0;
    for (let s = 0; s < 200; s++) n += levelLoot(two, 0, "mago", s, { repeat: false }).pieces.length;
    expect(n / 200).toBeGreaterThan(2);
  });

  it("repeats give fewer pieces and fewer materials than a first clear", () => {
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
    expect(rp).toBeLessThan(fp);
    expect(rp).toBeGreaterThan(fp / 3); // still generous: sweeps are repeats
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
