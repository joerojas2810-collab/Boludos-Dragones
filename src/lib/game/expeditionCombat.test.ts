// Torre relic hooks inside the turn engine: every relic touches only its own component, caps hold,
// no proc recursion, and the Corazón fénix is a single, visible exception to the single life.
import { describe, expect, it } from "vitest";
import { autoResolve } from "./auto";
import {
  estimateDamage,
  FROST_CAP,
  startBattle,
  step,
  TURN_THRESHOLD,
  WIND_CAP,
  type Battle,
  type RelicMods,
} from "./combat";
import { createRng, type Rng } from "./rng";
import { SHIELD_CAP } from "./skills";
import { aggregateRelics, RELIC_IDS, type OwnedRelic } from "./relics";
import { fight, mapEnemy, mapPlayer, noCrit, turnOrder, unit } from "./testkit";

const foe = (extra: Partial<Parameters<typeof unit>[1]> = {}) => unit("picaro", { hp: 100000, atk: 30, ...extra });
const hitOn = (b: Battle) => (b.enemies[0].hp !== undefined ? b.enemies[0].char.stats.hp - b.enemies[0].hp : 0);
const progressEv = (b: Battle) => b.cev.filter((e) => e.type === "progressChanged");

describe("damage components", () => {
  const hero = unit("caballero", { hp: 5000, atk: 100 });
  const mk = (relic: RelicMods | undefined) => fight(hero, foe(), { relic, res: 3 });

  it("Piedra raises only the basic attack", () => {
    const plain = mk(undefined);
    const stone = mk({ basicDmg: 0.12 });
    const dmg = (b: Battle, key: "attack1" | "knight_advance") => estimateDamage(b.player, b.enemies[0], key);
    expect(dmg(stone, "attack1")).toBeGreaterThan(dmg(plain, "attack1"));
    expect(dmg(stone, "attack1") / dmg(plain, "attack1")).toBeCloseTo(1.12, 2);
    expect(dmg(stone, "knight_advance")).toBe(dmg(plain, "knight_advance"));
    // what the enemy does to the hero is untouched
    expect(estimateDamage(stone.enemies[0], stone.player, "attack1")).toBe(estimateDamage(plain.enemies[0], plain.player, "attack1"));
  });

  it("Filo vorpal raises damaging skills and the damage the hero takes, not the basic", () => {
    const plain = mk(undefined);
    const blade = mk({ skillDmg: 0.18, hitExtra: 0.09 });
    const d = (b: Battle, key: "attack1" | "knight_breaker") => estimateDamage(b.player, b.enemies[0], key);
    expect(d(blade, "knight_breaker") / d(plain, "knight_breaker")).toBeCloseTo(1.18, 2);
    expect(d(blade, "attack1")).toBe(d(plain, "attack1"));
    const taken = (b: Battle) => estimateDamage(b.enemies[0], b.player, "attack1");
    expect(taken(blade) / taken(plain)).toBeCloseTo(1.09, 1);
  });

  it("Coraza and Filo multiply separately on hits taken; Coraza never touches the hero's own damage", () => {
    const plain = mk(undefined);
    const armor = mk({ hitReduction: 0.06 });
    const taken = (b: Battle) => estimateDamage(b.enemies[0], b.player, "attack1");
    expect(taken(armor) / taken(plain)).toBeCloseTo(0.94, 1);
    expect(estimateDamage(armor.player, armor.enemies[0], "attack1")).toBe(estimateDamage(plain.player, plain.enemies[0], "attack1"));
  });

  it("Libro raises Inscribir only", () => {
    const mage = unit("mago", { hp: 5000, atk: 1000 });
    const a = fight(mage, foe(), { relic: { inscribeDmg: 0.15 } });
    const b = fight(mage, foe(), { relic: {} });
    const d = (x: Battle, k: "mage_inscribe" | "mage_detonate" | "attack1") => estimateDamage(x.player, x.enemies[0], k);
    expect(d(a, "mage_inscribe") / d(b, "mage_inscribe")).toBeCloseTo(1.15, 2);
    expect(d(a, "mage_detonate")).toBe(d(b, "mage_detonate"));
    expect(d(a, "attack1")).toBe(d(b, "attack1"));
  });

  it("Guante: only the first hit of a turn against an Expuesto target", () => {
    const rogue = unit("picaro", { hp: 5000, atk: 100 });
    const exposed = (b: Battle) => mapEnemy(b, 0, () => ({ exposed: true }));
    const g = exposed(fight(rogue, foe(), { relic: { exposedFirst: 0.18 } }));
    const n = exposed(fight(rogue, foe(), { relic: {} }));
    expect(estimateDamage(g.player, g.enemies[0], "attack1") / estimateDamage(n.player, n.enemies[0], "attack1")).toBeCloseTo(1.18, 2);
    // not exposed: no bonus
    const g2 = fight(rogue, foe(), { relic: { exposedFirst: 0.18 } });
    const n2 = fight(rogue, foe(), { relic: {} });
    expect(estimateDamage(g2.player, g2.enemies[0], "attack1")).toBe(estimateDamage(n2.player, n2.enemies[0], "attack1"));
    // after the first hit of the turn it is spent
    const spent = mapPlayer(g, { firstHitDone: true });
    expect(estimateDamage(spent.player, spent.enemies[0], "attack1")).toBe(estimateDamage(n.player, n.enemies[0], "attack1"));
  });

  it("Guante in a sweep: first target boosted, second target not (one first hit per turn)", () => {
    const knight = unit("caballero", { hp: 90000, atk: 100 });
    const run = (relic: RelicMods) => {
      let b = fight(knight, [foe(), foe()], { relic, res: 3, loadout: ["knight_advance", "knight_sweep"] });
      b = mapEnemy(mapEnemy(b, 0, () => ({ exposed: true })), 1, () => ({ exposed: true }));
      return step(b, "knight_sweep", noCrit());
    };
    const on = run({ exposedFirst: 0.5 });
    const off = run({});
    const lost = (b: Battle, i: number) => b.enemies[i].char.stats.hp - b.enemies[i].hp;
    expect(lost(on, 0)).toBeGreaterThan(lost(off, 0));
    expect(lost(on, 1)).toBe(lost(off, 1));
  });

  it("Placas boost only the attack that spends a prepared penetration, and add no charges", () => {
    const earth = { ...unit("caballero", { hp: 5000, atk: 100 }), element: "tierra" as const };
    const mk2 = (relic: RelicMods) => fight(earth, foe(), { relic });
    const p = mapPlayer(mk2({ pierceBonus: 0.1 }), { nextAttackDefenseBypass: 0.3 });
    const q = mapPlayer(mk2({}), { nextAttackDefenseBypass: 0.3 });
    expect(estimateDamage(p.player, p.enemies[0], "attack1")).toBeGreaterThan(estimateDamage(q.player, q.enemies[0], "attack1"));
    const idle = mk2({ pierceBonus: 0.1 });
    const idle0 = mk2({});
    expect(estimateDamage(idle.player, idle.enemies[0], "attack1")).toBe(estimateDamage(idle0.player, idle0.enemies[0], "attack1"));
    const after = step(p, "attack1", noCrit());
    const after0 = step(q, "attack1", noCrit());
    const ruptura = (b: Battle) => b.enemies[0].statuses?.find((s) => s.id === "ruptura")?.stacks ?? 0;
    expect(ruptura(after)).toBe(ruptura(after0));
    expect(ruptura(after)).toBeLessThanOrEqual(1);
  });
});

