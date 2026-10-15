// Turn contract (docs/ideal/01 §3, 03 §4): scheduler, statuses, class resource, Defender.
import { describe, expect, it } from "vitest";
import {
  DEFEND_FACTOR,
  estimateDamage,
  livingEnemies,
  PERFECT_GUARD_FACTOR,
  projectTurns,
  rateOf,
  RATE_MAX,
  RATE_MIN,
  startBattle,
  step,
  TURN_CAP,
  TURN_THRESHOLD,
  TURN_WARN,
  type Battle,
  type Combatant,
} from "./combat";
import { createRng } from "./rng";
import { SKILLS } from "./skills";
import { addStatus, tickStatuses, type StatusEffect } from "./statuses";
import {
  fight, mapEnemy, mapPlayer, noCrit, spyRng, turnOrder, unit, withIntents, withProgress,
} from "./testkit";

const comb = (speed: number, statuses?: StatusEffect[]): Combatant => ({
  char: unit("picaro", { speed }),
  hp: 100, cooldown: 0, defending: false, progress: 0, ownTurns: 0, ...(statuses && { statuses }),
});

describe("scheduler: rate", () => {
  it("rate is round(100 * speed) clamped to [RATE_MIN, RATE_MAX] (2:1 at most)", () => {
    expect(rateOf(comb(10))).toBe(1000);
    expect(rateOf(comb(1))).toBe(RATE_MIN);
    expect(rateOf(comb(99))).toBe(RATE_MAX);
    expect(RATE_MAX / RATE_MIN).toBe(2);
  });

  it("Escarcha and Impulso change the rate before the clamp", () => {
    const st = (id: StatusEffect["id"], stacks: number): StatusEffect[] => [{ id, stacks, turns: 3 }];
    expect(rateOf(comb(12, st("escarcha", 1)))).toBe(1080);
    expect(rateOf(comb(10, st("impulso", 2)))).toBe(1160);
    expect(rateOf(comb(10, st("escarcha", 3)))).toBe(RATE_MIN); // 700 -> clamped
    expect(rateOf(comb(14, st("impulso", 3)))).toBe(RATE_MAX); // 1736 -> clamped
  });
});

