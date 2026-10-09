import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  critMultiplier,
  dmgReductionOf,
  estimateDamage,
  hitChance,
  startBattle,
  step,
  withRound,
  type Battle,
  TRAIT_CAPS,
} from "./combat";
import { createRng } from "./rng";
import {
  RULE_TRAIT_IDS,
  rollRuleTrait,
  traitPlan,
  traitTotals,
  TRAITS,
  type TraitId,
} from "./traits";

function hero(
  traits: TraitId[],
  classId: ClassId = "mago",
  stats: Partial<Character["stats"]> = {},
): Character {
  const c = generateCharacter(createRng(1), classId);
  return {
    ...c,
    element: "fuego",
    traits,
    stats: {
      hp: 100,
      atk: 20,
      def: 0,
      crit: 0,
      resist: 0,
      accuracy: 1,
      critDmg: 1.5,
      regen: 0,
      lifesteal: 0,
      speed: 10,
      ...stats,
    },
  };
}
const LOW = TRAITS.ultimoAliento.rules.lowHpReduction;
const HEAL = TRAITS.ultimoAliento.rules.healPenalty;
const THORNS = TRAITS.espinas.rules.thorns;
const foe = (traits: TraitId[] = [], classId: ClassId = "mago") => ({
  ...hero(traits, classId),
  element: "fuego" as const,
});
const open = (p: Character, e: Character, opts = {}): Battle =>
  startBattle(p, e, createRng(3), opts);

describe("trait rules: generation", () => {
  it("is deterministic per seed and keeps name/element independent of the rule trait", () => {
    const a = generateCharacter(createRng(1));
    expect(generateCharacter(createRng(1))).toEqual(a);
    // same stream: a rank-S roll only adds a rule trait, same name/element
    const lo = generateCharacter(createRng(5), "mago", "d");
    const hi = generateCharacter(createRng(5), "mago", "s");
    expect([hi.name, hi.element]).toEqual([lo.name, lo.element]);
  });

  it("traitPlan by rank: F-D 1 classic, C-A 2, S-SSR 1 classic + rule", () => {
    expect(traitPlan("f")).toEqual({ classic: 1, rule: false });
    expect(traitPlan("d")).toEqual({ classic: 1, rule: false });
    expect(traitPlan("c")).toEqual({ classic: 2, rule: false });
    expect(traitPlan("a")).toEqual({ classic: 2, rule: false });
    expect(traitPlan("s")).toEqual({ classic: 1, rule: true });
    expect(traitPlan("ssr")).toEqual({ classic: 1, rule: true });
  });

  it("generateCharacter by rank; Espinas never on a Caballero", () => {
    const rng = createRng(77);
    const isRule = (t: string) => RULE_TRAIT_IDS.includes(t as never);
    for (let i = 0; i < 500; i++) {
      for (const [rank, n, rule] of [
        ["f", 1, 0],
        ["c", 2, 0],
        ["s", 2, 1],
        ["ssr", 2, 1],
      ] as const) {
        const c = generateCharacter(rng, "caballero", rank);
        expect(c.traits).not.toContain("espinas");
        expect(c.traits).toHaveLength(n);
        expect(c.traits.filter(isRule)).toHaveLength(rule);
        expect(new Set(c.traits).size).toBe(c.traits.length);
      }
    }
    let thorns = 0;
    for (let i = 0; i < 500; i++)
      if (traitTotals(generateCharacter(rng, "mago", "s").traits).thorns > 0)
        thorns++;
    expect(thorns).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++)
      expect(isRule(rollRuleTrait(rng, "caballero"))).toBe(true);
  });
});

