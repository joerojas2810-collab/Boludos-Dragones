import { describe, expect, it } from "vitest";
import {
  coopNode,
  coopPool,
  coopPrizes,
  COOP_REWARD,
  coopRank,
  coopTally,
} from "./coop";

const node = coopNode(11, null);

describe("coop boss", () => {
  it("is deterministic and never a Clérigo", () => {
    expect(coopNode(11, null)).toEqual(node);
    for (let s = 1; s < 60; s++)
      expect(coopNode(s, null).enemies[0].classId).not.toBe("clerigo");
  });

  it("pool scales with players and the tally picks win and MVP", () => {
    expect(Math.abs(coopPool(11, null, 4) - coopPool(11, null, 2) * 2)).toBeLessThanOrEqual(1);
    const pool = coopPool(11, null, 2);
    const lost = coopTally(pool, { a: pool * 0.3, b: pool * 0.2 });
    expect(lost.won).toBe(false);
    expect(lost.mvp).toBe("a");
    const won = coopTally(pool, { a: pool * 0.6, b: pool * 0.7 });
    expect(won.won).toBe(true);
    expect(won.total).toBe(pool);
    expect(coopTally(pool, {}).mvp).toBeNull();
    expect(coopRank("nivelado", "s")).toBeNull();
    expect(coopRank("completo", "s")).toBe("s");
  });
});

describe("coop prizes", () => {
  const pool = coopPool(11, null, 2);
  it("everybody with damage is paid; a win pays more and the MVP gets an extra Dado cargado", () => {
    const dmg = { a: pool * 0.7, b: pool * 0.5, c: 0 };
    const won = coopPrizes(coopTally(pool, dmg), dmg);
    expect(won.map((p) => p.id)).toEqual(["a", "b"]); // c did nothing
    expect(won[0]).toMatchObject({ coins: COOP_REWARD.winCoins, mvp: true });
    expect(won[0].dados).toBe(2);
    expect(won[1].dados).toBe(1);
    expect(coopPrizes(coopTally(pool, dmg), dmg)).toEqual(won); // deterministic
    const small = { a: pool * 0.1, b: pool * 0.1 };
    const lost = coopPrizes(coopTally(pool, small), small);
    expect(lost.every((p) => p.coins === COOP_REWARD.loseCoins)).toBe(true);
    expect(lost.every((p) => p.dados === 0 && !p.mvp)).toBe(true);
  });
});
