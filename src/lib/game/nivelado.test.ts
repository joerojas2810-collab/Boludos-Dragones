import { describe, expect, it } from "vitest";
import {
  CLASSES,
  CLASS_IDS,
  generateCharacter,
  type Character,
} from "./characters";
import {
  NIVELADO_MAX_BONUS,
  NIVELADO_VARIATION,
  NIVELADO_WEAPON_CAP,
  niveladoBonus,
  normalizeHero,
} from "./nivelado";
import { RARITY_IDS, RARITIES, scaleStats, starMult } from "./rarity";
import { createRng } from "./rng";

function hero(
  seed: number,
  rarity: (typeof RARITY_IDS)[number],
  stars: number,
  weaponAtk = 0,
): Character {
  const c = generateCharacter(createRng(seed), CLASS_IDS[seed % 4]);
  const stats = scaleStats(c.stats, rarity, stars);
  return {
    ...c,
    rarity,
    stars,
    stats: { ...stats, atk: stats.atk + weaponAtk },
    weapon: weaponAtk ? { element: "fuego", atkBonus: weaponAtk } : undefined,
  };
}

describe("niveladoBonus", () => {
  it.each([
    ["comun", 0, 0],
    ["legendario", 5, NIVELADO_MAX_BONUS],
  ] as const)("%s %i★ = %f", (r, st, exp) => {
    expect(niveladoBonus(r, st)).toBeCloseTo(exp, 10);
  });
  it("epico 3★ is about 8-9% and monotonic", () => {
    expect(niveladoBonus("epico", 3)).toBeGreaterThan(0.08);
    expect(niveladoBonus("epico", 3)).toBeLessThan(0.09);
    expect(niveladoBonus("raro", 0)).toBeLessThan(niveladoBonus("epico", 0));
    expect(niveladoBonus("legendario", 99)).toBeLessThanOrEqual(
      NIVELADO_MAX_BONUS,
    );
  });
});

describe("normalizeHero", () => {
  it("completo returns the hero unchanged (same reference)", () => {
    const h = hero(1, "epico", 2);
    expect(normalizeHero(h, "completo")).toBe(h);
  });
  it("deterministic and pure", () => {
    const h = hero(3, "raro", 1, 2);
    const copy = structuredClone(h);
    expect(normalizeHero(h, "nivelado")).toEqual(normalizeHero(h, "nivelado"));
    expect(h).toEqual(copy);
  });
  it("keeps identity: traits, element, passive source, weapon element, name", () => {
    const h = hero(5, "legendario", 5, 3);
    const n = normalizeHero(h, "nivelado");
    expect(n).toMatchObject({
      name: h.name,
      classId: h.classId,
      element: h.element,
      traits: h.traits,
      catchphrase: h.catchphrase,
      rarity: "legendario",
      stars: 5,
      level: 1,
      xp: 0,
    });
    expect(n.weapon?.element).toBe("fuego");
  });
  it("cap: nobody exceeds base*(1.075)*(1.15)+weapon cap, floor at base*0.925", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rarity = RARITY_IDS[seed % 5];
      const stars = seed % 6;
      const h = hero(seed, rarity, stars, (seed % 7) * 2);
      const n = normalizeHero(h, "nivelado");
      const base = CLASSES[h.classId].stats;
      const top = 1 + NIVELADO_VARIATION;
      const bonus = 1 + NIVELADO_MAX_BONUS;
      expect(n.stats.hp).toBeLessThanOrEqual(Math.round(base.hp * top * bonus));
      expect(n.stats.def).toBeLessThanOrEqual(base.def * top * bonus + 0.1);
      expect(n.stats.atk).toBeLessThanOrEqual(
        base.atk * top * bonus + base.atk * NIVELADO_WEAPON_CAP + 0.1,
      );
      expect(n.stats.hp).toBeGreaterThanOrEqual(
        Math.floor(base.hp * (1 - top + 1 - NIVELADO_VARIATION - 0.0001)),
      );
      expect(n.stats.atk).toBeGreaterThanOrEqual(
        base.atk * (1 - NIVELADO_VARIATION) - 0.1,
      );
    }
  });
  it("a Legendario 5★ and a Común 0★ of the same class differ by at most ~15% + variation", () => {
    const lo = normalizeHero(hero(4, "comun", 0), "nivelado");
    const hi = normalizeHero(hero(8, "legendario", 5), "nivelado");
    expect(lo.classId).toBe(hi.classId);
    const ratio = hi.stats.hp / lo.stats.hp;
    expect(ratio).toBeLessThan(
      ((1 + NIVELADO_VARIATION) * 1.15) / (1 - NIVELADO_VARIATION) + 0.01,
    );
    void RARITIES;
    void starMult;
  });
});
