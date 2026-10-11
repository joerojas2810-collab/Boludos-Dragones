import { describe, expect, it } from "vitest";
import { autoBlockReason, autoPolicy, autoResolve } from "./auto";
import {
  CLASS_PASSIVE_DMG_REDUCTION,
  generateCharacter,
  type Character,
  type ClassId,
} from "./characters";
import {
  DAMAGE_SCALE,
  DEFEND_FACTOR,
  ENRAGE_AFTER_TURN,
  estimateDamage,
  classHeal,
  classShield,
  earnGuard,
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
    // (the scale rounds once at the end, so compare within one point)
    expect(Math.abs(normal - plain * DEFEND_FACTOR)).toBeLessThanOrEqual(1);
    expect(Math.abs(perfect - plain * PERFECT_GUARD_FACTOR)).toBeLessThanOrEqual(1);
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
      DAMAGE_SCALE *
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

describe("universal skills and class hooks (3c)", () => {
  const three = () => [
    unit("caballero", { hp: 500, atk: 1 }),
    unit("mago", { hp: 500, atk: 1 }),
    unit("picaro", { hp: 500, atk: 1 }),
  ];

  it("Golpe has its approved accuracy/power and own-activation cooldown", () => {
    const b = fight(unit("caballero"), three(), [[], [], []]);
    expect(step(b, "attack2" as never, always)).toBe(b);
    expect(step(b, "attack3" as never, always)).toBe(b);
    const s = step(b, "golpe", always);
    expect(s.events.filter((e) => e.actor === "player")).toHaveLength(1);
    expect(s.player.universalCooldowns?.golpe).toBe(1.7);
    expect(step(s, "golpe", always)).toBe(s);
  });

  it("Barrido hits every living enemy once and applies one elemental stack to each", () => {
    const b = fight(unit("caballero"), three(), [[], [], []]);
    const s = step(b, "barrido", always);
    expect(s.events.filter((e) => e.actor === "player")).toHaveLength(3);
    s.enemies.forEach((e, i) =>
      expect(b.enemies[i].hp - e.hp).toBe(
        estimateDamage(b.player, b.enemies[i], "barrido"),
      ),
    );
    expect(s.enemies.map((e) => e.statuses?.[0]?.stacks)).toEqual([1, 1, 1]);
    // dead enemies are skipped
    const half = {
      ...b,
      enemies: [{ ...b.enemies[0], hp: 0 }, b.enemies[1], b.enemies[2]],
    };
    expect(step(half, "barrido", always).events).toHaveLength(2);
  });

  it("implements the approved Golpe class hooks", () => {
    const foe = unit("mago", { hp: 500, atk: 1 });
    const base = fight(unit("mago", { atk: 20 }), [foe], [[]]);
    const mageTarget = { ...base, enemies: [{ ...base.enemies[0], statuses: [{ id: "escarcha" as const, stacks: 1, turns: 2 }] }] };
    expect(base.enemies[0].hp - step(base, "golpe", always).enemies[0].hp).toBeLessThan(
      mageTarget.enemies[0].hp - step(mageTarget, "golpe", always).enemies[0].hp,
    );
    const rogue = { ...base, player: { ...base.player, char: { ...base.player.char, classId: "picaro" as const } }, enemies: [{ ...base.enemies[0], exposed: true }] };
    expect(rogue.enemies[0].hp - step(rogue, "golpe", always).enemies[0].hp).toBeGreaterThan(
      base.enemies[0].hp - step(base, "golpe", always).enemies[0].hp,
    );
    const berserker = { ...base, player: { ...base.player, char: { ...base.player.char, classId: "berserker" as const }, hp: 400 } };
    expect(base.enemies[0].hp - step(base, "golpe", always).enemies[0].hp).toBeLessThan(
      berserker.enemies[0].hp - step(berserker, "golpe", always).enemies[0].hp,
    );
  });

  it("implements Barrido hooks for Mage, Rogue and Berserker", () => {
    const foe = unit("mago", { hp: 2000, atk: 1 });
    const mage = unit("mago", { atk: 20 });
    const clean = fight(mage, [foe], [[]]);
    const marked = { ...clean, enemies: [{ ...clean.enemies[0], statuses: [{ id: "escarcha" as const, stacks: 1, turns: 2 }] }] };
    expect(clean.enemies[0].hp - step(clean, "barrido", always).enemies[0].hp).toBeLessThan(
      marked.enemies[0].hp - step(marked, "barrido", always).enemies[0].hp,
    );

    const rogue = fight(unit("picaro", { atk: 20 }), [foe], [[]]);
    const rogueBase = { ...rogue, player: { ...rogue.player, char: { ...rogue.player.char, classId: "caballero" as const } } };
    expect(rogue.enemies[0].hp - step(rogue, "barrido", always).enemies[0].hp).toBeGreaterThan(
      rogueBase.enemies[0].hp - step(rogueBase, "barrido", always).enemies[0].hp,
    );

    const berserker = fight(unit("berserker", { atk: 20 }), [foe], [[]]);
    const safe = { ...berserker, player: { ...berserker.player, hp: 700 } };
    const wounded = { ...berserker, player: { ...berserker.player, hp: 400 } };
    expect(safe.enemies[0].hp - step(safe, "barrido", always).enemies[0].hp).toBeLessThan(
      wounded.enemies[0].hp - step(wounded, "barrido", always).enemies[0].hp,
    );
  });

  it("Cleric heals on a landed hit even when the target's shield absorbs it", () => {
    const b = fight(unit("clerigo"), [unit("mago", { hp: 2000, atk: 1 })], [[]]);
    const ready = { ...b, player: { ...b.player, hp: 500 }, enemies: [{ ...b.enemies[0], shield: 2000 }] };
    const result = step(ready, "golpe", always);
    expect(result.events.some((event) => event.actor === "player" && event.kind === "hit")).toBe(true);
    expect(result.log.some((line) => line.includes("recupera 30 de vida"))).toBe(true);
    expect(result.player.hp).toBe(535); // +3% for the skill hook and +0.5% passive regen at round end.
  });

  it("Cleric's Barrido heals up to 3% per use, including shield-absorbed hits", () => {
    const b = fight(unit("clerigo"), [
      unit("mago", { hp: 2000, atk: 1 }), unit("picaro", { hp: 2000, atk: 1 }), unit("caballero", { hp: 2000, atk: 1 }),
    ], [[], [], []]);
    const ready = { ...b, player: { ...b.player, hp: 500 }, enemies: b.enemies.map((enemy) => ({ ...enemy, shield: 2000 })) };
    const result = step(ready, "barrido", always);
    expect(result.player.hp).toBe(535); // 3% class heal + 0.5% passive regen.
  });

  it("Resolution replaces the Knight's perfect-guard reflection and boosts the next Golpe", () => {
    const cab = unit("caballero");
    const log: string[] = [];
    const ready = earnGuard({ char: cab, hp: cab.stats.hp, cooldown: 0, defending: false }, log);
    expect(ready.resolution).toBe(true);
    const b = fight(cab, [unit("picaro", { hp: 1000, atk: 1 })], [[]]);
    const plainDamage = b.enemies[0].hp - step(b, "golpe", always).enemies[0].hp;
    const charged = { ...b, player: { ...b.player, resolution: true } };
    const chargedDamage = charged.enemies[0].hp - step(charged, "golpe", always).enemies[0].hp;
    expect(chargedDamage).toBeGreaterThan(plainDamage);
    expect(step(charged, "golpe", always).player.resolution).toBeUndefined();
  });

  it("Berserker's perfect-guard bonus shortens the next universal cooldown", () => {
    const hero = unit("berserker");
    const b = fight(hero, [unit("mago", { hp: 1500, atk: 1 })], [[]]);
    const ready = earnGuard(b.player, []);
    const result = step({ ...b, player: ready }, "golpe", always);
    expect(result.player.universalCooldowns?.golpe).toBe(0.85);
    expect(result.player.riposte).toBe(false);
  });

  it("Barrido grants the Knight a one-hit guard only against groups", () => {
    const b = fight(unit("caballero"), three(), [[], [], []]);
    const s = step(b, "barrido", always);
    expect(s.player.nextHitReduction).toBe(0.1);
    const one = fight(unit("caballero"), [unit("mago")], [[]]);
    expect(step(one, "barrido", always).player.nextHitReduction).toBeUndefined();
  });

  it("caps class heals and shields per activation and round", () => {
    const c = { char: unit("clerigo"), hp: 0, cooldown: 0, defending: false };
    const healed = classHeal(classHeal(c, 0.03), 0.03);
    expect(healed.hp).toBe(30);
    const shielded = classShield(classShield(c, 0.03), 0.03);
    expect(shielded.shield).toBe(30);
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
      { level: 5 },
    );
    const b = startBattle(
      hero,
      [...weakFoes(), unit("clerigo", { hp: 100, atk: 3 })],
      createRng(2),
    );
    expect(autoPolicy(b).action).toBe("barrido");
    const solo = startBattle(
      strong(),
      [unit("mago", { hp: 900, atk: 3 }), unit("picaro", { hp: 20, atk: 40 })],
      createRng(2),
    );
    expect(autoPolicy(solo, { useUniversalSkills: false }).target).toBe(1);
  });

  it("defends against announced strong hits that would hurt (guard on) and not with guard off", () => {
    const hero = unit("caballero", { hp: 100, atk: 10 });
    const b = fight(hero, [unit("picaro", { atk: 60 })], [["attack2"]], 1, 1);
    expect(autoPolicy(b).action).toBe("defend");
    expect(autoPolicy(b, { guard: false }).action).not.toBe("defend");
  });

  it("uses Interrumpir on the announced ritual for every class", () => {
    const classes: ClassId[] = ["caballero", "mago", "picaro", "clerigo", "berserker"];
    for (const classId of classes) {
      const queen = { ...unit("mago", { hp: 5000, atk: 10 }), bossId: "withered_queen" as const };
      const b = withRound(
        startBattle(unit(classId, { hp: 5000 }), queen, createRng(11)),
        false,
        [["channeling"]],
        1,
      );
      expect(autoPolicy(b)).toEqual({ action: "interrumpir", target: 0 });
    }
  });

  it("uses Quebrar to stop a nearly broken Charge for every class", () => {
    const classes: ClassId[] = ["caballero", "mago", "picaro", "clerigo", "berserker"];
    for (const classId of classes) {
      const golem = { ...unit("caballero", { hp: 5000, atk: 60 }), name: "Gólem Colosal" };
      const b0 = startBattle(unit(classId, { hp: 5000 }), golem, createRng(12));
      const b = {
        ...withRound(b0, false, [["charge"]], 1),
        enemies: [{ ...b0.enemies[0], aguante: 1, chargePending: true, chargeUsed: true }],
      };
      expect(autoPolicy(b)).toEqual({ action: "quebrar", target: 0 });
    }
  });
});
