// The nine boss rules and enemy enrage on the turn contract (docs/ideal/01 §3.2, §7).
import { describe, expect, it } from "vitest";
import {
  estimateDamage,
  rateOf,
  RATE_MAX,
  startBattle,
  step,
  type Battle,
  type Intent,
} from "./combat";
import {
  armorBrokenRounds,
  ARMOR_FRACTION,
  ARMOR_TAKEN,
  armorRegrow,
  BROKEN_TAKEN,
  bossAscensionNotice,
  BOSS_RULE,
  ENRAGE_AFTER_OWN_TURN,
  ENRAGE_STEP,
  EXTRA_IMPACT,
  HEAD_HEAL,
  headThresholds,
  hungerBelow,
  HUNGER_STEAL,
  MAX_EXTRA_IMPACTS,
  plagueLoss,
  PRESSURE_MAX,
  PRESSURE_STEP,
  pressureGain,
  rampInterval,
  RAMP_MAX,
  ritualEvery,
  RITUAL_HEAL_CUT,
  RITUAL_ROUNDS,
  stanceFor,
  stanceLength,
  STANCES,
} from "./bossRules";
import { createRng } from "./rng";
import type { StatusEffect } from "./statuses";
import { fight, mapEnemy, mapPlayer, noCrit, unit, withIntents, withProgress } from "./testkit";

const ev = (b: Battle, type: string) => b.cev.filter((e) => e.type === type);
const boss = (bossId: string, over: Record<string, number> = {}, extra = {}) =>
  unit("berserker", { hp: 1000, atk: 40, ...over }, { bossId, name: `Jefe ${bossId}`, ...extra });
const hero = (over: Record<string, number> = {}, cls: "picaro" | "clerigo" | "caballero" = "picaro") =>
  unit(cls, { hp: 1000, atk: 1, ...over });

/** Hero (progress 0) awaiting, the boss ready: exactly one boss turn per hero step from here. */
const duel = (h = hero(), b = boss("lord_of_flies"), asc = 0, intent?: Intent): Battle =>
  withProgress(fight(h, b, { ascension: asc, ...(intent && { intents: [intent] }) }), { 0: 0, 1: 10_000 });

/** Plays n hero steps re-announcing `intent` before each one. */
const play = (b: Battle, n: number, intent: Intent = "defend", action: "defend" | "attack1" = "defend"): Battle[] => {
  const out: Battle[] = [];
  let cur = b;
  for (let i = 0; i < n; i++) {
    cur = step(withIntents(cur, [intent]), action, noCrit());
    out.push(cur);
  }
  return out;
};

describe("registry", () => {
  it("nine bosses, nine distinct rules", () => {
    expect(Object.keys(BOSS_RULE)).toHaveLength(9);
    expect(new Set(Object.values(BOSS_RULE)).size).toBe(9);
  });

  it("ascension notices speak of own turns, never rounds", () => {
    for (const route of Object.keys(BOSS_RULE))
      for (const a of [1, 3, 5]) expect(bossAscensionNotice(route, a).toLowerCase()).not.toContain("ronda");
  });
});

describe("enrage by personal turns", () => {
  it("+5 % ATQ per own turn after the 30th, compounding; the global turn counter is irrelevant", () => {
    const base = duel(hero({ hp: 1e9 }), unit("picaro", { hp: 1e9, atk: 10 }));
    const atk = (b: Battle) => b.enemies[0].char.stats.atk;
    // a late global turn does not enrage an enemy that has barely acted
    const fresh = play({ ...base, turn: 500 }, 1)[0];
    expect(atk(fresh)).toBe(10);
    // right before the threshold nothing changes
    const edge = mapEnemy(base, 0, () => ({ ownTurns: ENRAGE_AFTER_OWN_TURN - 2 }));
    expect(atk(play(edge, 1)[0])).toBe(10); // ownTurns = 29 after its turn
    // past it, +5 % every own turn
    const late = mapEnemy(base, 0, () => ({ ownTurns: ENRAGE_AFTER_OWN_TURN }));
    const [one, two] = play(late, 2);
    expect(atk(one)).toBeCloseTo(10 * (1 + ENRAGE_STEP));
    expect(atk(two)).toBeCloseTo(10 * (1 + ENRAGE_STEP) ** 2);
  });
});

