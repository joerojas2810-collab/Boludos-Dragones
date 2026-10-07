import { describe, expect, it } from "vitest";
import {
  CLASS_PASSIVE_REGEN,
  generateCharacter,
  type Character,
  type ClassId,
} from "./characters";
import {
  critMultiplier,
  estimateDamage,
  startBattle,
  withRound,
  step,
  type Combatant,
} from "./combat";
import type { Element } from "./elements";
import { createRng } from "./rng";

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
      atk: 20,
      def: 0,
      crit: 0,
      dodge: 0,
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
});

describe("class passives", () => {
  it("Muralla: caballero takes 10% less", () => {
    const att = comb(hero("picaro", "agua"));
    const plain = estimateDamage(att, comb(hero("mago", "agua")), "attack1");
    const wall = estimateDamage(
      att,
      comb(hero("caballero", "agua")),
      "attack1",
    );
    expect(plain).toBe(20);
    expect(wall).toBe(18);
  });

  it("Muralla composes multiplicatively with relic reduction", () => {
    const att = comb(hero("picaro", "agua"));
    const def = {
      ...comb(hero("caballero", "agua")),
      perks: { dmgReduction: 0.5 },
    };
    expect(estimateDamage(att, def, "attack1")).toBe(9); // 20*.5*.9
  });

  it("Foco arcano: mago advantage is +40%, disadvantage and neutral unchanged", () => {
    const def = (e: Element) => comb(hero("picaro", e));
    const mago = comb(hero("mago", "agua", { atk: 20 }));
    const rogue = comb(hero("picaro", "agua", { atk: 20 }));
    // agua beats fuego
    expect(estimateDamage(mago, def("fuego"), "attack1")).toBe(25); // 20*.9*1.4
    expect(estimateDamage(rogue, def("fuego"), "attack1")).toBe(25); // 20*1.25
    expect(estimateDamage(mago, def("agua"), "attack1")).toBe(18);
    expect(estimateDamage(mago, def("rayo"), "attack1")).toBe(14); // 18*.75 -> 13.5
  });

  it("Foco arcano uses the weapon element when equipped", () => {
    const m = hero("mago", "rayo");
    const armed = comb({ ...m, weapon: { element: "agua", atkBonus: 0 } });
    expect(
      estimateDamage(armed, comb(hero("picaro", "fuego")), "attack1"),
    ).toBe(25);
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
    const p = hero("picaro", "agua", { crit: 1, atk: 20, speed: 99 });
    const e = hero("mago", "agua", { hp: 1000, speed: 1 });
    let b = startBattle(p, e, createRng(3));
    b = withRound(b, false, ["defend"]);
    // defending enemy halves: 20 * .5 = 10, crit x2 = 20
    const after = step(b, "attack1", createRng(3));
    expect(after.log.some((l) => l.includes("20 de daño (¡crítico!)"))).toBe(
      true,
    );
  });

  it("Bendición: heals 1.5% per turn (rounded) and logs it", () => {
    const c = hero("clerigo", "agua", { hp: 200, speed: 99 });
    const e = hero("caballero", "agua", { hp: 1000, speed: 1 });
    let b = startBattle(c, e, createRng(5));
    b = withRound({ ...b, player: comb(c, 100) }, false, ["defend"]);
    b = step(b, "defend", createRng(5));
    expect(b.player.hp).toBe(100 + Math.round(200 * CLASS_PASSIVE_REGEN));
    expect(b.log.some((l) => l.includes("se recupera 3"))).toBe(true);
  });

  it("Bendición never exceeds max hp", () => {
    const c = hero("clerigo", "agua", { hp: 200, speed: 99 });
    const e = hero("caballero", "agua", { hp: 1000, speed: 1 });
    let b = startBattle(c, e, createRng(5));
    b = withRound({ ...b, player: comb(c, 199) }, false, ["defend"]);
    b = step(b, "defend", createRng(5));
    expect(b.player.hp).toBe(200);
    b = step(withRound(b, false, ["defend"]), "defend", createRng(5));
    expect(b.player.hp).toBe(200);
    expect(b.log.filter((l) => l.includes("se recupera")).length).toBe(1);
  });

  it("Bendición does not trigger when the clérigo dies or the fight ends", () => {
    const c = hero("clerigo", "agua", { hp: 200, def: 0, speed: 1 });
    const killer = hero("mago", "agua", { atk: 9999, speed: 99, hp: 1000 });
    const dying = comb(c, 1);
    let b = startBattle(c, killer, createRng(9));
    b = withRound({ ...b, player: dying }, true, ["attack1"]);
    // force the hit to land
    const rng = { ...createRng(9), chance: () => true };
    b = step(b, "defend", rng);
    expect(b.status).toBe("lost");
    expect(b.player.hp).toBe(0);
    expect(b.log.some((l) => l.includes("se recupera"))).toBe(false);
  });

  it("no passive-relevant situation: other classes are unchanged", () => {
    const a = comb(hero("picaro", "agua", { atk: 20 }));
    const d = comb(hero("clerigo", "agua"));
    expect(estimateDamage(a, d, "attack1")).toBe(20);
    expect(critMultiplier(d)).toBe(1.5);
  });
});
