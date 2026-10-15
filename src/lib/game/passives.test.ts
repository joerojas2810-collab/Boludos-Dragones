import { describe, expect, it } from "vitest";
import {
  CLASS_PASSIVE_DMG_REDUCTION,
  CLASS_PASSIVE_FURY,
  CLASS_PASSIVE_REGEN,
  CLASSES,
  generateCharacter,
  type Character,
  type ClassId,
} from "./characters";
import {
  DAMAGE_SCALE,
  critMultiplier,
  estimateDamage,
  furyBonus,
  step,
  type Combatant,
} from "./combat";
import type { Element } from "./elements";
import { createRng } from "./rng";
import { fight, mapEnemy, mapPlayer, noCrit, unit, withIntents, withProgress } from "./testkit";

// Test heroes hit for 20 after the global DAMAGE_SCALE, so the numbers in the comments stay readable.
const ATK = 20 / DAMAGE_SCALE;

function hero(
  classId: ClassId,
  element: Element,
  over: Partial<Character["stats"]> = {},
): Character {
  const c = generateCharacter(createRng(1), classId);
  return {
    ...c,
    element,
    traits: [],
    stats: {
      hp: 100,
      atk: ATK,
      def: 0,
      crit: 0,
      resist: 0,
      accuracy: 0,
      critDmg: c.stats.critDmg,
      regen: 0,
      lifesteal: 0,
      speed: 10,
      ...over,
    },
  };
}
const comb = (char: Character, hp = char.stats.hp): Combatant => ({
  char,
  hp,
  cooldown: 0,
  defending: false,
  progress: 0,
  ownTurns: 0,
});

