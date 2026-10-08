import { describe, expect, it } from "vitest";
import { autoBlockReason, autoPolicy, autoResolve } from "./auto";
import {
  CLASS_PASSIVE_DMG_REDUCTION,
  CLASS_PASSIVE_REGEN,
  generateCharacter,
  type Character,
  type ClassId,
} from "./characters";
import {
  DEFEND_FACTOR,
  ENRAGE_AFTER_TURN,
  estimateDamage,
  GUARD_COUNTER_BONUS,
  livingEnemies,
  MAX_ACTIONS_PER_ROUND,
  pendingIntents,
  PERFECT_GUARD_FACTOR,
  startBattle,
  step,
  withRound,
  type Battle,
  type Intent,
} from "./combat";
import { createRng, type Rng } from "./rng";
import {
  COUNTER_TAKEN,
  EXECUTE_MULT,
  SKILLS,
  SWEEP_POWER,
  type SkillId,
} from "./skills";

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
      dodge: 0,
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
// Hits whenever the chance is decent, never crits (all test units have 0 crit).
const always: Rng = { ...createRng(1), chance: (p) => p >= 0.5 };
const never: Rng = { ...createRng(1), chance: () => false };

// Hero opens (no enemy slot before him); `intents` per enemy.
const fight = (
  hero: Character,
  foes: Character[],
  intents: Intent[][],
  playerActions = 1,
  lead = 0,
): Battle =>
  withRound(
    startBattle(hero, foes, createRng(4)),
    lead,
    intents,
    playerActions,
  );