describe("Moscas (plaga)", () => {
  it("drains a share of the hero's max hp at the end of each boss turn; not a cleansable status", () => {
    const b = duel(hero(), boss("lord_of_flies"));
    const [s] = play(b, 1);
    expect(s.player.hp).toBe(1000 - Math.round(1000 * plagueLoss(0)));
    expect(s.player.statuses?.length ?? 0).toBe(0);
    // two boss turns in one hero step => twice (no transferred hero actions either)
    const fast = withProgress(duel(hero({ speed: 7.5 }), boss("lord_of_flies", { speed: 15 })), { 0: 0, 1: 10_000 });
    const [t] = play(fast, 1);
    const bossTurns = ev(t, "actionCommitted").filter((e) => e.actor === 1).length;
    expect(bossTurns).toBeGreaterThanOrEqual(2);
    expect(t.log.slice(fast.log.length).filter((l) => l.includes("plaga"))).toHaveLength(bossTurns);
  });

  it("ascension raises the drain", () => {
    expect(plagueLoss(5)).toBeGreaterThan(plagueLoss(0));
    const [s] = play(duel(hero(), boss("lord_of_flies"), 5), 1);
    expect(s.player.hp).toBe(1000 - Math.round(1000 * plagueLoss(5)));
  });

  it("a Cleric's Purificar cannot remove it (it is not a status)", () => {
    let b = duel(hero({}, "clerigo"), boss("lord_of_flies"));
    b = mapPlayer({ ...b, player: { ...b.player, loadout: ["cleric_cleanse", "cleric_judgment"] } }, { res: 3 });
    const before = b.log.length;
    const s = step(withIntents(b, ["defend"]), "cleric_cleanse", noCrit());
    expect(s.log.slice(before).some((l) => l.includes("plaga"))).toBe(true);
    expect(s.player.hp).toBeLessThan(b.player.hp + Math.round(1000 * 0.008)); // the drain still landed
  });
});

describe("Ceniza (presión)", () => {
  it("+1 pressure per own turn (asc 0), capped at 5; +6 % damage per level", () => {
    const states = play(duel(hero({ hp: 1e9 }), boss("ash_king", { hp: 1e9 })), 7);
    expect(states.map((s) => s.enemies[0].boss!.pressure)).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(PRESSURE_MAX).toBe(5);
    const b = duel(hero(), boss("ash_king"));
    const at = (p: number) => estimateDamage({ ...b.enemies[0], boss: { ...b.enemies[0].boss!, pressure: p } }, b.player, "attack1");
    expect(at(5) / at(0)).toBeCloseTo(1 + PRESSURE_STEP * 5, 1);
  });

  it("ascension speeds up the build-up", () => {
    const [s] = play(duel(hero({ hp: 1e9 }), boss("ash_king", { hp: 1e9 }), 2), 1);
    expect(s.enemies[0].boss!.pressure).toBe(pressureGain(2));
    expect(pressureGain(2)).toBe(2);
  });

  it("a perfect guard against its strong hit resets pressure after the hit, without re-adding it", () => {
    let b = duel(hero({ hp: 1e9 }), boss("ash_king", { hp: 1e9 }), 0, "attack2");
    b = mapEnemy(b, 0, (e) => ({ boss: { ...e.boss!, pressure: 3 } }));
    const s = step(b, "defend", noCrit());
    expect(ev(s, "guardTriggered")).toHaveLength(1);
    expect(s.enemies[0].boss!.pressure).toBe(0); // not 1
    expect(s.enemies[0].boss!.pressureReset).toBe(false); // marker consumed in the same close
    // the next boss turn grows normally again
    const [next] = play(s, 1);
    expect(next.enemies[0].boss!.pressure).toBe(1);
  });

  it("a strong hit without guard, or a guard against a normal attack, keeps the pressure", () => {
    let b = duel(hero({ hp: 1e9 }), boss("ash_king", { hp: 1e9 }), 0, "attack2");
    b = mapEnemy(b, 0, (e) => ({ boss: { ...e.boss!, pressure: 3 } }));
    expect(step(b, "attack1", noCrit()).enemies[0].boss!.pressure).toBe(4);
    const weak = withIntents(b, ["attack1"]);
    expect(step(weak, "defend", noCrit()).enemies[0].boss!.pressure).toBe(4);
  });
});

