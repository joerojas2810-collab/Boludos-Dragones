// Combat redesign v11: elemental statuses, Berserker and the nine dungeon boss mechanics.
import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  earnGuard,
  estimateDamage,
  furyBonus,
  GUARD_HEAL,
  guardFree,
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
    withWeapon({ ...unit("mago"), skill: "tormenta" }, element);

  it("only the class special (Ataque 2) applies the status of the weapon element, 2 stacks", () => {
    const b = fight(mage("agua"), [unit("picaro")], [[]]);
    expect(step(b, "attack1", always).enemies[0].statuses ?? []).toHaveLength(0);
    expect(step(b, "attack2", always).enemies[0].statuses ?? []).toHaveLength(0);
    const s = step(b, "attack3", always);
    expect(stacksOf(s.enemies[0].statuses, "escarcha")).toBe(2);
  });

  it("each element maps to its own status; Rayo has none", () => {
    const stat = (e: Character["element"]) =>
      step(fight(mage(e), [unit("picaro")], [[]]), "attack3", always).player.statuses?.[0]?.id ??
      step(fight(mage(e), [unit("picaro")], [[]]), "attack3", always).enemies[0].statuses?.[0]?.id;
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

  it("Detonar consumes the statuses and does not apply new ones", () => {
    const hero = withWeapon({ ...unit("mago"), skill: "detonar" }, "agua");
    const b = fight(hero, [unit("picaro")], [[]]);
    const marked = { ...b, enemies: [{ ...b.enemies[0], statuses: addStatus(undefined, "ruptura", 2) }] };
    expect(step(marked, "attack3", always).enemies[0].statuses ?? []).toHaveLength(0);
  });
});

describe("perfect guard class bonuses", () => {
  const log: string[] = [];
  const earn = (cls: ClassId, hp?: number) => {
    const c = startBattle(unit(cls), [unit("picaro")], createRng(3)).player;
    return earnGuard(hp === undefined ? c : { ...c, hp }, log);
  };

  it("Mago, Pícaro and Berserker keep a bonus for the next hit; Caballero and Clérigo do not", () => {
    expect(earn("mago").riposte).toBe(true);
    expect(earn("picaro").riposte).toBe(true);
    expect(earn("berserker").riposte).toBe(true);
    expect(earn("caballero").riposte).toBeUndefined();
    expect(earn("clerigo", 500).riposte).toBeUndefined();
  });

  it("Clérigo heals GUARD_HEAL and cleanses a negative status", () => {
    const c = startBattle(unit("clerigo"), [unit("picaro")], createRng(3)).player;
    const hurt = { ...c, hp: 500, statuses: addStatus(undefined, "escarcha", 2) };
    const out = earnGuard(hurt, log);
    expect(out.hp).toBe(500 + Math.round(1000 * GUARD_HEAL));
    expect(out.statuses ?? []).toHaveLength(0);
  });

  it("Caballero reflects part of the avoided damage back, no hit roll", () => {
    const hero = unit("caballero");
    const foe = unit("picaro", { atk: 40 });
    const b = withRound(startBattle(hero, [foe], createRng(4)), 1, [["attack2"]], 1);
    const s = step(b, "defend", always);
    expect(s.log.some((l) => l.includes("refleja"))).toBe(true);
    expect(s.enemies[0].hp).toBeLessThan(s.enemies[0].char.stats.hp);
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

  it("Frenesí costs 8 % of the CURRENT hp and never kills", () => {
    const hero = { ...unit("berserker"), weapon: { element: "fuego" as const, atkBonus: 0, type: "mandoble" } };
    const b = fight(hero, [unit("picaro", { hp: 5000 })], [[]]);
    const s = step(b, "attack2", always);
    expect(b.player.hp - s.player.hp).toBe(Math.round(1000 * 0.08));
    const dying = { ...b, player: { ...b.player, hp: 1 } };
    expect(step(dying, "attack2", always).player.hp).toBeGreaterThanOrEqual(1);
  });

  it("guard bonus: the next special costs no hp and recharges a round sooner, an Ataque 1 keeps it", () => {
    const hero = { ...unit("berserker"), weapon: { element: "fuego" as const, atkBonus: 0, type: "mandoble" } };
    const b = fight(hero, [unit("picaro", { hp: 5000 })], [[]]);
    const armed = { ...b, player: { ...b.player, riposte: true } };
    expect(guardFree(armed.player)).toBe(true);
    const keep = step(armed, "attack1", always);
    expect(keep.player.riposte).toBe(true); // Ataque 1 does not spend it
    const free = step(armed, "attack2", always);
    expect(free.player.hp).toBe(1000); // no Frenesí cost
    const paid = step(b, "attack2", always);
    expect(free.player.cooldown).toBe(paid.player.cooldown - 1);
    expect(free.player.riposte).toBe(false);
  });

  it("Aniquilación hits much harder below 33 % hp", () => {
    const hero = { ...unit("berserker"), skill: "aniquilacion" as const };
    const b = fight(hero, [unit("picaro", { hp: 5000 })], [[]]);
    const low = { ...b, player: { ...b.player, hp: 200 } };
    const dmg = (x: Battle) => x.enemies[0].hp - step(x, "attack3", always).enemies[0].hp;
    expect(dmg(low)).toBeGreaterThan(dmg(b) * 1.4);
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
    expect(after.log.some((l) => l.includes("prepara un ritual"))).toBe(true);
    expect(after.log.some((l) => l.includes("marchita") || l.includes("anula"))).toBe(true);
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

describe("Contraataque resolves within the round", () => {
  const caballero = { ...generateCharacter(createRng(3), "caballero"), skill: "contraataque" as const };
  const foe = generateCharacter(createRng(9), "mago");
  // seed 1 and 3: the hero acts first; seed 2: the enemy opens the round
  for (const seed of [1, 2, 3])
    it(`returns the hit of the round either way (seed ${seed})`, () => {
      const rng = createRng(seed);
      const b = step(startBattle(caballero, [foe], rng), "attack3", rng);
      expect(b.log.some((l) => /devuelve \d+ a/.test(l))).toBe(true);
      expect(b.enemies[0].hp).toBeLessThan(foe.stats.hp);
      expect(b.player.reflect ?? 0).toBe(0); // nothing is left charged for the next round
    });
});
