// The 20 skills of the first delivery (docs/ideal/01 §5-6): catalog, loadouts, cooldown
// semantics, class identity, element consumption.
import { describe, expect, it } from "vitest";
import { CLASS_IDS, type ClassId } from "./characters";
import {
  actionError,
  attackOf,
  BURN_CONSUME_TICKS,
  equippedSkills,
  estimateDamage,
  FROST_DELAY,
  MAGE_CONSUME_MULT,
  RUPTURE_BYPASS_PER_CHARGE,
  skillBlockReason,
  SOBRECARGA_DISCHARGE,
  step,
  TURN_THRESHOLD,
  WIND_ADVANCE,
  type Battle,
} from "./combat";
import type { Element } from "./elements";
import {
  ACTIVE_HEAL_CAP,
  defaultLoadout,
  EMPTY_MASTERY,
  isSkillUnlocked,
  loadoutError,
  newlyUnlocked,
  RESOURCE_NAME,
  sanitizeLoadout,
  SHIELD_CAP,
  SKILL_IDS,
  SKILLS,
  skillsOfClass,
  type Loadout,
  type SkillId,
} from "./skills";
import type { StatusEffect } from "./statuses";
import { WEAPON_TYPE_DATA, WEAPON_TYPES } from "./weapons";
import { fight, mapEnemy, mapPlayer, noCrit, allRolls, unit, withIntents } from "./testkit";