describe("Vigía (aprende)", () => {
  const watcher = () => duel(hero({ atk: 400, hp: 1e9 }), boss("eternal_watcher", { hp: 1e9, atk: 1 }));
  const dealt = (before: Battle, after: Battle) => before.enemies[0].hp - after.enemies[0].hp;

  it("the third identical action in a row deals 75 %", () => {
    const b0 = watcher();
    const a = step(withIntents(b0, ["attack1"]), "attack1", noCrit());
    const b = step(withIntents(a, ["attack1"]), "attack1", noCrit());
    const c = step(withIntents(b, ["attack1"]), "attack1", noCrit());
    const first = dealt(b0, a);
    expect(dealt(a, b)).toBe(first);
    expect(dealt(b, c) / first).toBeCloseTo(0.75, 1);
  });

  it("two different skills are not punished even though both are 'attack_2'-like", () => {
    let b = mapPlayer(watcher(), { res: 3, loadout: ["rogue_feint", "rogue_finish"] });
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, defending: false })) };
    const a = step(withIntents(b, ["attack1"]), "rogue_feint", noCrit());
    const b2 = step(withIntents(a, ["attack1"]), "rogue_finish", noCrit());
    const c = step(withIntents(b2, ["attack1"]), "rogue_feint", noCrit());
    expect(c.log.some((l) => l.includes("te lee"))).toBe(false);
    expect(ev(c, "hit").some((e) => e.actor === 0)).toBe(true);
  });

  it("basic and Defender have their own identity: basic, defend, basic is not a repetition", () => {
    const b0 = watcher();
    const a = step(withIntents(b0, ["attack1"]), "attack1", noCrit());
    const d = step(withIntents(a, ["attack1"]), "defend", noCrit());
    const c = step(withIntents(d, ["attack1"]), "attack1", noCrit());
    expect(c.log.some((l) => l.includes("te lee"))).toBe(false);
  });

  it("remembers the last 2 (asc 0) and adapts faster with ascension", () => {
    let b = watcher();
    const once = step(withIntents(b, ["attack1"]), "attack1", noCrit());
    expect(once.enemies[0].boss!.last).toEqual(["attack1"]);
    b = duel(hero({ atk: 400, hp: 1e9 }), boss("eternal_watcher", { hp: 1e9, atk: 1 }), 3);
    const x = step(withIntents(b, ["attack1"]), "attack1", noCrit());
    const y = step(withIntents(x, ["attack1"]), "attack1", noCrit());
    expect(y.log.some((l) => l.includes("te lee"))).toBe(true); // already on the second repetition
  });
});

