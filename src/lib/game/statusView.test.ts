// HUD view-model (statusView.ts + the Tips built on it): every prediction must equal what the engine resolves.
import { describe, expect, it } from "vitest";
import type { Character } from "./characters";
import {
  consumePreview,
  estimateDamage,
  FROST_CAP,
  RATE_MAX,
  step,
  TURN_THRESHOLD,
  WIND_CAP,
  type Battle,
  type Combatant,
  type RelicMods,
  startBattle,
} from "./combat";
import { createRng } from "./rng";
import type { Element } from "./elements";
import { SKILLS } from "./skills";
import { addStatus, tickStatuses, type StatusEffect } from "./statuses";
import { bossBadge, bossText, BOSS_TEXT, consumeHint, EXPUESTO_LINE, intentInfo, penetrationTip } from "./explain";
import {
  bossView,
  burnTick,
  consumeLines,
  healCutText,
  interruptLine,
  mitigationText,
  preparedPenetration,
  previewDamage,
  statBreakdown,
  statusChanges,
  statusRows,
  statValue,
} from "./statusView";
import { fight, mapEnemy, mapPlayer, noCrit, unit } from "./testkit";

const withEl = (c: Character, element: Element): Character => ({ ...c, element });
const foe = (over: Partial<Character["stats"]> = {}) => unit("picaro", { hp: 1_000_000, atk: 1, ...over });
const evs = (b: Battle, type: string, actor: number) => b.cev.filter((e) => e.type === type && e.actor === actor);
const progress = (b: Battle, actor: number) => evs(b, "progressChanged", actor).map((e) => e.value ?? 0);

