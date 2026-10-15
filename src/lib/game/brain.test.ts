// Enemy brains (docs/ideal/01 §8): legality, personality, memory, commitment, reproducibility,
// no peeking at pending input, a response is always possible.
import { describe, expect, it } from "vitest";
import {
  chooseIntent,
  legalIntents,
  MEMORY,
  personalityOf,
  PERSONALITIES,
  SCORE_BAND,
  scoreIntents,
  type BrainView,
  type Personality,
} from "./brain";
import {
  actionError,
  estimateDamage,
  isStrongIntent,
  pendingIntents,
  projectTurns,
  startBattle,
  step,
  strongPending,
  type Battle,
  type Intent,
} from "./combat";
import { createRng } from "./rng";
import { fight, mapEnemy, noCrit, spyRng, unit, withIntents, withProgress } from "./testkit";

// names that hash to each personality (see personalityOf)
const NAME: Record<Personality, string> = { agresor: "Foe0", protector: "Foe1", ritualista: "Foe2" };

const open = (foes: ReturnType<typeof unit>[], seed = 3, heroHp = 1e6): Battle =>
  startBattle(unit("caballero", { hp: heroHp, atk: 10 }), foes, createRng(seed));

const viewOf = (b: Battle, i = 0, over: Partial<BrainView> = {}): BrainView => ({
  self: b.enemies[i],
  index: i,
  player: b.player,
  allies: b.enemies.flatMap((e, k) => (k !== i && e.hp > 0 ? [{ index: k, c: e }] : [])),
  strongCommitted: false,
  ev: (att, def, intent) => estimateDamage(att, def, intent as "attack1"),
  ritualDue: false,
  rebuildDue: false,
  chargeReady: false,
  prepareCharge: false,
  ...over,
});
const kinds = (v: BrainView) => legalIntents(v).map((x) => x.intent).sort();

describe("personalities", () => {
  it("are stable per name and the three of them exist", () => {
    const seen = new Set(PERSONALITIES.map((p) => p));
    expect(seen.size).toBe(3);
    for (const p of PERSONALITIES) {
      const b = open([unit("picaro", {}, { name: NAME[p] })]);
      expect(personalityOf(b.enemies[0])).toBe(p);
      expect(personalityOf(b.enemies[0])).toBe(p);
    }
  });

  it("each common type has 3-4 legal actions, never more than the catalog of its type", () => {
    const b = (p: Personality) => open([unit("picaro", {}, { name: NAME[p] }), unit("mago", {}, { name: "Foe0" })]);
    const hurt = (bt: Battle) => mapEnemy(bt, 1, (e) => ({ hp: Math.round(e.hp / 2) }));
    expect(kinds(viewOf(b("agresor")))).toEqual(["attack1", "attack2", "defend"]);
    expect(kinds(viewOf(hurt(b("protector"))))).toEqual(["attack1", "attack2", "defend", "protect"]);
    expect(kinds(viewOf(b("protector")))).toEqual(["attack1", "attack2", "defend"]); // nobody to protect
    expect(kinds(viewOf(b("ritualista")))).toEqual(["attack1", "channeling", "charge", "defend"]);
  });

  it("a strong action is illegal while on cooldown or when another enemy already announced one", () => {
    const b = open([unit("picaro", {}, { name: NAME.agresor })]);
    expect(kinds(viewOf(mapEnemy(b, 0, () => ({ cooldown: 2 }))))).toEqual(["attack1", "defend"]);
    expect(kinds(viewOf(b, 0, { strongCommitted: true }))).toEqual(["attack1", "defend"]);
    const rit = open([unit("picaro", {}, { name: NAME.ritualista })]);
    expect(kinds(viewOf(rit, 0, { strongCommitted: true }))).toEqual(["attack1", "defend"]);
  });

  it("Ritualista does not repeat a ritual it just resolved (memory)", () => {
    const b = open([unit("picaro", {}, { name: NAME.ritualista })]);
    const after = mapEnemy(b, 0, () => ({ mem: ["attack1", "channeling"] as Intent[] }));
    expect(kinds(viewOf(after))).not.toContain("channeling");
    const old = mapEnemy(b, 0, () => ({ mem: ["channeling", "attack1", "attack1"] as Intent[] }));
    expect(kinds(viewOf(old))).toContain("channeling");
  });

  it("Protector protects the most wounded ally with an explicit shield event, no hidden damage transfer", () => {
    const foes = [unit("picaro", { hp: 1000, atk: 1 }, { name: NAME.protector }), unit("mago", { hp: 1000, atk: 1 }, { name: "Foe0" })];
    let b = fight(unit("caballero", { hp: 1e6, atk: 1 }), foes);
    b = mapEnemy(b, 1, () => ({ hp: 200 }));
    const legal = legalIntents(viewOf(b, 0));
    expect(legal.find((x) => x.intent === "protect")?.ally).toBe(1);
    b = mapEnemy(withIntents(b, ["protect"]), 0, () => ({ intentAlly: 1 }));
    const s = step(b, "defend", noCrit());
    const shield = s.cev.find((e) => e.type === "shieldChanged" && e.actor === 1);
    expect(shield?.target).toBe(2);
    expect(s.enemies[1].shield).toBe(Math.round(1000 * 0.08));
    expect(s.enemies[1].hp).toBe(200); // nothing healed or transferred
    expect(s.enemies[0].hp).toBe(1000);
  });
});