describe("Coloso (armadura)", () => {
  const colossus = (asc = 0) => duel(hero({ atk: 5000, hp: 1e9 }), boss("hollow_colossus", { hp: 100_000, atk: 1 }), asc);

  it("has an armor bar instead of the generic Aguante (as stage.ts opens it: enemyAguante on)", () => {
    const plain = startBattle(hero(), boss("hollow_colossus"), createRng(2));
    expect(plain.enemies[0].shield).toBe(Math.round(1000 * ARMOR_FRACTION));
    expect(plain.enemies[0].aguante).toBeUndefined();
    const asStage = startBattle(hero(), boss("hollow_colossus"), createRng(2), { enemyAguante: true });
    expect(asStage.enemies[0].aguante).toBeUndefined();
    expect(asStage.enemies[0].aguanteMax).toBeUndefined();
  });

  it("takes reduced damage while the armor holds, extra while Roto", () => {
    const b = colossus();
    const e = b.enemies[0];
    const armored = estimateDamage(b.player, e, "attack1");
    const bare = estimateDamage(b.player, { ...e, shield: 0 }, "attack1");
    const broken = estimateDamage(b.player, { ...e, shield: 0, boss: { ...e.boss!, broken: 2 } }, "attack1");
    expect(armored / bare).toBeCloseTo(ARMOR_TAKEN, 1);
    expect(broken / bare).toBeCloseTo(BROKEN_TAKEN, 1);
  });

  it("breaking the armor announces Roto; recovery is announced a turn ahead and never shortens Roto", () => {
    for (const asc of [0, 1, 2, 3, 4, 5]) {
      let b = colossus(asc);
      b = mapEnemy(b, 0, () => ({ shield: 1 })); // one hit breaks it
      b = step(withIntents(b, ["defend"]), "attack1", noCrit());
      expect(b.enemies[0].shield).toBe(0);
      expect(ev(b, "bossPhaseChanged").some((e) => e.detail === "roto")).toBe(true);
      const broken0 = armorBrokenRounds(asc);
      // after the break the colossus's own turn already ran once
      let rebuiltAt = -1;
      let announcedAt = -1;
      for (let i = 0; i < 12 && rebuiltAt < 0; i++) {
        const st = b.enemies[0].boss!;
        if (st.regrow > 0) expect(st.regrow).toBeGreaterThan(st.broken); // recovery never cuts Roto short
        if (b.enemies[0].intent === "rebuild" && announcedAt < 0) announcedAt = i;
        b = step(b, "defend", noCrit());
        if ((b.enemies[0].shield ?? 0) > 0) rebuiltAt = i;
      }
      expect(rebuiltAt).toBeGreaterThanOrEqual(0);
      expect(announcedAt).toBe(rebuiltAt); // announced the own turn before the rebuild
      expect(b.enemies[0].boss!.broken).toBe(0);
      expect(b.enemies[0].shield).toBe(Math.round(100_000 * ARMOR_FRACTION));
      expect(armorRegrow(asc)).toBeGreaterThanOrEqual(2);
      expect(broken0).toBeGreaterThanOrEqual(1);
    }
  });

  it("Roto lasts armorBrokenRounds own turns", () => {
    for (const asc of [0, 2, 4]) {
      let b = colossus(asc);
      b = mapEnemy(b, 0, () => ({ shield: 1 }));
      b = step(withIntents(b, ["defend"]), "attack1", noCrit());
      // the boss already closed one turn (broken - 1) when the step ended
      expect(b.enemies[0].boss!.broken).toBe(Math.max(0, armorBrokenRounds(asc) - 1));
      expect(b.enemies[0].boss!.regrow).toBeGreaterThan(b.enemies[0].boss!.broken);
    }
  });

  it("breaking attacks bite the armor without extra damage to life", () => {
    const f = fight(unit("caballero", { hp: 1e9, atk: 20 }), boss("hollow_colossus", { hp: 1_000_000, atk: 1 }), { res: 3 });
    const shield0 = f.enemies[0].shield!;
    const brk = step(withIntents(f, ["defend"]), "knight_breaker", noCrit());
    const adv = step(withIntents(f, ["defend"]), "knight_advance", noCrit());
    const dBrk = estimateDamage(f.player, f.enemies[0], "knight_breaker");
    expect(brk.enemies[0].hp).toBe(f.enemies[0].hp); // everything on the armor
    expect(shield0 - brk.enemies[0].shield!).toBe(dBrk + Math.round(dBrk * (1.25 - 0.25)));
    expect(adv.enemies[0].hp).toBe(f.enemies[0].hp);
  });
});

describe("Trueno (velocidad)", () => {
  it("+1 ramp every rampInterval own turns up to the max (asc 3: every turn)", () => {
    for (const asc of [0, 3]) {
      // hero faster than the boss ever gets, so the loop sees every boss turn
      const states = play(duel(hero({ hp: 1e9, speed: 15 }), boss("thunder_king", { hp: 1e9, atk: 1, speed: 10 }), asc), 40, "attack1");
      for (const s of states) {
        const b = s.enemies[0].boss!;
        expect(b.ramp).toBe(Math.min(RAMP_MAX, Math.floor(b.turns / rampInterval(asc))));
      }
      expect(Math.max(...states.map((s) => s.enemies[0].boss!.ramp))).toBe(RAMP_MAX);
    }
    expect(rampInterval(0)).toBe(2);
    expect(rampInterval(3)).toBe(1);
  });

  it("the global rate cap still bounds the boss", () => {
    const b = duel(hero({ hp: 1e9 }), boss("thunder_king", { hp: 1e9, atk: 1, speed: 14 }));
    const maxed = mapEnemy(b, 0, (e) => ({ boss: { ...e.boss!, ramp: RAMP_MAX } }));
    expect(rateOf(maxed.enemies[0])).toBe(RATE_MAX);
    expect(rateOf(b.enemies[0])).toBeLessThan(RATE_MAX);
  });
});

