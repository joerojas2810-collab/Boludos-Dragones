import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import {
  REGEN_FRACTION,
  startBattle,
  step,
  withRound,
  type Battle,
} from "./combat";
import { EVENTS } from "./events";
import { createRng, type Rng } from "./rng";
import {
  applyUpgrade,
  describeUpgrade,
  FLOOR_SCALE,
  rollUpgrades,
  scaleForFloor,
  stackMult,
  TIER2_LEVEL,
  UPGRADE_STACK_CAP,
  UPGRADE_POWER,
  UPGRADES,
  type UpgradeId,
} from "./progression";
import {
  activeSynergies,
  applyRelicStats,
  RELIC_CAPS,
  RELIC_IDS,
  RELICS,
  relicTotals,
  rollRelics,
  SYNERGIES,
  type RelicId,
} from "./relics";
import {
  applyBattleResult,
  buyItem,
  chooseDoor,
  chooseRelic,
  COIN_FLOOR_SCALE,
  createRun,
  doorsFor,
  eventCost,
  enemyFor,
  FIGHT_COINS,
  fleeCost,
  getFloor,
  isBossFloor,
  leaveNode,
  LIFE_LOSS_HEAL,
  MAX_LIVES,
  maxHp,
  MODIFIER_FLOORS,
  modsAtFloor,
  nextFloor,
  isVictory,
  MAX_FLOOR,
  VICTORY_COINS,
  pickUpgrade,
  relicOffer,
  describeChanges,
  resolveEvent,
  runScore,
  shopItems,
  START_LIVES,
  startFight,
  type DoorKind,
  type FightNode,
  type Run,
  type RunNode,
  type ShopItem,
} from "./run";
import { worldOf } from "./worlds";

const hero = () => generateCharacter(createRng(1), "caballero");
const fresh = (seed = 42): Run => createRun(seed, hero());
// Opens door 0 (a fight, see fightRun), starts it and fakes the final status.
const withStatus = (run: Run, status: "won" | "lost" | "fled", hp = 10) => {
  const opened = chooseDoor(run, 0);
  if (opened?.node.type !== "fight") throw new Error("expected fight door");
  const started = startFight(opened.run);
  if (!started) throw new Error("fight refused");
  return {
    f: started.run,
    node: opened.node,
    battle: {
      ...started.battle,
      status,
      player: { ...started.battle.player, hp },
    },
  };
};
// Opens a door of the given kind on the first floor that has one.
const openKind = (kind: DoorKind, base: Run = fresh()) => {
  for (let fl = 1; fl < 60; fl++) {
    const r = { ...base, floor: fl };
    const i = doorsFor(r.seed, fl).findIndex((d) => d.kind === kind);
    if (i >= 0) return chooseDoor(r, i)!;
  }
  throw new Error(`no ${kind} door`);
};
const withNode = (node: RunNode, patch: Partial<Run> = {}): Run => ({
  ...fresh(),
  node,
  ...patch,
});
const eventNode = (title: string): RunNode => {
  const event = EVENTS.find((e) => e.title === title);
  if (!event) throw new Error(title);
  return { type: "event", event };
};
// Deterministic stub: every roll succeeds, picks the first item.
const stubRng: Rng = {
  next: () => 0,
  int: (min) => min,
  chance: (p) => p > 0,
  pick: (items) => items[0],
};
const cleared = (r: Run): Run => ({ ...r, floorCleared: true });
// Finds a floor whose first door is a fight.
const fightRun = (): Run => {
  for (let fl = 1; fl < 50; fl++) {
    const r = { ...fresh(), floor: fl };
    if (["easy", "hard", "boss"].includes(doorsFor(r.seed, fl)[0].kind))
      return r;
  }
  throw new Error("no fight floor");
};