describe("scheduler: order of turns", () => {
  const run = (b: Battle, n: number): Battle[] => {
    const out: Battle[] = [];
    let cur = b;
    for (let i = 0; i < n; i++) {
      cur = step(cur, "defend", noCrit());
      out.push(cur);
    }
    return out;
  };
  const big = { hp: 1e9, atk: 1 };

  it("equal speeds alternate, the stable order (player first) breaks the tie", () => {
    const b = withProgress(fight(unit("caballero", big), unit("picaro", big)), { 0: 0, 1: 10_000 });
    expect(turnOrder(run(b, 4))).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
  });

  it("swapOrder flips the tie-break between two equal sides (duel seed)", () => {
    const plain = fight(unit("caballero", big), unit("picaro", big));
    const swapped = fight(unit("caballero", big), unit("picaro", big), { swapOrder: true });
    expect(plain.order).toEqual([0, 1]);
    expect(swapped.order).toEqual([1, 0]);
    // both at the threshold: the order array alone decides who goes first
    const tie = (b: Battle) => withProgress({ ...b, awaiting: 0 }, { 0: 10_000, 1: 10_000 });
    expect(turnOrder([step(tie(plain), "defend", noCrit())])[0]).toBe(0);
    expect(turnOrder([step(tie(swapped), "defend", noCrit())])[0]).toBe(1);
  });

  it("2:1 ratio: the fast enemy acts twice per slow player turn, no transferred actions", () => {
    const hero = unit("caballero", { ...big, speed: 7.5 }); // rate 750
    const foe = unit("picaro", { ...big, speed: 15 }); // rate 1500
    const b = fight(hero, foe);
    const order = turnOrder(run(b, 6));
    const idx = order.reduce<number[]>((acc, x, i) => (x === 0 ? [...acc, i] : acc), []);
    // steady state: exactly two enemy turns between two player turns
    const gaps = idx.slice(1).map((v, i) => v - idx[i]);
    expect(gaps.slice(1)).toEqual(gaps.slice(1).map(() => 3));
    expect(order.filter((x) => x === 1).length).toBeGreaterThanOrEqual(idx.length * 2 - 2);
  });

  it("a slow enemy never grants the player extra actions against the others", () => {
    const hero = unit("caballero", { ...big, speed: 10 });
    const foes = [unit("picaro", { ...big, speed: 7.5 }), unit("mago", { ...big, speed: 10 })];
    const order = turnOrder(run(fight(hero, foes), 20));
    // the player never acts twice in a row
    for (let i = 1; i < order.length; i++) expect(order[i] === 0 && order[i - 1] === 0).toBe(false);
  });

  it("several ready at once resolve by overshoot, then rate, then stable order", () => {
    const hero = unit("caballero", big);
    const foes = [unit("picaro", big), unit("mago", big), unit("berserker", { ...big, speed: 15 })];
    let b = fight(hero, foes);
    // all three enemies ready; enemy 2 has the biggest overshoot, 1 and 3 tie on progress
    b = withProgress(b, { 1: 10_000, 2: 12_000, 3: 10_000 });
    const s = step(b, "defend", noCrit());
    const acted = s.cev.filter((e) => e.type === "turnStarted").map((e) => e.actor);
    expect(acted.slice(0, 3)).toEqual([2, 3, 1]); // 12000 first; then equal progress: faster (3) before 1
  });

  it("equal progress and equal rate fall back to the stable order array", () => {
    const hero = unit("caballero", big);
    let b = fight(hero, [unit("picaro", big), unit("mago", big)]);
    b = withProgress(b, { 1: 10_000, 2: 10_000 });
    expect(turnOrder([step(b, "defend", noCrit())]).slice(0, 2)).toEqual([1, 2]);
    const swapped: Battle = { ...b, order: [0, 2, 1] };
    expect(turnOrder([step(swapped, "defend", noCrit())]).slice(0, 2)).toEqual([2, 1]);
  });

  it("surplus progress is conserved after paying exactly one threshold", () => {
    let b = fight(unit("caballero", big), unit("picaro", big));
    b = withProgress(b, { 1: 13_500 });
    const s = step(b, "defend", noCrit());
    // the enemy acted once (paid 10000, kept 3500) and then both advanced to the next turn
    const rate = rateOf(s.enemies[0]);
    expect((s.enemies[0].progress - 3500) % rate).toBe(0);
    expect(s.enemies[0].progress).toBeLessThan(TURN_THRESHOLD + rate);
  });

  it("a speed change only affects future gain, never progress already earned", () => {
    let b = fight(unit("caballero", big), unit("picaro", big));
    b = withProgress(b, { 1: 4000 });
    const slowed = mapEnemy(b, 0, () => ({ statuses: [{ id: "escarcha", stacks: 3, turns: 3 }] as StatusEffect[] }));
    const s = step(slowed, "defend", noCrit());
    // 6000 missing at 750/tick = 8 ticks; the hero (1000/tick) gains 8000 meanwhile, so the hero
    // is not ready yet: the enemy acts first and progress was kept (4000 + 8*750 = 10000 -> 0 left)
    expect(s.cev.filter((e) => e.type === "turnStarted").map((e) => e.actor)[0]).toBe(1);
  });

  it("dead enemies are removed from the schedule for good", () => {
    const foes = [unit("picaro", { hp: 1, atk: 1 }), unit("mago", big), unit("berserker", big)];
    let b = fight(unit("caballero", { ...big, atk: 100 }), foes);
    b = step(b, "attack1", noCrit(), 0);
    expect(livingEnemies(b)).toEqual([1, 2]);
    const seen = turnOrder(run(b, 12));
    expect(seen).not.toContain(1);
    expect(seen).toContain(2);
    expect(seen).toContain(3);
    expect(projectTurns(b).every((t) => t.id !== 1)).toBe(true);
  });

  it("projectTurns lists up to 6 turns and only the first is certain", () => {
    const b = fight(unit("caballero", big), [unit("picaro", big), unit("mago", big)]);
    const q = projectTurns(b);
    expect(q).toHaveLength(6);
    expect(q.map((t) => t.certain)).toEqual([true, false, false, false, false, false]);
    // the first entry is exactly who acts next after the hero's decision
    expect(q[0].id).toBe(turnOrder([step(b, "defend", noCrit())])[0]);
  });

  it("projectTurns / actionError / estimates consume no RNG and mutate nothing", () => {
    const b = fight(unit("caballero", big), unit("picaro", big));
    const before = JSON.stringify(b);
    projectTurns(b);
    estimateDamage(b.player, b.enemies[0], "attack1");
    expect(JSON.stringify(b)).toBe(before);
  });

  it("no turn is infinite: a held enemy cannot stall time, the human is always reached", () => {
    let b = fight(unit("caballero", big), unit("picaro", { ...big, speed: 15 }), { intents: ["attack2"] });
    b = withProgress(b, { 1: 50_000 });
    // strong intent unanswered + huge progress: it is held, the scheduler still returns to the human
    expect(b.status).toBe("ongoing");
    const s = step(b, "attack1", noCrit());
    expect(s.status).toBe("ongoing");
    expect(s.awaiting).toBe(0);
  });

  it("an announced strong enemy keeps filling its bar until ready (hold freezes only a READY enemy)", () => {
    // docs/ideal/01 §3.3: the hold applies to an enemy that is already ready; before that it
    // accrues progress like everyone else. Equal speeds: the opener announces a ritual.
    const b = startBattle(unit("caballero", { hp: 1e6, atk: 1 }), unit("picaro", { hp: 1e6, atk: 1 }, { name: "Foe2" }), createRng(4));
    expect(b.enemies[0].intent).toBe("channeling");
    expect(b.enemies[0].intentAnswered).toBe(false);
    expect(b.enemies[0].progress).toBeGreaterThanOrEqual(TURN_THRESHOLD);
  });

  it(`a fight without winner ends as a draw at ${TURN_CAP} resolved turns`, () => {
    let b = fight(unit("caballero", { hp: 1e12, atk: 1 }), unit("picaro", { hp: 1e12, atk: 1 }));
    let warned = false;
    for (let i = 0; i < 400 && b.status === "ongoing"; i++) {
      b = step(b, "defend", noCrit());
      if (b.turn >= TURN_WARN && b.log.some((l) => l.includes("empate"))) warned = true;
    }
    expect(b.status).toBe("draw");
    expect(b.turn).toBeGreaterThanOrEqual(TURN_CAP);
    expect(warned).toBe(true);
    expect(b.cev.some((e) => e.type === "combatEnded" && e.detail === "draw")).toBe(true);
    expect(step(b, "attack1", noCrit())).toBe(b); // nothing happens after the end
  });

  it("is deterministic and a mid-battle state survives a JSON round trip", () => {
    const rng0 = createRng(3);
    const b0 = startBattle(unit("picaro", { speed: 12 }), [unit("caballero", { speed: 8 }), unit("mago")], rng0);
    const mid = step(b0, "attack1", createRng(5));
    const copy: Battle = JSON.parse(JSON.stringify(mid));
    const json = (x: Battle) => JSON.stringify(x);
    expect(json(copy)).toBe(json(mid));
    expect(json(step(copy, "attack1", createRng(9)))).toBe(json(step(mid, "attack1", createRng(9))));
    const play = (seed: number) => {
      const rng = createRng(seed);
      let b = startBattle(unit("picaro"), [unit("mago"), unit("clerigo")], rng);
      for (let i = 0; i < 60 && b.status === "ongoing"; i++) b = step(b, i % 4 === 3 ? "defend" : "attack1", rng);
      return b.log;
    };
    expect(play(7)).toEqual(play(7));
  });

  it("strong intents never resolve before the human has acted (held)", () => {
    const strongKinds = new Set(["attack2", "charge", "channeling"]);
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed);
      const foes = [
        unit("picaro", { speed: 15, hp: 1e6, atk: 5 }, { name: "Ritual A" }),
        unit("mago", { speed: 15, hp: 1e6, atk: 5 }, { name: "Ritual B" }),
      ];
      let b = startBattle(unit("caballero", { speed: 7.5, hp: 1e6, atk: 5 }), foes, rng);
      const announced = new Set<number>();
      const answered = new Set<number>();
      const note = (battle: Battle, humanActed: boolean) => {
        if (humanActed) announced.forEach((a) => answered.add(a)); // any step() is a human decision
        for (const e of battle.cev) {
          if (e.type === "telegraphStarted") announced.add(e.actor);
          if (e.type === "actionCommitted" && e.actor > 0 && strongKinds.has(e.detail ?? "")) {
            expect(announced.has(e.actor)).toBe(true);
            expect(answered.has(e.actor)).toBe(true);
            announced.delete(e.actor);
            answered.delete(e.actor);
          }
        }
      };
      note(b, false);
      for (let i = 0; i < 60 && b.status === "ongoing"; i++) {
        b = step(b, i % 2 ? "attack1" : "defend", rng);
        note(b, true);
      }
    }
  });
});