const ev = (b: Battle, type: string) => b.cev.filter((e) => e.type === type);
const stat = (id: StatusEffect["id"], stacks: number, extra: Partial<StatusEffect> = {}): StatusEffect => ({ id, stacks, turns: 3, ...extra });
const PAIRS = (cls: ClassId): Loadout[] => {
  const ids = skillsOfClass(cls).map((s) => s.id);
  const out: Loadout[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
};
const foe = (over: Record<string, number> = {}) => unit("picaro", { hp: 1e6, atk: 1, ...over });
const hero = (cls: ClassId, over: Record<string, number> = {}, extra = {}) => unit(cls, { hp: 1000, atk: 20, ...over }, extra);

describe("catalog", () => {
  it("has 20 skills, 4 per class: two initial, one at mastery 5, one at 12", () => {
    expect(SKILL_IDS).toHaveLength(20);
    for (const cls of CLASS_IDS) {
      const list = skillsOfClass(cls);
      expect(list.map((s) => s.unlock)).toEqual([0, 0, 5, 12]);
      for (const s of list) expect(s.id.startsWith(cls === "caballero" ? "knight" : cls === "picaro" ? "rogue" : cls === "clerigo" ? "cleric" : cls === "mago" ? "mage" : "berserker")).toBe(true);
    }
  });

  it("resource names per class", () => {
    expect(RESOURCE_NAME).toEqual({ caballero: "Resolución", mago: "Foco", picaro: "Apertura", clerigo: "Bendición", berserker: "Furia" });
  });

  // structural rows of the contract table: cost / cooldown / target / tags
  const rows: Record<SkillId, { cost: number; cooldown: number; target: string; consume: boolean; cancels?: string }> = {
    knight_advance: { cost: 0, cooldown: 0, target: "single", consume: false },
    knight_breaker: { cost: 2, cooldown: 0, target: "single", consume: true, cancels: "break" },
    knight_bastion: { cost: 2, cooldown: 1, target: "self", consume: false },
    knight_sweep: { cost: 2, cooldown: 1, target: "all", consume: true },
    mage_inscribe: { cost: 0, cooldown: 0, target: "single", consume: false },
    mage_detonate: { cost: 2, cooldown: 0, target: "single", consume: true },
    mage_barrier: { cost: 1, cooldown: 1, target: "single", consume: false },
    mage_seal: { cost: 1, cooldown: 1, target: "single", consume: false, cancels: "interruptible" },
    rogue_feint: { cost: 0, cooldown: 0, target: "single", consume: false },
    rogue_finish: { cost: 2, cooldown: 0, target: "single", consume: true },
    rogue_step: { cost: 1, cooldown: 1, target: "single", consume: false },
    rogue_sabotage: { cost: 1, cooldown: 1, target: "single", consume: false, cancels: "interruptible" },
    cleric_judgment: { cost: 0, cooldown: 0, target: "single", consume: false },
    cleric_consecrate: { cost: 2, cooldown: 0, target: "single", consume: true },
    cleric_restore: { cost: 2, cooldown: 1, target: "self", consume: false },
    cleric_cleanse: { cost: 1, cooldown: 1, target: "self", consume: false },
    berserker_charge: { cost: 0, cooldown: 0, target: "single", consume: false },
    berserker_release: { cost: 2, cooldown: 0, target: "single", consume: true },
    berserker_recover: { cost: 2, cooldown: 1, target: "single", consume: false },
    berserker_shatter: { cost: 2, cooldown: 1, target: "single", consume: true, cancels: "break" },
  };
  it.each(SKILL_IDS)("%s keeps its contract row", (id) => {
    const d = SKILLS[id];
    const r = rows[id];
    expect([d.cost, d.cooldown, d.target, d.consume, d.cancels]).toEqual([r.cost, r.cooldown, r.target, r.consume, r.cancels]);
    expect(d.cost).toBeLessThanOrEqual(3);
    expect(d.gen).toBeLessThanOrEqual(2);
    expect(d.id).toBe(id);
    if (d.target === "self") expect(d.power).toBe(0);
    if (d.cost === 0) expect(d.gen).toBeGreaterThan(0); // the cost-0 skill is the generator
    if (d.gen > 0) expect(d.cost).toBe(0); // no skill both spends and generates
  });

  it("every class pairs a generator with a spender among its two initial skills", () => {
    for (const cls of CLASS_IDS) {
      const [a, b] = defaultLoadout(cls).map((id) => SKILLS[id]);
      expect([a.gen > 0, b.gen > 0].filter(Boolean)).toHaveLength(1);
      expect(Math.max(a.cost, b.cost)).toBe(2);
    }
  });

  it("only Inscribir and Sello add extra charges; only Remate has an exposed power", () => {
    expect(SKILL_IDS.filter((id) => SKILLS[id].extraCharge)).toEqual(["mage_inscribe", "mage_seal"]);
    expect(SKILL_IDS.filter((id) => SKILLS[id].exposedPower)).toEqual(["rogue_finish"]);
  });
});

describe("loadouts and unlocks", () => {
  it("defaults are the two initial skills", () => {
    for (const cls of CLASS_IDS) expect(defaultLoadout(cls).map((id) => SKILLS[id].unlock)).toEqual([0, 0]);
  });

  it("unlock thresholds follow class mastery; levelled mode (null) unlocks all", () => {
    expect(isSkillUnlocked("knight_bastion", 4)).toBe(false);
    expect(isSkillUnlocked("knight_bastion", 5)).toBe(true);
    expect(isSkillUnlocked("knight_sweep", 11)).toBe(false);
    expect(isSkillUnlocked("knight_sweep", 12)).toBe(true);
    expect(isSkillUnlocked("knight_sweep", null)).toBe(true);
    expect(newlyUnlocked("mago", 4, 12).map((s) => s.id)).toEqual(["mage_barrier", "mage_seal"]);
    expect(newlyUnlocked("mago", 5, 11)).toEqual([]);
    expect(EMPTY_MASTERY.mago).toBe(0);
  });

  it("all 6 pairs per class are legal when unlocked, only the initial pair at mastery 0", () => {
    for (const cls of CLASS_IDS) {
      const pairs = PAIRS(cls);
      expect(pairs).toHaveLength(6);
      for (const p of pairs) {
        expect(loadoutError(cls, p, null)).toBeNull();
        expect(loadoutError(cls, p, 12)).toBeNull();
        expect(loadoutError(cls, p, 0) === null).toBe(p.every((id) => SKILLS[id].unlock === 0));
      }
    }
  });

  it("rejects bad selections", () => {
    expect(loadoutError("mago", ["mage_inscribe"], null)).not.toBeNull();
    expect(loadoutError("mago", undefined, null)).not.toBeNull();
    expect(loadoutError("mago", ["mage_inscribe", "mage_inscribe"], null)).not.toBeNull(); // duplicate
    expect(loadoutError("mago", ["mage_inscribe", "knight_advance"], null)).not.toBeNull(); // other class
    expect(loadoutError("mago", ["mage_inscribe", "nope"], null)).not.toBeNull(); // unknown
    expect(loadoutError("mago", ["mage_inscribe", "mage_seal"], 5)).not.toBeNull(); // locked
    expect(sanitizeLoadout("mago", ["mage_inscribe", "mage_seal"], 5)).toEqual(defaultLoadout("mago"));
    expect(sanitizeLoadout("mago", ["mage_seal", "mage_inscribe"], 12)).toEqual(["mage_seal", "mage_inscribe"]);
  });

  it("both slots work: every skill of every pair is usable from either slot", () => {
    for (const cls of CLASS_IDS) {
      for (const [a, b] of PAIRS(cls)) {
        for (const loadout of [[a, b], [b, a]] as Loadout[]) {
          const bt = fight(hero(cls), foe(), { loadout, res: 3 });
          expect(equippedSkills(bt.player)).toEqual(loadout);
          for (const id of loadout) expect(actionError(bt, id, 0), `${id} in ${loadout}`).toBeNull();
          for (const other of skillsOfClass(cls).map((s) => s.id).filter((id) => !loadout.includes(id)))
            expect(skillBlockReason(bt.player, other)).toBe("No está equipada.");
        }
      }
    }
  });

  it("slot order does not change the rules", () => {
    const run = (loadout: Loadout) => {
      const s = step(fight(hero("mago"), foe(), { loadout, res: 3 }), "mage_detonate", noCrit());
      const { loadout: _l, ...player } = s.player;
      void _l;
      return JSON.stringify({ ...s, player });
    };
    expect(run(["mage_inscribe", "mage_detonate"])).toBe(run(["mage_detonate", "mage_inscribe"]));
  });
});

describe("cooldown semantics", () => {
  it("C=1: used on turn 1, blocked on turn 2, free on turn 3", () => {
    let b = fight(hero("picaro"), foe(), { loadout: ["rogue_sabotage", "rogue_finish"], res: 3 });
    expect(actionError(b, "rogue_sabotage", 0)).toBeNull();
    b = step(b, "rogue_sabotage", noCrit()); // turn 1
    expect(b.player.cds?.rogue_sabotage).toBe(1);
    expect(skillBlockReason(b.player, "rogue_sabotage")).toMatch(/enfriamiento/);
    expect(step(b, "rogue_sabotage", noCrit())).toBe(b); // turn 2: refused, nothing spent
    b = step(b, "attack1", noCrit()); // turn 2: something else
    expect(skillBlockReason(b.player, "rogue_sabotage")).toBeNull(); // turn 3
    expect(step(b, "rogue_sabotage", noCrit())).not.toBe(b);
  });

  it("C=1 is not shortened by the very action that sets it, whatever else is used", () => {
    let b = fight(hero("picaro"), foe(), { loadout: ["rogue_sabotage", "rogue_finish"], res: 3 });
    b = step(b, "rogue_finish", noCrit()); // another skill first
    b = step(b, "rogue_sabotage", noCrit());
    expect(b.player.cds?.rogue_sabotage).toBe(1);
    b = step(b, "defend", noCrit()); // defending also counts as a turn
    expect(b.player.cds?.rogue_sabotage ?? 0).toBe(0);
  });

  it("C=0 has no block: usable on consecutive turns (costs still apply)", () => {
    let b = fight(hero("caballero"), foe(), { res: 0 });
    for (let i = 0; i < 3; i++) {
      expect(actionError(b, "knight_advance", 0)).toBeNull();
      b = step(b, "knight_advance", noCrit());
    }
    expect(b.player.cds?.knight_advance).toBeUndefined();
    expect(b.player.res).toBe(3);
    b = step(b, "knight_breaker", noCrit());
    expect(actionError(b, "knight_breaker", 0)).toMatch(/recurso/); // 1 left, needs 2: not a cooldown
  });
});

describe("damage skills: P is a multiple of the same actor's basic", () => {
  const damaging = SKILL_IDS.filter((id) => SKILLS[id].power > 0 && SKILLS[id].target === "single");
  it.each(damaging)("%s deals estimateDamage(P) to the chosen target only", (id) => {
    const d = SKILLS[id];
    const foes = [foe(), foe(), foe()];
    let b = fight(hero(d.classId), foes, { res: 3, loadout: [id, defaultLoadout(d.classId).find((x) => x !== id)!] });
    b = withIntents(b, ["defend", "defend", "defend"]);
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, defending: false })) };
    const s = step(b, id, noCrit(), 1);
    expect(b.enemies[1].hp - s.enemies[1].hp).toBe(estimateDamage(b.player, b.enemies[1], id));
    expect(s.enemies[0].hp).toBe(b.enemies[0].hp);
    expect(s.enemies[2].hp).toBe(b.enemies[2].hp);
    // basic * P (before rounding), so the skill never applies element/crit/def twice
    const basic = estimateDamage(b.player, b.enemies[1], "attack1");
    expect(Math.abs(estimateDamage(b.player, b.enemies[1], id) - basic * d.power)).toBeLessThanOrEqual(2);
  });

  it("support skills deal no damage and apply no elemental charge", () => {
    for (const id of SKILL_IDS.filter((x) => SKILLS[x].power === 0)) {
      const d = SKILLS[id];
      const b = fight(hero(d.classId), foe(), { res: 3, loadout: [id, defaultLoadout(d.classId).find((x) => x !== id)!] });
      const s = step(b, id, noCrit());
      expect(s.enemies[0].hp).toBe(b.enemies[0].hp);
      expect(s.enemies[0].statuses?.length ?? 0).toBe(0);
      expect(s.player.res).toBe(3 - d.cost);
    }
  });
});

