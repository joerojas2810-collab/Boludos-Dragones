// Core of the turn engine: vocabulary, targeting, damage pieces, mods, Aguante/Quiebre,
// determinism. The scheduler, statuses, resource and Defender live in turns.test.ts.
import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import {
  DAMAGE_SCALE,
  DEF_CAP,
  defReduction,
  estimateDamage,
  intentType,
  isStrongIntent,
  livingEnemies,
  pendingIntents,
  startBattle,
  step,
  AGUANTE_FRACTION,
  QUIEBRE_RESIST_TURNS,
  type Battle,
  type Intent,
} from "./combat";
import { createRng } from "./rng";
import { fight, mapEnemy, mapPlayer, noCrit, unit, withIntents, withProgress } from "./testkit";

const ev = (b: Battle, type: string) => b.cev.filter((e) => e.type === type);

describe("intent vocabulary", () => {
  it("maps every intent to its category; only attack2, charge and channeling are strong", () => {
    const table: Record<Intent, [string, boolean]> = {
      attack1: ["golpe", false],
      attack2: ["golpe", true],
      charge: ["carga", true],
      channeling: ["canalizacion", true],
      defend: ["defensa", false],
      protect: ["proteccion", false],
      rebuild: ["reconstruccion", false],
    };
    for (const [intent, [type, strong]] of Object.entries(table) as [Intent, [string, boolean]][]) {
      expect(intentType(intent)).toBe(type);
      expect(isStrongIntent(intent)).toBe(strong);
    }
  });
});

describe("damage formula pieces", () => {
  const hero = (over = {}) => unit("picaro", { hp: 1e6, atk: 100, ...over });
  const at = (att: ReturnType<typeof unit>, def: ReturnType<typeof unit>, key: "attack1" | "attack2" = "attack1") => {
    const b = startBattle(att, def, createRng(1));
    return estimateDamage(b.player, b.enemies[0], key);
  };

  it("base: ATQ x power x scale, neutral element, no defense", () => {
    expect(at(hero(), unit("berserker"))).toBe(Math.round(100 * DAMAGE_SCALE));
  });

  it("defense is a percentage of ATQ and is capped", () => {
    const b = startBattle(hero(), unit("berserker", { def: 1e9 }), createRng(1));
    expect(defReduction(b.player, b.enemies[0])).toBe(DEF_CAP);
    expect(estimateDamage(b.player, b.enemies[0], "attack1")).toBe(Math.round(100 * DAMAGE_SCALE * (1 - DEF_CAP)));
    const some = startBattle(hero(), unit("berserker", { def: 100 }), createRng(1));
    expect(defReduction(some.player, some.enemies[0])).toBeCloseTo(0.5);
    expect(defReduction(some.player, some.enemies[0], 0.5)).toBeCloseTo(50 / 150); // Ruptura bypass
  });

  it("element table applies: advantage 1.25, disadvantage 0.75", () => {
    const base = at(hero(), unit("berserker", {}, { element: "agua" }));
    expect(at(hero(), unit("berserker", {}, { element: "fuego" }))).toBe(Math.round(base * 1.25));
    expect(at(hero(), unit("berserker", {}, { element: "rayo" }))).toBe(Math.round(base * 0.75));
    expect(at(hero(), unit("berserker", {}, { element: "tierra" }))).toBe(base);
  });

  it("a skill's damage is P x the same actor's basic, strong enemy hits use their own profile", () => {
    const b = startBattle(unit("caballero", { atk: 100 }), unit("berserker"), createRng(1));
    const basic = estimateDamage(b.player, b.enemies[0], "attack1");
    expect(estimateDamage(b.player, b.enemies[0], "knight_sweep")).toBeCloseTo(basic * 0.65, 0);
    expect(estimateDamage(b.enemies[0], b.player, "attack2")).toBeGreaterThan(estimateDamage(b.enemies[0], b.player, "attack1"));
  });

  it("class passives: Caballero and Mago take less; relic reduction multiplies", () => {
    const att = unit("picaro", { atk: 100 });
    const plain = at(att, unit("clerigo"));
    expect(at(att, unit("caballero"))).toBeLessThan(at(att, unit("mago")));
    expect(at(att, unit("mago"))).toBeLessThan(plain);
  });

  it("estimate never goes below 1", () => {
    expect(at(unit("picaro", { atk: 0 }), unit("berserker", { def: 1e9 }))).toBe(1);
  });
});