describe("Hidra (cabezas)", () => {
  const hydra = (hpNow = 1000) =>
    mapEnemy(duel(hero({ atk: 750, hp: 1e9 }), boss("mother_hydra", { hp: 1000, atk: 40 }), 0, "defend"), 0, () => ({ hp: hpNow }));

  it("one big hit crossing two thresholds resolves each once: +10 % heal and +1 head each", () => {
    const s = step(hydra(), "attack1", noCrit()); // 600 damage: 1000 -> 400, crossing 75 % and 50 %
    const e = s.enemies[0];
    expect(e.boss!.heads).toBe(2);
    expect(e.boss!.crossed).toBe(0b011);
    expect(e.hp).toBe(400 + 2 * Math.round(1000 * HEAD_HEAL));
    expect(ev(s, "bossPhaseChanged").filter((x) => x.detail === "cabeza")).toHaveLength(1); // one event per hit
  });

  it("a hit crossing all three gives max 3 heads; later hits never re-resolve a threshold", () => {
    const all = step(mapPlayer(hydra(), { char: { ...hydra().player.char, stats: { ...hydra().player.char.stats, atk: 1125 } } }), "attack1", noCrit());
    expect(all.enemies[0].boss!.heads).toBe(MAX_EXTRA_IMPACTS);
    expect(all.enemies[0].boss!.crossed).toBe(0b111);
    const first = step(hydra(), "attack1", noCrit());
    const small = mapPlayer(mapEnemy(withIntents(first, ["attack1"]), 0, () => ({ defending: false })), { char: { ...first.player.char, stats: { ...first.player.char.stats, atk: 125 } } });
    const hp0 = small.enemies[0].hp; // 600
    const after = step(small, "attack1", noCrit()); // 100 damage: 600 -> 500, touching the 50 % line again
    expect(after.enemies[0].boss!.crossed).toBe(0b011); // nothing re-resolved
    expect(after.enemies[0].hp).toBe(hp0 - 100); // no heal either
  });

  it("heads add limited extra impacts on the next multi-hit action: no extra turn, no extra charges", () => {
    let b = hydra();
    b = mapEnemy(b, 0, (e) => ({ boss: { ...e.boss!, heads: 2 }, applies: true }));
    const s = step(withIntents(mapPlayer(b, { char: { ...b.player.char, stats: { ...b.player.char.stats, atk: 1 } } }), ["attack2"]), "defend", noCrit());
    const hits = ev(s, "hit").filter((e) => e.actor === 1);
    expect(hits).toHaveLength(3);
    const main = estimateDamage(b.enemies[0], { ...b.player, defending: true, guard: true }, "attack2");
    const extra = Math.round(estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1") * EXTRA_IMPACT);
    expect(hits.map((h) => h.value)).toEqual([main, extra, extra]);
    expect(s.enemies[0].boss!.heads).toBe(0);
    // one strong action (the extra impacts are not extra actions); Escarcha slows the hero afterwards
    expect(ev(s, "actionCommitted").filter((e) => e.actor === 1 && e.detail === "attack2")).toHaveLength(1);
    expect(s.player.statuses?.filter((x) => x.id === "escarcha")).toHaveLength(1);
    expect(s.player.statuses?.find((x) => x.id === "escarcha")?.stacks).toBe(1);
  });

  it("ascension moves the thresholds up", () => {
    expect(headThresholds(5)[0]).toBeGreaterThan(headThresholds(0)[0]);
  });
});

describe("Reina Marchita (marchitar)", () => {
  const queen = (asc = 0) => duel(hero({ hp: 1e9 }), boss("withered_queen", { hp: 1e9, atk: 1 }), asc);

  it("prepares a ritual after every ritualEvery own turns and resolves it on the next one", () => {
    for (const asc of [0, 2]) {
      const every = ritualEvery(asc);
      let b = queen(asc);
      const announced: number[] = [];
      for (let i = 0; i < 80 && announced.length < 3; i++) {
        const before = b.log.length;
        b = step(withIntents(b, b.enemies[0].intent === "channeling" ? ["channeling"] : ["attack1"]), "attack1", noCrit());
        const n = b.enemies[0].ownTurns;
        const resolved = b.log.slice(before).some((l) => l.includes("completa su ritual"));
        if (resolved) expect(announced.at(-1)).toBe(n - 1); // resolved on the very next own turn
        if (ev(b, "telegraphStarted").some((e) => e.detail === "channeling")) announced.push(n);
      }
      expect(announced).toEqual([every, every * 2, every * 3]);
    }
  });

  it("Defender does NOT cancel the ritual (even with a perfect guard): Ruptura and halved heals follow", () => {
    let b = queen();
    b = withIntents(b, ["channeling"]);
    const s = step(b, "defend", noCrit());
    expect(ev(s, "guardTriggered")).toHaveLength(1); // the guard is still earned as a reward
    expect(ev(s, "telegraphCancelled")).toHaveLength(0);
    expect(s.log.some((l) => l.includes("completa su ritual"))).toBe(true);
    const rupt = s.player.statuses?.find((x) => x.id === "ruptura");
    expect(rupt?.stacks).toBe(1);
    expect(rupt?.turns).toBeLessThanOrEqual(2);
    expect(s.player.healCut).toBe(RITUAL_ROUNDS);
    expect(RITUAL_HEAL_CUT).toBe(0.5);
  });

  it("the ritual cannot resolve before the hero has had a turn", () => {
    const b = startBattle(hero({ hp: 1e9, speed: 7.5 }), boss("withered_queen", { hp: 1e9, atk: 1, speed: 15 }), createRng(3));
    expect(b.log.some((l) => l.includes("completa su ritual"))).toBe(false);
    expect(b.player.statuses?.some((x) => x.id === "ruptura")).toBeFalsy();
  });
});

describe("Sin Rostro (posturas)", () => {
  it("stances alternate every stanceLength own turns, announced before they take effect", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => stanceFor(n, 0))).toEqual(["ofensiva", "ofensiva", "defensiva", "defensiva", "ofensiva", "ofensiva"]);
    expect(stanceLength(0)).toBe(2);
    expect([1, 2, 3, 4].map((n) => stanceFor(n, 3))).toEqual(["ofensiva", "defensiva", "ofensiva", "defensiva"]);
    const states = play(duel(hero({ hp: 1e9 }), boss("faceless_one", { hp: 1e9, atk: 1 })), 5);
    const announced = states.map((s) => ev(s, "bossPhaseChanged").map((e) => e.detail));
    expect(announced).toEqual([[], ["defensiva"], [], ["ofensiva"], []]);
    // the stance in force while the next boss action resolves is the announced one
    expect(states.map((s) => s.enemies[0].boss!.stance)).toEqual(["ofensiva", "defensiva", "defensiva", "ofensiva", "ofensiva"]);
  });

  it("offensive: +30 % damage dealt / -20 % defense; defensive: -30 % / +30 %", () => {
    const b = duel(hero({ hp: 1e9, atk: 1000 }), boss("faceless_one", { hp: 1e9, atk: 4000, def: 100 }));
    const withStance = (s: "ofensiva" | "defensiva") => mapEnemy(b, 0, (e) => ({ boss: { ...e.boss!, stance: s } }));
    const dealt = (s: "ofensiva" | "defensiva") => estimateDamage(withStance(s).enemies[0], b.player, "attack1");
    expect(dealt("ofensiva") / dealt("defensiva")).toBeCloseTo(STANCES.ofensiva.dmg / STANCES.defensiva.dmg, 1);
    const taken = (s: "ofensiva" | "defensiva") => estimateDamage(b.player, withStance(s).enemies[0], "attack1");
    expect(taken("ofensiva")).toBeGreaterThan(taken("defensiva"));
  });
});