describe("weapon profile is preserved", () => {
  it("the basic keeps the weapon's profile and every skill scales that same basic", () => {
    for (const type of WEAPON_TYPES) {
      const char = unit("caballero", {}, { weapon: { element: "fuego", atkBonus: 0, type } });
      const p = fight(char, foe()).player;
      const info = WEAPON_TYPE_DATA[type].basic;
      const basic = attackOf(p, "attack1");
      if (info) {
        expect(basic.name).toBe(info.name);
        expect(basic.power).toBe(info.power);
      }
      for (const id of SKILL_IDS.filter((x) => SKILLS[x].classId === "caballero" && SKILLS[x].power > 0)) {
        expect(attackOf(p, id).power).toBeCloseTo(basic.power * SKILLS[id].power);
        expect(attackOf(p, id).name).toBe(SKILLS[id].name);
      }
    }
  });

  it("the weapon's element never replaces the hero's element for status or advantage", () => {
    const withWeapon = unit("caballero", {}, { element: "agua", weapon: { element: "rayo", atkBonus: 0, type: "espada" } });
    const b = step(fight(withWeapon, foe()), "attack1", noCrit());
    expect(b.enemies[0].statuses?.[0].id).toBe("escarcha"); // Agua, from the hero
  });
});

describe("Caballero", () => {
  it("Avance generates; Rompeguardia hits the Aguante harder (A 1.25 vs 0.25)", () => {
    const f = foe();
    const base = fight(hero("caballero"), f, { res: 3 });
    const withAg = mapEnemy(base, 0, (e) => ({ aguante: 100_000, aguanteMax: 100_000, char: e.char }));
    const adv = step(withAg, "knight_advance", noCrit());
    const brk = step(withAg, "knight_breaker", noCrit());
    const dAdv = withAg.enemies[0].hp - adv.enemies[0].hp;
    const dBrk = withAg.enemies[0].hp - brk.enemies[0].hp;
    expect(withAg.enemies[0].aguante! - adv.enemies[0].aguante!).toBe(Math.round(dAdv * SKILLS.knight_advance.aguante));
    expect(withAg.enemies[0].aguante! - brk.enemies[0].aguante!).toBe(Math.round(dBrk * SKILLS.knight_breaker.aguante));
  });

  it("Rompeguardia cancels a Charge only when it causes the Quiebre", () => {
    const golem = unit("picaro", { hp: 1e6, atk: 1 }, { name: "Gólem Colosal" });
    const base = withIntents(fight(hero("caballero"), golem, { res: 3 }), ["charge"]);
    const setup = (aguante: number) => mapEnemy(base, 0, () => ({ aguante, aguanteMax: 300_000, chargePending: true, chargeUsed: true }));
    // high Aguante: no Quiebre, the Charge goes ahead
    const high = step(setup(1e9), "knight_breaker", noCrit());
    expect(ev(high, "telegraphCancelled")).toHaveLength(0);
    expect(high.log.some((l) => l.includes("lanza su Carga"))).toBe(true);
    // Aguante 1: the hit breaks it and the Charge is cancelled
    const low = step(setup(1), "knight_breaker", noCrit());
    expect(ev(low, "staggerBroken")).toHaveLength(1);
    expect(ev(low, "telegraphCancelled")).toHaveLength(1);
    expect(low.log.some((l) => l.includes("lanza su Carga"))).toBe(false);
    expect(low.enemies[0].exposed).toBe(false); // Expuesto lasts until its next activation, which already passed
    // a breaking basic hit does not cancel
    const basic = step(setup(1), "attack1", noCrit());
    expect(ev(basic, "staggerBroken")).toHaveLength(1);
    expect(ev(basic, "telegraphCancelled")).toHaveLength(0);
    expect(basic.log.some((l) => l.includes("lanza su Carga"))).toBe(true);
  });

  it("Bastión protects without attacking; Barrera attacks and adds a smaller shield, both capped at 10 %", () => {
    for (const [cls, id] of [["caballero", "knight_bastion"], ["mago", "mage_barrier"]] as const) {
      let b = fight(hero(cls), foe(), { res: 3, loadout: [id, defaultLoadout(cls)[0]] });
      b = mapEnemy(b, 0, () => ({ statuses: [stat("escarcha", 2)] }));
      b = mapPlayer(b, { statuses: [stat("impulso", 1)], charge: 2 });
      const s1 = step(b, id, noCrit());
      expect(ev(s1, "shieldChanged")[0].value).toBe(Math.round(1000 * SKILLS[id].shield!));
      expect(s1.enemies[0].statuses?.find((x) => x.id === "escarcha")?.stacks).toBe(cls === "mago" ? 3 : 2); // Barrier applies, neither consumes
      expect(s1.player.charge).toBe(2);
      expect(ev(s1, "statusConsumed")).toHaveLength(0);
      expect(s1.player.res).toBe(3 - SKILLS[id].cost); // no generation
      // second use (after the cooldown) tops up to the cap only
      let b2 = step(mapPlayer(s1, { res: 3 }), "attack1", noCrit());
      b2 = step(mapPlayer(b2, { res: 3, shield: 80 }), id, noCrit());
      expect(ev(b2, "shieldChanged").at(-1)?.value).toBe(Math.round(1000 * SHIELD_CAP));
    }
  });

  it("Corte amplio hits every living enemy and spares the dead", () => {
    const foes = [foe(), foe(), foe()];
    let b = fight(hero("caballero"), foes, { res: 3, loadout: ["knight_sweep", "knight_advance"] });
    b = mapEnemy(b, 1, () => ({ hp: 0 }));
    const s = step(b, "knight_sweep", noCrit());
    expect(ev(s, "hit").filter((e) => e.actor === 0)).toHaveLength(2);
    expect(s.enemies[1].hp).toBe(0);
    for (const i of [0, 2]) expect(b.enemies[i].hp - s.enemies[i].hp).toBe(estimateDamage(b.player, b.enemies[i], "knight_sweep"));
  });
});