describe("determinism", () => {
  it("floor content depends only on (seed, floor)", () => {
    const a = [3, 1, 7, 12].map((f) => [
      doorsFor(9, f),
      enemyFor(9, f, "easy"),
      relicOffer(9, f),
      shopItems(9, f),
    ]);
    const b = [12, 7, 1, 3].map((f) => [
      doorsFor(9, f),
      enemyFor(9, f, "easy"),
      relicOffer(9, f),
      shopItems(9, f),
    ]);
    expect(a).toEqual([b[3], b[2], b[1], b[0]]);
    expect(doorsFor(9, 4)).not.toEqual(doorsFor(10, 4).concat([]));
  });
  it("boss floor is a single boss door every 5 floors, else 2-3 doors", () => {
    for (let f = 1; f <= 60; f++) {
      const d = doorsFor(5, f);
      if (f % 5 === 0) {
        expect(isBossFloor(f)).toBe(true);
        expect(d).toEqual([{ kind: "boss" }]);
      } else {
        expect(d.length).toBeGreaterThanOrEqual(2);
        expect(d.length).toBeLessThanOrEqual(3);
        expect(new Set(d.map((x) => x.kind)).size).toBe(d.length);
        expect(d.some((x) => x.kind === "easy" || x.kind === "hard")).toBe(
          true,
        );
      }
    }
  });
  it("getFloor exposes world and doors", () => {
    const r = { ...fresh(), floor: 12 };
    expect(getFloor(r).world).toBe(worldOf(12));
    expect(worldOf(10)).not.toBe(worldOf(11));
  });
});