// ---- statuses -------------------------------------------------------------------------------

describe("statuses: apply, renew, expire", () => {
  it("a status applied during the carrier's own turn does not lose duration at that close", () => {
    const own = addStatus(undefined, "impulso", 1, undefined, 0, true);
    expect(own[0].turns).toBe(3);
    expect(tickStatuses(own)[0].turns).toBe(3);
    expect(tickStatuses(tickStatuses(own))[0].turns).toBe(2);
  });

  it("applying again renews the duration and adds a charge up to the cap", () => {
    let st = addStatus(undefined, "escarcha", 1, undefined, 0);
    st = tickStatuses(tickStatuses(st));
    expect(st[0].turns).toBe(1);
    st = addStatus(st, "escarcha", 1, undefined, 0);
    expect(st[0]).toMatchObject({ stacks: 2, turns: 3 });
    st = addStatus(addStatus(st, "escarcha", 1), "escarcha", 1);
    expect(st[0].stacks).toBe(3); // max 3
  });

  it("duration 3 gives exactly three carrier maintenances", () => {
    let st = addStatus(undefined, "ruptura", 1, undefined, 0);
    let n = 0;
    while (st.length) {
      n++;
      st = tickStatuses(st);
    }
    expect(n).toBe(3);
  });

  it("a hit applies one charge of the hero element; the hit itself does not tick it", () => {
    const b = fight(unit("caballero", { hp: 1e6 }), unit("picaro", { hp: 1e6, atk: 1 }));
    const s = step(b, "attack1", noCrit());
    const esc = s.enemies[0].statuses?.find((x) => x.id === "escarcha");
    expect(esc?.stacks).toBe(1);
    // applied on the hero's turn; the enemy's own close afterwards counts one maintenance
    expect(esc?.turns).toBeLessThanOrEqual(3);
    expect(esc?.turns).toBeGreaterThanOrEqual(2);
  });

  it("Quemadura: no immediate tick, ticks only on the carrier's turns, exactly three times", () => {
    const base = unit("picaro", { hp: 1000, atk: 1, speed: 10 }, { element: "fuego" });
    let b = fight(unit("caballero", { hp: 1e6, atk: 1 }), base, { intents: ["defend"] });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "quemadura", stacks: 1, turns: 3, amount: 5 }] as StatusEffect[] }));
    const before = b.enemies[0].hp;
    const states: Battle[] = [];
    let cur = b;
    for (let i = 0; i < 5; i++) {
      cur = step(cur, "defend", noCrit());
      states.push(cur);
    }
    const burns = states[4].log.filter((l) => l.includes("se quema")).length;
    expect(burns).toBe(3);
    expect(states[4].enemies[0].hp).toBe(before - 15);
    expect(states[4].enemies[0].statuses?.some((x) => x.id === "quemadura")).toBeFalsy();
  });

  it("Quemadura kills at the start of the carrier's turn: its action is omitted", () => {
    let b = fight(unit("caballero", { hp: 1e6, atk: 1 }), unit("picaro", { hp: 100, atk: 999 }), { intents: ["attack1"] });
    b = mapEnemy(b, 0, () => ({ hp: 4, statuses: [{ id: "quemadura", stacks: 1, turns: 3, amount: 5 }] as StatusEffect[] }));
    const s = step(b, "defend", noCrit());
    expect(s.status).toBe("won");
    expect(s.enemies[0].hp).toBe(0);
    expect(s.player.hp).toBe(1e6); // it never struck
    expect(s.cev.some((e) => e.type === "actionCommitted" && e.actor === 1)).toBe(false);
  });

  it("Quemadura can kill the hero before it acts: the fight is lost", () => {
    let b = fight(unit("caballero", { hp: 1000, atk: 1 }), unit("picaro", { hp: 1e6, atk: 1 }), { intents: ["defend"] });
    b = mapPlayer(b, { hp: 5, statuses: [{ id: "quemadura", stacks: 1, turns: 3, amount: 50 }] });
    b = step(b, "defend", noCrit());
    expect(b.status).toBe("lost");
  });

  it("Agua never blocks forever: a foe hit by Escarcha every turn still acts", () => {
    const b = fight(unit("picaro", { hp: 1e9, atk: 1 }), unit("caballero", { hp: 1e9, atk: 1 }));
    let cur = b;
    const seen: Battle[] = [];
    for (let i = 0; i < 40; i++) {
      cur = step(cur, "attack1", noCrit());
      seen.push(cur);
    }
    expect(cur.enemies[0].statuses?.[0]?.stacks).toBeGreaterThan(0);
    const foeTurns = turnOrder(seen).filter((x) => x === 1).length;
    expect(foeTurns).toBeGreaterThanOrEqual(28); // 0.75 foe turns per hero turn at the minimum rate
  });

  it("Escarcha delay is applied once per target until it completes its turn", () => {
    let b = fight(unit("mago", { hp: 1e6, atk: 1 }), unit("picaro", { hp: 1e6, atk: 1 }), { res: 3, loadout: ["mage_inscribe", "mage_detonate"] });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "escarcha", stacks: 3, turns: 3 }] as StatusEffect[], frostDelayed: true, progress: 6000 }));
    b = withIntents(b, ["defend"]);
    const s = step(b, "mage_detonate", noCrit());
    const lost = s.cev.filter((e) => e.type === "progressChanged" && e.actor === 1);
    expect(lost).toHaveLength(0); // already delayed this cycle: no second delay
    expect(s.cev.some((e) => e.type === "statusConsumed")).toBe(true);
  });
});