describe("prediction == resolution (consumePreview)", () => {
  const frostHero = withEl(unit("caballero", { hp: 90_000, atk: 20 }), "agua");
  const frozen = (relic: RelicMods, prog: number, frostDelayed = false, hero = frostHero, skill: "knight_breaker" | "mage_detonate" = "knight_breaker") => {
    let b = fight(hero, foe(), { relic, res: 3 });
    b = mapEnemy(b, 0, () => ({ progress: prog, frostDelayed, statuses: [{ id: "escarcha" as const, stacks: 3, turns: 3 }] }));
    const pv = consumePreview(b.player, b.enemies[0]);
    return { pv, b, out: step(b, skill, noCrit()) };
  };

  it.each([
    ["no relic", {}],
    ["Musgo", { frostBonus: 0.04 }],
    ["over the cap", { frostBonus: 0.5 }],
  ] as [string, RelicMods][])("Escarcha delay, %s: preview delayLost = progress actually removed, cap included", (_n, relic) => {
    const { pv, out } = frozen(relic, 9000);
    expect(pv?.ready).toBe(true);
    expect(progress(out, 1)[0]).toBe(-(pv?.delayLost ?? NaN));
    expect(pv?.delayPct).toBeLessThanOrEqual(FROST_CAP);
    expect(pv?.delayLost).toBe(Math.round(TURN_THRESHOLD * (pv?.delayPct ?? 0)));
  });

  it("Escarcha: removable now is limited by the target's progress and the hint says so", () => {
    const { pv, b, out } = frozen({ frostBonus: 0.04 }, 300);
    expect(pv?.delayLost).toBe(300);
    expect(progress(out, 1)[0]).toBe(-300);
    const lines = consumeLines(b.player, b.enemies[0])!.join(" | ");
    expect(lines).toContain("19 %"); // 15 % + 4 points
    expect(lines).toContain("Ahora solo puede quitar 3 %");
    expect(consumeHint(b.player, b.enemies[0], SKILLS.knight_breaker)).toContain("19 %");
  });

  it("Escarcha: an already delayed target is consumed without a second delay, and the text says it", () => {
    const { pv, b, out } = frozen({}, 9000, true);
    expect(pv?.alreadyDelayed).toBe(true);
    expect(progress(out, 1)).toEqual([]);
    expect(out.enemies[0].statuses?.some((s) => s.id === "escarcha")).toBeFalsy();
    expect(consumeLines(b.player, b.enemies[0])![0]).toContain("sin retrasar");
  });

  it("Escarcha: Mago multiplier is part of the preview and of the resolution", () => {
    const mage = withEl(unit("mago", { hp: 90_000, atk: 20 }), "agua");
    const { pv, out } = frozen({ frostBonus: 0.04 }, 9000, false, mage, "mage_detonate");
    expect(pv?.delayPct).toBeCloseTo(Math.min(FROST_CAP, 0.15 * 1.25 + 0.04), 10);
    expect(progress(out, 1)[0]).toBe(-(pv?.delayLost ?? NaN));
  });

  it.each([
    ["no relic", {}],
    ["Reloj", { windBonus: 0.05 }],
    ["over the cap", { windBonus: 0.5 }],
  ] as [string, RelicMods][])("Impulso advance, %s", (_n, relic) => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 20 }), "viento");
    let b = fight(hero, foe(), { relic, res: 3 });
    b = mapPlayer(b, { statuses: [{ id: "impulso", stacks: 3, turns: 3 }] });
    const pv = consumePreview(b.player, b.enemies[0]);
    expect(progress(step(b, "knight_breaker", noCrit()), 0)[0]).toBe(Math.round(TURN_THRESHOLD * (pv?.advancePct ?? 0)));
    expect(pv?.advancePct).toBeLessThanOrEqual(WIND_CAP);
    if (relic.windBonus === 0.5) expect(consumeLines(b.player, b.enemies[0])![0]).toContain("tope 40 %");
  });

  it.each([
    ["no relic", {}, 100],
    ["Colmillo", { burnDmg: 0.15 }, 100],
    ["cap", { burnDmg: 0.15 }, 50_000],
  ] as [string, RelicMods, number][])("Quemadura consume, %s: preview damage = the consumed burn", (_n, relic, amount) => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 5 }), "fuego");
    let b = fight(hero, foe({ hp: 100_000 }), { relic, res: 3 });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "quemadura" as const, stacks: 2, turns: 3, amount }] }));
    const pv = consumePreview(b.player, b.enemies[0]);
    const out = step(b, "knight_breaker", noCrit());
    expect(evs(out, "statusConsumed", 0).find((e) => e.detail === "quemadura")?.value).toBe(pv?.damage);
    const cap = Math.round(100_000 * 0.06);
    expect(pv?.damage).toBeLessThanOrEqual(cap);
    const text = consumeLines(b.player, b.enemies[0])!.join(" | ");
    expect(text).toContain(`${pv?.damage} de daño`);
    if (amount > 1000) expect(text).toContain("Tope aplicado");
    else expect(text).toContain(`Un tic normal: ${burnTick(b.enemies[0], relic.burnDmg ?? 0)}`);
  });

  it("Quemadura: the tick shown is the one beginTurn applies (relic on enemies, cap)", () => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 5 }), "fuego");
    let b = fight(hero, foe({ hp: 100_000 }), { relic: { burnDmg: 0.15 } });
    b = mapEnemy(b, 0, () => ({ progress: TURN_THRESHOLD - 50, statuses: [{ id: "quemadura" as const, stacks: 1, turns: 3, amount: 100 }] }));
    const shown = burnTick(b.enemies[0], 0.15);
    const out = step(b, "defend", noCrit());
    expect(out.enemies[0].char.stats.hp - out.enemies[0].hp).toBe(shown);
  });

  it.each([
    ["no relic", {}],
    ["Sello sabio", { dischargeBonus: 0.25 }],
  ] as [string, RelicMods][])("Sobrecarga discharge, %s", (_n, relic) => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 3000 }), "rayo");
    let b = fight(hero, foe({ hp: 10_000_000 }), { relic, res: 3 });
    b = mapPlayer(b, { charge: 3 });
    const pv = consumePreview(b.player, b.enemies[0]);
    const out = step(b, "knight_breaker", noCrit());
    expect(evs(out, "statusConsumed", 0).find((e) => e.detail === "sobrecarga")?.value).toBe(pv?.damage);
    expect(consumeLines(b.player, b.enemies[0])![0]).toContain(`${pv?.damage} de daño extra`);
  });

  it("Sobrecarga below 3 charges does not promise a discharge", () => {
    const hero = withEl(unit("caballero"), "rayo");
    const b = mapPlayer(fight(hero, foe(), { res: 3 }), { charge: 2 });
    expect(consumeLines(b.player, b.enemies[0])![0]).toContain("necesita 3 cargas");
  });

  it("Ruptura: bypass preview = prepared penetration, and the damage preview counts it", () => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 30 }), "tierra");
    let b = fight(hero, foe({ def: 60 }), { relic: { pierceBonus: 0.1 }, res: 3 });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "ruptura" as const, stacks: 2, turns: 3 }] }));
    const pv = consumePreview(b.player, b.enemies[0]);
    expect(consumeLines(b.player, b.enemies[0])![0]).toContain(`${+(((pv?.bypass ?? 0)) * 100).toFixed(1)} %`);
    const after = step(b, "knight_breaker", noCrit());
    const pen = preparedPenetration(after.player);
    expect(pen?.pct).toBeCloseTo(pv?.bypass ?? NaN, 10);
    expect(pen?.text).toBe("Penetración preparada: 16 % DEF");
    expect(penetrationTip(after.player)?.lines.join(" ")).toContain("Reliquia");
    // the next attack's real damage is the preview, and spends the penetration
    const target = after.enemies[0];
    const predicted = previewDamage(after.player, target, "attack1");
    expect(predicted).toBeGreaterThan(estimateDamage(after.player, target, "attack1"));
    const hit = step(after, "attack1", noCrit());
    expect(target.hp - hit.enemies[0].hp).toBe(predicted);
    expect(preparedPenetration(hit.player)).toBeNull();
  });

  it("prepared penetration expires when the next own turn closes without an attack", () => {
    const hero = withEl(unit("caballero", { hp: 90_000, atk: 30 }), "tierra");
    let b = fight(hero, foe({ def: 60 }), { res: 3 });
    b = mapEnemy(b, 0, () => ({ statuses: [{ id: "ruptura" as const, stacks: 1, turns: 3 }] }));
    const after = step(b, "knight_breaker", noCrit());
    expect(preparedPenetration(after.player)).not.toBeNull(); // the close of the creating turn does not drop it
    expect(after.player.bypassFresh).toBeFalsy();
    const idle = step(after, "defend", noCrit());
    expect(preparedPenetration(idle.player)).toBeNull();
  });
});