describe("Mago", () => {
  it("Detonar consumes with x1.25 over the same effect of another class (per element)", () => {
    const setup = (cls: ClassId, el: Element, id: SkillId, st: StatusEffect[], self: StatusEffect[] = [], charge = 0) => {
      let b = fight(hero(cls, {}, { element: el }), foe(), { res: 3, loadout: [id, defaultLoadout(cls)[0] === id ? defaultLoadout(cls)[1] : defaultLoadout(cls)[0]] });
      b = mapEnemy(b, 0, () => ({ statuses: st, progress: 9000 }));
      b = mapPlayer(b, { statuses: self, charge });
      return step(b, id, noCrit());
    };
    // Fuego: burn ticks advanced
    const q = [stat("quemadura", 2, { amount: 100 })];
    const fk = ev(setup("caballero", "fuego", "knight_breaker", q), "statusConsumed")[0].value!;
    const fm = ev(setup("mago", "fuego", "mage_detonate", q), "statusConsumed")[0].value!;
    expect(fk).toBe(Math.round(200 * BURN_CONSUME_TICKS));
    expect(fm).toBe(Math.round(200 * BURN_CONSUME_TICKS * MAGE_CONSUME_MULT));
    // Agua: delay of the target's progress (5/10/15 % per charges)
    for (const n of [1, 2, 3]) {
      const k = ev(setup("caballero", "agua", "knight_breaker", [stat("escarcha", n)]), "progressChanged")[0].value!;
      const m = ev(setup("mago", "agua", "mage_detonate", [stat("escarcha", n)]), "progressChanged")[0].value!;
      expect(k).toBe(-Math.round(TURN_THRESHOLD * FROST_DELAY[n]));
      expect(m).toBe(-Math.round(TURN_THRESHOLD * FROST_DELAY[n] * MAGE_CONSUME_MULT));
    }
    // Viento: advance own progress after paying the turn (10/20/30 %)
    for (const n of [1, 2, 3]) {
      const k = ev(setup("caballero", "viento", "knight_breaker", [], [stat("impulso", n)]), "progressChanged")[0].value!;
      const m = ev(setup("mago", "viento", "mage_detonate", [], [stat("impulso", n)]), "progressChanged")[0].value!;
      expect(k).toBe(Math.round(TURN_THRESHOLD * WIND_ADVANCE[n]));
      expect(m).toBe(Math.round(TURN_THRESHOLD * WIND_ADVANCE[n] * MAGE_CONSUME_MULT));
    }
    // Tierra: next own attack ignores 8/16/24 % DEF
    for (const n of [1, 2, 3]) {
      const k = setup("caballero", "tierra", "knight_breaker", [stat("ruptura", n)]).player.nextAttackDefenseBypass;
      const m = setup("mago", "tierra", "mage_detonate", [stat("ruptura", n)]).player.nextAttackDefenseBypass;
      expect(k).toBeCloseTo(n * RUPTURE_BYPASS_PER_CHARGE);
      expect(m).toBeCloseTo(n * RUPTURE_BYPASS_PER_CHARGE * MAGE_CONSUME_MULT);
    }
    // Rayo: only at 3 charges, an extra 0.60 of a basic; 1 or 2 charges neither consume nor add damage
    for (const n of [1, 2]) {
      const s = setup("caballero", "rayo", "knight_breaker", [], [], n);
      expect(ev(s, "statusConsumed")).toHaveLength(0);
      expect(s.player.charge).toBe(n);
    }
    const rk = setup("caballero", "rayo", "knight_breaker", [], [], 3);
    const rm = setup("mago", "rayo", "mage_detonate", [], [], 3);
    expect(rk.player.charge).toBe(0);
    expect(ev(rm, "statusConsumed")[0].value!).toBeGreaterThan(ev(rk, "statusConsumed")[0].value!);
    expect(SOBRECARGA_DISCHARGE).toBe(0.6);
  });

  it("consuming skills add no charge of their own and Sobrecarga is not rebuilt by the consume", () => {
    const b = mapPlayer(fight(hero("mago", {}, { element: "rayo" }), foe(), { res: 3 }), { charge: 3 });
    const s = step(b, "mage_detonate", noCrit());
    expect(s.player.charge).toBe(0);
  });

  it("Sello cancels only an interruptible ritual; Sabotaje too; neither cancels a strong hit or a Charge", () => {
    for (const [cls, id] of [["mago", "mage_seal"], ["picaro", "rogue_sabotage"]] as const) {
      const queen = unit("mago", { hp: 1e6, atk: 1 }, { bossId: "withered_queen", name: "Reina" });
      const mk = (intent: "channeling" | "attack2" | "charge") =>
        withIntents(fight(hero(cls), queen, { res: 3, loadout: [id, defaultLoadout(cls)[0]] }), [intent]);
      const cancelled = step(mk("channeling"), id, noCrit());
      expect(ev(cancelled, "telegraphCancelled")).toHaveLength(1);
      expect(cancelled.log.some((l) => l.includes("completa su ritual"))).toBe(false);
      expect(cancelled.player.statuses?.some((x) => x.id === "ruptura")).toBeFalsy();
      for (const other of ["attack2", "charge"] as const) {
        const kept = step(mk(other), id, noCrit());
        expect(ev(kept, "telegraphCancelled")).toHaveLength(0);
      }
    }
  });

  it("Inscribir generates its resource once", () => {
    const s = step(fight(hero("mago"), foe(), { loadout: ["mage_inscribe", "mage_detonate"] }), "mage_inscribe", noCrit());
    expect(s.player.res).toBe(SKILLS.mage_inscribe.gen);
  });
});