describe("statuses: consumption", () => {
  const consumed = (b: Battle) => b.cev.filter((e) => e.type === "statusConsumed");

  it("a consuming skill consumes once per use (single target)", () => {
    let b = fight(unit("caballero", { hp: 1e6, atk: 20 }, { element: "fuego" }), unit("picaro", { hp: 1e6, atk: 1 }), { res: 3 });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "quemadura", stacks: 2, turns: 3, amount: 10 }] as StatusEffect[] }));
    const s = step(b, "knight_breaker", noCrit());
    expect(consumed(s)).toHaveLength(1);
    expect(s.enemies[0].statuses?.some((x) => x.id === "quemadura")).toBeFalsy();
  });

  it("an area skill consumes per target; own states (Impulso) only once", () => {
    const foes = [unit("picaro", { hp: 1e6, atk: 1 }), unit("mago", { hp: 1e6, atk: 1 }), unit("berserker", { hp: 1e6, atk: 1 })];
    let b = fight(unit("caballero", { hp: 1e6, atk: 20 }, { element: "fuego" }), foes, {
      res: 3, loadout: ["knight_sweep", "knight_advance"],
    });
    for (let i = 0; i < 3; i++)
      b = mapEnemy(b, i, () => ({ statuses: [{ id: "quemadura", stacks: 1, turns: 3, amount: 5 }] as StatusEffect[] }));
    expect(consumed(step(b, "knight_sweep", noCrit()))).toHaveLength(3);

    let w = fight(unit("caballero", { hp: 1e6, atk: 20 }, { element: "viento" }), foes, {
      res: 3, loadout: ["knight_sweep", "knight_advance"],
    });
    w = mapPlayer(w, { statuses: [{ id: "impulso", stacks: 2, turns: 3 }] });
    const s = step(w, "knight_sweep", noCrit());
    expect(consumed(s)).toHaveLength(1);
  });

  it("an area hit applies one charge per target, not one per visual impact", () => {
    const foes = [unit("picaro", { hp: 1e6, atk: 1 }), unit("mago", { hp: 1e6, atk: 1 }), unit("berserker", { hp: 1e6, atk: 1 })];
    // Sweep consumes, so use a non-consuming multi target: the basic hits one; check one charge each via two basics
    let b = fight(unit("caballero", { hp: 1e6 }), foes, { res: 3, loadout: ["knight_sweep", "knight_advance"] });
    const s = step(b, "knight_sweep", noCrit());
    // sweep consumes and does not add charges (no consumer state to eat either)
    expect(s.enemies.every((e) => !e.statuses?.some((x) => x.id === "escarcha" && x.stacks > 1))).toBe(true);
    b = step(b, "attack1", noCrit(), 0);
    expect(b.enemies[0].statuses?.[0].stacks).toBe(1);
  });

  it("Hydra extra impacts do not multiply the elemental charges applied", () => {
    const hydra = unit("berserker", { hp: 1e6, atk: 20 }, { bossId: "mother_hydra", name: "Hidra" });
    let b = fight(unit("caballero", { hp: 1e6, atk: 1 }), hydra, { intents: ["attack2"] });
    b = mapEnemy(b, 0, (e) => ({ applies: true, boss: { ...e.boss!, heads: 3 } }));
    const s = step(b, "attack1", noCrit());
    const hits = s.cev.filter((e) => e.type === "hit" && e.actor === 1);
    expect(hits).toHaveLength(4); // main + 3 extra impacts
    expect(s.player.statuses?.find((x) => x.id === "escarcha")?.stacks).toBe(1);
  });

  it("Inscribir adds an extra charge (2 per use, still capped at 3)", () => {
    let b = fight(unit("mago", { hp: 1e6, atk: 5 }), unit("picaro", { hp: 1e6, atk: 1 }), { loadout: ["mage_inscribe", "mage_detonate"] });
    b = step(b, "mage_inscribe", noCrit());
    expect(b.enemies[0].statuses?.[0].stacks).toBe(2);
    b = step(b, "mage_inscribe", noCrit());
    expect(b.enemies[0].statuses?.[0].stacks).toBe(3);
  });

  it("Impulso never regenerates through a consume (Viento)", () => {
    let b = fight(unit("caballero", { hp: 1e6, atk: 20 }, { element: "viento" }), unit("picaro", { hp: 1e6, atk: 1 }), { res: 3 });
    b = mapPlayer(b, { statuses: [{ id: "impulso", stacks: 2, turns: 3 }] });
    const s = step(b, "knight_breaker", noCrit());
    expect(s.player.statuses?.some((x) => x.id === "impulso")).toBeFalsy();
    expect(s.cev.some((e) => e.type === "statusConsumed")).toBe(true);
    // with no Impulso a consuming skill neither consumes nor creates it
    const none = step(mapPlayer(b, { statuses: [] }), "knight_breaker", noCrit());
    expect(none.cev.some((e) => e.type === "statusConsumed")).toBe(false);
    expect(none.player.statuses?.some((x) => x.id === "impulso")).toBeFalsy();
  });

  it("Impulso consume adds progress after paying the turn: no free action", () => {
    let b = fight(unit("caballero", { hp: 1e6, atk: 20 }, { element: "viento" }), unit("picaro", { hp: 1e6, atk: 1 }), { res: 3 });
    b = mapPlayer(b, { statuses: [{ id: "impulso", stacks: 3, turns: 3 }] });
    const s = step(b, "knight_breaker", noCrit());
    const progress = s.cev.filter((e) => e.type === "progressChanged" && e.actor === 0);
    expect(progress).toHaveLength(1);
    expect(progress[0].value).toBe(Math.round(TURN_THRESHOLD * 0.3));
    expect(s.awaiting).toBe(0);
  });
});