describe("status rows", () => {
  const you = (statuses: StatusEffect[], extra: Partial<Combatant> = {}): Combatant => ({
    ...fight(withEl(unit("caballero"), "agua"), foe()).player,
    statuses,
    ...extra,
  });

  it("shows quantity/max and the carrier's turns, with an aria-label that has both", () => {
    const [r] = statusRows(you([{ id: "escarcha", stacks: 2, turns: 2 }]));
    expect(r.text).toBe("Escarcha 2/3 · 2 turnos propios");
    expect(r.aria).toContain("2 de 3 cargas");
    expect(r.aria).toContain("2 turnos propios");
    expect(statusRows(you([{ id: "ruptura", stacks: 1, turns: 1 }]), { you: false })[0].text).toBe("Ruptura 1/3 · 1 turno suyo");
  });

  it("Quemadura max is 2 and out-of-range stacks are clamped only in the view", () => {
    const c = you([{ id: "quemadura", stacks: 9, turns: 3, amount: 10 }]);
    const [r] = statusRows(c);
    expect(r.max).toBe(2);
    expect(r.stacks).toBe(2);
    expect(c.statuses?.[0].stacks).toBe(9);
  });

  it("one row per status, never per charge, in a stable order", () => {
    const rows = statusRows(you([
      { id: "ruptura", stacks: 3, turns: 3 },
      { id: "escarcha", stacks: 3, turns: 3 },
      { id: "impulso", stacks: 3, turns: 3 },
    ]));
    expect(rows.map((r) => r.key)).toEqual(["escarcha", "impulso", "ruptura"]);
  });

  it("resistance shortens the displayed duration of a negative status", () => {
    const plain = statusRows(you(addStatus([], "escarcha", 1)))[0];
    const resisted = statusRows(you(addStatus([], "escarcha", 1, undefined, 0.5)))[0];
    expect(plain.turns).toBe(3);
    expect(resisted.turns).toBe(2);
    expect(resisted.text).toContain("2 turnos");
  });

  it("a fresh (self-applied) status is not discounted at the same close; the next close does", () => {
    const a = addStatus([], "impulso", 1, undefined, 0, true);
    const t1 = tickStatuses(a);
    expect(statusRows(you(t1))[0].turns).toBe(3);
    expect(t1[0].fresh).toBeUndefined();
    expect(statusRows(you(tickStatuses(t1)))[0].turns).toBe(2);
  });

  it("expiry removes the row", () => {
    const list = tickStatuses([{ id: "escarcha", stacks: 1, turns: 1 }]);
    expect(statusRows(you(list))).toHaveLength(0);
  });

  it("re-applying renews the duration and adds a charge without a second row", () => {
    const first = addStatus([], "escarcha", 1);
    const old = tickStatuses(tickStatuses(first)); // 1 turn left
    expect(statusRows(you(old))[0].turns).toBe(1);
    const again = addStatus(old, "escarcha", 1);
    const rows = statusRows(you(again));
    expect(rows).toHaveLength(1);
    expect(rows[0].stacks).toBe(2);
    expect(rows[0].turns).toBe(3);
  });

  it("Sobrecarga has no turn duration; Listo only at 3/3 with a consuming skill equipped", () => {
    const rayo = withEl(unit("caballero"), "rayo");
    const base = fight(rayo, foe()).player;
    const two = statusRows({ ...base, charge: 2 })[0];
    expect(two.text).toBe("Sobrecarga 2/3 · sin duración por turnos");
    expect(two.turns).toBeNull();
    expect(two.ready).toBe(false);
    const three = statusRows({ ...base, charge: 3 })[0];
    expect(three.ready).toBe(true); // default knight loadout has Rompeguardia
    expect(three.text).toContain("Listo");
    const noConsume = statusRows({ ...base, charge: 3, loadout: ["knight_advance", "knight_bastion"] })[0];
    expect(noConsume.ready).toBe(false);
    expect(noConsume.text).not.toContain("Listo");
    const enemy = statusRows({ ...foeOf(rayo), charge: 3 })[0];
    expect(enemy.ready).toBe(false);
  });

  it("Expuesto and Ruptura are different things: only Ruptura is a row, Expuesto lasts until the next own turn completes", () => {
    const c = you([{ id: "ruptura", stacks: 1, turns: 3 }], { exposed: true });
    expect(statusRows(c).map((r) => r.key)).toEqual(["ruptura"]);
    expect(EXPUESTO_LINE).toContain("hasta que complete su próximo turno propio");
    const def = statBreakdown(c, "def");
    expect(def.mods.some((m) => m.startsWith("Ruptura"))).toBe(true);
    expect(def.mods.some((m) => m.startsWith("Expuesto"))).toBe(true);
    expect(def.effective).toBeCloseTo(def.base * 0.92 * 0.85, 10);
  });

  it("the engine drops Expuesto when the carrier completes its next own turn", () => {
    let b = fight(unit("caballero"), foe({ hp: 1_000_000, atk: 1 }), { res: 3 });
    b = mapEnemy(b, 0, () => ({ exposed: true, progress: TURN_THRESHOLD - 10 }));
    expect(step(b, "defend", noCrit()).enemies[0].exposed).toBe(false);
  });
});

