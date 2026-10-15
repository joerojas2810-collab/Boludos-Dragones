// Perfect-guard arithmetic, group fights and the three auto policies on the turn engine.
import { describe, expect, it } from "vitest";
import { autoBlockReason, autoPolicy, autoResolve, AUTO_STOP_HP } from "./auto";
import { CLASS_PASSIVE_DMG_REDUCTION, CLASSES, CLASS_IDS, generateCharacter } from "./characters";
import {
  actionError,
  DAMAGE_SCALE,
  DEFEND_FACTOR,
  estimateDamage,
  PERFECT_GUARD_FACTOR,
  startBattle,
  step,
} from "./combat";
import { createRng } from "./rng";
import { defaultLoadout, type Loadout } from "./skills";
import { addStatus } from "./statuses";
import { fight, mapEnemy, noCrit, unit, withIntents } from "./testkit";

describe("perfect guard arithmetic", () => {
  const foe = unit("picaro", { atk: 30 });

  it("cuts the strong hit to PERFECT_GUARD_FACTOR, replacing (not stacking on) the normal defend", () => {
    const b = fight(unit("mago", { hp: 1000 }), foe, { intents: ["attack2"] });
    const plain = estimateDamage(b.enemies[0], b.player, "attack2");
    const normal = estimateDamage(b.enemies[0], { ...b.player, defending: true }, "attack2");
    const perfect = estimateDamage(b.enemies[0], { ...b.player, defending: true, guard: true }, "attack2");
    expect(Math.abs(normal - plain * DEFEND_FACTOR)).toBeLessThanOrEqual(1);
    expect(Math.abs(perfect - plain * PERFECT_GUARD_FACTOR)).toBeLessThanOrEqual(1);
    expect(perfect).toBeGreaterThan(plain * DEFEND_FACTOR * PERFECT_GUARD_FACTOR * 1.5);
  });

  it("composes with Muralla and relic reductions by multiplying once", () => {
    const b = fight(unit("caballero", { hp: 1000 }), foe, { intents: ["attack2"] });
    const me = { ...b.player, defending: true, guard: true, perks: { dmgReduction: 0.2 } };
    const expected =
      foe.stats.atk * CLASSES.picaro.attack2.power * DAMAGE_SCALE * PERFECT_GUARD_FACTOR * 0.8 * (1 - CLASS_PASSIVE_DMG_REDUCTION);
    expect(estimateDamage(b.enemies[0], me, "attack2")).toBe(Math.max(1, Math.round(expected)));
  });

  it("the guard is spent by the strong hit, not by the defend window ending", () => {
    const b = fight(unit("mago", { hp: 1e6 }), foe, { intents: ["attack2"] });
    const s = step(b, "defend", noCrit());
    expect(s.player.guard).toBe(false); // dropped when the next own turn began
    expect(b.player.hp - s.player.hp).toBe(estimateDamage(b.enemies[0], { ...b.player, defending: true, guard: true }, "attack2"));
  });
});