describe("perfect guard", () => {
  const hero = unit("mago", { hp: 1000, speed: 10 });
  const foe = unit("picaro", { atk: 30, speed: 10 });

  it("cuts the announced strong hit to PERFECT_GUARD_FACTOR, replacing the normal defend factor", () => {
    const b = fight(hero, [foe], [["attack2"]], 1, 1);
    const plain = estimateDamage(b.enemies[0], b.player, "attack2");
    const normal = estimateDamage(
      b.enemies[0],
      { ...b.player, defending: true },
      "attack2",
    );
    const perfect = estimateDamage(
      b.enemies[0],
      { ...b.player, defending: true, guard: true },
      "attack2",
    );
    expect(normal).toBe(Math.round(plain * DEFEND_FACTOR));
    expect(perfect).toBe(Math.round(plain * PERFECT_GUARD_FACTOR));
    // not stacked on top of the normal defend (that would be x0.125)
    expect(perfect).toBeGreaterThan(
      plain * DEFEND_FACTOR * PERFECT_GUARD_FACTOR * 1.5,
    );
  });

  it("composes with Muralla and relic reductions by multiplying once", () => {
    const wall = unit("caballero", { hp: 1000 });
    const b = fight(wall, [foe], [["attack2"]], 1, 1);
    const me = {
      ...b.player,
      defending: true,
      guard: true,
      perks: { dmgReduction: 0.2 },
    };
    const raw = estimateDamage(
      b.enemies[0],
      { ...b.player, defending: false },
      "attack2",
    );
    const expected =
      (foe.stats.atk * 2.1 * 1 - 0) * // picaro attack2 power
      PERFECT_GUARD_FACTOR *
      0.8 *
      (1 - CLASS_PASSIVE_DMG_REDUCTION);
    expect(raw).toBeGreaterThan(0);
    expect(estimateDamage(b.enemies[0], me, "attack2")).toBe(
      Math.max(1, Math.round(expected)),
    );
  });

  it("choosing Defender with a strong hit pending logs it and arms the counter bonus", () => {
    const b = fight(hero, [foe], [["attack2"]], 1, 1);
    const s = step(b, "defend", always);
    expect(s.log.some((l) => l.includes("¡Guardia perfecta!"))).toBe(true);
    expect(s.player.riposte).toBe(true);
    // the strong hit landed at -75%
    const dealt = hero.stats.hp - s.player.hp;
    expect(dealt).toBe(
      estimateDamage(
        b.enemies[0],
        { ...b.player, defending: true, guard: true },
        "attack2",
      ),
    );
    // the guard itself ends with the round
    expect(s.player.guard).toBe(false);
  });

  it("the next attack deals +GUARD_COUNTER_BONUS once, then it is spent", () => {
    const base = fight(hero, [unit("caballero", { atk: 1 })], [["defend"]]);
    const plain = step(base, "attack1", always);
    const armed = step(
      { ...base, player: { ...base.player, riposte: true } },
      "attack1",
      always,
    );
    const d0 = base.enemies[0].hp - plain.enemies[0].hp;
    const d1 = base.enemies[0].hp - armed.enemies[0].hp;
    expect(d1).toBe(
      Math.round(
        estimateDamage(
          { ...base.player, riposte: true },
          base.enemies[0],
          "attack1",
        ),
      ),
    );
    expect(d1).toBeGreaterThan(d0 * (1 + GUARD_COUNTER_BONUS) - 2);
    expect(armed.player.riposte).toBe(false);
  });

  it("a normal attack announcement stays a normal defend (no guard, no bonus)", () => {
    const b = fight(hero, [foe], [["attack1"]], 1, 1);
    const s = step(b, "defend", always);
    expect(s.log.some((l) => l.includes("Guardia perfecta"))).toBe(false);
    expect(s.player.riposte).toBeFalsy();
    expect(hero.stats.hp - s.player.hp).toBe(
      estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1"),
    );
  });

  it("only weaker hits in the same round stay at the normal defend factor", () => {
    const b = fight(
      hero,
      [foe, unit("picaro", { atk: 30 })],
      [["attack2"], ["attack1"]],
      1,
      2,
    );
    const s = step(b, "defend", always);
    const weak = estimateDamage(
      b.enemies[1],
      { ...b.player, defending: true },
      "attack1",
    );
    const strong = estimateDamage(
      b.enemies[0],
      { ...b.player, defending: true, guard: true },
      "attack2",
    );
    expect(hero.stats.hp - s.player.hp).toBe(strong + weak);
  });

  it("a strong hit from a dead enemy does not count", () => {
    const b = fight(
      hero,
      [foe, unit("caballero")],
      [["attack2"], ["attack1"]],
      1,
      2,
    );
    const dead = {
      ...b,
      enemies: [{ ...b.enemies[0], hp: 0 }, b.enemies[1]],
    };
    const s = step(dead, "defend", always);
    expect(s.player.riposte).toBeFalsy();
  });
});

