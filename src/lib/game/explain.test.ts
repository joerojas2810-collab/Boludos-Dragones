import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  estimateDamage,
  startBattle,
  withRound,
  type Combatant,
} from "./combat";
import type { Element } from "./elements";
import {
  attackDisabledReason,
  attackTip,
  doorTip,
  elementTip,
  fightReward,
  fleeTip,
  intentTip,
  modTip,
  passiveTip,
  relicTip,
  statTip,
  traitTip,
  type Tip,
} from "./explain";
import { createRng } from "./rng";
import {
  applyBattleResult,
  chooseDoor,
  doorsFor,
  createRun,
  fleeCost,
  type FightNode,
} from "./run";
import { RELICS } from "./relics";
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
      flee: 0,
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
  it("Bendición states 1.5% and the right PV for this character", () => {
    const t = text(passiveTip(comb(hero("clerigo", "agua"))));
    expect(t).toContain("1.5%");
    expect(t).toContain("≈2 PV con 106 de vida");
    expect(t).toContain("No cura si caes ni si la pelea terminó");
  });

  it("Muralla states 10% and 20 -> 18", () => {
    const t = text(passiveTip(comb(hero("caballero", "agua"))));
    expect(t).toContain("10%");
    expect(t).toContain("un golpe de 20 pasa a 18");
  });

  it("Foco arcano states +40% instead of +25%", () => {
    const t = text(passiveTip(comb(hero("mago", "agua"))));
    expect(t).toContain("+40% en vez de +25%");
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

  it("DEF says DEF x 0.5", () => {
    expect(text(statTip("def", me, { foe }))).toContain("DEF × 0.5 = 4");
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

  it("flee and intents use real numbers", () => {
    const p = hero("caballero", "agua", { dodge: 0.05 });
    const b = withRound(
      startBattle(p, hero("mago", "fuego"), createRng(2)),
      false,
      ["attack1", "defend"],
    );
    expect(text(fleeTip(b, 7))).toContain("45%");
    expect(text(fleeTip(b, 7))).toContain("7 monedas");
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

describe("explain: run", () => {
  it("relic tip includes description, rarity and synergy", () => {
    const t = text(relicTip("lente", ["lente"], hero("picaro", "agua")));
    expect(t).toContain(RELICS.lente.description);
    expect(t).toContain("Cazador implacable");
  });

  it("fight reward equals what applyBattleResult pays", () => {
    const run = createRun(7, hero("caballero", "agua"));
    const i = doorsFor(run.seed, run.floor).findIndex(
      (d) => d.kind === "easy" || d.kind === "hard",
    );
    const opened = chooseDoor(run, i);
    if (!opened || opened.node.type !== "fight") throw new Error("no fight");
    const node: FightNode = opened.node;
    const b = startBattle(run.hero, node.enemies, createRng(1));
    const won = applyBattleResult(
      opened.run,
      { ...b, status: "won", player: { ...b.player, hp: run.hp } },
      node,
    );
    expect(won.coins - run.coins).toBe(fightReward(node.kind, run).coins);
    expect(text(doorTip(node.kind, run))).toContain(
      `${fightReward(node.kind, run).coins} monedas`,
    );
    const rich = { ...run, coins: 50 };
    expect(text(doorTip(node.kind, rich))).toContain(
      `pagas ${fleeCost(rich)} monedas`,
    );
  });
});
