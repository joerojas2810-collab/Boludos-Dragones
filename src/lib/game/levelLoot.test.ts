import { describe, expect, it } from "vitest";
import { levelEscamas, levelLoot, rollDado } from "./levelLoot";
import { createRng } from "./rng";
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
    let fp = 0;
    let rp = 0;
    for (let s = 0; s < 400; s++) {
      const a = levelLoot(three, 0, "mago", s, { repeat: false });
      const b = levelLoot(three, 0, "mago", s, { repeat: true });
      fp += a.pieces.length;
      rp += b.pieces.length;
    }
    expect(rp).toBeLessThan(fp);
    expect(rp).toBeGreaterThan(fp / 3); // still generous: sweeps are repeats
  });

  it("Escamas: only S+ (2/3/4), +10% per ascension; repeats take 0.6 x decay and floor to 0", () => {
    expect(levelEscamas("a", 0)).toBe(0);
    expect([levelEscamas("s", 0), levelEscamas("ss", 0), levelEscamas("ssr", 0)]).toEqual([2, 3, 4]);
    expect(levelEscamas("ssr", 5)).toBe(6);
    expect(levelEscamas("ssr", 0, true, 1)).toBe(2); // floor(4 x 0.6)
    expect(levelEscamas("ssr", 5, true, 1)).toBe(3); // floor(6 x 0.6)
    expect(levelEscamas("ssr", 5, true, 0.1)).toBe(0); // heavily decayed repeats (sweep farm) pay nothing
    expect(levelEscamas("ssr", 5, true, 0.2)).toBe(0);
    const last = levelsOf("s").find((l) => l.final)!;
    expect(levelLoot(last, 0, "mago", 1, { repeat: false }).escamas).toBe(2);
    expect(levelLoot(levelsOf("c")[0], 0, "mago", 1, { repeat: false }).escamas).toBe(0);
  });

  it("Dado cargado: 5% from the injected server rng, last level of a dungeon S+ only, never without daily room", () => {
    const last = levelsOf("ss").find((l) => l.final)!;
    const notLast = levelsOf("ss").find((l) => !l.final)!;
    const rng = createRng(77);
    let n = 0;
    for (let s = 0; s < 4000; s++) {
      n += rollDado(last, rng, 2);
      expect(rollDado(notLast, rng, 2)).toBe(0);
      expect(rollDado(last, rng, 0)).toBe(0);
    }
    expect(n / 4000).toBeGreaterThan(0.03);
    expect(n / 4000).toBeLessThan(0.07);
    expect(rollDado(levelsOf("a").find((l) => l.final)!, { ...rng, chance: () => true }, 2)).toBe(0);
    // the run seed decides nothing about it
    expect(levelLoot(last, 0, "mago", 3, { repeat: false }).dados).toBe(0);
  });

  it("pays flat coins, repeats 60% with daily decay", () => {
    expect(levelCoins("f", 0, false)).toBe(60);
    expect(levelCoins("f", 0, true, 1)).toBe(36);
    expect(levelCoins("f", 0, true, 30)).toBeLessThan(levelCoins("f", 0, true, 1));
    expect(levelDecay(100)).toBe(0.1);
    expect(firstClearChest("d", 0)).toBe(2500);
    expect(firstClearChest("d", 2)).toBe(1250);
  });
});
