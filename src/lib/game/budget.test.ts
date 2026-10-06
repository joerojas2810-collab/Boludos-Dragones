import { describe, expect, it } from "vitest";
import { dungeonBudget, rollEvent } from "./budget";
import { DUNGEONS } from "./dungeons";
import { partCount } from "./parts";
import { RARITY_IDS } from "./rarity";

describe("dungeon loot budget", () => {
  it("grows with rank and length", () => {
    let prev = 0;
    for (const r of RARITY_IDS) {
      expect(dungeonBudget(r), r).toBeGreaterThan(prev);
      prev = dungeonBudget(r);
    }
    expect(dungeonBudget("f")).toBe(Math.round(8 * 1.5));
  });

  it("a whole dungeon never gives more than its budget and the final boss spends the rest", () => {
    for (const rank of ["f", "c", "ssr"] as const) {
      for (let seed = 1; seed <= 60; seed++) {
        const d = DUNGEONS[rank];
        let pool = dungeonBudget(rank);
        let spent = 0;
        for (let floor = 1; floor <= d.floors; floor++) {
          const isBoss = d.bosses.includes(floor);
          const source =
            floor === d.floors
              ? "finalBoss"
              : isBoss
                ? "boss"
                : floor % 3 === 0
                  ? "chest"
                  : floor % 2
                    ? "hard"
                    : "easy";
          const ev = rollEvent(
            source,
            seed,
            floor,
            1,
            rank,
            "mago",
            pool,
            "fuego",
          );
          expect(ev.spent).toBeLessThanOrEqual(pool + 1e-9);
          expect(partCount(ev.parts)).toBeLessThanOrEqual(ev.spent * 2 + 2); // spent + risk bonus
          pool -= ev.spent;
          spent += ev.spent;
        }
        expect(spent).toBeLessThanOrEqual(dungeonBudget(rank) + 1e-9);
        expect(pool, `${rank}:${seed}`).toBeLessThan(1.01); // all but a sub-point crumb is spent
      }
    }
  });

  it("splits the same budget differently between seeds; bosses offer pieces, easy fights do not", () => {
    const mixes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const ev = rollEvent("boss", seed, 5, 1, "c", "caballero", 40, "agua");
      mixes.add(`${ev.pieces.length}:${partCount(ev.parts)}`);
      expect(ev.pieces.length).toBe(2);
      expect(
        rollEvent("easy", seed, 3, 1, "c", "caballero", 40, "agua").pieces,
      ).toEqual([]);
    }
    expect(mixes.size).toBeGreaterThan(3);
    expect(rollEvent("boss", 1, 5, 1, "c", "caballero", 0, "agua")).toEqual({
      parts: {},
      pieces: [],
      spent: 0,
    });
  });

  it("risk is free loot on top: the pool is charged the same share for easy and hard", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const e = rollEvent("easy", seed, 6, 1, "c", "mago", 60, "fuego", 1);
      const h = rollEvent("hard", seed, 6, 1, "c", "mago", 60, "fuego", 3);
      expect(h.spent).toBeLessThanOrEqual(60 * 0.05 * 1.6 + 1e-9); // never above the base share
      expect(e.spent).toBeLessThanOrEqual(60 * 0.05 * 1.6 + 1e-9);
    }
  });

  it("riskier choices pay better: hard > easy and bigger groups > lone enemies", () => {
    const avg = (src: "easy" | "hard", group: number) => {
      let parts = 0;
      let high = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const ev = rollEvent(src, seed, 6, 1, "c", "mago", 60, "fuego", group);
        parts += partCount(ev.parts);
        for (const k of Object.keys(ev.parts))
          if (/-b$/.test(k)) high += ev.parts[k];
      }
      return { parts: parts / 600, high: high / 600 };
    };
    const easy = avg("easy", 1);
    const hard = avg("hard", 1);
    const hard3 = avg("hard", 3);
    expect(hard.parts).toBeGreaterThan(easy.parts * 1.3);
    expect(hard.high).toBeGreaterThan(easy.high);
    expect(hard3.parts).toBeGreaterThan(hard.parts * 1.15);
    expect(hard3.high).toBeGreaterThan(hard.high);
  });
});