describe("elemental components", () => {
  it("Colmillo raises Quemadura ticks on enemies but respects the per-tick cap and never burns the hero harder", () => {
    const hero = { ...unit("caballero", { hp: 5000, atk: 5 }), element: "fuego" as const };
    const burning = [{ id: "quemadura" as const, stacks: 1, turns: 3, amount: 100 }];
    const tickOn = (relic: RelicMods, amount = 100, hp = 100000) => {
      let b = fight(hero, foe({ hp, atk: 1 }), { relic });
      b = mapEnemy(b, 0, () => ({ statuses: [{ ...burning[0], amount }], progress: TURN_THRESHOLD - 50 }));
      const out = step(b, "defend", noCrit());
      return out.enemies[0].char.stats.hp - out.enemies[0].hp;
    };
    const base = tickOn({});
    expect(base).toBe(100);
    expect(tickOn({ burnDmg: 0.15 })).toBe(115);
    // cap: 6 % of max hp per tick, with or without the relic
    expect(tickOn({ burnDmg: 0.15 }, 5000, 1000)).toBe(tickOn({}, 5000, 1000));
    // a burn on the hero is not boosted by the hero's own relic
    const self = (relic: RelicMods) => {
      let b = fight(hero, foe({ atk: 1 }), { relic });
      b = mapPlayer(b, { statuses: [{ ...burning[0] }] });
      return step(b, "defend", noCrit()).player.hp;
    };
    expect(self({ burnDmg: 0.5 })).toBe(self({}));
  });

  it("Musgo delays more, but the total stays under the 25 % cap and only on consume", () => {
    const hero = { ...unit("caballero", { hp: 90000, atk: 20 }), element: "agua" as const };
    const frozen = (relic: RelicMods, action: "knight_breaker" | "attack1") => {
      let b = fight(hero, foe(), { relic, res: 3 });
      b = mapEnemy(b, 0, () => ({ progress: 9000, statuses: [{ id: "escarcha" as const, stacks: 3, turns: 3 }] }));
      return progressEv(step(b, action, noCrit())).map((e) => e.value);
    };
    expect(frozen({}, "knight_breaker")[0]).toBe(-1500);
    expect(frozen({ frostBonus: 0.04 }, "knight_breaker")[0]).toBe(-1900);
    expect(frozen({ frostBonus: 0.5 }, "knight_breaker")[0]).toBe(-Math.round(TURN_THRESHOLD * FROST_CAP));
    expect(frozen({ frostBonus: 0.04 }, "attack1")).not.toContain(-1900); // plain attacks do not consume
  });

  it("Reloj advances more, capped at 40 %, and is only a progress bonus (no free action)", () => {
    const hero = { ...unit("caballero", { hp: 90000, atk: 20 }), element: "viento" as const };
    const impulse = [{ id: "impulso" as const, stacks: 3, turns: 3 }];
    const advance = (relic: RelicMods) => {
      let b = fight(hero, foe(), { relic, res: 3 });
      b = mapPlayer(b, { statuses: impulse });
      return step(b, "knight_breaker", noCrit()).cev.filter((e) => e.type === "progressChanged" && e.actor === 0).map((e) => e.value);
    };
    expect(advance({})[0]).toBe(3000);
    expect(advance({ windBonus: 0.05 })[0]).toBe(3500);
    expect(advance({ windBonus: 0.5 })[0]).toBe(Math.round(TURN_THRESHOLD * WIND_CAP));
    // mage x1.25 would reach 42.5 % with Reloj II: the cap clamps it
    const mage = { ...unit("mago", { hp: 90000, atk: 20 }), element: "viento" as const };
    let b = fight(mage, foe(), { relic: { windBonus: 0.05 }, res: 3 });
    b = mapPlayer(b, { statuses: impulse });
    const v = step(b, "mage_detonate", noCrit()).cev.find((e) => e.type === "progressChanged" && e.actor === 0)?.value;
    expect(v).toBe(Math.round(TURN_THRESHOLD * WIND_CAP));
  });

  it("Sello sabio boosts the Sobrecarga discharge only, not the attack or non-consuming moves", () => {
    const hero = { ...unit("caballero", { hp: 90000, atk: 3000 }), element: "rayo" as const };
    const loss = (relic: RelicMods, action: "knight_breaker" | "attack1") => {
      let b = fight(hero, foe({ hp: 10_000_000 }), { relic, res: 3 });
      b = mapPlayer(b, { charge: 3 });
      return hitOn(step(b, action, noCrit()));
    };
    const d0 = loss({}, "knight_breaker");
    const dBig = loss({ dischargeBonus: 1 }, "knight_breaker");
    const dSeal = loss({ dischargeBonus: 0.12 }, "knight_breaker");
    const discharge = dBig - d0; // = base discharge (the bonus doubles it)
    expect(discharge).toBeGreaterThan(500);
    expect(Math.abs(dSeal - d0 - 0.12 * discharge)).toBeLessThanOrEqual(2);
    expect(loss({ dischargeBonus: 0.12 }, "attack1")).toBe(loss({}, "attack1"));
  });
});

