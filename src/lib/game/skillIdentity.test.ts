import { describe, expect, it } from "vitest";
import { actionError, estimateDamage, step, type Battle } from "./combat";
import { defaultLoadout, isSkillUnlocked, loadoutHints, sanitizeLoadout, skillRoles, SKILLS } from "./skills";
import { fight, mapEnemy, mapPlayer, noCrit, unit, withIntents } from "./testkit";
import { autoPolicy } from "./auto";
import { withProgress } from "./testkit";
import { ELEMENTS } from "./elements";
import { STATUS_OF_ELEMENT } from "./statuses";

const events = (b: Battle, kind: string) => b.cev.filter((e) => e.type === kind);
const hero = (cls: "mago" | "picaro" | "clerigo", element = "tierra" as typeof ELEMENTS[number]) => unit(cls, { hp: 1000, atk: 100 }, { element });
const foe = () => unit("caballero", { hp: 10000, atk: 1, speed: 7.5 });

describe("class identity revision", () => {
  it("Cleric starts as a healer; mastery 5 adds an offensive alternative without adding buttons", () => {
    expect(defaultLoadout("clerigo")).toEqual(["cleric_judgment", "cleric_restore"]);
    for (const mastery of [0, 1, 4]) {
      expect(isSkillUnlocked("cleric_restore", mastery)).toBe(true);
      expect(isSkillUnlocked("cleric_consecrate", mastery)).toBe(false);
      expect(sanitizeLoadout("clerigo", ["cleric_judgment", "cleric_consecrate"], mastery)).toEqual(defaultLoadout("clerigo"));
    }
    expect(isSkillUnlocked("cleric_consecrate", 5)).toBe(true);
    expect(sanitizeLoadout("clerigo", ["cleric_judgment", "cleric_consecrate"], 5)).toEqual(["cleric_judgment", "cleric_consecrate"]);
    expect(isSkillUnlocked("cleric_cleanse", 11)).toBe(false);
    expect(isSkillUnlocked("cleric_cleanse", 12)).toBe(true);
  });

  it("Juicio trades immediate damage for resource; basic remains useful at the cap", () => {
    const b = fight(hero("clerigo"), foe());
    const basic = step(b, "attack1", noCrit());
    const judgment = step(b, "cleric_judgment", noCrit());
    expect(events(judgment, "hit").find((e) => e.actor === 0)!.value).toBeLessThan(events(basic, "hit").find((e) => e.actor === 0)!.value!);
    expect(judgment.player.res).toBe(2);
    expect(basic.player.res).toBe(1);
    const full = mapPlayer(b, { res: 3 });
    expect(step(full, "cleric_judgment", noCrit()).player.res).toBe(3);
    expect(estimateDamage(full.player, full.enemies[0], "attack1")).toBeGreaterThan(estimateDamage(full.player, full.enemies[0], "cleric_judgment"));
  });

  it("Barrera damages and prepares element while providing smaller persistent protection than Bastión", () => {
    const b = fight(hero("mago"), foe(), { loadout: ["mage_barrier", "mage_inscribe"], res: 1 });
    const s = step(b, "mage_barrier", noCrit());
    expect(actionError(b, "mage_barrier", 0)).toBeNull();
    expect(events(s, "hit").find((e) => e.actor === 0)?.value).toBe(estimateDamage(b.player, b.enemies[0], "mage_barrier"));
    expect(events(s, "shieldChanged").find((e) => e.actor === 0)?.value).toBe(60);
    expect(events(s, "statusConsumed")).toHaveLength(0);
    expect(s.player.res).toBe(0);
    expect(SKILLS.knight_bastion.shield).toBe(0.1);
    expect(SKILLS.mage_barrier.shield).toBeLessThan(SKILLS.knight_bastion.shield!);
    expect(SKILLS.knight_bastion.power).toBe(0);
    // Protection is unconditional, even when the opponent absorbs the entire hit.
    const absorbed = step(mapEnemy(b, 0, () => ({ shield: 9999 })), "mage_barrier", noCrit());
    expect(events(absorbed, "shieldChanged").find((e) => e.actor === 0)?.value).toBe(60);
  });

  it("Paso attacks instead of replacing free Defender, keeps statuses and costs resource", () => {
    let b = fight(hero("picaro"), foe(), { loadout: ["rogue_step", "rogue_feint"], res: 1 });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "ruptura", stacks: 1, turns: 3 }] }));
    const s = step(b, "rogue_step", noCrit());
    expect(events(s, "hit").find((e) => e.actor === 0)?.value).toBeGreaterThan(0);
    expect(events(s, "statusConsumed")).toHaveLength(0);
    expect(s.player.res).toBe(0);
    expect(events(s, "guardTriggered")).toHaveLength(0);
    expect(actionError(s, "rogue_step", 0)).not.toBeNull();
    const defense = step(b, "defend", noCrit());
    expect(events(defense, "hit").filter((e) => e.actor === 0)).toHaveLength(0);
    expect(defense.player.res).toBe(1);
  });

  it.each(ELEMENTS)("Sello prepares up to two %s charges on the correct bearer and respects caps", (element) => {
    const b = fight(hero("mago", element), foe(), { loadout: ["mage_seal", "mage_inscribe"], res: 1 });
    const s = step(b, "mage_seal", noCrit());
    const id = STATUS_OF_ELEMENT[element];
    const bearer = element === "viento" || element === "rayo" ? s.player : s.enemies[0];
    expect(element === "rayo" ? bearer.charge : bearer.statuses?.find((st) => st.id === id)?.stacks).toBe(2);
    const p = element === "rayo" ? mapPlayer(b, { charge: 3 }) : element === "viento" ? mapPlayer(b, { statuses: [{ id: "impulso", stacks: 3, turns: 3 }] }) : mapEnemy(b, 0, () => ({ statuses: [{ id: id!, stacks: element === "fuego" ? 2 : 3, turns: 3 }] }));
    const capped = step(p, "mage_seal", noCrit());
    const target = element === "viento" || element === "rayo" ? capped.player : capped.enemies[0];
    expect(element === "rayo" ? target.charge : target.statuses?.find((st) => st.id === id)?.stacks).toBe(element === "fuego" ? 2 : 3);
  });

  it("Sabotaje creates a break opportunity but does not acquire the Charge cancellation tag", () => {
    let b = fight(hero("picaro"), foe(), { loadout: ["rogue_sabotage", "rogue_finish"], res: 3 });
    b = mapEnemy(withIntents(b, ["charge"]), 0, () => ({ aguante: 1, aguanteMax: 200, chargePending: true, chargeUsed: true }));
    const s = step(b, "rogue_sabotage", noCrit());
    expect(events(s, "staggerBroken")).toHaveLength(1);
    expect(events(s, "telegraphCancelled")).toHaveLength(0);
    expect(SKILLS.rogue_sabotage.aguante).toBe(1);
    expect(SKILLS.mage_seal.aguante).toBe(0.25);
  });

  it("selection communicates roles and non-blocking pair tradeoffs", () => {
    expect(skillRoles(SKILLS.mage_seal)).toContain("Prepara elemento");
    expect(skillRoles(SKILLS.rogue_sabotage)).toContain("Rompe Aguante");
    expect(skillRoles(SKILLS.rogue_step)).toContain("Protege");
    expect(loadoutHints(defaultLoadout("clerigo")).join(" ")).toContain("Sin consumidor");
    expect(loadoutHints(["mage_barrier", "mage_seal"]).join(" ")).toContain("Sin generador");
    expect(loadoutHints(["mage_inscribe", "mage_detonate"])).toEqual([]);
  });
});