describe("class passives", () => {
  it("Muralla: caballero takes its reduction less (mago 5%)", () => {
    const att = comb(hero("picaro", "agua"));
    const plain = estimateDamage(att, comb(hero("mago", "agua")), "attack1");
    const wall = estimateDamage(
      att,
      comb(hero("caballero", "agua")),
      "attack1",
    );
    expect(plain).toBe(19); // 20*.95
    expect(wall).toBe(Math.round(20 * (1 - CLASS_PASSIVE_DMG_REDUCTION))); // 20*.85
  });

  it("Muralla composes multiplicatively with relic reduction", () => {
    const att = comb(hero("picaro", "agua"));
    const def = {
      ...comb(hero("caballero", "agua")),
      perks: { dmgReduction: 0.5 },
    };
    expect(estimateDamage(att, def, "attack1")).toBe(Math.round(20 * 0.5 * (1 - CLASS_PASSIVE_DMG_REDUCTION)));
  });

  it("Foco arcano: mago advantage is +55%, disadvantage and neutral unchanged", () => {
    const def = (e: Element) => comb(hero("picaro", e));
    const mago = comb(hero("mago", "agua", { atk: ATK }));
    const rogue = comb(hero("picaro", "agua", { atk: ATK }));
    // agua beats fuego
    expect(estimateDamage(mago, def("fuego"), "attack1")).toBe(31); // 20*1*1.55
    expect(estimateDamage(rogue, def("fuego"), "attack1")).toBe(25); // 20*1.25
    expect(estimateDamage(mago, def("agua"), "attack1")).toBe(20);
    expect(estimateDamage(mago, def("rayo"), "attack1")).toBe(15); // 20*.75
  });

  it("Foco arcano uses the hero element even when weapon element differs", () => {
    const m = hero("mago", "rayo");
    const armed = comb({ ...m, weapon: { element: "agua", atkBonus: 0 } });
    expect(
      estimateDamage(armed, comb(hero("picaro", "fuego")), "attack1"),
    ).toBe(20); // Engine v14: neutral Rayo matchup; the Agua weapon no longer grants advantage.
  });

  it("Filo mortal: picaro crits x2.0, others x1.5, relic adds on top", () => {
    expect(critMultiplier(comb(hero("picaro", "agua")))).toBe(2);
    expect(critMultiplier(comb(hero("mago", "agua")))).toBe(1.5);
    const withRelic = {
      ...comb(hero("picaro", "agua")),
      perks: { critDamage: 0.5 },
    };
    expect(critMultiplier(withRelic)).toBe(2.5);
  });

  it("Filo mortal: a guaranteed crit deals x2.0 in battle", () => {
    const p = unit("picaro", { crit: 1, atk: ATK, speed: 10, hp: 1e6, critDmg: CLASSES.picaro.stats.critDmg });
    let b = fight(p, unit("clerigo", { hp: 1e6, atk: 1 }));
    b = mapEnemy(b, 0, () => ({ defending: true })); // halves: 20 * .5 = 10, crit x2 = 20
    const after = step(b, "attack1", createRng(3));
    expect(after.log.some((l) => l.includes("20 de daño (¡crítico!)"))).toBe(true);
  });

  // Bendición: +0.5 % / turn is a class passive at the close of the Cleric's own turn
  const cleric = (hpNow: number) =>
    withIntents(mapPlayer(fight(hero("clerigo", "agua", { hp: 200 }), hero("caballero", "agua", { hp: 1000, atk: 1 })), { hp: hpNow }), ["defend"]);

  it("Bendición: heals its share of max hp when the Cleric's own turn closes, and logs it", () => {
    const b = step(cleric(100), "defend", createRng(5));
    const heal = Math.round(200 * CLASS_PASSIVE_REGEN);
    expect(b.player.hp).toBe(100 + heal);
    expect(b.log.some((l) => l.includes(`se recupera ${heal}`))).toBe(true);
  });

  it("Bendición never exceeds max hp", () => {
    let b = step(cleric(199), "defend", createRng(5));
    expect(b.player.hp).toBe(200);
    b = step(withIntents(b, ["defend"]), "defend", createRng(5));
    expect(b.player.hp).toBe(200);
    expect(b.log.filter((l) => l.includes("se recupera")).length).toBe(1);
  });

  it("Bendición never revives: a burn that kills the Cleric at its next turn start leaves it at 0", () => {
    let b = withIntents(fight(hero("clerigo", "agua", { hp: 200 }), hero("caballero", "agua", { hp: 1000, atk: 1 })), ["defend"]);
    b = mapPlayer(b, { hp: 5, statuses: [{ id: "quemadura", stacks: 1, turns: 3, amount: 50 }] });
    const s = step(withProgress(b, { 1: 0 }), "defend", createRng(5));
    expect(s.status).toBe("lost");
    expect(s.player.hp).toBe(0);
    // it healed once while alive (end of the turn it just played) and never after dying
    expect(s.log.filter((l) => l.includes("se recupera"))).toHaveLength(1);
    expect(s.cev.at(-1)?.type).toBe("combatEnded");
  });

  it("Bendición acts at its own close, before the enemy answers", () => {
    const b = withIntents(
      withProgress(mapPlayer(fight(hero("clerigo", "agua", { hp: 200 }), hero("mago", "agua", { hp: 1000, atk: 9999 })), { hp: 1 }), { 0: 0, 1: 10_000 }),
      ["attack1"],
    );
    const s = step(b, "attack1", noCrit());
    expect(s.status).toBe("lost");
    expect(s.player.hp).toBe(0);
    expect(s.log.filter((l) => l.includes("se recupera"))).toHaveLength(1); // once, while still alive
  });

  it("Furia: Berserker damage grows at 66 % and 33 % hp, highest threshold wins", () => {
    const b = comb(hero("berserker", "agua"));
    const at = (frac: number) => furyBonus({ ...b, hp: Math.round(100 * frac) });
    expect(at(1)).toBe(0);
    expect(at(0.5)).toBe(CLASS_PASSIVE_FURY.find((t) => t.below === 0.66)!.bonus);
    expect(at(0.2)).toBe(CLASS_PASSIVE_FURY.find((t) => t.below === 0.33)!.bonus);
    expect(furyBonus(comb(hero("caballero", "agua"), 10))).toBe(0);
    const target = comb(hero("picaro", "agua"));
    expect(estimateDamage({ ...b, hp: 20 }, target, "attack1")).toBeGreaterThan(estimateDamage(b, target, "attack1"));
  });

  it("no passive-relevant situation: other classes are unchanged", () => {
    const a = comb(hero("picaro", "agua", { atk: ATK }));
    const d = comb(hero("clerigo", "agua"));
    expect(estimateDamage(a, d, "attack1")).toBe(20);
    expect(critMultiplier(d)).toBe(1.5);
  });
});