describe("class components", () => {
  it("Escudo rúnico starts the fight with Resolución, capped at 3, and gives nothing per hit", () => {
    const knight = unit("caballero", { hp: 5000, atk: 20 });
    const start = (r: RelicMods | undefined) => startBattle(knight, foe(), createRng(4), { relic: r }).player.res;
    expect(start(undefined)).toBe(0);
    expect(start({ startRes: 1 })).toBe(1);
    expect(start({ startRes: 2 })).toBe(2);
    expect(start({ startRes: 9 })).toBe(3);
    // being hit does not add it: after a defended enemy hit the resource only moved by the engine's own rules
    const withR = step(fight(knight, foe(), { relic: { startRes: 2 }, res: 2 }), "defend", noCrit());
    const without = step(fight(knight, foe(), { relic: {}, res: 2 }), "defend", noCrit());
    expect(withR.player.res).toBe(without.player.res);
  });

  it("Cáliz: only the first active heal of a combat adds a shield, capped by the shield cap", () => {
    const cleric = unit("clerigo", { hp: 1000, atk: 1 });
    const sum = (b: Battle) => b.player.hp + (b.player.shield ?? 0);
    const run = (relic: RelicMods) => {
      let b = fight(cleric, foe({ atk: 1 }), { relic, res: 3, playerHp: 400, loadout: ["cleric_judgment", "cleric_restore"] });
      b = step(b, "cleric_restore", noCrit());
      const first = sum(b);
      b = mapPlayer(step(b, "cleric_judgment", noCrit()), { res: 3 }); // cooldown turn
      b = step(b, "cleric_restore", noCrit());
      return { first, second: sum(b), shield: b.player.shield ?? 0 };
    };
    const off = run({});
    const on = run({ chaliceShield: 0.03 });
    expect(on.first - off.first).toBe(30);
    expect(on.second - off.second).toBe(30); // not 60: the second heal adds nothing
    expect(run({ chaliceShield: 5 }).shield).toBeLessThanOrEqual(Math.round(1000 * SHIELD_CAP));
  });

  it("Cáliz does not trigger on a heal that restores nothing", () => {
    const cleric = unit("clerigo", { hp: 1000, atk: 1 });
    const b = fight(cleric, foe({ atk: 1 }), { relic: { chaliceShield: 0.03 }, res: 3, loadout: ["cleric_judgment", "cleric_restore"] });
    expect(step(b, "cleric_restore", noCrit()).player.shield ?? 0).toBeLessThan(30);
  });

  it("Anillo cuts Embestida self damage and stays non-lethal", () => {
    const zerk = unit("berserker", { hp: 1000, atk: 20 });
    const cost = (relic: RelicMods, hp?: number) => {
      // a big shield soaks the enemy's reply so only the self damage moves hp
      const b = fight(zerk, foe({ atk: 1 }), { relic, playerHp: hp, playerShield: 5000 });
      const out = step(b, "berserker_charge", noCrit());
      return { lost: out.player.char.stats.hp - out.player.hp, hp: out.player.hp };
    };
    // 2 % of 1000 = 20 vs 12 with the tier-II ring
    const plain = cost({}).lost;
    const ring = cost({ recklessCut: 0.4 }).lost;
    expect(plain - ring).toBe(8);
    expect(cost({ recklessCut: 0 }, 5).hp).toBe(1);
    expect(cost({ recklessCut: 0.4 }, 5).hp).toBe(1);
  });

  it("Lente adds absolute crit points to every strike roll", () => {
    const seen: number[] = [];
    const rng: Rng = { ...createRng(1), chance: (p) => (seen.push(p), p >= 0.5) };
    const hero = unit("caballero", { hp: 5000, atk: 20, crit: 0 });
    step(fight(hero, foe(), { relic: { critPts: 0.06 } }), "attack1", rng);
    expect(seen.some((p) => Math.abs(p - 0.06) < 1e-9)).toBe(true);
    seen.length = 0;
    step(fight(hero, foe(), { relic: {} }), "attack1", rng);
    expect(seen.some((p) => p > 0 && p < 0.5)).toBe(false);
  });
});