describe("contextual policy values the revised kit", () => {
  it("prepares the Mage element while a second charge fits, not after the cap", () => {
    const b = withProgress(fight(hero("mago"), foe(), { loadout: ["mage_inscribe", "mage_detonate"], res: 0 }), { 0: 10000, 1: 0 });
    expect(autoPolicy(b, { guard: false }).action).toBe("mage_inscribe");
    const capped = mapEnemy(b, 0, () => ({ statuses: [{ id: "ruptura", stacks: 3, turns: 3 }] }));
    expect(autoPolicy(capped, { guard: false }).action).toBe("attack1");
    const oneSpace = mapEnemy(b, 0, () => ({ statuses: [{ id: "ruptura", stacks: 2, turns: 3 }] }));
    expect(autoPolicy(oneSpace, { guard: false }).action).toBe("attack1");
  });
  it("does not value a one-hit ward as protection against an entire group", () => {
    const p = unit("picaro", { hp: 1000, atk: 20, speed: 10 }, { element: "tierra" });
    const e = unit("picaro", { hp: 10000, atk: 20, speed: 10 }, { element: "tierra" });
    const b = withProgress(fight(p, [e, e, e], { loadout: ["rogue_step", "rogue_sabotage"], res: 3, intents: ["attack1", "attack1", "attack1"] }), { 0: 10000, 1: 9000, 2: 8000, 3: 7000 });
    expect(autoPolicy(b, { guard: false }).action).toBe("attack1");
    const dangerousFirst = mapEnemy(b, 0, (foe) => ({ char: { ...foe.char, stats: { ...foe.char.stats, atk: 100 } } }));
    expect(autoPolicy(dangerousFirst, { guard: false }).action).toBe("rogue_step");
    const dangerousLast = mapEnemy(b, 2, (foe) => ({ char: { ...foe.char, stats: { ...foe.char.stats, atk: 100 } } }));
    expect(autoPolicy(dangerousLast, { guard: false }).action).toBe("attack1");
  });
});