function foeOf(char: Character): Combatant {
  return fight(unit("caballero"), char).enemies[0];
}

describe("announcements", () => {
  const row = (key: "escarcha" | "sobrecarga", stacks: number, ready = false) =>
    ({ key, label: key === "escarcha" ? "Escarcha" : "Sobrecarga", stacks, max: 3, ready }) as Parameters<typeof statusChanges>[0][number];

  it("announces only changes, not unchanged states or ticking durations", () => {
    const same = [row("escarcha", 2)];
    expect(statusChanges(same, [...same], "R1")).toEqual([]);
    expect(statusChanges(same, [row("escarcha", 3)], "R1")).toEqual(["R1: Escarcha 3 de 3."]);
    expect(statusChanges(same, [], "R1")).toEqual(["R1: Escarcha terminó."]);
    expect(statusChanges([row("sobrecarga", 3)], [row("sobrecarga", 3, true)], "Tú")).toEqual(["Tú: Sobrecarga lista para descargar."]);
  });

  it("announces penetration prepared and spent", () => {
    expect(statusChanges([], [], "Tú", 0, 0.16)[0]).toContain("penetración preparada");
    expect(statusChanges([], [], "Tú", 0.16, 0)[0]).toContain("ya no está activa");
    expect(statusChanges([], [], "Tú", 0.16, 0.16)).toEqual([]);
  });
});