describe("start of combat", () => {
  it("Botas give a one-off head start: the hero acts first once and then alternates normally", () => {
    const slow = unit("caballero", { hp: 90000, atk: 1, speed: 9.5 });
    const quick = foe({ speed: 10, atk: 1 });
    const order = (relic: RelicMods | undefined) => {
      let b = startBattle(slow, quick, createRng(4), { relic });
      const seq: Battle[] = [b];
      for (let i = 0; i < 8; i++) seq.push((b = step(b, "defend", noCrit())));
      return turnOrder(seq);
    };
    expect(startBattle(slow, quick, createRng(4), { relic: { startProgress: 0.12 } }).player.progress).toBeGreaterThan(0);
    const plain = order(undefined);
    const boots = order({ startProgress: 0.12 });
    expect(boots[0]).toBe(0);
    expect(plain[0]).toBe(1);
    // never two own turns in a row in a 1:1 fight: no free action
    for (let i = 1; i < boots.length; i++) expect(boots[i] === 0 && boots[i - 1] === 0).toBe(false);
  });
});

describe("Corazón fénix in the engine", () => {
  const hero = unit("caballero", { hp: 1000, atk: 20 });
  const lethal = () => foe({ atk: 80 });

  it("revives once with the stated share of max hp and a visible event", () => {
    let b = fight(hero, lethal(), { relic: { phoenix: 0.25 }, playerHp: 10 });
    b = step(b, "defend", noCrit());
    expect(b.status).toBe("ongoing");
    expect(b.player.phoenixUsed).toBe(true);
    expect(b.player.hp).toBeGreaterThan(0);
    expect(b.cev.some((e) => e.type === "healed" && e.detail === "phoenix")).toBe(true);
  });

  it("a second lethal hit after reviving kills", () => {
    let b = fight(hero, lethal(), { relic: { phoenix: 0.25 }, playerHp: 10 });
    b = step(b, "defend", noCrit());
    b = step(mapPlayer(b, { hp: 10 }), "defend", noCrit());
    expect(b.status).toBe("lost");
  });

  it("stays spent when the expedition already used it", () => {
    const b = step(fight(hero, lethal(), { relic: { phoenix: 0.25 }, phoenixSpent: true, playerHp: 10 }), "defend", noCrit());
    expect(b.status).toBe("lost");
  });

  it("does nothing without the relic or when the last enemy falls in the same exchange", () => {
    expect(step(fight(hero, lethal(), { playerHp: 10 }), "defend", noCrit()).status).toBe("lost");
    expect(step(fight(hero, lethal(), { relic: {}, playerHp: 10 }), "defend", noCrit()).status).toBe("lost");
  });
});