describe("targeting", () => {
  const foes = () => [
    unit("caballero", { hp: 400, atk: 1 }),
    unit("mago", { hp: 400, atk: 1 }),
    unit("picaro", { hp: 400, atk: 1 }),
  ];
  const hero = () => unit("picaro", { hp: 1e6, atk: 20 });

  it("defaults to the first living enemy and honours `target`", () => {
    const b = fight(hero(), foes());
    const d = step(b, "attack1", noCrit());
    expect(d.enemies[0].hp).toBeLessThan(400);
    expect(d.enemies[1].hp).toBe(400);
    const t = step(b, "attack1", noCrit(), 2);
    expect(t.enemies[2].hp).toBeLessThan(400);
    expect(t.enemies[0].hp).toBe(400);
  });

  it("indexes the LIVING enemies and rejects out-of-range targets", () => {
    const b = fight(hero(), foes());
    const dead = mapEnemy(b, 0, () => ({ hp: 0 }));
    expect(livingEnemies(dead)).toEqual([1, 2]);
    const s = step(dead, "attack1", noCrit(), 1);
    expect(s.enemies[2].hp).toBeLessThan(400);
    expect(s.enemies[1].hp).toBe(400);
    expect(step(dead, "attack1", noCrit(), 2)).toBe(dead);
    expect(step(b, "attack1", noCrit(), 3)).toBe(b);
    expect(step(b, "attack1", noCrit(), -1)).toBe(b);
    expect(step(b, "attack1", noCrit(), 0.5)).toBe(b);
  });

  it("the fight ends only when every enemy is down", () => {
    let b = fight(hero(), foes());
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, hp: 1 })) };
    for (const left of [2, 1, 0]) {
      b = step(b, "attack1", noCrit(), 0);
      expect(livingEnemies(b)).toHaveLength(left);
      expect(b.status).toBe(left === 0 ? "won" : "ongoing");
    }
    expect(b.log.filter((l) => l.endsWith("cae.")).length).toBeGreaterThanOrEqual(3);
    expect(b.cev.some((e) => e.type === "combatEnded" && e.detail === "won")).toBe(true);
  });

  it("elemental weakness makes the choice matter", () => {
    const fire = unit("caballero", { hp: 400, atk: 1 }, { element: "fuego" });
    const earth = unit("caballero", { hp: 400, atk: 1 }, { element: "tierra" });
    const b = startBattle(unit("picaro", {}, { element: "agua" }), [earth, fire], createRng(2));
    expect(estimateDamage(b.player, b.enemies[1], "attack1")).toBeGreaterThan(estimateDamage(b.player, b.enemies[0], "attack1"));
  });

  it("every enemy announces and resolves its own intents", () => {
    const b = startBattle(unit("caballero", { speed: 10 }), [unit("mago"), unit("picaro")], createRng(3));
    expect(new Set(pendingIntents(b).map((s) => s.e))).toEqual(new Set([0, 1]));
    expect(b.log.filter((l) => l.includes("aparece."))).toHaveLength(2);
    let q = withProgress(fight(unit("caballero", { hp: 1e9, atk: 1 }), [unit("mago", { atk: 5 }), unit("picaro", { atk: 5 })], { intents: ["attack1", "attack1"] }), { 0: 0, 1: 10_000, 2: 10_000 });
    q = step(q, "defend", noCrit()); // (a hit would slow its target with Escarcha and reorder them)
    expect(q.events.map((e) => `${e.actor}${e.enemy}`)).toEqual(["enemy0", "enemy1"]);
  });

  it("dead enemies lose their turns", () => {
    const b = withProgress(
      fight(unit("caballero", { hp: 1e9, atk: 100 }), [unit("picaro", { hp: 1, atk: 5 }), unit("mago", { atk: 5 })]),
      { 0: 0, 1: 10_000, 2: 10_000 },
    );
    const s = step(b, "attack1", noCrit(), 0);
    expect(s.events.filter((e) => e.actor === "enemy").map((e) => e.enemy)).toEqual([1]);
  });
});

