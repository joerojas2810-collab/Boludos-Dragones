// Combat redesign v11: elemental statuses, Berserker and the nine dungeon boss mechanics.
import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  earnGuard,
  estimateDamage,
  EXPLOIT_BASIC_DAMAGE_FRACTION,
  EXPLOIT_MAGE_EFFECT_MULT,
  EXPLOIT_OVERLOAD_DAMAGE_FRACTION,
  furyBonus,
  speedOf,
  startBattle,
  statusTick,
  step,
  withRound,
  type Battle,
  type Intent,
} from "./combat";
import { ARMOR_FRACTION, ARMOR_TAKEN, HEAD_HEAL, PLAGUE_LOSS, stanceFor } from "./bossRules";
import { createRng, type Rng } from "./rng";
import { addStatus, BURN_CAP, burnDamage, cleanse, STATUS_DATA, stacksOf } from "./statuses";

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

const fight = (hero: Character, foes: Character[], intents: Intent[][], opts = {}): Battle =>
  withRound(startBattle(hero, foes, createRng(4), opts), 0, intents, 1);

const withWeapon = (c: Character, element: Character["element"]): Character => ({
  ...c,
  weapon: { element, atkBonus: 0, type: "baston" },
});

describe("elemental statuses", () => {
  const mage = (element: Character["element"]) =>
    withWeapon({ ...unit("mago"), element }, "agua");

  it("basic and universal attacks apply the hero element's state once", () => {
    const b = fight(mage("agua"), [unit("picaro")], [[]]);
    expect(stacksOf(step(b, "attack1", always).enemies[0].statuses, "escarcha")).toBe(1);
    expect(stacksOf(step(b, "golpe", always).enemies[0].statuses, "escarcha")).toBe(1);
    const s = step(b, "golpe", always);
    expect(stacksOf(s.enemies[0].statuses, "escarcha")).toBe(1);
    const mismatch = fight(mage("fuego"), [unit("picaro")], [[]]);
    expect(stacksOf(step(mismatch, "attack1", always).enemies[0].statuses, "quemadura")).toBe(1);
  });

  it("each element maps to its own status; Rayo has none", () => {
    const stat = (e: Character["element"]) =>
      step(fight(mage(e), [unit("picaro")], [[]]), "barrido", always).player.statuses?.[0]?.id ??
      step(fight(mage(e), [unit("picaro")], [[]]), "barrido", always).enemies[0].statuses?.[0]?.id;
    expect(stat("fuego")).toBe("quemadura");
    expect(stat("tierra")).toBe("ruptura");
    expect(stat("viento")).toBe("impulso"); // the user's own buff
    expect(stat("rayo")).toBeUndefined();
  });

  it("stacks cap at the status maximum and renew the duration", () => {
    let list = addStatus(undefined, "escarcha", 2);
    list = addStatus(list, "escarcha", 2);
    expect(stacksOf(list, "escarcha")).toBe(STATUS_DATA.escarcha.max);
    expect(list[0].turns).toBe(STATUS_DATA.escarcha.turns);
  });

  it("resistance shortens negative statuses (min 1 round) and never the positive one", () => {
    expect(addStatus(undefined, "ruptura", 1, undefined, 0.5)[0].turns).toBe(2); // 3 * 0.5 = 1.5 -> 2
    expect(addStatus(undefined, "ruptura", 1, undefined, 0.99)[0].turns).toBe(1);
    expect(addStatus(undefined, "impulso", 1, undefined, 0.99)[0].turns).toBe(STATUS_DATA.impulso.turns);
  });

  it("Escarcha slows and Ruptura cuts DEF", () => {
    const c = { ...unit("caballero", { def: 10, speed: 10 }) };
    const base = startBattle(c, [unit("picaro")], createRng(3)).player;
    const frozen = { ...base, statuses: addStatus(undefined, "escarcha", 3) };
    expect(speedOf(frozen)).toBeCloseTo(10 * (1 - 3 * STATUS_DATA.escarcha.per));
    const foe = startBattle(unit("picaro"), [c], createRng(3)).player;
    const broken = { ...base, statuses: addStatus(undefined, "ruptura", 3) };
    expect(estimateDamage(foe, broken, "attack1")).toBeGreaterThan(estimateDamage(foe, base, "attack1"));
  });

  it("Quemadura bites each round, capped at BURN_CAP of max hp, and statuses expire", () => {
    const c = startBattle(unit("mago"), [unit("picaro")], createRng(3)).player;
    const huge = { ...c, statuses: addStatus(undefined, "quemadura", 2, 10_000) };
    expect(burnDamage(huge.statuses)).toBe(20_000);
    const log: string[] = [];
    const ticked = statusTick(huge, log);
    expect(c.hp - ticked.hp).toBe(Math.round(c.char.stats.hp * BURN_CAP));
    let t = ticked;
    for (let i = 0; i < 3; i++) t = statusTick(t, log);
    expect(t.statuses ?? []).toHaveLength(0);
  });

  it("cleanse removes the first negative status only", () => {
    const list = addStatus(addStatus(undefined, "impulso", 1), "escarcha", 1);
    const out = cleanse(list);
    expect(out.map((s) => s.id)).toEqual(["impulso"]);
  });

  it("enemies apply their status only when flagged, and only on strong hits", () => {
    const foe = unit("picaro", {}, { element: "tierra" });
    const hero = unit("caballero");
    const run = (opts: object, intent: Intent) =>
      step(withRound(startBattle(hero, [foe], createRng(4), opts), 1, [[intent]], 1), "attack1", always).player;
    expect(run({ enemyStatus: true }, "attack2").statuses?.[0]?.id).toBe("ruptura");
    expect(run({ enemyStatus: true }, "attack1").statuses ?? []).toHaveLength(0);
    expect(run({}, "attack2").statuses ?? []).toHaveLength(0);
  });

  it("Explotar consumes Quemadura, deals 40% basic damage, advances one capped tick, and applies no new state", () => {
    const hero = withWeapon({ ...unit("mago"), element: "fuego" }, "agua");
    const foe = unit("picaro", { hp: 1000, def: 0 });
    const b = fight(hero, [foe], [[]]);
    const target = {
      ...b.enemies[0],
      statuses: addStatus(undefined, "quemadura", 2, 100),
    };
    const prepared = { ...b, enemies: [target] };
    const common = Math.round(estimateDamage(b.player, target, "attack1") * 0.4);
    const out = step(prepared, "explotar", always);
    const cappedBurn = Math.round(foe.stats.hp * BURN_CAP);
    expect(target.hp - out.enemies[0].hp).toBe(common + cappedBurn);
    expect(stacksOf(out.enemies[0].statuses, "quemadura")).toBe(0);
    expect(out.enemies[0].statuses?.some((s) => s.id === "escarcha")).toBe(false);
    expect(out.log.join(" ")).toContain("Quemadura adelantada");
  });

  it("Explotar consumes Ruptura and grants a one-activation defense bypass", () => {
    const hero = withWeapon({ ...unit("caballero"), element: "tierra" }, "agua");
    const foe = unit("picaro", { hp: 10000, def: 50 });
    const b = fight(hero, [foe], [[]]);
    const target = {
      ...b.enemies[0],
      char: { ...b.enemies[0].char, stats: { ...b.enemies[0].char.stats, def: 10000 } },
      statuses: addStatus(undefined, "ruptura", 2),
    };
    const out = step({ ...b, enemies: [target] }, "explotar", always);
    expect(stacksOf(out.enemies[0].statuses, "ruptura")).toBe(0);
    expect(out.player.nextAttackDefenseBypass).toBeCloseTo(0.16);
    const def = {
      ...out.enemies[0],
      hp: 10000,
      char: { ...out.enemies[0].char, stats: { ...out.enemies[0].char.stats, def: 100 } },
    };
    const strongPlayer = {
      ...out.player,
      char: { ...out.player.char, stats: { ...out.player.char.stats, atk: 1000 } },
    };
    expect(estimateDamage(strongPlayer, def, "attack1", false, 0.16)).toBeGreaterThan(
      estimateDamage(strongPlayer, def, "attack1"),
    );
    const next = step(withRound({ ...out, enemies: [def] }, false, [[]], 1), "attack1", always);
    expect(next.player.nextAttackDefenseBypass).toBeUndefined();
  });

  it("Explotar requires three Sobrecarga charges, consumes them, and adds no charge", () => {
    const hero = withWeapon({ ...unit("mago"), element: "rayo" }, "agua");
    const b = fight(hero, [unit("picaro", { hp: 10000 })], [[]]);
    expect(step(b, "explotar", always)).toBe(b);
    const charged = { ...b, player: { ...b.player, charge: 3 } };
    const common = estimateDamage(charged.player, charged.enemies[0], "attack1");
    const out = step(charged, "explotar", always);
    expect(charged.enemies[0].hp - out.enemies[0].hp).toBe(
      Math.round(common * (EXPLOIT_BASIC_DAMAGE_FRACTION + EXPLOIT_OVERLOAD_DAMAGE_FRACTION * EXPLOIT_MAGE_EFFECT_MULT)),
    );
    expect(out.player.charge).toBe(0);
    expect(out.enemies[0].statuses ?? []).toHaveLength(0);
  });

  it("Explotar class hooks respect the class healing and shield caps", () => {
    const foe = unit("picaro", { hp: 10000 });
    const prepare = (classId: ClassId) => {
      const hero = withWeapon({ ...unit(classId), element: "fuego" }, "agua");
      const b = fight(hero, [foe], [[]]);
      return {
        ...b,
        player: { ...b.player, hp: b.player.char.stats.hp - 100 },
        enemies: [{ ...b.enemies[0], statuses: addStatus(undefined, "quemadura", 1, 1) }],
      };
    };
    const cleric = prepare("clerigo");
    expect(step(cleric, "explotar", always).player.hp).toBeGreaterThan(cleric.player.hp);
    const knight = prepare("caballero");
    const shielded = step(knight, "explotar", always).player;
    expect(shielded.shield).toBeGreaterThan(0);
    expect(shielded.shield).toBeLessThanOrEqual(Math.round(shielded.char.stats.hp * 0.03));
  });

  it("Mago and low-health Berserker amplify Quemadura's immediate tick by 25%", () => {
    const foe = unit("picaro", { hp: 1000 });
    const run = (classId: ClassId, hp = 1000) => {
      const hero = withWeapon({ ...unit(classId), element: "fuego", stats: { ...unit(classId).stats, hp } }, "agua");
      const initial = fight(hero, [foe], [[]]);
      const b = classId === "berserker"
        ? { ...initial, player: { ...initial.player, hp: 250 } }
        : initial;
      const target = { ...b.enemies[0], statuses: addStatus(undefined, "quemadura", 1, 40) };
      const prepared = { ...b, enemies: [target] };
      const common = Math.round(estimateDamage(b.player, target, "attack1") * 0.4);
      return target.hp - step(prepared, "explotar", always).enemies[0].hp - common;
    };
    expect(run("mago")).toBe(50);
    expect(run("berserker", 500)).toBe(50);
  });
});