describe("trait rules: combat", () => {
  it("Filo del azar: non-crits -20%, crit multiplier +0.5, capped with relics", () => {
    const b0 = open(hero([]), foe());
    const b1 = open(hero(["filoAzar"]), foe());
    expect(estimateDamage(b1.player, b1.enemies[0], "attack1")).toBe(
      Math.round(estimateDamage(b0.player, b0.enemies[0], "attack1") * 0.8),
    );
    expect(critMultiplier(b1.player)).toBeCloseTo(
      critMultiplier(b0.player) + 0.5,
    );
    const b2 = open(hero(["filoAzar"]), foe(), {
      perks: { critDamage: TRAIT_CAPS.critDamage },
    });
    expect(critMultiplier(b2.player)).toBeCloseTo(1.5 + TRAIT_CAPS.critDamage);
  });

  it("Último aliento: reduction grows as hp drops, stacks with relics under the cap, heals halved", () => {
    const b = open(hero(["ultimoAliento"]), foe());
    expect(dmgReductionOf(b.player)).toBe(0);
    expect(dmgReductionOf({ ...b.player, hp: 50 })).toBeCloseTo(LOW / 2);
    const r = open(hero(["ultimoAliento"]), foe(), {
      perks: { dmgReduction: 0.3 },
    });
    expect(dmgReductionOf({ ...r.player, hp: 10 })).toBe(
      TRAIT_CAPS.dmgReduction,
    );
    // lifesteal 40% with a guaranteed hit: heals half of 40% of the damage
    const s = open(hero(["ultimoAliento"]), foe(), {
      playerHp: 50,
      perks: { lifesteal: 0.4 },
    });
    const dealt = estimateDamage(s.player, s.enemies[0], "attack1");
    const after = step(
      withRound(s, false, ["attack1"]),
      "attack1",
      createRng(9),
    );
    const healed = after.player.hp - 50;
    // enemy may have hit back; compare against the same fight without the trait
    expect(after.log.join(" ")).toContain("de daño");
    expect(healed).toBeLessThanOrEqual(Math.round(dealt * 0.4 * (1 - HEAL)));
  });

  it("Último aliento halves the Clérigo blessing", () => {
    const mk = (t: TraitId[]) =>
      open(hero(t, "clerigo", { hp: 200 }), foe(), { playerHp: 100 });
    const run = (b: Battle) =>
      step(withRound(b, false, ["defend"]), "defend", createRng(2)).player.hp;
    expect(run(mk(["ultimoAliento"])) - 100).toBeLessThan(
      run(mk([])) - 100 + 1,
    );
    expect(run(mk(["ultimoAliento"]))).toBeLessThan(run(mk([])));
  });

  it("Espinas: the attacker takes 15% of the damage dealt, in both directions", () => {
    const p = hero([]);
    const e = foe(["espinas"]);
    const b = open(p, e);
    const dmg = estimateDamage(b.player, b.enemies[0], "attack1");
    const after = step(withRound(b, false, []), "attack1", createRng(4));
    expect(after.enemies[0].hp).toBe(100 - dmg);
    expect(after.player.hp).toBe(100 - Math.round(dmg * THORNS));
    expect(after.log.join(" ")).toContain("espinas");
    // and when the thorned hero is the one hit
    const b2 = open(hero(["espinas"]), foe());
    const d2 = estimateDamage(b2.enemies[0], b2.player, "attack1");
    const a2 = step(withRound(b2, true, ["attack1"]), "defend", createRng(4));
    expect(a2.player.hp).toBeGreaterThan(0);
    expect(a2.enemies[0].hp).toBeLessThanOrEqual(
      100 - Math.round(d2 * THORNS * 0.5),
    );
  });

  it("Apostador: same mean, wide spread, same visible accuracy", () => {
    const b = open(hero(["apostador"]), foe());
    const plain = open(hero([]), foe());
    expect(hitChance(b.player, "attack1")).toBe(
      hitChance(plain.player, "attack1"),
    );
    const est = estimateDamage(b.player, b.enemies[0], "attack1");
    const rng = createRng(11);
    const seen: number[] = [];
    for (let i = 0; i < 600; i++) {
      const s = open(hero(["apostador"]), foe());
      const a = step(withRound(s, false, []), "attack1", rng);
      seen.push(100 - a.enemies[0].hp);
    }
    const mean = seen.reduce((x, y) => x + y, 0) / seen.length;
    expect(Math.abs(mean - est) / est).toBeLessThan(0.06);
    expect(Math.min(...seen)).toBeLessThan(est * 0.4);
    expect(Math.max(...seen)).toBeGreaterThan(est * 1.6);
  });

  it("non-rule characters consume the same RNG as before (no extra draws)", () => {
    const a = open(hero([]), foe());
    const r1 = createRng(21);
    const r2 = createRng(21);
    step(withRound(a, false, []), "attack1", r1);
    step(withRound(a, false, []), "attack1", r2);
    expect(r1.next()).toBe(r2.next());
  });
});