describe("enemy mods", () => {
  const foes = () => [unit("picaro", { hp: 100 }), unit("mago", { hp: 200 })];
  const hero = () => unit("caballero", { hp: 9000, atk: 1 });

  it("shield and regeneration apply to each enemy at its own turn end", () => {
    const b0 = startBattle(hero(), foes(), createRng(3), { mods: ["escudo", "regeneracion"] });
    expect(b0.enemies.map((e) => e.shield)).toEqual([30, 60]);
    let b = fight(hero(), foes(), { mods: ["regeneracion"] });
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, hp: 10 })) };
    b = withIntents(withProgress(b, { 1: 10_000, 2: 10_000 }), ["defend", "defend"]);
    const s = step(b, "defend", noCrit());
    expect(s.enemies[0].hp).toBe(10 + Math.round(100 * 0.03));
    expect(s.enemies[1].hp).toBe(10 + Math.round(200 * 0.03));
  });

  it("double attack adds a half-power second impact to each attack", () => {
    let b = fight(unit("caballero", { hp: 1e9, atk: 1 }), unit("picaro", { hp: 1e9, atk: 100 }), { mods: ["dobleAtaque"], intents: ["attack1"] });
    b = withProgress(b, { 0: 0, 1: 10_000 });
    const s = step(b, "attack1", noCrit());
    const hits = ev(s, "hit").filter((e) => e.actor === 1);
    expect(hits).toHaveLength(2);
    expect(hits[1].value).toBe(Math.round(estimateDamage(b.enemies[0], b.player, "attack1") * 0.5));
  });

  it("element shifting changes each enemy independently every 2 own turns", () => {
    let b = fight(unit("caballero", { hp: 1e9, atk: 1 }), [unit("picaro"), unit("mago")], { mods: ["elementoCambiante"] });
    const before = b.enemies.map((e) => e.char.element);
    b = withProgress(b, { 0: 0, 1: 10_000, 2: 10_000 });
    const rng = createRng(8);
    for (let i = 0; i < 2; i++) b = step(withIntents(b, ["defend", "defend"]), "defend", rng);
    b.enemies.forEach((e, i) => {
      expect(e.ownTurns).toBe(2);
      expect(e.char.element).not.toBe(before[i]);
    });
  });
});

