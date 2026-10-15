import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { ELEMENTS, elementMultiplier } from "./elements";
import { generateCharacter, CLASSES } from "./characters";
import { startBattle, step } from "./combat";
import { ENRAGE_AFTER_OWN_TURN } from "./bossRules";
import { fight, noCrit, unit, withIntents, withProgress } from "./testkit";
import { TRAIT_IDS, TRAITS } from "./traits";

describe("rng", () => {
  it("is deterministic per seed", () => {
    expect(createRng(7).next()).toBe(createRng(7).next());
    expect(createRng(7).next()).not.toBe(createRng(8).next());
  });
});

describe("elements", () => {
  it("each element beats 1, loses to 1, neutral vs the other 3", () => {
    for (const a of ELEMENTS) {
      const ms = ELEMENTS.map((b) => elementMultiplier(a, b));
      expect(ms.filter((m) => m === 1.25)).toHaveLength(1);
      expect(ms.filter((m) => m === 0.75)).toHaveLength(1);
      expect(ms.filter((m) => m === 1)).toHaveLength(3); // itself and two more
    }
  });
  it("follows the cycle agua > fuego > viento > tierra > rayo > agua", () => {
    expect(elementMultiplier("agua", "fuego")).toBe(1.25);
    expect(elementMultiplier("fuego", "viento")).toBe(1.25);
    expect(elementMultiplier("viento", "tierra")).toBe(1.25);
    expect(elementMultiplier("tierra", "rayo")).toBe(1.25);
    expect(elementMultiplier("rayo", "agua")).toBe(1.25);
    expect(elementMultiplier("agua", "rayo")).toBe(0.75);
    expect(elementMultiplier("agua", "viento")).toBe(1);
    expect(elementMultiplier("agua", "tierra")).toBe(1);
  });
});

describe("characters", () => {
  it("keeps stats within ±15% of class base", () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) {
      const c = generateCharacter(rng, "mago");
      if (c.traits.some((t) => "hp" in TRAITS[t].mods)) continue; // traits shift hp on purpose
      const base = CLASSES.mago.stats;
      expect(c.stats.hp).toBeGreaterThanOrEqual(Math.floor(base.hp * 0.85));
      expect(c.stats.hp).toBeLessThanOrEqual(Math.ceil(base.hp * 1.15));
    }
  });
});

describe("combat", () => {
  it("ends with a winner by basic attacks and blocks a skill during its cooldown", () => {
    const rng = createRng(3);
    let b = startBattle(
      generateCharacter(rng, "caballero"),
      generateCharacter(rng, "mago"),
      rng,
      { loadout: ["knight_advance", "knight_bastion"] },
    );
    b = { ...b, player: { ...b.player, res: 3 } };
    b = step(b, "knight_bastion", rng);
    const turns = b.turn;
    expect(step(b, "knight_bastion", rng)).toBe(b); // C=1: blocked on the next own turn
    expect(b.turn).toBe(turns);
    for (let i = 0; i < 300 && b.status === "ongoing"; i++) b = step(b, "attack1", rng);
    expect(b.status).not.toBe("ongoing");
  });
});

describe("traits", () => {
  it("rolls 1-2 unique traits and applies their stat mods", () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const c = generateCharacter(rng);
      expect(c.traits.length).toBeGreaterThanOrEqual(1);
      expect(c.traits.length).toBeLessThanOrEqual(2);
      expect(new Set(c.traits).size).toBe(c.traits.length);
      expect(c.stats.resist).toBeGreaterThanOrEqual(0);
      expect(c.stats.hp).toBeGreaterThan(0);
    }
  });
  it("has 20 personality traits", () => {
    expect(TRAIT_IDS).toHaveLength(20);
  });
});

describe("combat edge cases", () => {
  it("enrages the enemy by its own turns in long fights so they cannot stall forever", () => {
    const base = withProgress(
      fight(unit("clerigo", { hp: 1e9, atk: 1 }), unit("clerigo", { hp: 1e9, atk: 10 })),
      { 0: 0, 1: 10_000 },
    );
    const before = base.enemies[0].char.stats.atk;
    const late = { ...base, enemies: [{ ...base.enemies[0], ownTurns: ENRAGE_AFTER_OWN_TURN }] };
    const next = step(withIntents(late, ["defend"]), "defend", noCrit());
    expect(next.enemies[0].char.stats.atk).toBeGreaterThan(before);
    const early = step(withIntents(base, ["defend"]), "defend", noCrit());
    expect(early.enemies[0].char.stats.atk).toBe(before);
  });
});