describe("boss brains", () => {
  const bossB = (id: string) => open([unit("berserker", { hp: 1e6, atk: 10 }, { bossId: id, name: "Jefe" })]);

  it("a ruled boss chooses among attack, strong attack and defend", () => {
    expect(kinds(viewOf(bossB("ash_king")))).toEqual(["attack1", "attack2", "defend"]);
    expect(kinds(viewOf(bossB("thunder_king")))).toEqual(["attack1", "attack2", "defend"]);
  });

  it("Reina: the ritual is forced when due, otherwise ordinary options", () => {
    expect(kinds(viewOf(bossB("withered_queen"), 0, { ritualDue: true }))).toEqual(["channeling"]);
    expect(kinds(viewOf(bossB("withered_queen")))).toEqual(["attack1", "attack2", "defend"]);
  });

  it("Coloso: reconstruction is announced when due; Gólem prepares a Carga, then charges", () => {
    expect(kinds(viewOf(bossB("hollow_colossus"), 0, { rebuildDue: true }))).toEqual(["rebuild"]);
    const golem = open([unit("picaro", { hp: 1e6, atk: 10 }, { name: "Gólem Colosal" })]);
    expect(golem.enemies[0].chargePending).toBe(true);
    expect(golem.enemies[0].intent).toBe("defend");
    expect(kinds(viewOf(golem, 0, { chargeReady: true }))).toEqual(["charge"]);
    expect(kinds(viewOf(golem, 0, { prepareCharge: true }))).toEqual(["defend"]);
  });
});