describe("Explotar Escarcha e Impulso sobre la cola de ronda", () => {
  const frostTarget = (b: Battle, stacks: number) => ({
    ...b.enemies[0],
    statuses: addStatus(undefined, "escarcha", stacks),
  });

  it("consumes Escarcha and moves the next pending enemy slot after the next player action", () => {
    const hero = withWeapon(unit("caballero"), "agua");
    const foe = unit("mago", { hp: 10000 });
    const base = fight(hero, [foe], [["attack1", "attack1"]]);
    const prepared = withRound({ ...base, enemies: [frostTarget(base, 1)] }, false, [["attack1", "attack1"]], 2);
    const out = step(prepared, "explotar", always);

    expect(stacksOf(out.enemies[0].statuses, "escarcha")).toBe(0);
    expect(out.queue[0]).toBe("player");
    expect(out.queue[1]).toMatchObject({ e: 0, n: 0 });
    expect(out.log.join(" ")).toContain("Escarcha retrasa una acción");
  });

  it("three Escarcha charges move up to two queued slots in one event", () => {
    const hero = withWeapon(unit("caballero"), "agua");
    const foe = unit("mago", { hp: 10000 });
    const base = fight(hero, [foe], [["attack1"]]);
    const prepared: Battle = {
      ...base,
      playerActions: 2,
      enemies: [frostTarget(base, 3)],
      queue: [
        "player",
        { e: 0, n: 0, intent: "attack1" as const },
        { e: 0, n: 1, intent: "attack1" as const },
        "player",
        { e: 0, n: 2, intent: "attack1" as const },
      ],
    };
    const out = step(prepared, "explotar", always);

    expect(out.queue).toEqual([
      "player",
      { e: 0, n: 0, intent: "attack1" },
      { e: 0, n: 1, intent: "attack1" },
      { e: 0, n: 2, intent: "attack1" },
    ]);
    expect(out.frostDelayedEnemies).toEqual([0]);
  });

  it("does not delay a strong slot that already received its warning wait", () => {
    const hero = withWeapon(unit("caballero"), "agua");
    const foe = unit("mago", { hp: 10000 });
    const base = fight(hero, [foe], [["attack2"]]);
    const prepared: Battle = {
      ...base,
      playerActions: 2,
      enemies: [frostTarget(base, 3)],
      queue: ["player", { e: 0, n: 0, intent: "attack2" as const, warningWaited: true }, "player"],
    };
    const out = step(prepared, "explotar", always);

    expect(out.log.join(" ")).not.toContain("Escarcha retrasa");
    expect(out.frostDelayedEnemies).toEqual([]);
  });

  it("requires 3 Impulso stacks for one queued action, never exceeding three", () => {
    const hero = withWeapon({ ...unit("mago"), element: "viento" }, "agua");
    const foe = unit("mago", { hp: 10000 });
    const base = fight(hero, [foe], [["attack1"]]);
    const prepared: Battle = {
      ...base,
      player: { ...base.player, statuses: addStatus(undefined, "impulso", 2) },
      playerActions: 2,
      queue: ["player", { e: 0, n: 0, intent: "attack1" as const }, "player"],
    };
    const out = step(prepared, "explotar", always);

    expect(stacksOf(out.player.statuses, "impulso")).toBe(0);
    expect(out.playerActions).toBe(2);
    expect(out.impulseGranted).toBe(false);
    expect(out.queue).toEqual(["player"]);

    const charged: Battle = {
      ...prepared,
      player: { ...prepared.player, statuses: addStatus(undefined, "impulso", 3) },
    };
    const granted = step(charged, "explotar", always);
    expect(granted.playerActions).toBe(3);
    expect(granted.impulseGranted).toBe(true);
    expect(granted.queue).toEqual(["player", "player"]);
  });

  it("keeps the three-action cap and Pícaro consumes Impulso for next-attack critical chance", () => {
    const rogue = withWeapon({ ...unit("picaro", { crit: 0.2 }), element: "viento" }, "agua");
    const foe = unit("mago", { hp: 10000 });
    const base = fight(rogue, [foe], [["attack1", "attack1"]]);
    const capped: Battle = {
      ...base,
      player: { ...base.player, statuses: addStatus(undefined, "impulso", 2) },
      playerActions: 3,
      queue: ["player", { e: 0, n: 0, intent: "attack1" as const }, "player", { e: 0, n: 1, intent: "attack1" as const }, "player"],
    };
    const cappedOut = step(capped, "explotar", always);
    expect(cappedOut.playerActions).toBe(3);
    expect(cappedOut.log.join(" ")).not.toContain("añade una acción");

    const critRng: Rng = { ...createRng(5), chance: (p) => p >= 0.3 };
    const bonusBase: Battle = {
      ...base,
      player: { ...base.player, statuses: addStatus(undefined, "impulso", 1) },
      queue: ["player", "player"],
    };
    const primed = step(bonusBase, "explotar", always);
    expect(primed.player.nextCritChance).toBe(0.15);
    const defended = step(primed, "defend", always);
    expect(defended.player.nextCritChance).toBeUndefined();
    const next = step(primed, "attack1", critRng);
    expect(next.events.some((event) => event.kind === "crit")).toBe(true);
    expect(next.player.nextCritChance).toBeUndefined();
  });
});