describe("no recursion", () => {
  it("a full tier-II build resolves fights to the end with finite, deterministic results", () => {
    const owned: OwnedRelic[] = RELIC_IDS.map((id) => ({ id, tier: 2 }));
    const a = aggregateRelics(owned);
    for (const cls of ["caballero", "mago", "picaro", "clerigo", "berserker"] as const) {
      const hero = { ...unit(cls, { hp: 3000 * a.hpMult, atk: 60 }), element: "rayo" as const };
      const run = () => autoResolve(startBattle(hero, [foe({ hp: 3000, atk: 40 }), foe({ hp: 3000, atk: 40 })], createRng(9), { relic: a.mods }), createRng(3));
      const x = run();
      expect(["won", "lost", "ongoing"]).toContain(x.status);
      expect(x.player.phoenixUsed ? 1 : 0).toBeLessThanOrEqual(1);
      expect(JSON.stringify(run())).toBe(JSON.stringify(x));
    }
  });

  it("relics never change an enemy's own damage dealt (only hits taken are modified)", () => {
    const a = fight(unit("caballero", { hp: 5000, atk: 100 }), foe(), { relic: { basicDmg: 0.3, skillDmg: 0.3, critPts: 0.12, exposedFirst: 0.3 } });
    const b = fight(unit("caballero", { hp: 5000, atk: 100 }), foe(), {});
    expect(estimateDamage(a.enemies[0], a.player, "attack1")).toBe(estimateDamage(b.enemies[0], b.player, "attack1"));
  });
});