describe("Pícaro", () => {
  it("Finta generates its fixed amount, even on a crit (no extra for criticals)", () => {
    const b = fight(hero("picaro"), foe(), { loadout: ["rogue_feint", "rogue_finish"] });
    const s = step(b, "rogue_feint", allRolls());
    expect(ev(s, "hit").some((e) => e.actor === 0)).toBe(true);
    expect(s.player.res).toBe(SKILLS.rogue_feint.gen);
  });

  it("Remate hits harder against an Expuesto target", () => {
    const b = fight(hero("picaro"), foe(), { res: 3 });
    const plain = step(b, "rogue_finish", noCrit());
    const exposed = step(mapEnemy(b, 0, () => ({ exposed: true })), "rogue_finish", noCrit());
    const dPlain = b.enemies[0].hp - plain.enemies[0].hp;
    const dExp = b.enemies[0].hp - exposed.enemies[0].hp;
    expect(dExp / dPlain).toBeCloseTo(SKILLS.rogue_finish.exposedPower! / SKILLS.rogue_finish.power, 1);
  });

  it("Paso evasivo: the next hit received is 40 % lighter, only that one, and it expires", () => {
    const f = unit("berserker", { hp: 1e6, atk: 40, speed: 15 });
    let b = fight(hero("picaro", { hp: 1e6, speed: 7.5 }, { element: "tierra" }), f, { res: 3, loadout: ["rogue_step", "rogue_finish"], intents: ["attack1"] });
    b = { ...b, enemies: [{ ...b.enemies[0], progress: 10_000 }], player: { ...b.player, progress: 0 } };
    const s = step(b, "rogue_step", noCrit());
    const hits = ev(s, "hit").filter((e) => e.actor === 1).map((e) => e.value!);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBe(estimateDamage(b.enemies[0], { ...b.player, nextHitReduction: SKILLS.rogue_step.reduceNextHit }, "attack1"));
    expect(hits[1]).toBe(estimateDamage(b.enemies[0], b.player, "attack1")); // second hit: no reduction left
    // unused, it is gone when the next own turn begins
    const quiet = step(withIntents(mapEnemy(b, 0, () => ({ progress: 0 })), ["defend"]), "rogue_step", noCrit());
    expect(quiet.player.nextHitReduction).toBeUndefined();
  });
});