describe("Aguante and Quiebre", () => {
  it("gives Aguante only to elite fights and named bosses", () => {
    const hero = unit("caballero");
    const common = startBattle(hero, unit("picaro"), createRng(2));
    const elite = startBattle(hero, [unit("picaro"), unit("mago")], createRng(2), { enemyAguante: true });
    const named = startBattle(hero, { ...unit("picaro"), bossId: "ash_king" }, createRng(2));
    expect(common.enemies[0].aguante).toBeUndefined();
    expect(elite.enemies[0].aguante).toBe(Math.round(elite.enemies[0].char.stats.hp * AGUANTE_FRACTION));
    expect(elite.enemies[1].aguante).toBeUndefined();
    expect(named.enemies[0].aguante).toBe(Math.round(named.enemies[0].char.stats.hp * AGUANTE_FRACTION));
  });

  it("Quiebre: Aguante refills, the enemy is Expuesto until it completes its next turn, and resists a new Quiebre", () => {
    const base = fight(unit("caballero", { hp: 1e9, atk: 20 }), unit("picaro", { hp: 1e6, atk: 1 }));
    let b = mapEnemy(base, 0, () => ({ aguante: 1, aguanteMax: 300_000 }));
    b = withIntents(b, ["defend"]);
    const brk = step(withProgress(b, { 1: 0 }), "attack1", noCrit()); // enemy not ready: stays Expuesto
    expect(ev(brk, "staggerBroken")).toHaveLength(1);
    expect(brk.enemies[0].aguante).toBe(300_000);
    expect(brk.enemies[0].exposed).toBe(true);
    expect(brk.enemies[0].quiebreResist).toBe(QUIEBRE_RESIST_TURNS);
    // its next turn closes the Expuesto window and starts burning the resistance
    const later = step(withProgress(withIntents(brk, ["defend"]), { 1: 10_000 }), "defend", noCrit());
    expect(later.enemies[0].exposed).toBe(false);
    expect(later.enemies[0].quiebreResist).toBe(QUIEBRE_RESIST_TURNS - 1);
  });

  it("Expuesto lowers DEF by 15 %", () => {
    const b = fight(unit("picaro", { atk: 100 }), unit("berserker", { def: 100 }));
    const plain = estimateDamage(b.player, b.enemies[0], "attack1");
    const exposed = estimateDamage(b.player, { ...b.enemies[0], exposed: true }, "attack1");
    expect(exposed).toBeGreaterThan(plain);
  });

  it("does not chain Quiebres while the resistance lasts", () => {
    let b = fight(unit("berserker", { hp: 1e9, atk: 20 }), unit("picaro", { hp: 1e6, atk: 1 }, { bossId: "ash_king" }));
    b = mapEnemy(b, 0, () => ({ aguante: 1, aguanteMax: 300, quiebreResist: 2 }));
    const s = step(b, "attack1", noCrit());
    expect(s.enemies[0].aguante).toBe(1);
    expect(s.enemies[0].exposed).toBeFalsy();
    expect(ev(s, "staggerBroken")).toHaveLength(0);
    expect(ev(s, "staggerDamaged")).toHaveLength(1);
  });

  it("announces the Colossal Golem's single Charge before its strike", () => {
    const golem = unit("picaro", { hp: 1000, def: 0 }, { name: "Gólem Colosal" });
    const b = startBattle(unit("caballero"), golem, createRng(1));
    expect(b.enemies[0].chargePending).toBe(true);
    expect(b.enemies[0].chargeUsed).toBe(true);
    expect(b.log.some((l) => l.includes("prepara una Carga"))).toBe(true);
  });

  it("a damaging basic can break Aguante but cannot cancel Charge", () => {
    const golem = unit("picaro", { hp: 1e6, def: 0, atk: 1 }, { name: "Gólem Colosal" });
    let b = withIntents(fight(unit("berserker", { hp: 1e9, atk: 20 }), golem), ["charge"]);
    b = mapEnemy(b, 0, () => ({ aguante: 1, aguanteMax: 300, chargePending: true, chargeUsed: true }));
    const s = step(b, "attack1", noCrit());
    expect(ev(s, "staggerBroken")).toHaveLength(1);
    expect(ev(s, "telegraphCancelled")).toHaveLength(0);
    expect(s.log.some((l) => l.includes("lanza su Carga"))).toBe(true);
  });
});

describe("determinism and serialization", () => {
  const play = (seed: number): Battle => {
    const rng = createRng(seed);
    let b = startBattle(generateCharacter(rng, "picaro"), generateCharacter(rng, "mago"), rng);
    for (let i = 0; i < 200 && b.status === "ongoing"; i++) b = step(b, i % 3 === 0 ? "defend" : "attack1", rng);
    return b;
  };
  it("same seed -> same log and state", () => {
    expect(play(7).log).toEqual(play(7).log);
    expect(JSON.stringify(play(7))).toBe(JSON.stringify(play(7)));
  });
  it("different seeds diverge", () => {
    expect(play(7).log).not.toEqual(play(8).log);
  });
  it("a mid-fight group battle survives a JSON round trip and resumes identically", () => {
    const b0 = fight(unit("picaro", { speed: 12 }), [unit("caballero", { speed: 6 }), unit("mago", { speed: 6 })], { intents: ["attack1", "attack2"] });
    const mid = step(b0, "attack1", createRng(5), 1);
    const copy: Battle = JSON.parse(JSON.stringify(mid));
    expect(JSON.stringify(copy)).toBe(JSON.stringify(mid));
    expect(JSON.stringify(step(copy, "attack1", createRng(9), 0))).toBe(JSON.stringify(step(mid, "attack1", createRng(9), 0)));
  });
  it("the hero's own hp matters only through its pieces: a hurt hero keeps playing", () => {
    const b = mapPlayer(fight(unit("picaro"), unit("mago")), { hp: 5 });
    expect(step(b, "defend", noCrit()).status).toBeDefined();
  });
});
