// Statuses, Berserker fury and boss registration on the turn engine (engine rules live in combat/skills tests).
import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import { startBattle, furyBonus, step } from "./combat";
import { stanceFor } from "./bossRules";
import { createRng, type Rng } from "./rng";
import { addStatus, cleanse, STATUS_DATA, stacksOf, tickStatuses } from "./statuses";

const unit = (
  classId: ClassId,
  stats: Partial<Character["stats"]> = {},
  extra: Partial<Character> = {},
): Character => {
  const c = generateCharacter(createRng(1), classId);
  return {
    ...c,
    element: "agua",
    traits: [],
    stats: {
      hp: 1000,
      atk: 20,
      def: 0,
      crit: 0,
      resist: 0,
      accuracy: 0.5,
      critDmg: 1.5,
      regen: 0,
      lifesteal: 0,
      speed: 10,
      ...stats,
    },
    ...extra,
  };
};
const always: Rng = { ...createRng(1), chance: (p) => p >= 0.5 };

describe("elemental statuses", () => {
  it("stacks cap at the status maximum and renew the duration", () => {
    let list = addStatus(undefined, "escarcha", 2);
    list = addStatus(list, "escarcha", 2);
    expect(stacksOf(list, "escarcha")).toBe(STATUS_DATA.escarcha.max);
    expect(list[0].turns).toBe(STATUS_DATA.escarcha.turns);
  });

  it("resistance shortens negative statuses (min 1 turn) and never the positive one", () => {
    expect(addStatus(undefined, "ruptura", 1, undefined, 0.5)[0].turns).toBe(2);
    expect(addStatus(undefined, "ruptura", 1, undefined, 0.99)[0].turns).toBe(1);
    expect(addStatus(undefined, "impulso", 1, undefined, 0.99)[0].turns).toBe(STATUS_DATA.impulso.turns);
  });

  it("statuses expire after their duration", () => {
    let list = addStatus(undefined, "quemadura", 1, 10);
    for (let i = 0; i < 6; i++) list = tickStatuses(list);
    expect(list).toHaveLength(0);
  });

  it("cleanse removes the first negative status only", () => {
    const list = addStatus(addStatus(undefined, "impulso", 1), "escarcha", 1);
    expect(cleanse(list).map((s) => s.id)).toEqual(["impulso"]);
  });

  it("an elemental hero's attack leaves its state on the target", () => {
    const b = startBattle({ ...unit("mago"), element: "fuego" }, [unit("picaro", { hp: 10000 })], createRng(4));
    const out = step(b, "attack1", always);
    expect(out).not.toBe(b);
    expect(stacksOf(out.enemies[0].statuses, "quemadura")).toBeGreaterThan(0);
  });
});

describe("Berserker", () => {
  it("Furia: +15 % under 66 % hp and +30 % under 33 %, none for other classes", () => {
    const at = (cls: ClassId, frac: number) => {
      const c = startBattle(unit(cls), [unit("picaro")], createRng(3)).player;
      return furyBonus({ ...c, hp: Math.round(c.char.stats.hp * frac) });
    };
    expect(at("berserker", 1)).toBe(0);
    expect(at("berserker", 0.5)).toBe(0.15);
    expect(at("berserker", 0.2)).toBe(0.3);
    expect(at("caballero", 0.2)).toBe(0);
  });
});

describe("dungeon bosses", () => {
  const hero = () => unit("caballero", { hp: 5000, atk: 5, def: 0 });
  it("a boss gets its state and ordinary enemies do not", () => {
    const boss = unit("mago", {}, { bossId: "ash_king", name: "ash_king" });
    expect(startBattle(hero(), [boss], createRng(2)).enemies[0].boss).toBeDefined();
    expect(startBattle(hero(), [unit("mago")], createRng(2)).enemies[0].boss).toBeUndefined();
  });

  it("El Sin Rostro stance alternates every 2 own turns", () => {
    expect([1, 2, 3, 4, 5].map((n) => stanceFor(n))).toEqual(["ofensiva", "ofensiva", "defensiva", "defensiva", "ofensiva"]);
  });
});