describe("Clérigo", () => {
  it("Consagrar does not heal by itself; Juicio generates", () => {
    const b = mapPlayer(fight(hero("clerigo"), foe(), { res: 3, loadout: ["cleric_judgment", "cleric_consecrate"] }), { hp: 500 });
    const s = step(b, "cleric_consecrate", noCrit());
    expect(ev(s, "healed")).toHaveLength(0);
    const j = step(fight(hero("clerigo"), foe()), "cleric_judgment", noCrit());
    expect(j.player.res).toBe(SKILLS.cleric_judgment.gen);
  });

  it("Restaurar heals 6 % of max hp once per turn, never above the cap", () => {
    const b = mapPlayer(fight(hero("clerigo"), foe(), { res: 3, loadout: ["cleric_restore", "cleric_judgment"] }), { hp: 500 });
    const s = step(b, "cleric_restore", noCrit());
    const healed = ev(s, "healed");
    expect(healed).toHaveLength(1);
    expect(healed[0].value).toBe(Math.round(1000 * SKILLS.cleric_restore.heal!));
    expect(SKILLS.cleric_restore.heal).toBeLessThanOrEqual(ACTIVE_HEAL_CAP);
    // a wounded-by-Reina hero is healed at half
    const cut = step(mapPlayer(b, { healCut: 2 }), "cleric_restore", noCrit());
    expect(ev(cut, "healed")[0].value).toBe(Math.round(1000 * 0.06 * 0.5));
  });

  it("Purificar removes the first negative status by application order, keeps buffs, adds a 3 % shield", () => {
    let b = fight(hero("clerigo"), foe(), { res: 3, loadout: ["cleric_cleanse", "cleric_judgment"] });
    b = mapPlayer(b, { statuses: [stat("impulso", 1), stat("escarcha", 2), stat("ruptura", 1)] });
    const s = step(b, "cleric_cleanse", noCrit());
    expect(s.player.statuses?.map((x) => x.id)).toEqual(["impulso", "ruptura"]);
    expect(ev(s, "shieldChanged")[0].value).toBe(Math.round(1000 * SKILLS.cleric_cleanse.shield!));
    expect(s.player.res).toBe(2);
    // the removal is announced with the status id; nothing is announced when nothing was removed
    expect(ev(s, "statusRemoved").map((e) => e.detail)).toEqual(["escarcha"]);
    const clean = step(fight(hero("clerigo"), foe(), { res: 3, loadout: ["cleric_cleanse", "cleric_judgment"] }), "cleric_cleanse", noCrit());
    expect(ev(clean, "statusRemoved")).toHaveLength(0);
    const buffOnly = step(mapPlayer(fight(hero("clerigo"), foe(), { res: 3, loadout: ["cleric_cleanse", "cleric_judgment"] }), { statuses: [stat("impulso", 1)] }), "cleric_cleanse", noCrit());
    expect(ev(buffOnly, "statusRemoved")).toHaveLength(0);
  });

  it("the Cleric's perfect guard announces the status it cleanses", () => {
    let b = fight(hero("clerigo", { hp: 1e6 }), foe(), { intents: ["attack2"] });
    b = mapPlayer(b, { statuses: [stat("escarcha", 1)] });
    const d = step(b, "defend", noCrit());
    expect(ev(d, "guardTriggered")).toHaveLength(1);
    expect(ev(d, "statusRemoved").map((e) => e.detail)).toEqual(["escarcha"]);
  });
});