describe("stats: base -> effective", () => {
  const mk = (over: Partial<Character["stats"]>) => fight(unit("caballero", over), foe()).player;

  it("speed follows Escarcha/Impulso and says when the global rate cap binds", () => {
    const c = { ...mk({ speed: 10 }), statuses: [{ id: "escarcha" as const, stacks: 2, turns: 3 }] };
    const b = statBreakdown(c, "speed");
    expect(b.effective).toBeCloseTo(8, 10);
    expect(statValue(b)).toBe("10 → 8");
    expect(b.mods[0]).toBe("Escarcha ×2: −20 %");
    const fast = { ...mk({ speed: 20 }), statuses: [{ id: "impulso" as const, stacks: 3, turns: 3 }] };
    const f = statBreakdown(fast, "speed");
    expect(f.effective).toBe(RATE_MAX / 100);
    expect(f.mods.some((m) => m.startsWith("Ritmo limitado"))).toBe(true);
  });

  it("an unmodified stat shows just the base", () => {
    expect(statValue(statBreakdown(mk({ atk: 20 }), "atk"))).toBe("20");
  });

  it("ATQ folds only target-independent effects (Furia, boss stance) and keeps the rest as notes", () => {
    const furious = { ...mk({ atk: 20, hp: 100 }), hp: 20, char: { ...mk({}).char, classId: "berserker" as const, stats: { ...mk({}).char.stats, atk: 20, hp: 100 } } };
    const f = statBreakdown(furious, "atk");
    expect(f.effective).toBeCloseTo(20 * 1.3, 10);
    expect(f.notes.join(" ")).toContain("depende del objetivo");
    const boss = bossOf("faceless_one", 0);
    expect(statBreakdown(boss, "atk").effective).toBeCloseTo(boss.char.stats.atk * 1.3, 10);
    expect(statBreakdown(boss, "def").effective).toBeCloseTo(boss.char.stats.def * 0.8, 10);
  });
});

function bossOf(bossId: string, ascension: number, over: Partial<Character["stats"]> = {}): Combatant {
  const char = unit("picaro", { hp: 1000, atk: 20, def: 10, ...over }, { bossId } as Partial<Character>);
  return startBattle(unit("caballero"), char, createRng(3), { ascension }).enemies[0];
}

