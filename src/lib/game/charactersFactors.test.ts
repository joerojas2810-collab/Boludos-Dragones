import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  CLASSES,
  FACTOR_MAX,
  FACTOR_MIN,
  buildStats,
  capFactors,
  factorLabel,
  generateCharacter,
  rollFactors,
} from "./characters";

describe("hero attribute factors", () => {
  it("rolls deterministically in bounds and caps aggregate power", () => {
    const first = rollFactors(createRng(413));
    expect(rollFactors(createRng(413))).toEqual(first);
    for (let seed = 0; seed < 10_000; seed += 1) {
      const factors = rollFactors(createRng(seed));
      for (const value of Object.values(factors)) {
        expect(value).toBeGreaterThanOrEqual(FACTOR_MIN);
        expect(value).toBeLessThanOrEqual(FACTOR_MAX);
      }
      const mean = (factors.hp + factors.atk + factors.def + factors.speed) / 4;
      expect(Math.abs(mean - 1)).toBeLessThanOrEqual(0.1 + Number.EPSILON);
      const cappedAgain = capFactors(factors);
      for (const key of Object.keys(factors) as (keyof typeof factors)[]) {
        expect(cappedAgain[key]).toBeCloseTo(factors[key], 14);
      }
    }
  });

  it("scales class stats before applying traits and leaves accuracy at zero", () => {
    const factors = { hp: 1.1, atk: 0.9, def: 1.05, crit: 1.15, speed: 0.95 };
    const stats = buildStats("caballero", factors, ["temerario"]);
    const base = CLASSES.caballero.stats;
    expect(stats.hp).toBe(Math.round(base.hp * factors.hp));
    expect(stats.atk).toBe(Math.round(base.atk * factors.atk * 1.1 * 10) / 10);
    expect(stats.accuracy).toBe(0);
    expect(stats.critDmg).toBe(base.critDmg);
    expect(stats.resist).toBe(0);
  });

  it("keeps generated stats synchronized with its rolled factors", () => {
    const character = generateCharacter(createRng(71), "mago");
    expect(character.factors).toBeDefined();
    expect(character.stats).toEqual(
      buildStats("mago", character.factors!, character.traits),
    );
    expect(character.stats.accuracy).toBe(0);
  });

  it("labels factor deltas and the overall mean", () => {
    const labels = factorLabel({ hp: 0.94, atk: 1.12, def: 1, crit: 1.05, speed: 1.02 });
    expect(labels.perStat.atk).toBe("ATQ +12 %");
    expect(labels.perStat.hp).toBe("VIDA −6 %");
    expect(labels.summary).toBe("estándar");
  });
});