describe("Devorador (hambre)", () => {
  const eater = (hpNow: number, asc = 0) =>
    mapEnemy(duel(hero({ hp: 1e9 }), boss("great_devourer", { hp: 1000, atk: 40 }), asc, "attack1"), 0, () => ({ hp: hpNow }));

  it("heals 10 % of the life damage it deals", () => {
    const b = eater(900);
    const s = step(b, "defend", noCrit());
    const dmg = estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1");
    expect(s.enemies[0].hp).toBe(900 + Math.round(dmg * HUNGER_STEAL));
  });

  it("under 30 % its next attack adds one 35 % impact, with no extra turn", () => {
    const low = step(eater(250), "defend", noCrit());
    const hits = ev(low, "hit").filter((e) => e.actor === 1);
    expect(hits).toHaveLength(2);
    expect(hits[1].value).toBe(Math.round(estimateDamage(eater(250).enemies[0], { ...eater(250).player, defending: true }, "attack1") * EXTRA_IMPACT));
    expect(ev(low, "actionCommitted").filter((e) => e.actor === 1)).toHaveLength(1);
    const high = step(eater(300), "defend", noCrit());
    expect(ev(high, "hit").filter((e) => e.actor === 1)).toHaveLength(1);
    expect(hungerBelow(5)).toBeGreaterThan(hungerBelow(0));
  });

  it("the extra impact feeds no extra elemental charge", () => {
    let b = eater(100);
    b = mapEnemy(b, 0, () => ({ applies: true }));
    const s = step(withIntents(b, ["attack2"]), "defend", noCrit());
    expect(s.player.statuses?.find((x: StatusEffect) => x.id === "escarcha")?.stacks).toBe(1);
  });
});