// ---- class resource -------------------------------------------------------------------------

describe("class resource 0..3", () => {
  const foe = () => unit("picaro", { hp: 1e6, atk: 1 });
  const hero = () => unit("caballero", { hp: 1e6, atk: 20 });

  it("starts at 0 and the basic generates exactly 1 per use", () => {
    let b = fight(hero(), foe());
    expect(b.player.res).toBe(0);
    b = step(b, "attack1", noCrit());
    expect(b.player.res).toBe(1);
  });

  it("never exceeds 3", () => {
    let b = fight(hero(), foe());
    for (let i = 0; i < 6; i++) b = step(b, "attack1", noCrit());
    expect(b.player.res).toBe(3);
  });

  it("the basic hitting nobody generates nothing", () => {
    const b = fight(hero(), foe());
    const dead = { ...b, enemies: [{ ...b.enemies[0], hp: 0 }] };
    expect(step(dead, "attack1", noCrit(), 0)).toBe(dead); // no valid target: rejected
  });

  it("a generator skill adds its fixed amount once, capped", () => {
    let b = fight(hero(), foe());
    b = step(b, "knight_advance", noCrit());
    expect(b.player.res).toBe(SKILLS.knight_advance.gen);
    b = step(b, "knight_advance", noCrit());
    expect(b.player.res).toBe(3);
  });

  it("a spender needs its exact cost and pays it once; it generates nothing", () => {
    const cost = SKILLS.knight_breaker.cost;
    for (const res of [0, 1]) {
      const b = fight(hero(), foe(), { res });
      expect(step(b, "knight_breaker", noCrit())).toBe(b);
    }
    for (const res of [cost, cost + 1]) {
      const s = step(fight(hero(), foe(), { res }), "knight_breaker", noCrit());
      expect(s.player.res).toBe(res - cost);
    }
  });

  it("support skills generate no resource although they cost it", () => {
    const b = fight(hero(), foe(), { res: 3, loadout: ["knight_bastion", "knight_advance"] });
    const s = step(b, "knight_bastion", noCrit());
    expect(s.player.res).toBe(1);
    expect(s.cev.filter((e) => e.type === "classResourceChanged").map((e) => e.value)).toEqual([1]);
  });

  it("an invalid action spends nothing, returns the same object and takes no RNG", () => {
    const b = fight(hero(), foe(), { res: 1 });
    const rng = spyRng(1);
    const attempts: [string, number?][] = [
      ["knight_breaker"], // not enough resource
      ["knight_sweep"], // not equipped
      ["mage_inscribe"], // other class
      ["nonsense"],
      ["attack1", 5], // bad target
      ["attack1", -1],
    ];
    for (const [a, t] of attempts) expect(step(b, a as never, rng, t)).toBe(b);
    expect(rng.calls()).toBe(0);
    expect(b.player.res).toBe(1);
  });

  it("a blocked-by-cooldown skill is rejected without effects", () => {
    let b = fight(unit("picaro", { hp: 1e6, atk: 20 }), foe(), { res: 3, loadout: ["rogue_sabotage", "rogue_finish"] });
    b = step(b, "rogue_sabotage", noCrit());
    const rng = spyRng(2);
    expect(step(b, "rogue_sabotage", rng)).toBe(b);
    expect(rng.calls()).toBe(0);
  });

  it("a finished fight rejects every action", () => {
    let b = fight(hero(), unit("picaro", { hp: 1, atk: 1 }));
    b = step(b, "attack1", noCrit());
    expect(b.status).toBe("won");
    expect(step(b, "defend", noCrit())).toBe(b);
  });
});