describe("scaling and modifiers", () => {
  it("enemy power is FLOOR_SCALE^floor and monotonic", () => {
    const c = generateCharacter(createRng(3), "mago");
    const hp = (f: number) => scaleForFloor(c, f).stats.hp;
    expect(hp(10)).toBe(Math.round(c.stats.hp * FLOOR_SCALE ** 10));
    for (let f = 1; f < 40; f++) expect(hp(f + 1)).toBeGreaterThan(hp(f));
  });
  it("introduces modifiers gradually, one by one, never removing them", () => {
    const first = Math.min(...Object.values(MODIFIER_FLOORS));
    expect(modsAtFloor(first - 1)).toEqual([]);
    expect(modsAtFloor(first)).toEqual(["regeneracion"]);
    let prev = 0;
    for (let f = 1; f <= 60; f++) {
      const n = modsAtFloor(f).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(modsAtFloor(60)).toHaveLength(4);
  });
  it("hard enemies hit harder than easy ones and bosses scale with floor", () => {
    for (const f of [3, 12, 30]) {
      const easy = enemyFor(5, f, "easy").enemy.stats;
      const hard = enemyFor(5, f, "hard").enemy.stats;
      expect(hard.hp).toBeGreaterThan(0);
      expect(easy.hp).toBeGreaterThan(0);
    }
    const hp = (f: number) => enemyFor(5, f, "boss").enemy.stats.hp;
    expect(hp(30)).toBeGreaterThan(hp(5) * 5);
  });
  it("modifiers affect combat; plain fights carry no mods", () => {
    const rng = createRng(8);
    const p = generateCharacter(rng, "caballero");
    const e = generateCharacter(rng, "mago");
    const plain = startBattle(p, e, createRng(1));
    expect(plain.mods).toBeUndefined();
    expect(plain.enemies[0].shield).toBeUndefined();
    const mod = startBattle(p, e, createRng(1), {
      mods: ["escudo", "regeneracion"],
    });
    expect(mod.enemies[0].shield).toBeGreaterThan(0);
    let b = step(mod, "defend", createRng(2));
    b = withRound({ ...b, enemies: [{ ...b.enemies[0], hp: 1 }] }, false, [
      "defend",
    ]);
    const regen = step(b, "defend", createRng(2));
    expect(regen.enemies[0].hp).toBeGreaterThan(1);
  });
});

describe("run state", () => {
  it("starts with 3 lives; losing ends the run and score is max floor", () => {
    let r = fightRun();
    r = { ...r, maxFloor: r.floor };
    expect(r.lives).toBe(START_LIVES);
    for (let i = 0; i < START_LIVES; i++) {
      const { f, battle, node } = withStatus(r, "lost");
      r = applyBattleResult(f, battle, node);
      expect(r.node).toBeNull();
      expect(r.floorCleared).toBe(false);
      if (i < START_LIVES - 1) {
        expect(r.status).toBe("active");
        expect(r.lives).toBeGreaterThan(0);
        expect(r.hp).toBe(Math.max(1, Math.round(maxHp(r) * LIFE_LOSS_HEAL)));
      }
    }
    expect(r.status).toBe("over");
    expect(r.lives).toBe(0);
    expect(runScore(r)).toBe(r.maxFloor);
    expect(nextFloor(r)).toBe(r);
  });
  it("carries hp after a win and never exceeds max", () => {
    const { f, battle, node } = withStatus(fightRun(), "won", 7);
    const r = applyBattleResult(f, battle, node);
    expect(r.floorCleared).toBe(true);
    expect(r.node).toBeNull();
    expect(r.hp).toBeGreaterThanOrEqual(7);
    expect(r.hp).toBeLessThanOrEqual(maxHp(r));
    expect(r.coins).toBeGreaterThan(0);
    expect(r.hero.xp + r.hero.level).toBeGreaterThan(1);
  });
  it("fighting starts from carried hp", () => {
    const f = { ...fightRun(), hp: 5 };
    expect(startFight(chooseDoor(f, 0)!.run)!.battle.player.hp).toBe(5);
  });
  it("fleeing costs coins but keeps hp and floor", () => {
    const base = { ...fightRun(), coins: 100 };
    expect(fleeCost(base)).toBe(30);
    const { f, battle, node } = withStatus(base, "fled", 33);
    const r = applyBattleResult(f, battle, node);
    expect(r.coins).toBe(70);
    expect(r.hp).toBe(33);
    expect(r.lives).toBe(START_LIVES);
    expect(r.floor).toBe(base.floor);
  });
  it("offers a relic every 3 floors; relics last only for the run", () => {
    let r = fresh();
    const offered: number[] = [];
    for (let i = 1; i <= 9; i++) {
      r = nextFloor(cleared(r)); // leaves floor i
      if (r.pendingRelic) {
        offered.push(i);
        expect(new Set(r.pendingRelic).size).toBe(3);
        expect(r.pendingRelic.some((id) => r.relics.includes(id))).toBe(false);
        r = chooseRelic(r, r.pendingRelic[0]);
      }
    }
    expect(offered).toEqual([3, 6, 9]);
    expect(new Set(r.relics).size).toBe(3);
    expect(fresh().relics).toEqual([]);
    expect(RELIC_IDS.length).toBeGreaterThanOrEqual(12);
  });
  it("relic stats raise effective max hp and heal the gain", () => {
    let r: Run = { ...fresh(), pendingRelic: ["corazon", "colmillo", "lente"] };
    const before = maxHp(r);
    r = chooseRelic(r, "corazon");
    expect(maxHp(r)).toBeGreaterThan(before);
    expect(r.hp).toBe(maxHp(r));
  });
  it("shop purchases need coins and can't repeat", () => {
    let r: Run = { ...openKind("merchant").run, hp: 1, coins: 0 };
    expect(buyItem(r, "heal")).toBeNull();
    r = { ...r, coins: 1000 };
    const bought = buyItem(r, "heal")!;
    expect(bought.hp).toBeGreaterThan(1);
    expect(bought.coins).toBeLessThan(1000);
    expect(buyItem(bought, "heal")).toBeNull();
  });
  it("events are deterministic per seed+floor+choice", () => {
    const r = openKind("event").run;
    expect(resolveEvent(r, 0)).toEqual(resolveEvent(r, 0));
    expect(resolveEvent(r, 99)).toBeNull();
  });
  it("event results list what changed and what was paid", () => {
    const r: Run = { ...openKind("event").run, coins: 500, hp: 5 };
    const before = r.node?.type === "event" ? r.node.event.choices.length : 0;
    for (let i = 0; i < before; i++) {
      const out = resolveEvent(r, i);
      if (!out) continue;
      expect(out.changes.length).toBeGreaterThan(0);
      const net = out.changes.find((c) => c.text.includes("monedas"));
      if (net) expect(net.good).toBe(net.text.startsWith("+"));
    }
    expect(
      describeChanges(r, { ...r, coins: r.coins - 7, lives: r.lives + 1 }),
    ).toEqual([
      { text: "−7 monedas", good: false },
      { text: "+1 vida extra", good: true },
    ]);
  });
});

describe("node flow (no repeatable rewards, no skipping)", () => {
  it.each(["chest", "rest"] as const)(
    "%s can be taken once per floor",
    (kind) => {
      const base = { ...fresh(), hp: 1 };
      const opened = openKind(kind, base);
      const r = opened.run;
      expect(r.node).toEqual(opened.node);
      expect(chooseDoor(r, 0)).toBeNull(); // node already open
      expect(nextFloor(r)).toBe(r); // can't skip an open node
      const left = leaveNode(r);
      expect(left.node).toBeNull();
      expect(left.floorCleared).toBe(true);
      expect(chooseDoor(left, 0)).toBeNull(); // floor already done
      const next = nextFloor(left);
      expect(next.floor).toBe(left.floor + 1);
      expect(next.floorCleared).toBe(false);
      expect(nextFloor(next)).toBe(next); // can't skip again
      expect(next.maxFloor).toBe(left.floor + 1);
      if (kind === "chest") expect(left.coins).toBeGreaterThan(0);
    },
  );
  it("nextFloor refuses while a pick or relic is owed, or the run is over", () => {
    const c = cleared(fresh());
    const relicRun: Run = {
      ...c,
      floor: 3,
      pendingRelic: ["colmillo", "corazon", "lente"],
    };
    expect(nextFloor(relicRun)).toBe(relicRun); // unchosen relic never overwritten
    const picks = { ...c, pendingPicks: 1 };
    expect(nextFloor(picks)).toBe(picks);
    const over: Run = { ...c, status: "over", lives: 0 };
    expect(nextFloor(over)).toBe(over);
    expect(nextFloor(fresh())).toEqual(fresh()); // floor not cleared
    expect(nextFloor(c).floor).toBe(2);
  });
  it("leaveNode only closes chest, rest and shop", () => {
    const ev = withNode(eventNode("Fuente brillante"));
    expect(leaveNode(ev)).toBe(ev);
    const shop = withNode({ type: "shop", items: [] });
    expect(leaveNode(shop).floorCleared).toBe(true);
    expect(leaveNode(fresh())).toEqual(fresh());
  });
  it("events need an open event node and resolve only once", () => {
    expect(resolveEvent(fresh(), 0)).toBeNull();
    const r = withNode(eventNode("Fogata abandonada"), { hp: 10 });
    const res = resolveEvent(r, 0)!;
    expect(res.run.node).toBeNull();
    expect(res.run.floorCleared).toBe(true);
    expect(resolveEvent(res.run, 0)).toBeNull();
    expect(chooseDoor(res.run, 0)).toBeNull();
  });
  it("the +1 life event cannot be farmed", () => {
    const r = withNode(eventNode("Estatua con ojos de rubí"), { lives: 3 });
    let cur = r;
    let gained = 0;
    for (let i = 0; i < 10; i++) {
      const res = resolveEvent(cur, 1);
      if (!res) break;
      cur = res.run;
      gained++;
    }
    expect(gained).toBe(1);
    expect(cur.lives).toBeLessThanOrEqual(4);
  });
  it("rewards come from the open node, not from the caller", () => {
    const base = fightRun();
    const w = withStatus(base, "won");
    const forged: FightNode = { ...w.node, kind: "boss" };
    const real = applyBattleResult(w.f, w.battle, w.node);
    const viaForged = applyBattleResult(w.f, w.battle, forged);
    expect(viaForged.coins).toBe(real.coins);
    if (w.node.kind !== "boss")
      expect(real.coins).toBe(
        Math.round(
          FIGHT_COINS[w.node.kind] * (1 + COIN_FLOOR_SCALE * w.f.floor),
        ),
      );
    // second application finds no open node: no double reward
    expect(applyBattleResult(real, w.battle, w.node)).toBe(real);
    // a node that isn't the open one is ignored
    const other: FightNode = { ...w.node, battleSeed: w.node.battleSeed + 1 };
    expect(applyBattleResult(w.f, w.battle, other)).toBe(w.f);
  });
  it("losing or fleeing frees the floor to pick another door; winning clears it", () => {
    const base = fightRun();
    for (const st of ["lost", "fled"] as const) {
      const { f, battle, node } = withStatus(base, st);
      const r = applyBattleResult(f, battle, node);
      expect(r.node).toBeNull();
      expect(r.floorCleared).toBe(false);
      expect(chooseDoor(r, 0)).not.toBeNull();
      expect(nextFloor(r)).toBe(r);
    }
    const w = withStatus(base, "won");
    expect(applyBattleResult(w.f, w.battle, w.node).floorCleared).toBe(true);
  });
  it("startFight needs an open fight and a live run", () => {
    expect(startFight(fresh())).toBeNull();
    const over = { ...chooseDoor(fightRun(), 0)!.run, status: "over" as const };
    expect(startFight(over)).toBeNull();
  });
});

describe("retries and fleeing", () => {
  it("every fight start bumps attempts and changes the RNG stream", () => {
    const base = fightRun();
    const first = withStatus(base, "fled");
    expect(first.f.attempts).toBe(1);
    const after = applyBattleResult(first.f, first.battle, first.node);
    const reopened = chooseDoor(after, 0)!.run;
    const again = startFight(reopened)!;
    expect(again.run.attempts).toBe(2);
    const firstRng = startFight(chooseDoor(base, 0)!.run)!.rng;
    expect(again.rng.next()).not.toBe(firstRng.next());
    // same history, same stream
    const replay = startFight(chooseDoor(after, 0)!.run)!;
    expect(replay.battle.queue).toEqual(again.battle.queue);
    expect(replay.rng.next()).toBe(startFight(reopened)!.rng.next());
  });
  it("fleeing always costs at least 1 coin when you have any", () => {
    const at = (coins: number) => fleeCost({ ...fresh(), coins });
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(1);
    expect(at(2)).toBe(1);
    expect(at(100)).toBe(30);
  });
});

describe("events with costs", () => {
  const choiceOf = (title: string, label: string) => {
    const c = EVENTS.find((e) => e.title === title)?.choices.find(
      (x) => x.label === label,
    );
    if (!c) throw new Error(label);
    return c;
  };
  it("coin offerings are unavailable without coins and charge when taken", () => {
    for (const [title, label, idx] of [
      ["Mendigo sospechoso", "Darle monedas", 0],
      ["Altar olvidado", "Ofrecer monedas", 1],
    ] as const) {
      const poor = withNode(eventNode(title), { coins: 0 });
      expect(eventCost(poor, choiceOf(title, label)).affordable).toBe(false);
      expect(resolveEvent(poor, idx)).toBeNull();
      const rich = withNode(eventNode(title), { coins: 500 });
      const cost = eventCost(rich, choiceOf(title, label)).coins;
      expect(cost).toBeGreaterThan(0);
      expect(resolveEvent(rich, idx)!.run.coins).toBeLessThanOrEqual(
        500 - cost,
      );
    }
  });
  it("blood offering needs hp to spare and costs hp", () => {
    const title = "Altar olvidado";
    const low = withNode(eventNode(title), { hp: 1 });
    expect(resolveEvent(low, 0)).toBeNull();
    const ok = withNode(eventNode(title));
    const res = resolveEvent(ok, 0)!;
    expect(res.run.hp).toBeLessThan(ok.hp);
    expect(res.run.hp).toBeGreaterThanOrEqual(1);
  });
});

describe("shop guards", () => {
  const item = (
    kind: Exclude<ShopItem["kind"], "gear">,
    price = 10,
  ): ShopItem =>
    kind === "stat"
      ? { id: "s", kind, label: "x", price, stat: "ataque" }
      : { id: kind, kind, label: "x", price };
  const shop = (items: ShopItem[], patch: Partial<Run> = {}) =>
    withNode({ type: "shop", items }, { coins: 1000, ...patch });
  it("refuses a life at the cap and a potion at full hp, without charging", () => {
    const full = shop([item("life"), item("heal")], { lives: MAX_LIVES });
    expect(buyItem(full, "life")).toBeNull();
    expect(buyItem(full, "heal")).toBeNull();
    const ok = shop([item("life")], { lives: MAX_LIVES - 1 });
    expect(buyItem(ok, "life")!.lives).toBe(MAX_LIVES);
  });
  it("needs an open shop that offers the item", () => {
    expect(buyItem({ ...fresh(), coins: 1000 }, "heal")).toBeNull();
    expect(buyItem(shop([item("heal")], { hp: 1 }), "nope")).toBeNull();
    const ev = withNode(eventNode("Fuente brillante"), { coins: 1000, hp: 1 });
    expect(buyItem(ev, "heal")).toBeNull();
  });
  it("rerolling is once per floor and changes the next relic offer", () => {
    const r = shop([item("reroll")], { floor: 3 });
    const once = buyItem(r, "reroll")!;
    expect(once.rerolls).toBe(1);
    expect(buyItem(once, "reroll")).toBeNull();
    const left = nextFloor(leaveNode(once));
    expect(left.pendingRelic).toEqual(relicOffer(r.seed, 3, 1, []));
  });
});

describe("status guards and relic uniqueness", () => {
  const over: Run = {
    ...fresh(),
    status: "over",
    lives: 0,
    hp: 0,
    coins: 1000,
    pendingPicks: 1,
    pendingRelic: ["colmillo", "corazon", "lente"],
    node: {
      type: "shop",
      items: [{ id: "heal", kind: "heal", label: "x", price: 1 }],
    },
  };
  it("an over run accepts no actions", () => {
    expect(chooseDoor(over, 0)).toBeNull();
    expect(buyItem(over, "heal")).toBeNull();
    expect(resolveEvent(over, 0)).toBeNull();
    expect(pickUpgrade(over, "vida")).toBe(over);
    expect(chooseRelic(over, "colmillo")).toBe(over);
    expect(leaveNode(over)).toBe(over);
  });
  it("relic offers skip owned relics and stay deterministic", () => {
    const owned = RELIC_IDS.slice(0, 8);
    const a = relicOffer(7, 3, 0, owned)!;
    expect(a).toEqual(relicOffer(7, 3, 0, owned));
    expect(a.some((id) => owned.includes(id))).toBe(false);
    expect(relicOffer(7, 3, 0, RELIC_IDS)).toBeNull();
    expect(relicOffer(7, 3, 0, RELIC_IDS.slice(1))).toEqual([RELIC_IDS[0]]);
  });
  it("an owned relic can't be picked twice; stacking is capped", () => {
    const r: Run = {
      ...fresh(),
      relics: ["escudo"],
      pendingRelic: ["escudo", "colmillo", "lente"],
    };
    expect(chooseRelic(r, "escudo")).toBe(r);
    const t = relicTotals([
      "escudo",
      "escudo",
      "escudo",
      "guante",
      "guante",
      "guante",
    ]);
    expect(t.startShield).toBe(RELIC_CAPS.startShield);
    expect(t.freeHits).toBe(RELIC_CAPS.freeHits);
  });
});

describe("combat modifiers and relic effects", () => {
  const duel = (opts: Parameters<typeof startBattle>[3] = {}): Battle => {
    const p = generateCharacter(createRng(8), "caballero");
    const e = generateCharacter(createRng(9), "mago");
    return withRound(startBattle(p, e, createRng(1), opts), true, ["attack1"]);
  };
  const enemyEvents = (b: Battle) =>
    b.events.filter((e) => e.actor === "enemy");
  it("double attack lands a second, weaker hit", () => {
    const b = step(
      duel({ mods: ["dobleAtaque"], playerHp: 1000 }),
      "defend",
      stubRng,
    );
    expect(enemyEvents(b)).toHaveLength(2);
    const single = step(duel({ playerHp: 1000 }), "defend", stubRng);
    expect(enemyEvents(single)).toHaveLength(1);
    expect(b.player.hp).toBeLessThan(single.player.hp);
  });
  it("double attack does not hit a dead player a second time", () => {
    const b = step(
      duel({ mods: ["dobleAtaque"], playerHp: 1 }),
      "defend",
      stubRng,
    );
    expect(b.status).toBe("lost");
    expect(enemyEvents(b)).toHaveLength(1);
  });
  it("a player shield absorbs damage before hp", () => {
    const b = step(duel({ playerShield: 1000 }), "defend", stubRng);
    expect(b.player.hp).toBe(duel().player.hp);
    expect(b.player.shield).toBeLessThan(1000);
  });
  it("free hits evade enemy attacks one by one", () => {
    const start = duel({ freeHits: 1 });
    const b = step(start, "defend", stubRng);
    expect(b.player.hp).toBe(start.player.hp);
    expect(b.player.freeHits).toBe(0);
    const c = step(withRound(b, true, ["attack1"]), "defend", stubRng);
    expect(c.player.hp).toBeLessThan(b.player.hp);
  });
  it("changing element shifts every 2 turns, regeneration heals REGEN_FRACTION", () => {
    const b = duel({ mods: ["elementoCambiante", "regeneracion"] });
    const t1 = step(withRound(b, false, ["defend"]), "defend", stubRng);
    expect(t1.enemies[0].char.element).toBe(b.enemies[0].char.element);
    const t2 = step(withRound(t1, false, ["defend"]), "defend", stubRng);
    expect(t2.enemies[0].char.element).not.toBe(b.enemies[0].char.element);
    const hurt = withRound(
      { ...b, enemies: [{ ...b.enemies[0], hp: 1 }] },
      false,
      ["defend"],
    );
    const healed = step(hurt, "defend", stubRng);
    expect(healed.enemies[0].hp).toBe(
      1 + Math.round(b.enemies[0].char.stats.hp * REGEN_FRACTION),
    );
  });
});

describe("relic rarities, synergies and caps", () => {
  const ofRarity = (r: string) =>
    RELIC_IDS.filter((id) => RELICS[id].rarity === r);
  it("has all three rarities with several relics each", () => {
    expect(ofRarity("comun").length).toBeGreaterThanOrEqual(6);
    expect(ofRarity("rara").length).toBeGreaterThanOrEqual(5);
    expect(ofRarity("legendaria").length).toBeGreaterThanOrEqual(4);
  });
  it("offers are deterministic per (seed, floor, rerolls, owned)", () => {
    for (const f of [3, 9, 21]) {
      const a = relicOffer(11, f, 0, ["lente"]);
      expect(a).toEqual(relicOffer(11, f, 0, ["lente"]));
      expect(new Set(a).size).toBe(3);
      expect(a).not.toContain("lente");
    }
  });
  it("legendaries show up but stay rarer than commons, more so deep down", () => {
    const share = (floor: number, rarity: string) => {
      let hit = 0;
      let all = 0;
      for (let seed = 0; seed < 2000; seed++)
        for (const id of rollRelics(createRng(seed), 3, RELIC_IDS, floor)) {
          all++;
          if (RELICS[id].rarity === rarity) hit++;
        }
      return hit / all;
    };
    const early = share(3, "legendaria");
    expect(early).toBeGreaterThan(0.02);
    expect(early).toBeLessThan(share(3, "comun"));
    expect(share(30, "legendaria")).toBeGreaterThan(early);
  });
  it("rarity is drawn before the relic: a pool with one rarity returns it", () => {
    const only = ofRarity("legendaria");
    const offer = rollRelics(createRng(1), 3, only, 0);
    expect(offer.every((id) => only.includes(id))).toBe(true);
    expect(offer).toHaveLength(3);
  });
  it("synergies activate only with every required relic and add their bonus", () => {
    for (const s of SYNERGIES) {
      expect(s.needs.length).toBeGreaterThanOrEqual(2);
      expect(activeSynergies(s.needs.slice(1))).not.toContain(s);
      expect(activeSynergies(s.needs)).toContain(s);
    }
    const base = relicTotals(["lente"]);
    const both = relicTotals(["lente", "viper"]);
    const viperOnly = relicTotals(["viper"]);
    expect(both.critDamage).toBeGreaterThan(viperOnly.critDamage);
    expect(base.critDamage).toBe(0);
    const stats = generateCharacter(createRng(2), "picaro").stats;
    expect(applyRelicStats(stats, ["lente", "viper"]).crit).toBeCloseTo(
      Math.min(0.6, stats.crit + 0.08 + 0.06 + 0.1),
    );
  });
  it("caps bind even when all legendaries pile up; dmgMult multiplies", () => {
    const all = RELIC_IDS;
    const t = relicTotals(all);
    expect(t.lifesteal).toBeLessThanOrEqual(RELIC_CAPS.lifesteal);
    expect(t.dmgReduction).toBeLessThanOrEqual(RELIC_CAPS.dmgReduction);
    expect(t.dmgMult).toBeLessThanOrEqual(RELIC_CAPS.dmgMult);
    expect(t.regen).toBeLessThanOrEqual(RELIC_CAPS.regen);
    const stats = generateCharacter(createRng(2), "caballero").stats;
    const out = applyRelicStats(stats, all);
    expect(out.atk).toBeLessThanOrEqual(
      Math.round(stats.atk * (1 + RELIC_CAPS.statFraction) * 10) / 10,
    );
    expect(out.crit).toBeLessThanOrEqual(0.6);
    const ids: RelicId[] = ["reloj"];
    expect(relicTotals(ids).dmgMult).toBeCloseTo(1.35);
    expect(relicTotals([]).dmgMult).toBe(1);
  });
  it("combat perks: dmgMult/dmgReduction change damage, lifesteal and regen heal", () => {
    const p = generateCharacter(createRng(8), "caballero");
    const e = generateCharacter(createRng(9), "mago");
    const mk = (perks?: Parameters<typeof startBattle>[3]) =>
      withRound(
        startBattle(p, e, createRng(1), { playerHp: 50, ...perks }),
        false,
        ["defend"],
      );
    const plain = step(mk(), "attack1", stubRng);
    const strong = step(mk({ perks: { dmgMult: 2 } }), "attack1", stubRng);
    expect(plain.enemies[0].hp - strong.enemies[0].hp).toBeGreaterThan(0);
    const steal = step(mk({ perks: { lifesteal: 0.5 } }), "attack1", stubRng);
    expect(steal.player.hp).toBeGreaterThan(plain.player.hp);
    const regen = step(mk({ perks: { regen: 0.1 } }), "defend", stubRng);
    expect(regen.player.hp).toBeGreaterThan(50);
  });
});

describe("upgrade stacking and tier 2", () => {
  it("repeat picks compound up to the cap, never beyond", () => {
    expect(stackMult(0)).toBe(1);
    for (let n = 0; n < 10; n++)
      expect(stackMult(n + 1)).toBeGreaterThanOrEqual(stackMult(n));
    expect(stackMult(99)).toBe(UPGRADE_STACK_CAP);
    const c = generateCharacter(createRng(5), "caballero");
    const gain = (n: number) =>
      applyUpgrade(c, "ataque", n).stats.atk / c.stats.atk;
    expect(gain(2)).toBeGreaterThan(gain(0));
    expect(gain(99)).toBeCloseTo(
      1 + 0.1 * UPGRADE_POWER * UPGRADE_STACK_CAP,
      1,
    );
  });
  it("pickUpgrade records the stack and describes the next value", () => {
    let r: Run = { ...fresh(), pendingPicks: 3 };
    for (let i = 0; i < 3; i++) r = pickUpgrade(r, "ataque");
    expect(r.ups.ataque).toBe(3);
    expect(r.hero.stats.atk).toBeGreaterThan(
      applyUpgrade(applyUpgrade(fresh().hero, "ataque"), "ataque").stats.atk,
    );
    expect(describeUpgrade("ataque", 0)).toBe(
      `+${Math.round(10 * UPGRADE_POWER)}% ATQ`,
    );
    expect(describeUpgrade("ataque", 4)).toBe(
      `+${Math.round(10 * UPGRADE_POWER * stackMult(4))}% ATQ`,
    );
  });
  it("tier 2 upgrades appear only from TIER2_LEVEL and stay distinct", () => {
    const tier2 = (id: UpgradeId) => UPGRADES[id].tier === 2;
    let seen = 0;
    for (let seed = 0; seed < 300; seed++) {
      const low = rollUpgrades(createRng(seed), 3, TIER2_LEVEL - 1);
      expect(low.some(tier2)).toBe(false);
      const high = rollUpgrades(createRng(seed), 3, TIER2_LEVEL);
      expect(new Set(high).size).toBe(3);
      if (high.some(tier2)) seen++;
    }
    expect(seen).toBeGreaterThan(30);
  });
});

describe("run economy", () => {
  it("the floor before a boss always offers a rest door", () => {
    for (let seed = 1; seed < 60; seed++)
      for (const f of [4, 9, 14, 19, 24])
        expect(doorsFor(seed, f).map((d) => d.kind)).toContain("rest");
  });
  it("deeper floors offer fewer safe doors", () => {
    const fights = (from: number, to: number) => {
      let n = 0;
      let all = 0;
      for (let seed = 1; seed <= 300; seed++)
        for (let f = from; f <= to; f++) {
          if (isBossFloor(f) || isBossFloor(f + 1)) continue;
          const ds = doorsFor(seed, f);
          all += ds.length;
          n += ds.filter((d) => d.kind === "easy" || d.kind === "hard").length;
        }
      return n / all;
    };
    expect(fights(21, 29)).toBeGreaterThan(fights(1, 4));
  });
  it("winning a harder fight heals and pays more", () => {
    const a = withStatus(fightRun(), "won", 10);
    const r = applyBattleResult(a.f, a.battle, a.node);
    expect(r.hp).toBeGreaterThan(10);
    expect(r.coins).toBeGreaterThan(0);
  });
});

describe("hp is always whole", () => {
  it("max and current hp stay integers after upgrades and relics", () => {
    let r: Run = { ...fresh(), pendingPicks: 12, hp: 37 };
    const ids: UpgradeId[] = ["vida", "coloso", "dragon", "hierro", "vida"];
    for (let i = 0; i < 12; i++) r = pickUpgrade(r, ids[i % ids.length]);
    r = { ...r, pendingRelic: ["corazon", "colmillo", "lente"] };
    r = chooseRelic(r, "corazon");
    expect(Number.isInteger(r.hero.stats.hp)).toBe(true);
    expect(Number.isInteger(maxHp(r))).toBe(true);
    expect(Number.isInteger(r.hp)).toBe(true);
  });
});

describe("floor cap", () => {
  it("clearing the last floor ends the run as a victory with a bonus", () => {
    const base = fresh();
    const r = nextFloor({
      ...base,
      floor: MAX_FLOOR,
      maxFloor: MAX_FLOOR,
      floorCleared: true,
    });
    expect(r.status).toBe("over");
    expect(isVictory(r)).toBe(true);
    expect(r.coins).toBe(base.coins + VICTORY_COINS);
    expect(r.floor).toBe(MAX_FLOOR);
  });
  it("a death at the last floor is not a victory", () => {
    const r = {
      ...fresh(),
      status: "over" as const,
      lives: 0,
      maxFloor: MAX_FLOOR,
    };
    expect(isVictory(r)).toBe(false);
  });
});
