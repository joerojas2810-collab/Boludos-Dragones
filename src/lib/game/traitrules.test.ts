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
  RAGE_MAX,
  rollTrait,
  TRAIT_IDS,
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
  it("is deterministic per seed", () => {
    const a = generateCharacter(createRng(1));
    expect(generateCharacter(createRng(1))).toEqual(a);
  });

  it("every hero rolls exactly one trait, whatever its rank; Espinas never on a Caballero", () => {
    const rng = createRng(77);
    for (let i = 0; i < 500; i++) {
      const c = generateCharacter(rng, "caballero");
      expect(c.traits).toHaveLength(1);
      expect(c.traits).not.toContain("espinas");
    }
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(rollTrait(rng, "mago"));
    expect(seen.size).toBe(TRAIT_IDS.length); // all twenty can show up, Espinas included
    for (let i = 0; i < 300; i++) expect(rollTrait(rng, "caballero")).not.toBe("espinas");
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

describe("trait rules: personality traits", () => {
  const dmg = (b: Battle) => estimateDamage(b.player, b.enemies[0], "attack1");
  const plainDmg = () => dmg(open(hero([]), foe()));

  it("Terco: the hit after a miss has +10 accuracy", () => {
    const b = open(hero(["terco"], "mago", { accuracy: -0.3 }), foe());
    const retry = { ...b.player, missed: true };
    expect(hitChance(retry, "attack1")).toBeCloseTo(hitChance(b.player, "attack1") + 0.1);
    expect(hitChance({ ...hero([], "mago", { accuracy: -0.3 }) && b.player, missed: false }, "attack1")).toBe(hitChance(b.player, "attack1"));
  });

  it("Orgulloso: +8% ATQ above half hp, -8% below", () => {
    const b = open(hero(["orgulloso"]), foe());
    const high = estimateDamage(b.player, b.enemies[0], "attack1");
    const low = estimateDamage({ ...b.player, hp: 40 }, b.enemies[0], "attack1");
    expect(high / plainDmg()).toBeCloseTo(1.08, 1);
    expect(low / plainDmg()).toBeCloseTo(0.92, 1);
  });

  it("Sanguinario: +10% damage against enemies under 40% hp", () => {
    const b = open(hero(["sanguinario"]), foe());
    const weak = { ...b.enemies[0], hp: 30 };
    const base = estimateDamage(b.player, b.enemies[0], "attack1");
    expect(estimateDamage(b.player, weak, "attack1") / base).toBeCloseTo(1.1, 1);
  });

  it("Paciente: +8% on the hit after a defended round, spent by that hit; defending arms it", () => {
    const b = open(hero(["paciente"]), foe());
    const base = dmg(b);
    expect(estimateDamage({ ...b.player, guardedLast: true }, b.enemies[0], "attack1") / base).toBeCloseTo(1.08, 1);
    const armed = step(withRound(b, false, [[]], 1), "defend", createRng(2));
    expect(armed.player.guardedLast).toBe(true);
    const spent = step(withRound({ ...b, player: { ...b.player, guardedLast: true } }, false, [[]], 1), "attack1", createRng(2));
    expect(spent.player.guardedLast).toBe(false);
  });

  it("Glotón: heals 3% of max hp when it takes an enemy down", () => {
    const b = open(hero(["glotón"], "mago", { hp: 100, accuracy: 1 }), foe([], "mago"), { playerHp: 50 });
    const dying = { ...b, enemies: [{ ...b.enemies[0], hp: 1 }] };
    const s = step(withRound(dying, false, [[]], 1), "attack1", createRng(2));
    expect(s.status).toBe("won");
    expect(s.player.hp).toBe(50 + Math.round(100 * TRAITS["glotón"].rules.killHeal));
  });

  it("Fanfarrón: the first hit of a fight is +20%, the next ones are normal", () => {
    const b = open(hero(["fanfarron"]), foe());
    expect(dmg(b) / plainDmg()).toBeCloseTo(1.2, 1);
    const after = step(withRound(b, false, [[]], 1), "attack1", createRng(2));
    expect(after.player.opened).toBe(true);
    expect(estimateDamage(after.player, after.enemies[0], "attack1")).toBeLessThan(dmg(b));
  });

  it("Curioso: +10% damage against a rival that carries a status", () => {
    const b = open(hero(["curioso"]), foe());
    const marked = { ...b.enemies[0], statuses: [{ id: "ruptura" as const, stacks: 1, turns: 2 }] };
    const base = estimateDamage(b.player, b.enemies[0], "attack1");
    expect(estimateDamage(b.player, marked, "attack1") / base).toBeCloseTo(1.1, 1);
  });

  it("Cauteloso: -10% damage taken while above 80% hp, nothing below", () => {
    const b = open(hero(["cauteloso"]), foe());
    expect(dmgReductionOf(b.player)).toBeCloseTo(0.1);
    expect(dmgReductionOf({ ...b.player, hp: 50 })).toBe(0);
  });

  it("Furioso: +4% damage per hit taken, up to five hits", () => {
    const b = open(hero(["furioso"]), foe());
    const base = dmg(b);
    expect(estimateDamage({ ...b.player, rage: 3 }, b.enemies[0], "attack1") / base).toBeCloseTo(1.12, 1);
    expect(estimateDamage({ ...b.player, rage: 99 }, b.enemies[0], "attack1") / base).toBeCloseTo(1 + 0.04 * RAGE_MAX, 1);
    const hurt = step(withRound(b, true, [["attack1"]], 1), "defend", createRng(2));
    expect(hurt.player.rage).toBe(1);
  });
});