describe("class skills (Ataque 3)", () => {
  const withSkill = (classId: ClassId, skill: SkillId, stats = {}) =>
    unit(classId, stats, { skill, level: 5 });
  const three = () => [
    unit("caballero", { hp: 500, atk: 1 }),
    unit("mago", { hp: 500, atk: 1 }),
    unit("picaro", { hp: 500, atk: 1 }),
  ];

  it("is illegal without a learned skill, and during its cooldown", () => {
    const b = fight(unit("caballero"), three(), [
      ["defend"],
      ["defend"],
      ["defend"],
    ]);
    expect(step(b, "attack3", never)).toBe(b);
    const sk = fight(withSkill("caballero", "barrido"), three(), [[], [], []]);
    const used = step(sk, "attack3", always);
    expect(used.player.cooldown3).toBe(SKILLS.barrido.cooldown); // ticked once at round end
    const again = withRound(used, 0, [[], [], []], 1);
    expect(step(again, "attack3", always)).toBe(again);
  });

  it("Barrido hits every living enemy once at SWEEP_POWER", () => {
    const b = fight(withSkill("caballero", "barrido"), three(), [[], [], []]);
    const s = step(b, "attack3", always);
    expect(s.events.filter((e) => e.actor === "player")).toHaveLength(3);
    s.enemies.forEach((e, i) =>
      expect(b.enemies[i].hp - e.hp).toBe(
        estimateDamage(b.player, b.enemies[i], "attack3"),
      ),
    );
    expect(SKILLS.barrido.power).toBe(SWEEP_POWER);
    // dead enemies are skipped
    const half = {
      ...b,
      enemies: [{ ...b.enemies[0], hp: 0 }, b.enemies[1], b.enemies[2]],
    };
    expect(step(half, "attack3", always).events).toHaveLength(2);
  });

  it("Tormenta is an area attack with a long cooldown", () => {
    const b = fight(withSkill("mago", "tormenta"), three(), [[], [], []]);
    const s = step(b, "attack3", always);
    expect(s.events.filter((e) => e.actor === "player")).toHaveLength(3);
    expect(SKILLS.tormenta.cooldown).toBeGreaterThan(SKILLS.barrido.cooldown);
  });

  it("Contraataque reduces the next hit and sends it back once", () => {
    const foe = unit("picaro", { atk: 40 });
    const b = fight(
      withSkill("caballero", "contraataque"),
      [foe],
      [["attack1"]],
      1,
      0,
    );
    const s = step(b, "attack3", always);
    const taken = b.player.char.stats.hp - s.player.hp;
    const plainHit = estimateDamage(
      b.enemies[0],
      { ...b.player, reflect: 0 },
      "attack1",
    );
    expect(taken).toBe(Math.round(plainHit * COUNTER_TAKEN));
    expect(b.enemies[0].hp - s.enemies[0].hp).toBe(
      Math.round(taken / COUNTER_TAKEN),
    );
    expect(s.player.reflect).toBeLessThanOrEqual(1); // spent hit, ticking down
    expect(s.log.some((l) => l.includes("contraataca"))).toBe(true);
    // it only works once
    const s2 = step(withRound(s, 1, [["attack1"]], 1), "defend", always);
    expect(s2.log.filter((l) => l.includes("contraataca"))).toHaveLength(1);
  });

  it("Drenar maná heals the hero for a share of the damage dealt", () => {
    const b0 = fight(withSkill("mago", "drenarMana", { hp: 100 }), three(), [
      [],
      [],
      [],
    ]);
    const b = { ...b0, player: { ...b0.player, hp: 40 } };
    const s = step(b, "attack3", always);
    const dealt = b.enemies[0].hp - s.enemies[0].hp;
    expect(dealt).toBeGreaterThan(0);
    expect(s.player.hp).toBe(
      40 + Math.round(dealt * (SKILLS.drenarMana.lifesteal ?? 0)),
    );
  });

  it("Golpe doble strikes the target twice", () => {
    const b = fight(withSkill("picaro", "golpeDoble"), three(), [[], [], []]);
    const s = step(b, "attack3", always, 1);
    expect(s.events.filter((e) => e.actor === "player")).toHaveLength(2);
    expect(b.enemies[1].hp - s.enemies[1].hp).toBe(
      2 * estimateDamage(b.player, b.enemies[1], "attack3"),
    );
    expect(s.enemies[0].hp).toBe(b.enemies[0].hp);
  });

  it("Ejecutar multiplies damage on a weakened target only", () => {
    const b = fight(withSkill("picaro", "ejecutar"), three(), [[], [], []]);
    const full = estimateDamage(b.player, b.enemies[0], "attack3");
    const low = estimateDamage(
      b.player,
      { ...b.enemies[0], hp: 100 },
      "attack3",
    );
    expect(low).toBe(Math.round(full * EXECUTE_MULT));
  });

  it("Castigo heals the hero for a share of the damage dealt", () => {
    const b0 = fight(withSkill("clerigo", "castigo", { hp: 100 }), three(), [
      [],
      [],
      [],
    ]);
    const b = { ...b0, player: { ...b0.player, hp: 40 } };
    const s = step(b, "attack3", always);
    const dealt = b.enemies[0].hp - s.enemies[0].hp;
    expect(s.player.hp).toBe(
      40 +
        Math.round(dealt * (SKILLS.castigo.lifesteal ?? 0)) +
        Math.round(100 * CLASS_PASSIVE_REGEN), // Bendición at round end
    );
  });

  it("Santuario heals, defends and makes a perfect guard against a strong hit", () => {
    const foe = unit("picaro", { atk: 30 });
    const b0 = fight(
      withSkill("clerigo", "santuario", { hp: 200 }),
      [foe],
      [["attack2"]],
      1,
      1,
    );
    const b = { ...b0, player: { ...b0.player, hp: 100 } };
    const s = step(b, "attack3", always);
    expect(s.player.riposte).toBe(true);
    const guarded = estimateDamage(
      b.enemies[0],
      { ...b.player, defending: true, guard: true },
      "attack2",
    );
    expect(s.player.hp).toBe(
      100 +
        Math.round(200 * (SKILLS.santuario.heal ?? 0)) -
        guarded +
        Math.round(200 * CLASS_PASSIVE_REGEN),
    );
  });
});

