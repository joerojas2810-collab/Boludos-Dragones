import { describe, expect, it } from "vitest";
import { niveladoHero, NIVELADO_PRESET } from "./niveladoHero";

describe("niveladoHero", () => {
  it("returns a deterministic shared D, 0-star, level-1 class and element preset", () => {
    const first = niveladoHero("mago", "agua");
    expect(niveladoHero("mago", "agua")).toEqual(first);
    expect(first).toMatchObject({
      classId: "mago",
      element: "agua",
      rarity: NIVELADO_PRESET.rank,
      stars: NIVELADO_PRESET.stars,
      level: NIVELADO_PRESET.level,
      xp: 0,
      traits: [],
    });
    expect(first.weapon).toBeUndefined();
    expect(first.gear).toBeUndefined();
  });
});