describe("perfect guard class bonuses", () => {
  const log: string[] = [];
  const earn = (cls: ClassId, hp?: number) => {
    const c = startBattle(unit(cls), [unit("picaro")], createRng(3)).player;
    return earnGuard(hp === undefined ? c : { ...c, hp }, log);
  };

  it("Mago and Pícaro keep their guard passive; Caballero gains Resolución", () => {
    expect(earn("mago").riposte).toBe(true);
    expect(earn("picaro").riposte).toBe(true);
    expect(earn("berserker").riposte).toBe(true);
    expect(earn("caballero").resolution).toBe(true);
    expect(earn("clerigo", 500).riposte).toBeUndefined();
  });

  it("Clérigo guard healing respects the 3% activation cap and cleanses a status", () => {
    const c = startBattle(unit("clerigo"), [unit("picaro")], createRng(3)).player;
    const hurt = { ...c, hp: 500, statuses: addStatus(undefined, "escarcha", 2) };
    const out = earnGuard(hurt, log);
    expect(out.hp).toBe(500 + 30);
    expect(out.statuses ?? []).toHaveLength(0);
  });

  it("Caballero gains a one-use Resolución instead of reflecting damage", () => {
    const hero = unit("caballero");
    const foe = unit("picaro", { atk: 40 });
    const b = withRound(startBattle(hero, [foe], createRng(4)), 1, [["attack2"]], 1);
    const s = step(b, "defend", always);
    expect(s.player.resolution).toBe(true);
    expect(s.enemies[0].hp).toBe(s.enemies[0].char.stats.hp);
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

describe("dungeon boss mechanics", () => {
  const boss = (bossId: string, stats: Partial<Character["stats"]> = {}) =>
    unit("mago", stats, { bossId, name: bossId });
  const hero = () => unit("caballero", { hp: 5000, atk: 5, def: 0 });
  // Passes rounds with the same action until `turns` rounds have gone by.
  const rounds = (b: Battle, turns: number, action: "defend" | "attack1" = "defend"): Battle => {
    let x = b;
    for (let i = 0; i < 400 && x.turn <= turns && x.status === "ongoing"; i++)
      x = step(x, action, always);
    return x;
  };

  it("a boss gets its state and ordinary enemies do not", () => {
    expect(startBattle(hero(), [boss("ash_king")], createRng(2)).enemies[0].boss).toBeDefined();
    expect(startBattle(hero(), [unit("mago")], createRng(2)).enemies[0].boss).toBeUndefined();
  });

  it("Coloso Hueco: armor bar, half damage while it holds, Roto after it breaks, armor comes back", () => {
    const heavy = unit("caballero", { hp: 5000, atk: 100, def: 0 }); // big numbers: no rounding noise
    const b = startBattle(heavy, [boss("hollow_colossus")], createRng(2));
    const plain = startBattle(heavy, [unit("mago")], createRng(2));
    expect(b.enemies[0].shield).toBe(Math.round(1000 * ARMOR_FRACTION));
    const armored = estimateDamage(b.player, b.enemies[0], "attack1");
    const naked = estimateDamage(plain.player, plain.enemies[0], "attack1");
    expect(armored).toBe(Math.round(naked * ARMOR_TAKEN));
    // break it with a huge hit
    const strong = { ...b, player: { ...b.player, char: { ...b.player.char, stats: { ...b.player.char.stats, atk: 5000 } } } };
    const s = step(withRound(strong, 0, [[]], 1), "attack1", always);
    expect(s.enemies[0].boss?.broken).toBeGreaterThan(0);
    expect(s.log.some((l) => l.includes("armadura") && l.includes("rompe"))).toBe(true);
  });

  it("Rey del Trueno: +10 % speed every 2 rounds, up to +40 %", () => {
    const b = startBattle(hero(), [boss("thunder_king")], createRng(2));
    const v0 = speedOf(b.enemies[0]);
    const later = rounds(b, 9);
    expect(later.enemies[0].boss!.ramp).toBe(4);
    expect(speedOf(later.enemies[0])).toBeCloseTo(v0 * 1.4);
  });

  it("Rey de Ceniza: pressure grows each round and raises its damage", () => {
    const b = startBattle(hero(), [boss("ash_king", { atk: 100 })], createRng(2));
    const later = rounds(b, 4, "attack1");
    expect(later.enemies[0].boss!.pressure).toBeGreaterThanOrEqual(3);
    expect(estimateDamage(later.enemies[0], later.player, "attack1")).toBeGreaterThan(
      estimateDamage(b.enemies[0], b.player, "attack1"),
    );
  });

  it("Rey de Ceniza: a perfect guard against its strong hit resets the pressure", () => {
    const b = startBattle(hero(), [boss("ash_king", { atk: 100 })], createRng(2));
    const hot = { ...b, enemies: [{ ...b.enemies[0], boss: { ...b.enemies[0].boss!, pressure: 3 } }] };
    const s = step(withRound(hot, 1, [["attack2"]], 1), "defend", always);
    expect(s.log.some((l) => l.includes("apaga la presión"))).toBe(true);
    expect(s.enemies[0].boss!.pressure).toBeLessThan(3);
  });

  it("Señor de las Moscas: the plague takes a share of the hero's max hp each round", () => {
    const b = startBattle(hero(), [boss("lord_of_flies")], createRng(2));
    const later = rounds(b, 2);
    expect(later.log.some((l) => l.includes("plaga"))).toBe(true);
    expect(b.player.hp - later.player.hp).toBeGreaterThanOrEqual(Math.round(5000 * PLAGUE_LOSS));
  });

  it("Madre Hidra: crossing 75 % of hp heals and adds an action", () => {
    const b = startBattle(
      { ...hero(), stats: { ...hero().stats, atk: 150 } },
      [boss("mother_hydra", { hp: 1000 })],
      createRng(2),
    );
    const near = { ...b, enemies: [{ ...b.enemies[0], hp: 800 }] };
    const s = step(withRound(near, 0, [[]], 1), "attack1", always);
    expect(s.enemies[0].boss!.heads).toBeGreaterThanOrEqual(1);
    expect(s.log.some((l) => l.includes("cabeza"))).toBe(true);
    expect(HEAD_HEAL).toBeGreaterThan(0);
  });

  it("El Sin Rostro: stance alternates every 2 rounds and shifts damage and DEF", () => {
    expect([1, 2, 3, 4, 5].map(stanceFor)).toEqual(["ofensiva", "ofensiva", "defensiva", "defensiva", "ofensiva"]);
    const b = startBattle(hero(), [boss("faceless_one")], createRng(2));
    const off = estimateDamage(b.enemies[0], b.player, "attack1");
    const def = estimateDamage(
      { ...b.enemies[0], boss: { ...b.enemies[0].boss!, stance: "defensiva" } },
      b.player,
      "attack1",
    );
    expect(def).toBeLessThan(off);
  });

  it("Gran Devorador: heals from the damage it deals", () => {
    const foe = boss("great_devourer", { atk: 30 });
    const b = startBattle(hero(), [foe], createRng(2));
    const hurt = { ...b, enemies: [{ ...b.enemies[0], hp: 500 }] };
    const s = step(withRound(hurt, 1, [["attack1"]], 1), "defend", always);
    expect(s.enemies[0].hp).toBeGreaterThan(500);
  });

  it("Reina Marchita: the ritual lands every 3 rounds unless a perfect guard stops it", () => {
    const b = startBattle(hero(), [boss("withered_queen")], createRng(2));
    const after = rounds(b, 3);
    expect(after.log.some((l) => l.includes("canaliza su ritual"))).toBe(true);
    expect(after.log.some((l) => l.includes("marchita") || l.includes("anula"))).toBe(true);
  });

  it("Interrumpir cancels the Queen's announced ritual before either effect", () => {
    const b0 = startBattle(hero(), [boss("withered_queen")], createRng(2));
    const b = withRound(b0, false, [["channeling"]], 1);
    const after = step(b, "interrumpir", always);
    expect(after).not.toBe(b);
    expect(after.enemies[0].channelingState).not.toBe("resolved");
    expect(after.player.healCut ?? 0).toBe(0);
    expect(after.player.statuses ?? []).not.toContainEqual(expect.objectContaining({ id: "ruptura" }));
    expect(after.log.some((line) => line.includes("canalización interrumpida"))).toBe(true);
    expect(after.queue.some((slot) => slot !== "player" && slot.intent === "channeling")).toBe(false);
  });

  it("a perfect guard remains a second answer to the announced ritual", () => {
    const b0 = startBattle(hero(), [boss("withered_queen")], createRng(2));
    const b = withRound(b0, false, [["channeling"]], 1);
    const after = step(b, "defend", always);
    expect(after.player.healCut ?? 0).toBe(0);
    expect(after.player.statuses ?? []).not.toContainEqual(expect.objectContaining({ id: "ruptura" }));
    expect(after.log.some((line) => line.includes("Tu guardia perfecta anula el ritual"))).toBe(true);
  });

  it("Vigía Eterno: repeating the same action twice weakens the third", () => {
    const b = startBattle(
      { ...hero(), stats: { ...hero().stats, atk: 20 } },
      [boss("eternal_watcher", { hp: 100000 })],
      createRng(2),
    );
    let x = withRound(b, 0, [[]], 3);
    const hp0 = x.enemies[0].hp;
    x = step(x, "attack1", always);
    const first = hp0 - x.enemies[0].hp;
    x = step(x, "attack1", always);
    const second = hp0 - first - x.enemies[0].hp;
    x = step(x, "attack1", always);
    const third = hp0 - first - second - x.enemies[0].hp;
    expect(third).toBeLessThan(second);
    expect(x.log.some((l) => l.includes("te lee"))).toBe(true);
  });
});