describe("target selection", () => {
  const foes = () => [
    unit("caballero", { hp: 400, atk: 1 }),
    unit("mago", { hp: 400, atk: 1 }),
    unit("picaro", { hp: 400, atk: 1 }),
  ];
  const hero = unit("picaro", { hp: 1000 });

  it("defaults to the first living enemy and honors `target`", () => {
    const b = fight(hero, foes(), [[], [], []]);
    const d = step(b, "attack1", always);
    expect(d.enemies[0].hp).toBeLessThan(400);
    expect(d.enemies[1].hp).toBe(400);
    const t = step(b, "attack1", always, 2);
    expect(t.enemies[2].hp).toBeLessThan(400);
    expect(t.enemies[0].hp).toBe(400);
  });

  it("indexes the LIVING enemies and rejects out-of-range targets", () => {
    const b = fight(hero, foes(), [[], [], []]);
    const dead = {
      ...b,
      enemies: [{ ...b.enemies[0], hp: 0 }, b.enemies[1], b.enemies[2]],
    };
    expect(livingEnemies(dead)).toEqual([1, 2]);
    const s = step(dead, "attack1", always, 1);
    expect(s.enemies[2].hp).toBeLessThan(400);
    expect(s.enemies[1].hp).toBe(400);
    expect(step(dead, "attack1", always, 2)).toBe(dead);
    expect(step(b, "attack1", always, 3)).toBe(b);
    expect(step(b, "attack1", always, -1)).toBe(b);
    expect(step(b, "attack1", always, 0.5)).toBe(b);
  });

  it("the fight ends only when every enemy is down", () => {
    const b = fight(hero, foes(), [[], [], []]);
    const weak = {
      ...b,
      enemies: b.enemies.map((e) => ({ ...e, hp: 1 })),
    };
    let s = step(weak, "attack1", always, 0);
    expect(s.status).toBe("ongoing");
    expect(livingEnemies(s)).toHaveLength(2);
    s = step(withRound(s, 0, [[], [], []]), "attack1", always, 0);
    s = step(withRound(s, 0, [[], [], []]), "attack1", always, 0);
    expect(s.status).toBe("won");
    expect(
      s.log.filter((l) => l.endsWith("cae.")).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("elemental weakness makes the choice matter", () => {
    const fire = unit("caballero", { hp: 400, atk: 1 }, { element: "fuego" });
    const earth = unit("caballero", { hp: 400, atk: 1 }, { element: "tierra" });
    const h = unit("picaro", {}, { element: "agua" }); // agua beats fuego
    const b = startBattle(h, [earth, fire], createRng(2));
    expect(estimateDamage(b.player, b.enemies[1], "attack1")).toBeGreaterThan(
      estimateDamage(b.player, b.enemies[0], "attack1"),
    );
  });
});

describe("rounds with several enemies", () => {
  it("every enemy announces its own intents in the queue", () => {
    const hero = unit("caballero", { speed: 10 });
    const b = startBattle(
      hero,
      [unit("mago", { speed: 10 }), unit("picaro", { speed: 10 })],
      createRng(3),
    );
    const slots = pendingIntents(b);
    expect(new Set(slots.map((s) => s.e))).toEqual(new Set([0, 1]));
    expect(b.queue.filter((s) => s === "player")).toHaveLength(1);
    expect(b.log.filter((l) => l.includes("aparece."))).toHaveLength(2);
  });

  it("speed is per enemy: a faster enemy acts more, a slower one once; hero gets the best pair", () => {
    const hero = unit("caballero", { speed: 10 });
    const b = startBattle(
      hero,
      [unit("picaro", { speed: 20 }), unit("mago", { speed: 5 })],
      createRng(3),
    );
    const mine = b.queue.filter((s) => s === "player").length;
    expect(mine).toBe(2); // hero is twice as fast as the slow one
    expect(pendingIntents(b).filter((s) => s.e === 0)).toHaveLength(2);
    expect(pendingIntents(b).filter((s) => s.e === 1)).toHaveLength(1);
    expect(b.playerActions).toBe(mine);
  });

  it("caps actions per round", () => {
    const b = startBattle(
      unit("caballero", { speed: 10 }),
      [unit("picaro", { speed: 100 }), unit("picaro", { speed: 100 })],
      createRng(3),
    );
    for (const e of [0, 1])
      expect(
        pendingIntents(b).filter((s) => s.e === e).length,
      ).toBeLessThanOrEqual(MAX_ACTIONS_PER_ROUND);
  });

  it("a step resolves enemy slots up to the next hero slot, in order", () => {
    const hero = unit("caballero", { hp: 5000, speed: 10 });
    const b = fight(
      hero,
      [unit("picaro", { atk: 5 }), unit("mago", { atk: 5 })],
      [["attack1"], ["attack1"]],
      1,
      0,
    ); // P E0 E1
    const s = step(b, "attack1", always);
    expect(s.events.map((e) => `${e.actor}${e.enemy}`)).toEqual([
      "player0",
      "enemy0",
      "enemy1",
    ]);
    expect(s.turn).toBe(2);
  });

  it("dead enemies lose their remaining slots", () => {
    const hero = unit("caballero", { hp: 5000, speed: 10 });
    const b = fight(
      hero,
      [unit("picaro", { atk: 5, hp: 1 }), unit("mago", { atk: 5 })],
      [["attack1"], ["attack1"]],
      1,
      0,
    );
    const s = step(b, "attack1", always, 0);
    expect(
      s.events.filter((e) => e.actor === "enemy").map((e) => e.enemy),
    ).toEqual([1]);
  });

  it("mods apply to each enemy: shield, regeneration and enrage", () => {
    const hero = unit("caballero", { hp: 9000, atk: 1 });
    const b = startBattle(
      hero,
      [unit("picaro", { hp: 100 }), unit("mago", { hp: 200 })],
      createRng(3),
      { mods: ["escudo", "regeneracion"] },
    );
    expect(b.enemies.map((e) => e.shield)).toEqual([30, 60]);
    const hurt = {
      ...b,
      enemies: b.enemies.map((e) => ({ ...e, hp: 10 })),
    };
    const s = step(
      withRound(hurt, 0, [["defend"], ["defend"]]),
      "defend",
      never,
    );
    expect(s.enemies.every((e) => e.hp > 10)).toBe(true);
    const late = step(
      withRound({ ...b, turn: ENRAGE_AFTER_TURN }, 0, [["defend"], ["defend"]]),
      "defend",
      never,
    );
    late.enemies.forEach((e, i) =>
      expect(e.char.stats.atk).toBeGreaterThan(b.enemies[i].char.stats.atk),
    );
  });

  it("element shifting changes each enemy independently", () => {
    const hero = unit("caballero", { hp: 9000, atk: 1 });
    let b = startBattle(hero, [unit("picaro"), unit("mago")], createRng(3), {
      mods: ["elementoCambiante"],
    });
    const before = b.enemies.map((e) => e.char.element);
    for (let i = 0; i < 2; i++)
      b = step(
        withRound(b, 0, [["defend"], ["defend"]]),
        "defend",
        createRng(8),
      );
    b.enemies.forEach((e, i) => expect(e.char.element).not.toBe(before[i]));
  });

  it("a mid-round group battle survives a JSON round trip", () => {
    const b0 = fight(
      unit("picaro", { speed: 12 }),
      [unit("caballero", { speed: 6 }), unit("mago", { speed: 6 })],
      [["attack1"], ["attack2"]],
      2,
    );
    const mid = step(b0, "attack1", createRng(5), 1);
    expect(mid.queue.length).toBeGreaterThan(0);
    const copy: Battle = JSON.parse(JSON.stringify(mid));
    expect(copy).toEqual(mid);
    expect(step(copy, "attack1", createRng(9), 0)).toEqual(
      step(mid, "attack1", createRng(9), 0),
    );
  });

  it("is deterministic for the same seed", () => {
    const play = (seed: number) => {
      const rng = createRng(seed);
      let b = startBattle(
        generateCharacter(rng, "picaro"),
        [generateCharacter(rng, "mago"), generateCharacter(rng, "clerigo")],
        rng,
      );
      for (let i = 0; i < 300 && b.status === "ongoing"; i++) {
        const p = autoPolicy(b);
        b = step(b, p.action, rng, p.target);
      }
      return b.log;
    };
    expect(play(11)).toEqual(play(11));
  });
});

describe("auto policy", () => {
  const strong = (extra: Partial<Character["stats"]> = {}) =>
    unit("caballero", { hp: 800, atk: 60, ...extra });
  const weakFoes = () => [
    unit("mago", { hp: 100, atk: 3 }),
    unit("picaro", { hp: 100, atk: 3 }),
  ];

  it("autoResolve plays to the end deterministically", () => {
    const run = (seed: number) =>
      autoResolve(
        startBattle(strong(), weakFoes(), createRng(2)),
        createRng(seed),
      );
    const a = run(5);
    expect(a.status).toBe("won");
    expect(run(5)).toEqual(a);
  });

  it("is allowed at any hp, but not mid-fight", () => {
    const b = startBattle(strong(), weakFoes(), createRng(2));
    expect(autoBlockReason(b)).toBeNull();
    const mid = step(b, "attack1", createRng(2));
    expect(autoBlockReason(mid)).toMatch(/empezar/);
    const hurt = { ...b, player: { ...b.player, hp: 300 } };
    expect(autoBlockReason(hurt)).toBeNull(); // risk is the player's
  });

  it("hands control back when the hero gets too hurt", () => {
    const b = startBattle(
      unit("caballero", { hp: 100, atk: 1 }),
      [unit("picaro", { hp: 5000, atk: 25 })],
      createRng(2),
    );
    const out = autoResolve(b, createRng(2));
    expect(out.status).toBe("ongoing");
    expect(out.player.hp).toBeLessThan(100 * 0.3);
  });

  it("prefers area skills against groups and the weak, dangerous target otherwise", () => {
    const hero = unit(
      "caballero",
      { hp: 800, atk: 40, accuracy: 0 },
      { skill: "barrido", level: 5 },
    );
    const b = startBattle(
      hero,
      [...weakFoes(), unit("clerigo", { hp: 100, atk: 3 })],
      createRng(2),
    );
    expect(autoPolicy(b).action).toBe("attack3");
    const solo = startBattle(
      strong(),
      [unit("mago", { hp: 900, atk: 3 }), unit("picaro", { hp: 20, atk: 40 })],
      createRng(2),
    );
    expect(autoPolicy(solo, { skill: false }).target).toBe(1);
  });

  it("defends against announced strong hits that would hurt (guard on) and not with guard off", () => {
    const hero = unit("caballero", { hp: 100, atk: 10 });
    const b = fight(hero, [unit("picaro", { atk: 60 })], [["attack2"]], 1, 1);
    expect(autoPolicy(b).action).toBe("defend");
    expect(autoPolicy(b, { guard: false }).action).not.toBe("defend");
  });
});