describe("auto policy", () => {
  const strong = () => unit("caballero", { hp: 800, atk: 60 });
  const weakFoes = () => [unit("mago", { hp: 100, atk: 3 }), unit("picaro", { hp: 100, atk: 3 })];
  const sample = (loadout: Loadout, cls: Parameters<typeof unit>[0], res = 3) => fight(unit(cls, { hp: 5000, atk: 20 }), unit("picaro", { hp: 5000, atk: 20 }), { loadout, res });

  it("autoResolve plays to the end deterministically", () => {
    const run = (seed: number) => autoResolve(startBattle(strong(), weakFoes(), createRng(2)), createRng(seed));
    const a = run(5);
    expect(a.status).toBe("won");
    expect(JSON.stringify(run(5))).toBe(JSON.stringify(a));
  });

  it("is allowed at any hp, but not mid-fight", () => {
    const b = startBattle(strong(), weakFoes(), createRng(2));
    expect(autoBlockReason(b)).toBeNull();
    expect(autoBlockReason(step(b, "attack1", createRng(2)))).toMatch(/empezar/);
    expect(autoBlockReason({ ...b, player: { ...b.player, hp: 300 } })).toBeNull();
  });

  it("hands control back when the hero gets too hurt", () => {
    const b = startBattle(unit("caballero", { hp: 100, atk: 1 }), unit("picaro", { hp: 5000, atk: 25 }), createRng(2));
    const out = autoResolve(b, createRng(2));
    expect(out.status).toBe("ongoing");
    expect(out.player.hp).toBeLessThan(100 * AUTO_STOP_HP);
  });

  it("never proposes an illegal action, with any policy, class or loadout", () => {
    for (const policy of ["contextual", "naive", "basic"] as const) {
      for (const cls of CLASS_IDS) {
        const rng = createRng(11);
        let b = startBattle(generateCharacter(rng, cls), [generateCharacter(rng, "mago"), generateCharacter(rng, "picaro")], rng, {
          loadout: defaultLoadout(cls),
        });
        for (let i = 0; i < 80 && b.status === "ongoing"; i++) {
          const pick = autoPolicy(b, { policy });
          expect(actionError(b, pick.action, pick.target), `${policy}/${cls}/${pick.action}`).toBeNull();
          b = step(b, pick.action, rng, pick.target);
        }
      }
    }
  });

  it("is a pure function of the public state (no RNG, no hidden input)", () => {
    const b = fight(unit("mago", { hp: 800 }), [unit("picaro", { atk: 30 }), unit("berserker")], { res: 2, intents: ["attack2", "attack1"] });
    const a = autoPolicy(b);
    for (let i = 0; i < 5; i++) expect(autoPolicy(b)).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(JSON.parse(JSON.stringify(b))));
  });

  it("the basic policy only attacks; the naive one spends the strongest affordable skill", () => {
    const b = sample(["knight_advance", "knight_breaker"], "caballero", 2);
    expect(autoPolicy(b, { policy: "basic" }).action).toBe("attack1");
    expect(autoPolicy(b, { policy: "naive" }).action).toBe("knight_breaker");
    expect(autoPolicy(sample(["knight_advance", "knight_breaker"], "caballero", 1), { policy: "naive" }).action).toBe("knight_advance");
  });

  it("contextual: defends against announced strong hits that would hurt, not with guard off", () => {
    const b = fight(unit("caballero", { hp: 100, atk: 10 }), unit("picaro", { atk: 60 }), { intents: ["attack2"] });
    expect(autoPolicy(b).action).toBe("defend");
    expect(autoPolicy(b, { guard: false }).action).not.toBe("defend");
  });

  it("contextual: spends a full resource instead of wasting a generator", () => {
    const b = sample(["knight_advance", "knight_breaker"], "caballero", 3);
    expect(autoPolicy(b).action).toBe("knight_breaker");
  });

  it("contextual: picks the right canceller for an announced ritual and ignores it without one", () => {
    const queen = () => ({ ...unit("mago", { hp: 5000, atk: 10 }), bossId: "withered_queen", name: "Reina" });
    const mk = (cls: Parameters<typeof unit>[0], loadout: Loadout) =>
      withIntents(fight(unit(cls, { hp: 5000, atk: 20 }), queen(), { loadout, res: 3 }), ["channeling"]);
    expect(autoPolicy(mk("mago", ["mage_seal", "mage_inscribe"])).action).toBe("mage_seal");
    expect(autoPolicy(mk("picaro", ["rogue_sabotage", "rogue_feint"])).action).toBe("rogue_sabotage");
    // Knight and Berserker have no interruptor: Defender is not a cancel and must not be believed to be one
    for (const [cls, loadout] of [["caballero", ["knight_advance", "knight_breaker"]], ["berserker", ["berserker_charge", "berserker_release"]]] as const) {
      const pick = autoPolicy(mk(cls, [...loadout]));
      expect(actionError(mk(cls, [...loadout]), pick.action, pick.target)).toBeNull();
    }
  });

  it("contextual: uses the Aguante breaker to stop a nearly broken Charge", () => {
    const golem = { ...unit("caballero", { hp: 5000, atk: 60 }), name: "Gólem Colosal" };
    let b = withIntents(fight(unit("caballero", { hp: 5000, atk: 20 }), golem, { res: 2 }), ["charge"]);
    b = mapEnemy(b, 0, () => ({ aguante: 1, chargePending: true, chargeUsed: true }));
    expect(autoPolicy(b, { guard: false })).toEqual({ action: "knight_breaker", target: 0 });
    const shatter = withIntents(
      mapEnemy(fight(unit("berserker", { hp: 5000, atk: 20 }), golem, { res: 2, loadout: ["berserker_charge", "berserker_shatter"] }), 0, () => ({ aguante: 1, chargePending: true, chargeUsed: true })),
      ["charge"],
    );
    expect(autoPolicy(shatter, { guard: false })).toEqual({ action: "berserker_shatter", target: 0 });
  });

  it("contextual: exploits a capped Quemadura tick through a consuming skill", () => {
    let b = fight(unit("caballero", { hp: 5000, atk: 20 }, { element: "fuego" }), unit("mago", { hp: 100_000, atk: 1 }), { res: 2 });
    b = mapEnemy(b, 0, () => ({ statuses: addStatus(undefined, "quemadura", 2, 10_000) }));
    expect(autoPolicy(b, { guard: false })).toEqual({ action: "knight_breaker", target: 0 });
  });

  it("contextual: prefers the area skill against a group", () => {
    const foes = [unit("mago", { hp: 100, atk: 3 }), unit("picaro", { hp: 100, atk: 3 }), unit("clerigo", { hp: 100, atk: 3 })];
    const b = fight(unit("caballero", { hp: 800, atk: 40 }), foes, { res: 2, loadout: ["knight_sweep", "knight_advance"] });
    expect(autoPolicy(b).action).toBe("knight_sweep");
  });

  it("the weak, dangerous target is chosen over a tanky one", () => {
    const b = fight(strong(), [unit("mago", { hp: 900, atk: 3 }), unit("picaro", { hp: 20, atk: 40 })]);
    expect(autoPolicy(b, { policy: "basic" }).target).toBe(1);
  });
});
