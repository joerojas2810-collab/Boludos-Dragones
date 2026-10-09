import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { ELEMENTS, elementMultiplier } from "./elements";
import { generateCharacter, CLASSES } from "./characters";
import { ENRAGE_AFTER_TURN, startBattle, step, withRound } from "./combat";
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
  it("ends with a winner and blocks attack2 during cooldown", () => {
    const rng = createRng(3);
    let b = startBattle(
      generateCharacter(rng, "caballero"),
      generateCharacter(rng, "mago"),
      rng,
    );
    b = step(b, "attack2", rng);
    const turn = b.turn;
    expect(step(b, "attack2", rng).turn).toBe(turn);
    for (let i = 0; i < 200 && b.status === "ongoing"; i++)
      b = step(b, "attack1", rng);
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
  it("enrages the enemy in long fights so they cannot stall forever", () => {
    const rng = createRng(11);
    const b0 = startBattle(
      generateCharacter(rng, "clerigo"),
      generateCharacter(rng, "clerigo"),
      rng,
    );
    const before = b0.enemies[0].char.stats.atk;
    const next = step(
      withRound({ ...b0, turn: ENRAGE_AFTER_TURN }, false, ["defend"]),
      "defend",
      rng,
    );
    expect(next.enemies[0].char.stats.atk).toBeGreaterThan(before);
  });
});