// ---- Defender -------------------------------------------------------------------------------

describe("Defender", () => {
  const hero = (over: Record<string, number> = {}) => unit("picaro", { hp: 1e6, atk: 1, ...over });
  const foe = (over: Record<string, number> = {}) => unit("berserker", { hp: 1e6, atk: 40, ...over });
  const lost = (b: Battle, s: Battle) => b.player.hp - s.player.hp;

  it("starts when chosen: the next enemy hit is cut to DEFEND_FACTOR; it ends at the own next turn", () => {
    const b = fight(hero(), foe(), { intents: ["attack1"] });
    const d = step(b, "defend", noCrit());
    const normal = estimateDamage(b.enemies[0], b.player, "attack1");
    expect(lost(b, d)).toBe(estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1"));
    expect(Math.abs(lost(b, d) - normal * DEFEND_FACTOR)).toBeLessThanOrEqual(1);
    expect(d.player.defending).toBe(false); // dropped when the new own turn began
    // the following turn the hero does not defend: full damage
    const fullIntent = withIntents(d, ["attack1"]);
    const a = step(fullIntent, "attack1", noCrit());
    expect(lost(d, a)).toBe(normal);
  });

  it("covers every hit of the window (a 2:1 enemy hits twice, both reduced)", () => {
    let b = fight(hero({ speed: 7.5 }), foe({ speed: 15 }), { intents: ["attack1"] });
    b = withProgress(b, { 0: 0, 1: 10_000 });
    const d = step(b, "defend", noCrit());
    const hits = d.cev.filter((e) => e.type === "hit" && e.actor === 1);
    expect(hits).toHaveLength(2);
    const each = estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1");
    expect(lost(b, d)).toBe(each * 2);
  });

  it("no guard against a normal announced attack", () => {
    const b = fight(hero(), foe(), { intents: ["attack1"] });
    const d = step(b, "defend", noCrit());
    expect(d.cev.some((e) => e.type === "guardTriggered")).toBe(false);
    expect(d.player.res).toBe(0);
  });

  it("perfect guard against an announced strong hit: 75 %, +1 resource, once", () => {
    const b = fight(hero(), foe(), { intents: ["attack2"] });
    const d = step(b, "defend", noCrit());
    expect(d.cev.filter((e) => e.type === "guardTriggered")).toHaveLength(1);
    expect(d.player.res).toBe(1);
    const strong = estimateDamage(b.enemies[0], { ...b.player, defending: true, guard: true }, "attack2");
    expect(lost(b, d)).toBe(strong);
    const plain = estimateDamage(b.enemies[0], b.player, "attack2");
    expect(Math.abs(strong - plain * PERFECT_GUARD_FACTOR)).toBeLessThanOrEqual(1);
    expect(strong).toBeGreaterThan(plain * DEFEND_FACTOR * PERFECT_GUARD_FACTOR * 1.5); // replaces, not stacks
  });

  it("two strong threats still give a single reward", () => {
    const b = fight(hero(), [foe(), foe()], { intents: ["attack2", "attack2"] });
    const d = step(b, "defend", noCrit());
    expect(d.cev.filter((e) => e.type === "guardTriggered")).toHaveLength(1);
    expect(d.player.res).toBe(1);
  });

  it("only the first strong hit gets 75 %; weaker hits do not spend the guard", () => {
    const strongStrong = fight(hero(), [foe(), foe()], { intents: ["attack2", "attack2"] });
    const d = step(strongStrong, "defend", noCrit());
    const first = estimateDamage(strongStrong.enemies[0], { ...strongStrong.player, defending: true, guard: true }, "attack2");
    const second = estimateDamage(strongStrong.enemies[1], { ...strongStrong.player, defending: true }, "attack2");
    expect(lost(strongStrong, d)).toBe(first + second);
    expect(second).toBeGreaterThan(first);

    const weakFirst = fight(hero(), [foe(), foe()], { intents: ["attack1", "attack2"] });
    const w = step(weakFirst, "defend", noCrit());
    const weak = estimateDamage(weakFirst.enemies[0], { ...weakFirst.player, defending: true }, "attack1");
    const strong = estimateDamage(weakFirst.enemies[1], { ...weakFirst.player, defending: true, guard: true }, "attack2");
    expect(lost(weakFirst, w)).toBe(weak + strong);
  });

  it("a dead enemy's old threat does not count; a ritual threat is a strong threat", () => {
    let b = fight(hero(), [foe(), foe()], { intents: ["attack2", "attack1"] });
    b = mapEnemy(b, 0, () => ({ hp: 0 }));
    const d = step(b, "defend", noCrit());
    expect(d.cev.some((e) => e.type === "guardTriggered")).toBe(false);
    const ritual = fight(hero(), foe(), { intents: ["channeling"] });
    expect(step(ritual, "defend", noCrit()).player.res).toBe(1);
  });

  it("perfect guard rewards every class with +1; the Cleric also cleanses a negative status", () => {
    for (const cls of ["caballero", "mago", "picaro", "clerigo", "berserker"] as const) {
      let b = fight(unit(cls, { hp: 1e6, atk: 1 }), foe(), { intents: ["attack2"] });
      b = mapPlayer(b, { statuses: [{ id: "escarcha", stacks: 1, turns: 3 }] });
      const d = step(b, "defend", noCrit());
      expect(d.player.res).toBe(1);
      const cleansed = !d.player.statuses?.some((x) => x.id === "escarcha");
      // the enemy (agua) does not re-apply here: its strong hit is not elemental unless `applies`
      expect(cleansed).toBe(cls === "clerigo");
      // retired riposte / resolution flags no longer exist
      expect(Object.keys(d.player)).not.toContain("riposte");
      expect(Object.keys(d.player)).not.toContain("resolution");
    }
  });

  it("Devorador heals from effective life damage only: a shield absorbs without feeding it", () => {
    const devourer = unit("berserker", { hp: 1000, atk: 40 }, { bossId: "great_devourer", name: "Devorador" });
    let b = fight(hero(), devourer, { intents: ["attack1"] });
    b = mapEnemy(b, 0, () => ({ hp: 500 }));
    const dmg = estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack1");
    const open = step(b, "defend", noCrit());
    expect(open.enemies[0].hp).toBe(500 + Math.round(dmg * 0.1));
    const shielded = step(mapPlayer(b, { shield: 1e5 }), "defend", noCrit());
    expect(shielded.enemies[0].hp).toBe(500); // everything went into the shield
    expect(shielded.player.hp).toBe(b.player.hp);
  });
});