describe("scoring", () => {
  it("every candidate score is normalised to [0,100] and its contributions are inspectable", () => {
    for (const p of PERSONALITIES) {
      for (const atk of [1, 50, 5000]) {
        const b = open([unit("picaro", { atk }, { name: NAME[p] }), unit("mago", { hp: 100 }, { name: "Foe0" })]);
        for (const c of scoreIntents(viewOf(b))) {
          expect(c.score).toBeGreaterThanOrEqual(0);
          expect(c.score).toBeLessThanOrEqual(100);
          expect(Object.keys(c.parts).length).toBeGreaterThan(0);
          expect(Object.values(c.parts).every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it("repetition is penalised per recent use; survival counts when wounded", () => {
    const b = open([unit("picaro", { hp: 1000, atk: 200 }, { name: NAME.agresor })]);
    const fresh = scoreIntents(viewOf(b)).find((c) => c.intent === "attack1")!;
    const twice = scoreIntents(viewOf(mapEnemy(b, 0, () => ({ mem: ["attack1", "attack1"] as Intent[] })))).find((c) => c.intent === "attack1")!;
    expect(twice.parts.repetition).toBe(-24);
    expect(twice.score).toBeLessThan(fresh.score);
    const hurt = scoreIntents(viewOf(mapEnemy(b, 0, () => ({ hp: 150 })))).find((c) => c.intent === "defend")!;
    const healthy = scoreIntents(viewOf(b)).find((c) => c.intent === "defend")!;
    expect(hurt.score).toBeGreaterThan(healthy.score);
  });

  it("personality changes what is preferred: only the Ritualista offers rituals", () => {
    const ritual = (p: Personality) => scoreIntents(viewOf(open([unit("picaro", {}, { name: NAME[p] })]))).some((c) => c.intent === "channeling");
    expect(PERSONALITIES.filter(ritual)).toEqual(["ritualista"]);
  });
});

describe("choice", () => {
  it("draws only among candidates within SCORE_BAND of the best; a lone candidate costs no RNG", () => {
    const strong = open([unit("picaro", { atk: 5000 }, { name: NAME.agresor })], 3, 100); // a lethal attack dominates
    const spy = spyRng(1);
    const pick = chooseIntent(viewOf(mapEnemy(strong, 0, () => ({ cooldown: 9 }))), spy);
    expect(pick.intent).toBe("attack1");
    expect(spy.calls()).toBe(0);

    const weak = open([unit("picaro", { atk: 1 }, { name: NAME.agresor })]);
    const spy2 = spyRng(1);
    const pick2 = chooseIntent(viewOf(weak), spy2);
    expect(spy2.calls()).toBe(1);
    const all = scoreIntents(viewOf(weak));
    const best = Math.max(...all.map((c) => c.score));
    expect(best - all.find((c) => c.intent === pick2.intent)!.score).toBeLessThanOrEqual(SCORE_BAND);
  });

  it("is always legal and reproducible: same view + same seed => same pick", () => {
    for (const p of PERSONALITIES) {
      const b = open([unit("picaro", { atk: 20 }, { name: NAME[p] }), unit("mago", { hp: 300 }, { name: "Foe0" })]);
      const v = viewOf(mapEnemy(b, 1, () => ({ hp: 300 })));
      for (let seed = 1; seed <= 25; seed++) {
        const a = chooseIntent(v, createRng(seed));
        expect(chooseIntent(v, createRng(seed))).toEqual(a);
        expect(legalIntents(v).some((x) => x.intent === a.intent && x.ally === a.ally)).toBe(true);
      }
    }
  });

  it("the whole opening is reproducible for a seed and does not read future RNG", () => {
    const mk = (seed: number) =>
      open([unit("picaro", {}, { name: "Foe0" }), unit("mago", {}, { name: "Foe1" }), unit("berserker", {}, { name: "Foe2" })], seed);
    for (let seed = 1; seed <= 10; seed++) expect(mk(seed).enemies.map((e) => e.intent)).toEqual(mk(seed).enemies.map((e) => e.intent));
  });
});

describe("commitment and no peeking", () => {
  it("the announced intent is what the enemy then does, whatever the hero picks", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b0 = fight(unit("picaro", { hp: 1e9, atk: 1 }), unit("picaro", { hp: 1e9, atk: 20 }, { name: NAME.agresor }), { seed, quiet: false });
      const b = withProgress(b0, { 0: 0, 1: 10_000 });
      const announced = b.enemies[0].intent;
      for (const action of ["attack1", "defend"] as const) {
        const s = step(b, action, createRng(seed));
        const first = s.cev.find((e) => e.type === "actionCommitted" && e.actor === 1);
        // the strong intents answered by `defend` and by `attack1` alike
        expect(first?.detail).toBe(announced);
      }
    }
  });

  it("hover, previews and queries never alter the committed intent or draw RNG", () => {
    const b = fight(unit("picaro", { hp: 1e9, atk: 1 }), unit("mago", { hp: 1e9 }), { intents: ["attack2"] });
    const before = JSON.stringify(b);
    projectTurns(b);
    strongPending(b);
    pendingIntents(b);
    for (const a of ["attack1", "defend", "rogue_feint", "rogue_finish"] as const) actionError(b, a, 0);
    estimateDamage(b.enemies[0], b.player, "attack2");
    expect(JSON.stringify(b)).toBe(before);
    expect(b.enemies[0].intent).toBe("attack2");
  });

  it("an enemy that does not act in a step keeps its commitment untouched", () => {
    const b = withProgress(
      fight(unit("picaro", { hp: 1e9, atk: 1, speed: 15 }), unit("mago", { hp: 1e9, speed: 7.5 }), { intents: ["attack2"] }),
      { 0: 0, 1: 0 },
    );
    const s = step(b, "attack1", noCrit());
    expect(s.enemies[0].intent).toBe("attack2");
  });

  it("memory keeps the last MEMORY resolved intents", () => {
    let b = fight(unit("picaro", { hp: 1e9, atk: 1 }), unit("mago", { hp: 1e9, atk: 1 }), { quiet: true });
    b = withProgress(b, { 0: 0, 1: 10_000 });
    for (let i = 0; i < 8; i++) b = step(b, "defend", noCrit());
    expect(b.enemies[0].mem?.length).toBe(MEMORY);
  });

  it("the development trace exposes the scores of the pick", () => {
    const b = open([unit("picaro", {}, { name: "Foe0" })]);
    const s = step(withProgress(b, { 1: 10_000 }), "defend", noCrit());
    const t = s.trace?.[0]?.candidates[0];
    expect(t).toBeDefined();
    expect(Object.keys(t!.parts).length).toBeGreaterThan(0);
  });
});

describe("groups: a response always stays possible", () => {
  it("common brains never stack two strong announcements", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed);
      let b = startBattle(
        unit("caballero", { hp: 1e9, atk: 1 }),
        [unit("picaro", { hp: 1e9, atk: 5 }, { name: "Foe0" }), unit("mago", { hp: 1e9, atk: 5 }, { name: "Foe1" }), unit("berserker", { hp: 1e9, atk: 5 }, { name: "Foe2" })],
        rng,
      );
      for (let i = 0; i < 40 && b.status === "ongoing"; i++) {
        const strong = pendingIntents(b).filter((p) => isStrongIntent(p.intent));
        expect(strong.length).toBeLessThanOrEqual(1);
        b = step(b, i % 2 ? "attack1" : "defend", rng);
      }
    }
  });

  it("even with several strong threats announced, the hero keeps legal answers", () => {
    const b = fight(unit("picaro", { hp: 1e9, atk: 1 }), [unit("mago"), unit("berserker"), unit("caballero")], {
      intents: ["attack2", "charge", "channeling"],
    });
    expect(strongPending(b)).toBe(true);
    expect(actionError(b, "defend")).toBeNull();
    expect(actionError(b, "attack1", 0)).toBeNull();
    const d = step(b, "defend", noCrit());
    expect(d.cev.filter((e) => e.type === "guardTriggered")).toHaveLength(1);
  });
});
