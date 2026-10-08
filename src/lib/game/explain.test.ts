import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  defReduction,
  estimateDamage,
  startBattle,
  withRound,
  type Combatant,
} from "./combat";
import type { Element } from "./elements";
import {
  attackDisabledReason,
  attackTip,
  elementTip,
  intentTip,
  modTip,
  passiveTip,
  statTip,
  traitTip,
  type Tip,
} from "./explain";
import { createRng } from "./rng";
import { TRAIT_IDS } from "./traits";

const text = (t: Tip) => [t.title, ...t.lines, t.source ?? ""].join("\n");

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
      hp: 106,
      atk: 20,
      def: 8,
      crit: 0.29,
      dodge: 0.05,
      accuracy: 0,
      critDmg: c.stats.critDmg,
      regen: 0,
      lifesteal: 0,
      speed: 12,
      ...over,
    },
  };
}
const comb = (char: Character): Combatant => ({
  char,
  hp: char.stats.hp,
  cooldown: 0,
  defending: false,
});

describe("explain: class passives", () => {
  it("Bendición states 0.5% and the right PV for this character", () => {
    const t = text(passiveTip(comb(hero("clerigo", "agua"))));
    expect(t).toContain("0.5%");
    expect(t).toContain("≈1 PV con 106 de vida");
    expect(t).toContain("No cura si caes ni si la pelea terminó");
  });

  it("Muralla states 18% and 20 -> 16", () => {
    const t = text(passiveTip(comb(hero("caballero", "agua"))));
    expect(t).toContain("18%");
    expect(t).toContain("un golpe de 20 pasa a 16");
  });

  it("Foco arcano states +55% instead of +25%", () => {
    const t = text(passiveTip(comb(hero("mago", "agua"))));
    expect(t).toContain("+55% en vez de +25%");
  });

  it("Filo mortal states x2.0 / x1.5 and the crit chance", () => {
    const t = text(passiveTip(comb(hero("picaro", "agua", { crit: 0.29 }))));
    expect(t).toContain("x2.0");
    expect(t).toContain("x1.5");
    expect(t).toContain("29%");
  });
});

describe("explain: stats", () => {
  const me = comb(hero("picaro", "agua", { speed: 12 }));
  const foe = comb(hero("mago", "fuego", { speed: 6 }));

  it("VEL 12 against 6 acts 2 times per round", () => {
    const t = text(statTip("speed", me, { foe }));
    expect(t).toContain("VEL 12 contra 6");
    expect(t).toContain("actúas 2 veces por ronda");
  });

  it("VEL slower side says the rival acts more", () => {
    const t = text(statTip("speed", foe, { foe: me }));
    expect(t).toContain("actúas 1 vez por ronda; el rival, 2 veces");
  });

  it("ATQ example matches estimateDamage", () => {
    const t = text(statTip("atk", me, { foe }));
    expect(t).toContain(`~${estimateDamage(me, foe, "attack1")} por golpe`);
  });

  it("DEF is a percentage reduction vs the attacker", () => {
    const pctOf = `${+(defReduction(foe, me) * 100).toFixed(1)}%`;
    expect(text(statTip("def", me, { foe }))).toContain(`${pctOf} menos daño`);
  });

  it("CRIT gives chance and multiplier", () => {
    const t = text(statTip("crit", me));
    expect(t).toContain("29%");
    expect(t).toContain("x2.0");
  });
});

describe("explain: elements, traits, actions", () => {
  it("element tip lists +25% / -25% matchups", () => {
    const t = text(elementTip("agua"));
    expect(t).toContain("Fuerte contra Fuego y Viento");
    expect(t).toContain("25%");
  });

  it("every trait has a tip with its numbers", () => {
    for (const id of TRAIT_IDS)
      expect(traitTip(id).lines.length).toBeGreaterThan(0);
    expect(text(traitTip("terco"))).toContain("+25% DEF");
    expect(text(traitTip("terco"))).toContain("−3 puntos de esquive");
    expect(text(traitTip("sediento"))).toContain("10%");
  });

  it("attack 2 on cooldown explains why", () => {
    const c = { ...comb(hero("mago", "agua")), cooldown: 2 };
    expect(attackDisabledReason(c, "attack2")).toBe("Recarga: 2 rondas");
    expect(attackDisabledReason(c, "attack1")).toBeNull();
    expect(
      text(attackTip(c, "attack2", comb(hero("mago", "fuego")))),
    ).toContain("No disponible");
  });

  it("intents use real numbers", () => {
    const p = hero("caballero", "agua", { dodge: 0.05 });
    const b = withRound(
      startBattle(p, hero("mago", "fuego"), createRng(2)),
      false,
      ["attack1", "defend"],
    );
    expect(text(intentTip("defend", b))).toContain("mitad");
    expect(text(intentTip("attack1", b))).toContain(
      `~${estimateDamage(b.enemies[0], b.player, "attack1")}`,
    );
  });

  it("enemy modifiers quote the constants", () => {
    expect(text(modTip("regeneracion"))).toContain("3%");
    expect(text(modTip("escudo"))).toContain("30%");
    expect(text(modTip("dobleAtaque"))).toContain("50%");
    expect(text(modTip("elementoCambiante"))).toContain("2 rondas");
  });
});

describe("explain: Run v2 rules", () => {
  it("level, pity and gear tips quote the real constants", async () => {
    const m = await import("./explain");
    expect(text(m.levelTip(3, 0, 0))).toContain("20");
    expect(text(m.pityTip())).toContain("250");
    expect(text(m.gearTip())).toContain("10%");
    expect(text(m.burnTip())).toContain("4%");
  });
});