describe("Paso evasivo wording", () => {
  it("logs mitigation, not evasion", () => {
    const b = fight(hero("picaro"), foe(), { res: 3, loadout: ["rogue_step", "rogue_finish"] });
    const log = step(b, "rogue_step", noCrit()).log.join("\n");
    expect(log).toContain("40 % menos");
    expect(log).not.toMatch(/esquiva/);
  });
});

describe("Berserker", () => {
  it("Embestida costs 2 % of max hp but is never lethal, and generates", () => {
    const b = fight(hero("berserker"), foe(), { loadout: ["berserker_charge", "berserker_release"] });
    const s = step(b, "berserker_charge", noCrit());
    expect(s.player.hp).toBeLessThanOrEqual(1000 - 20);
    expect(s.player.res).toBe(SKILLS.berserker_charge.gen);
    const cost = ev(s, "selfDamaged");
    expect(cost).toHaveLength(1);
    expect(cost[0]).toMatchObject({ actor: 0, target: 0, value: 20, skillId: "berserker_charge" });
    const low = step(withIntents(mapPlayer(b, { hp: 5 }), ["defend"]), "berserker_charge", noCrit());
    expect(low.player.hp).toBeGreaterThanOrEqual(1);
    expect(low.status).toBe("ongoing");
  });

  it("Sed de sangre heals 4 % when it damages and consumes nothing", () => {
    let b = mapPlayer(fight(hero("berserker", {}, { element: "fuego" }), foe(), { res: 3, loadout: ["berserker_recover", "berserker_release"] }), { hp: 500 });
    b = mapEnemy(b, 0, () => ({ statuses: [stat("quemadura", 1, { amount: 5 })] }));
    const s = step(b, "berserker_recover", noCrit());
    expect(ev(s, "healed")[0].value).toBe(Math.round(1000 * SKILLS.berserker_recover.healIfDamage!));
    expect(ev(s, "statusConsumed")).toHaveLength(0);
  });

  it("Rompemuro breaks Aguante harder and cancels a Charge on Quiebre", () => {
    const golem = unit("picaro", { hp: 1e6, atk: 1 }, { name: "Gólem Colosal" });
    let b = withIntents(fight(hero("berserker"), golem, { res: 3, loadout: ["berserker_shatter", "berserker_release"] }), ["charge"]);
    b = mapEnemy(b, 0, () => ({ aguante: 1, aguanteMax: 300_000, chargePending: true, chargeUsed: true }));
    const s = step(b, "berserker_shatter", noCrit());
    expect(ev(s, "telegraphCancelled")).toHaveLength(1);
    expect(SKILLS.berserker_shatter.aguante).toBeGreaterThan(SKILLS.knight_breaker.aguante);
  });
});

describe("retired mechanics are gone", () => {
  it("old universal actions are rejected", () => {
    const b = fight(hero("caballero"), foe());
    for (const old of ["golpe", "barrido", "quebrar", "interrumpir", "explotar"]) {
      expect(actionError(b, old as never)).not.toBeNull();
      expect(step(b, old as never, noCrit())).toBe(b);
    }
  });

  it("no hidden class hooks: a skill's damage is just P times the basic", () => {
    // The same class/element/stats with and without a Berserker low-hp or Mage hook is covered by
    // estimateDamage; here the old Clérigo 'heal on hit' hook must not exist.
    const b = mapPlayer(fight(hero("clerigo"), foe(), { res: 3 }), { hp: 500 });
    const s = step(b, "cleric_judgment", noCrit());
    expect(ev(s, "healed")).toHaveLength(0);
  });
});