describe("secondary conditions", () => {
  it("healCut and mitigation show size and own turns / expiry", () => {
    const c = { ...fight(unit("caballero"), foe()).player, healCut: 2, nextHitReduction: 0.4 };
    expect(healCutText(c)).toBe("Curas −50 % · 2 turnos propios");
    expect(mitigationText(c)).toBe("Mitigación −40 % al próximo golpe");
    expect(healCutText({ ...c, healCut: 0 })).toBeNull();
  });
});

describe("boss mechanics", () => {
  it("intervals come from the effective ascension, not fixed numbers", () => {
    expect(bossText("velocidad", 0).line).toContain("Cada 2 turnos");
    expect(bossText("velocidad", 4).line).toContain("Cada 1 turno");
    expect(bossText("presion", 4).line).toContain("3 niveles de presión");
    expect(bossText("marchitar", 4).line).toContain("Cada 2 turnos propios");
    expect(bossText("hambre", 5).line).toContain("45 %");
    expect(bossText("cabezas", 5).line).toContain("85 %, 60 %, 35 %");
    expect(BOSS_TEXT.aprende.line).toContain("2 veces seguidas");
    expect(bossText("aprende", 3).line).toContain("1 vez seguida");
    const v = bossView(bossOf("thunder_king", 4))!;
    expect(v.lines[0]).toBe(bossText("velocidad", 4).line);
  });

  it("Presión n/5 with its size and the guard reset", () => {
    const c = bossOf("ash_king", 0);
    c.boss = { ...c.boss!, pressure: 3 };
    const v = bossView(c)!;
    expect(v.label).toBe("Presión 3/5");
    expect(v.lines.join(" ")).toContain("+18 % de daño");
    c.boss = { ...c.boss!, pressure: 5 };
    expect(bossView(c)!.lines.join(" ")).toContain("Al máximo");
  });

  it("Aceleración n/4, next level and the speed cap", () => {
    const c = bossOf("thunder_king", 0, { speed: 14 });
    c.boss = { ...c.boss!, ramp: 2, turns: 3 };
    let v = bossView(c)!;
    expect(v.label).toBe("Aceleración 2/4");
    expect(v.lines.join(" ")).toContain("Siguiente nivel en 1 turno suyo");
    c.boss = { ...c.boss!, ramp: 4, turns: 8 };
    c.char = { ...c.char, stats: { ...c.char.stats, speed: 14 } };
    v = bossView(c)!;
    expect(v.lines.join(" ")).toContain("Al máximo de niveles");
    expect(v.lines.join(" ")).toContain("Tope de velocidad");
  });

  it("Cabezas: crossed thresholds, the next one and the extra impacts of the next attack", () => {
    const c = bossOf("mother_hydra", 0);
    c.boss = { ...c.boss!, crossed: 0b01, heads: 1 };
    const v = bossView(c)!;
    expect(v.label).toBe("Cabezas 1/3 · +1 golpe");
    expect(v.lines.join(" ")).toContain("Próxima cabeza al bajar del 50 %");
    expect(v.lines.join(" ")).toContain("1 impacto extra");
    expect(v.urgent).toBe(true);
    c.boss = { ...c.boss!, crossed: 0b111, heads: 0 };
    expect(bossView(c)!.lines.join(" ")).toContain("Ya brotaron todas");
  });

  it("a real hit that crosses the threshold shows up in the view", () => {
    let b = fight(unit("caballero", { hp: 9000, atk: 400 }), unit("picaro", { hp: 1000, atk: 1, def: 0 }, { bossId: "mother_hydra" } as Partial<Character>), { res: 3 });
    b = mapEnemy(b, 0, (e) => ({ boss: e.boss, cooldown: 999 }));
    const out = step(b, "knight_breaker", noCrit());
    expect(bossView(out.enemies[0])!.label).toMatch(/^Cabezas [1-3]\/3/);
  });

  it("Hambre states its threshold and when it is active", () => {
    const c = bossOf("great_devourer", 0);
    expect(bossView(c)!.lines.join(" ")).toContain("Se activa al bajar de 30 %");
    c.hp = 100;
    expect(bossView(c)!.label).toBe("Hambre activa");
  });

  it("Postura: current modifiers and when it changes", () => {
    const c = bossOf("faceless_one", 0);
    c.boss = { ...c.boss!, turns: 1 }; // one turn done of the 2 offensive ones
    const v = bossView(c)!;
    expect(v.label).toBe("Postura ofensiva");
    expect(v.lines.join(" ")).toContain("Cambia a defensiva al cerrar su próximo turno");
  });

  it("Armadura: shield vs Roto vs reconstruction counter", () => {
    const c = bossOf("hollow_colossus", 0);
    expect(bossView(c)!.lines.join(" ")).toContain("Armadura 300 de 300");
    c.shield = 0;
    c.boss = { ...c.boss!, broken: 2, regrow: 6 };
    const v = bossView(c)!;
    expect(v.label).toBe("Roto 2 · rearma 6");
    expect(v.lines.join(" ")).toContain("Contador de reconstrucción: 6 turnos suyos");
    expect(v.urgent).toBe(true);
    c.boss = { ...c.boss!, broken: 0, regrow: 3 };
    expect(bossView(c)!.label).toBe("Sin armadura · rearma 3");
  });

  it("Ritual is flagged interruptible when channeling and lists the equipped interrupters", () => {
    const queen = bossOf("withered_queen", 0);
    const mageSeal = fight(unit("mago"), foe(), { loadout: ["mage_inscribe", "mage_seal"], res: 3 }).player;
    const mageNone = fight(unit("mago"), foe()).player;
    queen.intent = "channeling";
    const v = bossView(queen, mageSeal)!;
    expect(v.label).toBe("Ritual · interrumpible");
    expect(v.urgent).toBe(true);
    expect(v.lines.join(" ")).toContain("Sello");
    expect(bossView(queen, mageNone)!.lines.join(" ")).toContain("Ninguna habilidad equipada");
    queen.intent = "attack1";
    queen.ownTurns = 1;
    expect(bossView(queen, mageNone)!.lines.join(" ")).toContain("se anuncia tras 2 turnos suyos");
    expect(interruptLine(undefined)).toContain("Sello o Sabotaje");
  });

  it("the intent card shows the interrupters of the equipped loadout", () => {
    let b = fight(unit("mago"), unit("picaro", { hp: 1000 }, { bossId: "withered_queen" } as Partial<Character>), { loadout: ["mage_inscribe", "mage_seal"], res: 3 });
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, intent: "channeling" as const })) };
    expect(intentInfo("channeling", b, 0).counter).toContain("Sello");
  });

  it("Vigía warns before a repeated action is punished", () => {
    const c = bossOf("eternal_watcher", 0);
    c.boss = { ...c.boss!, last: ["attack1"] };
    expect(bossView(c)!.label).toBe("Te lee 1/2");
    c.boss = { ...c.boss!, last: ["attack1", "attack1"] };
    const v = bossView(c)!;
    expect(v.label).toBe("Te lee: no repitas Básico");
    expect(v.urgent).toBe(true);
    c.boss = { ...c.boss!, last: ["attack1", "defend"] };
    expect(bossView(c)!.label).toBe("Te lee 1/2");
  });

  it("bossBadge wraps the view with the hero for the interrupt line", () => {
    const queen = bossOf("withered_queen", 0);
    expect(bossBadge(queen)?.tip.lines.join(" ")).toContain("Sello o Sabotaje");
  });
});

describe("previews", () => {
  it("previewDamage without prepared penetration equals estimateDamage", () => {
    const b = fight(unit("caballero"), foe({ def: 30 }));
    expect(previewDamage(b.player, b.enemies[0], "attack1")).toBe(estimateDamage(b.player, b.enemies[0], "attack1"));
  });
  it("consumeLines is null-safe without a target", () => {
    const hero = withEl(unit("caballero"), "fuego");
    const b = fight(hero, foe());
    expect(consumeLines(b.player, undefined)?.[0]).toContain("Sin Quemadura");
  });
});
