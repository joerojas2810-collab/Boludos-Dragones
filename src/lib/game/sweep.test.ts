import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { levelsOf } from "./levels";
import { scaleStats } from "./rarity";
import { createRng } from "./rng";
import { levelFights } from "./stage";
import { sweepStage } from "./sweep";

const strong = () => {
  const c = generateCharacter(createRng(1), "caballero");
  return { ...c, stats: scaleStats(c.stats, "s", 5, 50) };
};

describe("sweepStage", () => {
  it("clears an easy level with a strong hero, deterministically", () => {
    const fights = levelFights(levelsOf("f")[0], 0);
    const a = sweepStage(7, strong(), fights, 0);
    expect(a.status).toBe("cleared");
    expect(sweepStage(7, strong(), fights, 0).xp).toBe(a.xp);
  });

  it("does not clear a top dungeon with a weak hero", () => {
    const weak = generateCharacter(createRng(2), "mago");
    const fights = levelFights(levelsOf("ssr")[0], 0);
    expect(sweepStage(7, weak, fights, 0).status).not.toBe("cleared");
  });
});
