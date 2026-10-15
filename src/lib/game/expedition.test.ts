// Torre expedition core: calendar, determinism, relics/HP/Fénix, economy and reducer robustness.
// Pure-core tests only: persistence, ranking and server rules live elsewhere.
import { describe, expect, it, vi } from "vitest";
import { unit } from "./testkit";
import {
  absoluteNode,
  applyExpeditionAction,
  artWeekKey,
  bossSafeMods,
  combatOrdinal,
  COMBATS_PER_SECTOR,
  eventOptions,
  EVENT_IDS,
  expeditionFight,
  isRiskyOption,
  EXP_ACTION_TYPES,
  FRAGMENTS,
  MAX_FRAGMENTS,
  MAX_NODES,
  MAX_RECENT,
  maxHpOf,
  NODES_PER_SECTOR,
  nodePay,
  PACT_FRAGMENTS,
  replayExpedition,
  routeOptions,
  SCHEDULE,
  SHOP_PRICES,
  sectorBossRoute,
  sectorMods,
  startExpedition,
  START_FRAGMENTS,
  TOWER_PAID_SECTORS,
  TOWER_PAY,
  effectiveHero,
  type EventId,
  type ExpAction,
  type ExpActionType,
  type ExpInit,
  type ExpState,
  type Phase,
} from "./expedition";
import { nextAction, STRATEGIES, type Strategy } from "./expeditionBot";
import * as floor from "./floorFights";
import { DUNGEON_THEMES, ROUTE_IDS } from "./levels";
import { MAX_RELICS, RELICS, type OwnedRelic, type RelicId } from "./relics";
import { createRng } from "./rng";
import { ENGINE_VERSION } from "./stage";

vi.mock("./floorFights", async (orig) => {
  const m = await orig<typeof import("./floorFights")>();
  return { ...m, floorFight: vi.fn(m.floorFight) };
});

// ---- fixtures ----------------------------------------------------------------------------------

const GOD = unit("caballero", { hp: 1e15, atk: 1e15, def: 1e6 });
const MID = unit("caballero", { hp: 1000, atk: 50, def: 20 });
const TANK = unit("caballero", { hp: 1000, atk: 1e9, def: 1e6, speed: 100 }); // wins every early fight untouched
const init = (o: Partial<ExpInit> = {}): ExpInit => ({ mode: "nivelado", seed: 11, weekKey: "2026-10-12", hero: GOD, ...o });

type Body = ExpAction extends infer U ? (U extends unknown ? Omit<U, "actionId" | "expectedRevision"> : never) : never;
let counter = 0;
const act = (s: ExpState, a: Body) =>
  applyExpeditionAction(s, { ...a, actionId: `t${++counter}`, expectedRevision: s.revision } as ExpAction);
const ok = (s: ExpState, a: Body): ExpState => {
  const r = act(s, a);
  expect(r.error, `${a.type} in ${s.phase}`).toBeUndefined();
  return r.state;
};
const err = (s: ExpState, a: Body): string => {
  const r = act(s, a);
  expect(r.error, `${a.type} in ${s.phase} should fail`).toBeTruthy();
  expect(r.state).toBe(s); // an illegal action leaves the state untouched (same reference)
  return r.error!;
};
const fresh = (o: Partial<ExpInit> = {}) => startExpedition(init(o));
const patch = (s: ExpState, p: Partial<ExpState>): ExpState => ({ ...s, ...p });
const at = (sector: number, node: number, p: Partial<ExpState> = {}, o: Partial<ExpInit> = {}): ExpState =>
  patch(fresh(o), { phase: "route", sector, node, ...p });
const owned = (...ids: [RelicId, 1 | 2][]): OwnedRelic[] => ids.map(([id, tier]) => ({ id, tier }));
const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const bot = (s: ExpState, strat: Strategy, rng = createRng(1)) => nextAction(s, strat, rng)!;

/** Plays with a strategy until `stop` or the end; returns every visited state and the action log. */
function trace(i: ExpInit, strat: Strategy, seed: number, stop: (s: ExpState) => boolean = () => false) {
  let s = startExpedition(i);
  const rng = createRng(seed);
  const states = [s];
  const actions: ExpAction[] = [];
  for (let k = 0; k < 60000 && s.phase !== "ended" && !stop(s); k++) {
    const a = nextAction(s, strat, rng)!;
    const r = applyExpeditionAction(s, a);
    if (r.error) throw new Error(`${a.type} in ${s.phase}: ${r.error}`);
    s = r.state;
    states.push(s);
    actions.push(a);
  }
  return { states, actions, final: s };
}

/** Finishes the running fight with the shared bot policy. */
function finishFight(s: ExpState): ExpState {
  for (let k = 0; k < 400 && s.phase === "combat"; k++) s = ok(s, bot(s, "greedy") as Body);
  return s;
}
/** One enemy left, hitting for far more than any hp, against a 1-hp hero. */
const doom = (b: NonNullable<ExpState["battle"]>) => {
  b.player.hp = 1;
  b.enemies = [b.enemies[0]];
  b.order = [0, 1];
  b.enemies[0].char.stats.atk = 1e7;
};
/** Defends until `stop` holds or the fight leaves the combat phase (enemies need a few turns to hit). */
const press = (s: ExpState, stop: (s: ExpState) => boolean = () => false): ExpState => {
  for (let k = 0; k < 12 && s.phase === "combat" && !stop(s); k++) s = ok(s, { type: "combat_action", a: "defend" });
  return s;
};
const tamperBattle = (s: ExpState, f: (b: NonNullable<ExpState["battle"]>) => void): ExpState => {
  const c = json(s);
  f(c.battle!);
  return c;
};

// ---- calendar ----------------------------------------------------------------------------------

describe("calendar", () => {
  it("has 10 nodes per sector: 7 fights (5 normal + 1 elite + 1 boss), 2 services and the sanctuary", () => {
    expect(SCHEDULE).toHaveLength(NODES_PER_SECTOR);
    const n = (t: string) => SCHEDULE.filter((x) => x.type === t).length;
    expect([n("combat"), n("elite"), n("boss"), n("service"), n("sanctuary")]).toEqual([5, 1, 1, 2, 1]);
    expect(n("combat") + n("elite") + n("boss")).toBe(COMBATS_PER_SECTOR);
    expect(SCHEDULE.map((x) => x.type)).toEqual(
      ["combat", "combat", "service", "combat", "elite", "combat", "service", "combat", "sanctuary", "boss"],
    );
    expect(SCHEDULE.flatMap((x, i) => (x.relicReward ? [i + 1] : []))).toEqual([2, 5, 8, 10]);
  });

  it("gives 50 sectors = 500 nodes = 350 consecutive combat ordinals, none for services", () => {
    const ords: number[] = [];
    for (let sector = 1; sector <= 50; sector++)
      for (let pos = 1; pos <= NODES_PER_SECTOR; pos++) {
        const o = combatOrdinal(sector, pos);
        const type = SCHEDULE[pos - 1].type;
        if (type !== "service" && type !== "sanctuary") ords.push(o); // services have no ordinal of their own
      }
    expect(MAX_NODES).toBe(NODES_PER_SECTOR * 50);
    expect(ords).toEqual(Array.from({ length: 350 }, (_, i) => i + 1));
    expect(absoluteNode(50, 10)).toBe(500);
  });

  it("plays a whole season: 500 nodes, 350 combats, ledger by kind, then closes as 'limit'", () => {
    const { final, states } = trace(init(), "greedy", 3);
    expect(final.phase).toBe("ended");
    expect(final.end).toEqual({ reason: "limit", node: 500 });
    expect(final.nodes).toBe(500);
    expect(final.combats).toBe(350);
    expect(final.ledger).toHaveLength(350);
    const kind = (k: string) => final.ledger.filter((e) => e.kind === k).length;
    expect([kind("normal"), kind("elite"), kind("boss")]).toEqual([250, 50, 50]);
    // only combat positions appear in the ledger, never services/sanctuary
    for (const e of final.ledger) expect([1, 2, 4, 5, 6, 8, 10]).toContain(((e.node - 1) % 10) + 1);
    // "nodes" counts a node once, when it is resolved
    const nodes = states.map((s) => s.nodes);
    for (let i = 1; i < nodes.length; i++) expect(nodes[i] - nodes[i - 1]).toBeLessThanOrEqual(1);
    // weekly pay: first three sectors only, 475 each, 1425 in total
    expect(final.ledger.reduce((a, e) => a + nodePay(e), 0)).toBe(1425);
  });

  it("pays 5 / 150 / 300 per combat node in the first three sectors only", () => {
    expect(TOWER_PAY).toEqual({ normal: 5, elite: 150, boss: 300 });
    expect(TOWER_PAID_SECTORS).toBe(3);
    const sector = (k: number) => {
      let total = 0;
      for (let pos = 1; pos <= 10; pos++) {
        const t = SCHEDULE[pos - 1].type;
        const kind = t === "combat" ? "normal" : t === "elite" ? "elite" : t === "boss" ? "boss" : null;
        if (kind) total += nodePay({ node: absoluteNode(k, pos), kind });
      }
      return total;
    };
    expect([sector(1), sector(2), sector(3), sector(4), sector(50)]).toEqual([475, 475, 475, 0, 0]);
  });

  it("gives both route options the same difficulty ordinal", () => {
    const fightMock = floor.floorFight as unknown as ReturnType<typeof vi.fn>;
    for (const [sector, pos] of [[1, 1], [2, 2], [3, 4], [4, 5], [7, 6], [9, 8], [12, 10]] as const) {
      fightMock.mockClear();
      expeditionFight(11, sector, pos, 0);
      expeditionFight(11, sector, pos, 1);
      const [a, b] = fightMock.mock.calls;
      expect(a[1]).toBe(combatOrdinal(sector, pos));
      expect(b[1]).toBe(a[1]);
    }
    const opts = routeOptions(at(2, 4));
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => o.kind)).toEqual(["combat", "combat"]);
  });

  it("offers two fights, two variants of the elite, one boss, and the right services", () => {
    const kinds = (sector: number, node: number) => routeOptions(at(sector, node)).map((o) => o.kind);
    expect(kinds(1, 1)).toEqual(["combat", "combat"]);
    expect(kinds(1, 3)).toEqual(["event", "shop"]);
    expect(kinds(1, 5)).toEqual(["elite", "elite"]);
    expect(kinds(1, 7)).toEqual(["rest", "event"]);
    expect(kinds(1, 9)).toEqual(["sanctuary"]);
    expect(kinds(1, 10)).toEqual(["boss"]);
  });

  it("never repeats the sector boss back to back, also across the 9-cycle boundary", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const seq = Array.from({ length: 200 }, (_, i) => sectorBossRoute(seed, i + 1));
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      for (let b = 0; b < 22; b++) expect(new Set(seq.slice(b * 9, b * 9 + 9)).size).toBe(9); // each block is a permutation
    }
  });

  it("applies one sector modifier only from sector 2, never regeneration, and filters incompatibilities", () => {
    expect(sectorMods(11, 1)).toEqual([]);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++)
      for (let sector = 2; sector <= 50; sector++) {
        const m = sectorMods(seed, sector);
        expect(m).toHaveLength(1);
        expect(m).toEqual(sectorMods(seed, sector)); // deterministic
        seen.add(m[0]);
      }
    expect([...seen].sort()).toEqual(["dobleAtaque", "elementoCambiante", "escudo"]);
    expect(seen.has("regeneracion" as never)).toBe(false);
    for (const route of ROUTE_IDS) {
      const boss = DUNGEON_THEMES[route].bossId;
      const safe = bossSafeMods(["dobleAtaque", "elementoCambiante", "escudo"], route);
      if (boss === "mother_hydra" || boss === "great_devourer") expect(safe).not.toContain("dobleAtaque");
      if (boss === "hollow_colossus") expect(safe).not.toContain("escudo");
      expect(safe).toContain("elementoCambiante");
    }
    // sector 1 fights carry no modifier at all; later boss fights never get a forbidden pair
    for (let pos = 1; pos <= 10; pos++) {
      if (!["combat", "elite", "boss"].includes(SCHEDULE[pos - 1].type)) continue;
      expect(expeditionFight(11, 1, pos, 0).mods ?? []).toEqual([]);
    }
    for (let seed = 1; seed <= 20; seed++)
      for (let sector = 2; sector <= 40; sector++) {
        const f = expeditionFight(seed, sector, 10, 0);
        expect(f.mods ?? []).toEqual(bossSafeMods(sectorMods(seed, sector), f.route!));
      }
  });

  it("pins the named boss to the sector and keeps elite/boss roles independent of the combat number", () => {
    for (let sector = 1; sector <= 12; sector++) {
      const boss = expeditionFight(11, sector, 10, 0);
      expect(boss.role).toBe("final");
      expect(boss.kind).toBe("boss");
      expect(boss.route).toBe(sectorBossRoute(11, sector));
      expect(boss.enemies[0].bossId).toBe(DUNGEON_THEMES[boss.route!].bossId);
      const elite = expeditionFight(11, sector, 5, 1);
      expect(elite.role).toBe("elite");
      expect(elite.kind).toBe("elite");
      expect(expeditionFight(11, sector, 1, 0).role).toBe("normal");
    }
  });

  it("is independent of the hero: same calendar for every class, offers differ by class/element", () => {
    const a = fresh({ hero: unit("mago", { hp: 100 }, { element: "fuego" }) });
    const b = fresh({ hero: unit("picaro", { hp: 100 }, { element: "tierra" }) });
    expect(JSON.stringify(routeOptions(patch(a, { phase: "route" })))).toBe(JSON.stringify(routeOptions(patch(b, { phase: "route" }))));
    const oa = ok(a, { type: "begin" }).offer!.options.map((o) => o.relicId).join();
    const ob = ok(b, { type: "begin" }).offer!.options.map((o) => o.relicId).join();
    expect(oa).not.toBe(ob);
  });

  it("uses the Buenos Aires week authority (Monday 00:00 ART), not UTC", () => {
    expect(artWeekKey(new Date("2026-10-12T02:59:59Z"))).toBe("2026-10-05"); // still Sunday night in Buenos Aires
    expect(artWeekKey(new Date("2026-10-12T03:00:00Z"))).toBe("2026-10-12");
    expect(artWeekKey(new Date("2026-10-18T23:00:00Z"))).toBe("2026-10-12");
  });
});

// ---- determinism -------------------------------------------------------------------------------

describe("determinism", () => {
  it("replays the same action log to the same state, twice, and through JSON", () => {
    for (const strat of STRATEGIES) {
      const { actions, final } = trace(init({ hero: MID }), strat, 5, (s) => s.sector >= 3);
      const a = replayExpedition(init({ hero: MID }), actions);
      const b = replayExpedition(init({ hero: MID }), json(actions));
      expect(a.rejectedAt).toBeNull();
      expect(a.state).toEqual(final);
      expect(b.state).toEqual(final);
    }
  });

  it("is unchanged by a JSON round trip after every action, in every phase, mid-combat included", () => {
    const phases = new Set<Phase>();
    for (const strat of STRATEGIES)
      for (let seed = 1; seed <= 6; seed++) {
        const i = init({ hero: MID, seed });
        const rng1 = createRng(seed);
        const rng2 = createRng(seed);
        let live = startExpedition(i);
        let thawed = startExpedition(i);
        for (let k = 0; k < 4000 && live.phase !== "ended" && live.sector < 3; k++) {
          phases.add(live.phase);
          const a = nextAction(live, strat, rng1)!;
          const b = nextAction(thawed, strat, rng2)!;
          expect(b).toEqual(a);
          const r1 = applyExpeditionAction(live, a);
          const r2 = applyExpeditionAction(json(thawed), b);
          expect(r2.error).toBe(r1.error);
          live = r1.state;
          thawed = json(r2.state);
          expect(thawed).toEqual(live);
        }
      }
    for (const p of ["preparation", "initial_relic", "route", "combat", "reward", "shop", "rest", "sanctuary", "event", "sector_summary"] as Phase[])
      expect(phases.has(p), `phase ${p} visited`).toBe(true);
  });

  it("suspending and resuming returns to the origin phase and leaves everything else (RNG included) untouched", () => {
    const seen = new Set<Phase>();
    for (const strat of STRATEGIES) {
      const { states } = trace(init({ hero: MID, seed: 4 }), strat, 4, (s) => s.sector >= 3);
      for (const s of states) {
        if (s.phase === "ended") continue;
        seen.add(s.phase);
        const sus = ok(s, { type: "suspend" });
        expect(sus.phase).toBe("suspended");
        expect(sus.resumePhase).toBe(s.phase);
        expect(sus.rng).toBe(s.rng);
        const back = ok(json(sus), { type: "continue" });
        expect(back.phase).toBe(s.phase);
        const strip = ({ revision, recent, resumePhase, ...rest }: ExpState) => (void revision, void recent, void resumePhase, rest);
        expect(strip(back)).toEqual(strip(s));
      }
    }
    expect(seen.has("combat")).toBe(true);
    expect(seen.has("reward")).toBe(true);
  });

  it("does not advance the RNG for anything but fight starts and combat actions", () => {
    const { states, actions } = trace(init({ hero: MID, seed: 8 }), "random", 8, (s) => s.sector >= 4);
    for (let i = 1; i < states.length; i++) {
      const a = actions[i - 1];
      const startedFight = states[i - 1].phase === "route" && states[i].phase === "combat";
      const inFight = a.type === "combat_action" || a.type === "combat_auto";
      if (!startedFight && !inFight) expect(states[i].rng, `${a.type}`).toBe(states[i - 1].rng);
    }
  });

  it("opening panels and failed actions never touch the state or the RNG", () => {
    const { states } = trace(init({ hero: MID, seed: 9 }), "random", 9, (s) => s.sector >= 3);
    for (const s of states) {
      const before = JSON.stringify(s);
      routeOptions(s);
      routeOptions(s);
      eventOptions(s);
      maxHpOf(s);
      effectiveHero(s);
      expect(JSON.stringify(s)).toBe(before);
      if (s.phase !== "ended") {
        const bad = act(s, { type: "choose_relic", offerId: "nope", optionId: "nope" });
        expect(bad.state).toBe(s);
        expect(bad.state.rng).toBe(s.rng);
      }
    }
  });

  it("derives offers only from (seed, sector, node, sequence): same state, same offer", () => {
    const a = ok(fresh({ hero: MID }), { type: "begin" });
    const b = ok(fresh({ hero: MID }), { type: "begin" });
    expect(a.offer).toEqual(b.offer);
    expect(ok(fresh({ hero: MID, seed: 12 }), { type: "begin" }).offer).not.toEqual(a.offer);
  });
});

// ---- relics, HP, Fénix inside the expedition ----------------------------------------------------

const offerOf = (s: ExpState, relicId: RelicId, tier: 1 | 2 = 1, source: "initial" | "combat" = "combat"): ExpState =>
  patch(s, {
    phase: source === "initial" ? "initial_relic" : "reward",
    offerReturn: "route",
    offer: { id: "x:1", source, canDecline: source !== "initial", options: [{ id: "o0", relicId, tier }] },
  });
const take = (s: ExpState, slot?: number) =>
  ok(s, { type: "choose_relic", offerId: "x:1", optionId: "o0", ...(slot !== undefined && { replaceSlot: slot }) });

describe("relic flow", () => {
  it("starts with a mandatory initial offer: 3 unique options, cannot be declined", () => {
    const s = ok(fresh({ hero: MID }), { type: "begin" });
    expect(s.phase).toBe("initial_relic");
    expect(s.offer!.options).toHaveLength(3);
    expect(s.offer!.canDecline).toBe(false);
    err(s, { type: "decline_relic", offerId: s.offer!.id });
    expect(s.relics).toEqual([]);
    const r = ok(s, { type: "choose_relic", offerId: s.offer!.id, optionId: "o1" });
    expect(r.phase).toBe("route");
    expect(r.relics).toHaveLength(1);
    expect(r.offer).toBeNull();
  });

  it("rejects a stale offer id, an unknown option and picking outside an offer", () => {
    const s = ok(fresh({ hero: MID }), { type: "begin" });
    err(s, { type: "choose_relic", offerId: "wrong", optionId: "o0" });
    err(s, { type: "choose_relic", offerId: s.offer!.id, optionId: "o9" });
    err(at(1, 1), { type: "choose_relic", offerId: "x", optionId: "o0" });
  });

  it("never blocks with six slots: replace, upgrade or decline all work; unfinished picks keep the offer", () => {
    const six = owned(["whetstone", 1], ["bronze_armor", 1], ["hunter_lens", 1], ["winged_boots", 1], ["bottomless_purse", 1], ["bear_heart", 1]);
    const s = offerOf(at(1, 2, { relics: six }), "phoenix_heart");
    expect(err(s, { type: "choose_relic", offerId: "x:1", optionId: "o0" })).toMatch(/seis|reempla/i); // slot missing
    err(s, { type: "choose_relic", offerId: "x:1", optionId: "o0", replaceSlot: 9 });
    expect(s.offer).not.toBeNull(); // still open, nothing lost
    const replaced = take(s, 0);
    expect(replaced.relics).toHaveLength(MAX_RELICS);
    expect(replaced.relics[0]).toEqual({ id: "phoenix_heart", tier: 1 });
    const declined = ok(s, { type: "decline_relic", offerId: "x:1" });
    expect(declined.relics).toEqual(six);
    expect(declined.fragments).toBe(s.fragments + 10);
    expect(declined.phase).toBe("route");
    // upgrade needs no free slot
    const up = take(offerOf(at(1, 2, { relics: six }), "whetstone", 2));
    expect(up.relics[0]).toEqual({ id: "whetstone", tier: 2 });
    expect(up.relics).toHaveLength(6);
  });

  it("an upgrade offer for a relic that is no longer tier I is refused", () => {
    const s = offerOf(at(1, 2, { relics: owned(["whetstone", 2]) }), "whetstone", 2);
    err(s, { type: "choose_relic", offerId: "x:1", optionId: "o0" });
    err(offerOf(at(1, 2, { relics: [] }), "whetstone", 2), { type: "choose_relic", offerId: "x:1", optionId: "o0" });
  });

  it("grants a relic offer after the combats of nodes 2, 5, 8 and 10 only", () => {
    const withReward: number[] = [];
    for (let pos = 1; pos <= 10; pos++) {
      if (!["combat", "elite", "boss"].includes(SCHEDULE[pos - 1].type)) continue;
      let s = at(1, pos, { hp: 1000 }, { hero: TANK });
      s = finishFight(ok(s, { type: "choose_route", optionId: "r0" }));
      expect(s.battle).toBeNull();
      if (s.phase === "reward") {
        withReward.push(pos);
        expect(s.offer!.source).toBe("combat");
        expect(s.offer!.canDecline).toBe(true);
      } else expect(s.phase === "route" || s.phase === "sector_summary").toBe(true);
    }
    expect(withReward).toEqual([2, 5, 8, 10]);
  });
});

describe("HP and relics", () => {
  const six = (extra: OwnedRelic) => [extra, ...owned(["whetstone", 1], ["bronze_armor", 1], ["hunter_lens", 1], ["winged_boots", 1], ["bottomless_purse", 1])];

  it("Corazón raises max hp without healing", () => {
    const s = offerOf(at(1, 2, { hp: 800 }, { hero: MID }), "bear_heart");
    expect(maxHpOf(s)).toBe(1000);
    const t = take(s);
    expect(maxHpOf(t)).toBe(1080);
    expect(t.hp).toBe(800);
    // the engine plays with the raised max but the same current hp
    const f = ok(patch(t, { phase: "route", node: 1 }), { type: "choose_route", optionId: "r0" });
    expect(f.battle!.player.char.stats.hp).toBe(1080);
    expect(f.battle!.player.hp).toBe(800);
  });

  it("upgrading Corazón to tier II does not heal either", () => {
    const s = offerOf(at(1, 2, { hp: 700, relics: owned(["bear_heart", 1]) }, { hero: MID }), "bear_heart", 2);
    const t = take(s);
    expect(maxHpOf(t)).toBe(1120);
    expect(t.hp).toBe(700);
    const sanct = ok(patch(at(1, 9, { hp: 700, relics: owned(["bear_heart", 1]) }, { hero: MID }), { phase: "sanctuary" }), {
      type: "choose_sanctuary", optionId: "upgrade", relicId: "bear_heart",
    });
    expect(sanct.hp).toBe(700);
  });

  it("removing it clamps current hp to the new max", () => {
    const s = offerOf(at(1, 2, { hp: 1080, relics: six({ id: "bear_heart", tier: 1 }) }, { hero: MID }), "phoenix_heart");
    const t = take(s, 0);
    expect(maxHpOf(t)).toBe(1000);
    expect(t.hp).toBe(1000);
  });

  it("equip / replace / re-equip loops never raise current hp", () => {
    let s = at(1, 2, { hp: 500, relics: owned(["whetstone", 1], ["bronze_armor", 1], ["hunter_lens", 1], ["winged_boots", 1], ["bottomless_purse", 1], ["runic_shield", 1]) }, { hero: MID });
    for (let i = 0; i < 6; i++) {
      const hp0 = s.hp;
      s = take(offerOf(s, "bear_heart"), 0);
      expect(s.hp).toBeLessThanOrEqual(Math.max(hp0, 0) + 0);
      s = take(offerOf(s, "whetstone"), s.relics.findIndex((r) => r.id === "bear_heart"));
      expect(s.hp).toBeLessThanOrEqual(hp0);
      s = patch(s, { phase: "route" });
    }
    expect(s.hp).toBe(500);
  });

  it("battle hp never exceeds the effective max, even with stale current hp", () => {
    const f = ok(at(1, 1, { hp: 5000 }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(f.battle!.player.hp).toBeLessThanOrEqual(1000);
  });

  it("applies the relic aggregate and the spent Fénix flag when a fight starts", () => {
    const f = ok(at(1, 1, { relics: owned(["whetstone", 2], ["phoenix_heart", 1]), phoenixSpent: true }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(f.battle!.player.relic).toMatchObject({ basicDmg: 0.12, phoenix: 0.15 });
    expect(f.battle!.player.phoenixUsed).toBe(true);
    const g = ok(at(1, 1, { relics: owned(["phoenix_heart", 1]) }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(g.battle!.player.phoenixUsed).toBeFalsy();
  });
});

describe("Corazón fénix across the expedition", () => {
  const lethal = (s: ExpState) => tamperBattle(s, (b) => doom(b));
  const weak = (s: ExpState) => tamperBattle(s, (b) => { b.enemies = [b.enemies[0]]; b.order = [0, 1]; b.enemies[0].hp = 1; b.enemies[0].char.stats.atk = 0.1; });
  const toFight = (relics: OwnedRelic[], p: Partial<ExpState> = {}) =>
    ok(at(1, 1, { relics, hp: 1000, ...p }, { hero: unit("caballero", { hp: 1000, atk: 400, def: 0 }) }), { type: "choose_route", optionId: "r0" });

  it("revives once in a fight and, after the win, stays spent for the whole expedition", () => {
    let s = toFight(owned(["phoenix_heart", 1]));
    s = press(lethal(s), (x) => !!x.battle!.player.phoenixUsed);
    expect(s.phase).toBe("combat");
    expect(s.battle!.player.phoenixUsed).toBe(true);
    expect(s.battle!.player.hp).toBe(Math.round(1000 * 0.15));
    expect(s.phoenixSpent).toBe(false); // folded in when the fight settles
    s = ok(json(s), { type: "suspend" });
    s = ok(json(s), { type: "continue" });
    expect(s.battle!.player.phoenixUsed).toBe(true); // survives suspend + reload mid-fight
    s = weak(s);
    for (let k = 0; k < 30 && s.phase === "combat"; k++) s = ok(s, { type: "combat_action", a: "attack1" });
    expect(s.phoenixSpent).toBe(true);
    expect(s.phase).not.toBe("ended");
  });

  it("stays spent after the relic is replaced, re-acquired, upgraded, or the run is resumed", () => {
    const base = patch(at(1, 2, { relics: owned(["phoenix_heart", 1], ["whetstone", 1], ["bronze_armor", 1], ["hunter_lens", 1], ["winged_boots", 1], ["bottomless_purse", 1]), phoenixSpent: true }, { hero: MID }), {});
    // replace it, then take it again as a fresh tier-I relic
    let s = take(offerOf(base, "bear_heart"), 0);
    expect(s.relics.some((r) => r.id === "phoenix_heart")).toBe(false);
    s = take(offerOf(s, "phoenix_heart"), 0);
    expect(s.phoenixSpent).toBe(true);
    s = json(patch(s, { phase: "route", node: 1 }));
    let f = ok(s, { type: "choose_route", optionId: "r0" });
    expect(f.battle!.player.phoenixUsed).toBe(true);
    // upgrading I -> II does not recharge
    f = ok(patch(at(1, 9, { relics: owned(["phoenix_heart", 1]), phoenixSpent: true }, { hero: MID }), { phase: "sanctuary" }), {
      type: "choose_sanctuary", optionId: "upgrade", relicId: "phoenix_heart",
    });
    expect(f.phoenixSpent).toBe(true);
    expect(f.relics[0]).toEqual({ id: "phoenix_heart", tier: 2 });
  });

  it("a spent Fénix lets the next lethal hit kill: the expedition ends as a death", () => {
    let s = toFight(owned(["phoenix_heart", 2]), { phoenixSpent: true });
    s = press(lethal(s));
    expect(s.phase).toBe("ended");
    expect(s.end!.reason).toBe("death");
    expect(s.hp).toBe(0);
  });

  it("a second lethal hit kills after the revival", () => {
    let s = toFight(owned(["phoenix_heart", 2]));
    s = press(lethal(s), (x) => !!x.battle!.player.phoenixUsed);
    expect(s.phase).toBe("combat");
    s = press(tamperBattle(s, (b) => { b.player.hp = 1; }));
    expect(s.phase).toBe("ended");
    expect(s.end!.reason).toBe("death");
  });

  it("never revives outside a fight (events and services cannot kill, so nothing to revive)", () => {
    const altar = patch(at(1, 3, { hp: 1, relics: owned(["phoenix_heart", 1]) }, { hero: MID }), {
      phase: "event", event: { id: "altar", stage: "choose" },
    });
    expect(eventOptions(altar)[0].disabled).toBeTruthy();
    err(altar, { type: "choose_event", optionId: "a" });
    const poor = patch(altar, { hp: 50 });
    const paid = ok(poor, { type: "choose_event", optionId: "a" });
    expect(paid.hp).toBeGreaterThanOrEqual(1); // non-lethal
    expect(paid.phoenixSpent).toBe(false);
  });
});

// ---- economy -----------------------------------------------------------------------------------

describe("shop", () => {
  const shop = (p: Partial<ExpState> = {}) => {
    const s = patch(at(1, 3, { hp: 500, ...p }, { hero: MID }), {});
    return ok(s, { type: "choose_route", optionId: "r1" });
  };

  it("shows three goods with the contract prices and no upgrade when nothing is upgradable", () => {
    const s = shop();
    expect(s.phase).toBe("shop");
    expect(s.shop!.goods.map((g) => [g.kind, g.price])).toEqual([["relic", 40], ["relic", 40], ["heal", 20]]);
    expect(new Set(s.shop!.goods.flatMap((g) => (g.relicId ? [g.relicId] : []))).size).toBe(2);
    const up = shop({ relics: owned(["whetstone", 1]) });
    expect(up.shop!.goods.map((g) => g.kind)).toEqual(["relic", "upgrade", "heal"]);
    expect(up.shop!.goods[1]).toMatchObject({ price: SHOP_PRICES.upgrade, relicId: "whetstone" });
    expect(shop({ relics: owned(["whetstone", 2]) }).shop!.goods.some((g) => g.kind === "upgrade")).toBe(false);
  });

  it("explains insufficient funds and changes nothing; leaving without buying is always legal", () => {
    const s = patch(shop(), { fragments: 10 });
    expect(err(s, { type: "buy", itemId: "g0" })).toMatch(/fragmentos/i);
    err(s, { type: "buy", itemId: "g9" });
    const out = ok(s, { type: "continue" });
    expect(out.phase).toBe("route");
    expect(out.fragments).toBe(10);
  });

  it("allows only one purchase per visit", () => {
    let s = patch(shop(), { fragments: 500 });
    s = ok(s, { type: "buy", itemId: "g2" });
    expect(s.hp).toBe(700);
    expect(s.fragments).toBe(480);
    expect(err(s, { type: "buy", itemId: "g0" })).toMatch(/una compra/i);
    expect(s.shop!.bought).toBe(true);
  });

  it("buying with full slots is atomic: without a slot nothing is spent, with one it replaces and clamps hp", () => {
    const six = owned(["bear_heart", 1], ["bronze_armor", 1], ["hunter_lens", 1], ["winged_boots", 1], ["bottomless_purse", 1], ["runic_shield", 1]);
    let s = patch(shop({ relics: six, hp: 1080 }), { fragments: 100 });
    const good = s.shop!.goods[0];
    err(s, { type: "buy", itemId: "g0" });
    expect(s.fragments).toBe(100);
    s = ok(s, { type: "buy", itemId: "g0", replaceSlot: 0 });
    expect(s.fragments).toBe(60);
    expect(s.relics[0]).toEqual({ id: good.relicId, tier: 1 });
    expect(s.hp).toBe(1000); // Corazón gone: clamped
    expect(s.shop!.bought).toBe(true);
  });

  it("buying an upgrade turns the relic into tier II for the upgrade price", () => {
    let s = patch(shop({ relics: owned(["whetstone", 1]) }), { fragments: 100 });
    s = ok(s, { type: "buy", itemId: "g1" });
    expect(s.relics[0]).toEqual({ id: "whetstone", tier: 2 });
    expect(s.fragments).toBe(40);
  });

  it("leaving a service resolves the node once and heals/pays nothing", () => {
    for (const [node, route] of [[3, "r1"], [7, "r0"]] as const) {
      const s = ok(at(1, node, { hp: 500, fragments: 33 }, { hero: MID }), { type: "choose_route", optionId: route });
      expect(s.nodes).toBe(0); // entering a service does not count
      const out = ok(s, { type: "continue" });
      expect(out.nodes).toBe(1);
      expect([out.hp, out.fragments, out.combats, out.turns, out.ledger.length]).toEqual([500, 33, 0, 0, 0]);
      expect(out.node).toBe(node + 1);
      err(out, { type: "continue" });
    }
  });
});

describe("rest and sanctuary", () => {
  it("rest heals 25 % or gives 25 fragments, once", () => {
    const s = ok(at(1, 7, { hp: 400, fragments: 20 }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(s.phase).toBe("rest");
    const h = ok(s, { type: "choose_rest", optionId: "heal" });
    expect(h.hp).toBe(650);
    err(h, { type: "choose_rest", optionId: "fragments" });
    expect(ok(s, { type: "choose_rest", optionId: "fragments" }).fragments).toBe(45);
    expect(ok(h, { type: "continue" }).nodes).toBe(1);
  });

  it("sanctuary heals 25 %, gives 30 fragments or upgrades a tier-I relic; once; heal respects max hp", () => {
    const mk = (p: Partial<ExpState> = {}) => ok(at(1, 9, { hp: 900, ...p }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(ok(mk(), { type: "choose_sanctuary", optionId: "heal" }).hp).toBe(1000);
    expect(ok(mk(), { type: "choose_sanctuary", optionId: "fragments" }).fragments).toBe(START_FRAGMENTS + 30);
    const rel = mk({ relics: owned(["whetstone", 1], ["bronze_armor", 2]) });
    err(rel, { type: "choose_sanctuary", optionId: "upgrade", relicId: "bronze_armor" }); // tier II is not upgradable
    err(rel, { type: "choose_sanctuary", optionId: "upgrade" });
    const up = ok(rel, { type: "choose_sanctuary", optionId: "upgrade", relicId: "whetstone" });
    expect(up.relics[0].tier).toBe(2);
    err(up, { type: "choose_sanctuary", optionId: "heal" });
  });

  it("changes the two skills for free in preparation and sanctuary only, never class or element", () => {
    const hero = unit("mago", { hp: 1000 }, { element: "fuego" });
    const prep = fresh({ hero });
    const loadout = ["mage_inscribe", "mage_seal"];
    const s = ok(prep, { type: "set_loadout", loadout });
    expect(s.loadout).toEqual(loadout);
    expect(s.hero).toBe(prep.hero);
    err(prep, { type: "set_loadout", loadout: ["knight_advance", "knight_breaker"] }); // other class
    err(prep, { type: "set_loadout", loadout: ["mage_inscribe", "mage_inscribe"] }); // duplicates
    err(prep, { type: "set_loadout", loadout: ["mage_inscribe"] });
    err(prep, { type: "set_loadout", loadout: ["mage_inscribe", "nope"] });
    const sanct = ok(at(1, 9, {}, { hero }), { type: "choose_route", optionId: "r0" });
    expect(ok(sanct, { type: "set_loadout", loadout }).loadout).toEqual(loadout);
  });
});

describe("events", () => {
  const ev = (id: EventId, p: Partial<ExpState> = {}) =>
    patch(at(1, 3, { hp: 800, ...p }, { hero: MID }), { phase: "event", event: { id, stage: "choose" } });

  it("has all six events reachable from the seed", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const s = ok(at(1, 3, {}, { hero: MID, seed }), { type: "choose_route", optionId: "r0" });
      expect(s.phase).toBe("event");
      seen.add(s.event!.id);
      expect(s.seen.events).toContain(s.event!.id);
    }
    expect([...seen].sort()).toEqual([...EVENT_IDS].sort());
  });

  it("always has a legal exit, even broke and at 1 hp, and disabled options explain themselves", () => {
    for (const id of EVENT_IDS) {
      const s = ev(id, { hp: 1, fragments: 0 });
      const opts = eventOptions(s);
      expect(opts).toHaveLength(2);
      const open = opts.filter((o) => !o.disabled);
      expect(open.length, id).toBeGreaterThanOrEqual(1);
      for (const o of opts.filter((o) => o.disabled)) {
        expect(o.disabled!.length).toBeGreaterThan(3);
        err(s, { type: "choose_event", optionId: o.id });
      }
      const out = ok(s, { type: "choose_event", optionId: open[0].id });
      expect(["event", "reward"]).toContain(out.phase);
    }
  });

  it("fountain: +15 % hp or +20 fragments (clamped to 999)", () => {
    expect(ok(ev("fountain"), { type: "choose_event", optionId: "a" }).hp).toBe(950);
    expect(ok(ev("fountain", { fragments: 990 }), { type: "choose_event", optionId: "b" }).fragments).toBe(MAX_FRAGMENTS);
    expect(ok(ev("fountain"), { type: "choose_event", optionId: "b" }).fragments).toBe(START_FRAGMENTS + 20);
  });

  it("altar: pay 10 % max hp (non-lethal) for an offer, or leave free", () => {
    const paid = ok(ev("altar"), { type: "choose_event", optionId: "a" });
    expect(paid.hp).toBe(700);
    expect(paid.phase).toBe("reward");
    expect(paid.offer).toMatchObject({ source: "event", canDecline: true });
    expect(paid.offerReturn).toBe("event");
    const poor = ok(ev("altar", { hp: 30 }), { type: "choose_event", optionId: "a" });
    expect(poor.hp).toBe(1); // 10 % would be 100: never lethal
    const free = ok(ev("altar"), { type: "choose_event", optionId: "b" });
    expect([free.hp, free.fragments, free.phase]).toEqual([800, START_FRAGMENTS, "event"]);
  });

  it("purse: +25 fragments or spend 20 for an offer", () => {
    expect(ok(ev("purse"), { type: "choose_event", optionId: "a" }).fragments).toBe(45);
    const buy = ok(ev("purse"), { type: "choose_event", optionId: "b" });
    expect(buy.fragments).toBe(0);
    expect(buy.phase).toBe("reward");
    expect(eventOptions(ev("purse", { fragments: 19 }))[1].disabled).toBeTruthy();
  });

  it("book: upgrade a tier-I relic for 30, else buy an offer for 30; or +10 fragments", () => {
    const up = ok(ev("book", { fragments: 100, relics: owned(["whetstone", 1]) }), { type: "choose_event", optionId: "a" });
    expect([up.fragments, up.relics[0].tier, up.phase]).toEqual([70, 2, "event"]);
    const offer = ok(ev("book", { fragments: 100 }), { type: "choose_event", optionId: "a" });
    expect([offer.fragments, offer.phase]).toEqual([70, "reward"]);
    expect(ok(ev("book"), { type: "choose_event", optionId: "b" }).fragments).toBe(30);
    expect(eventOptions(ev("book", { fragments: 29 }))[0].disabled).toBeTruthy();
  });

  it("beggar: pay 15 fragments to heal 20 %, or move on", () => {
    const a = ok(ev("beggar"), { type: "choose_event", optionId: "a" });
    expect([a.fragments, a.hp]).toEqual([5, 1000]);
    expect(eventOptions(ev("beggar", { fragments: 14 }))[0].disabled).toBeTruthy();
    expect(ok(ev("beggar"), { type: "choose_event", optionId: "b" }).fragments).toBe(START_FRAGMENTS);
  });

  it("a paid event keeps its pending offer through a reload: no double charge, then back to the event", () => {
    let s = ok(ev("purse"), { type: "choose_event", optionId: "b" });
    expect(s.fragments).toBe(0);
    s = json(s); // reload in the reward phase
    err(s, { type: "choose_event", optionId: "b" }); // the event itself cannot be paid again
    s = ok(s, { type: "choose_relic", offerId: s.offer!.id, optionId: "o0" });
    expect(s.fragments).toBe(0);
    expect(s.phase).toBe("event");
    expect(s.event!.stage).toBe("done");
    err(s, { type: "choose_event", optionId: "a" });
    const out = ok(s, { type: "continue" });
    expect(out.nodes).toBe(1);
    expect(out.node).toBe(4);
    expect(out.relics).toHaveLength(1);
  });

  it("declining an event offer still ends the event cleanly", () => {
    const s = ok(ev("purse"), { type: "choose_event", optionId: "b" });
    const d = ok(s, { type: "decline_relic", offerId: s.offer!.id });
    expect(d.phase).toBe("event");
    expect(ok(d, { type: "continue" }).phase).toBe("route");
  });

  it("must be answered before continuing", () => {
    err(ev("fountain"), { type: "continue" });
  });
});

describe("pact (statue)", () => {
  const statue = (p: Partial<ExpState> = {}) =>
    patch(at(1, 3, { hp: 1000, ...p }, { hero: TANK }), { phase: "event", event: { id: "statue", stage: "choose" } });

  it("affects only the next combat: +10 % enemy atk, +30 fragments on a win, then expires", () => {
    let s = ok(statue(), { type: "choose_event", optionId: "a" });
    expect(s.pact).toBe(true);
    s = ok(s, { type: "continue" });
    expect(s.pact).toBe(true); // survives the service exit
    const plainEnemy = expeditionFight(11, 1, 4, 0).enemies[0].stats.atk;
    const f = ok(s, { type: "choose_route", optionId: "r0" });
    expect(f.pact).toBe(false);
    expect(f.fight).toMatchObject({ pact: true });
    expect(f.fight!.fragments).toBe(FRAGMENTS.normal + PACT_FRAGMENTS);
    expect(f.battle!.enemies[0].char.stats.atk).toBeCloseTo(plainEnemy * 1.1, 0);
    const won = finishFight(f);
    expect(won.fragments).toBe(START_FRAGMENTS + FRAGMENTS.normal + PACT_FRAGMENTS);
    // the next combat is back to normal
    const next = ok(patch(won, { phase: "route", node: 6 }), { type: "choose_route", optionId: "r0" });
    expect(next.fight!.pact).toBe(false);
    expect(next.fight!.fragments).toBe(FRAGMENTS.normal);
    expect(finishFight(next).fragments).toBe(won.fragments + FRAGMENTS.normal);
  });

  it("expires when the fight is lost too: the run ends and no pact is left", () => {
    let s = ok(statue(), { type: "choose_event", optionId: "a" });
    s = ok(s, { type: "continue" });
    s = ok(s, { type: "choose_route", optionId: "r0" });
    s = press(tamperBattle(s, doom));
    expect(s.phase).toBe("ended");
    expect(s.pact).toBe(false);
    expect(s.fragments).toBe(START_FRAGMENTS); // no pact bonus on a loss
  });

  it("declining the pact leaves the next fight untouched", () => {
    const s = ok(statue(), { type: "choose_event", optionId: "b" });
    expect(s.pact).toBe(false);
  });
});

describe("combat rewards", () => {
  it("pays 10 / 15 (hard route) / 20 / 30 fragments plus Bolsa, and only on a win", () => {
    const run = (pos: number, route: string, relics: OwnedRelic[] = []) =>
      finishFight(ok(at(1, pos, { relics }, { hero: TANK }), { type: "choose_route", optionId: route }));
    const risky = isRiskyOption(11, 1, 1, 0) ? 0 : 1; // the route with more total enemy PV pays 50 % more
    expect(run(1, `r${1 - risky}`).fragments).toBe(START_FRAGMENTS + 10);
    expect(run(1, `r${risky}`).fragments).toBe(START_FRAGMENTS + 15);
    expect(run(5, "r0").fragments).toBe(START_FRAGMENTS + 20);
    expect(run(10, "r0").fragments).toBe(START_FRAGMENTS + 30);
    expect(run(1, `r${1 - risky}`, owned(["bottomless_purse", 2])).fragments).toBe(START_FRAGMENTS + 10 + 8);
    expect(run(1, `r${1 - risky}`, owned(["bottomless_purse", 1])).fragments).toBe(START_FRAGMENTS + 10 + 5);
  });

  it("heals only 2 % of max hp after a won fight (tower rule), capped, and records turns", () => {
    const s = finishFight(ok(at(1, 1, { hp: 500 }, { hero: TANK }), { type: "choose_route", optionId: "r0" }));
    expect(s.hp).toBeGreaterThanOrEqual(500 - 10);
    expect(s.hp).toBeLessThanOrEqual(500 + 20);
    expect(s.turns).toBeGreaterThan(0);
    expect(s.combats).toBe(1);
    expect(s.nodes).toBe(1);
  });

  it("clamps fragments at 999 and never below 0", () => {
    const s = finishFight(ok(at(1, 1, { fragments: 998 }, { hero: TANK }), { type: "choose_route", optionId: "r0" }));
    expect(s.fragments).toBe(MAX_FRAGMENTS);
  });

  it("a lost or drawn fight ends the expedition keeping the score reached so far", () => {
    let s = ok(at(1, 4, { nodes: 3, combats: 2, turns: 20 }, { hero: unit("caballero", { hp: 1000, atk: 50, def: 0 }) }), { type: "choose_route", optionId: "r0" });
    s = press(tamperBattle(s, doom));
    expect(s.phase).toBe("ended");
    expect(s.end).toMatchObject({ reason: "death", node: 3 });
    expect([s.nodes, s.combats, s.turns]).toEqual([3, 2, 20]);
    expect(s.end!.killer!.length).toBeGreaterThan(0);
  });

  it("quick resolve is only available before the first action and is deterministic", () => {
    const f = ok(at(1, 1, {}, { hero: TANK }), { type: "choose_route", optionId: "r0" });
    const a = ok(f, { type: "combat_auto" });
    const b = ok(json(f), { type: "combat_auto" });
    const strip = ({ recent, revision, ...rest }: ExpState) => (void recent, void revision, rest);
    expect(strip(a)).toEqual(strip(b));
    const mid = ok(patch(f, {}), { type: "combat_action", a: "defend" });
    if (mid.phase === "combat") err(mid, { type: "combat_auto" });
  });
});

describe("fight start", () => {
  it("never leaves a finished battle in the combat phase (hero already dead before its first turn)", () => {
    // a 1-hp, very slow hero: some opening enemy turn kills it before it can act
    const slow = unit("caballero", { hp: 1000, atk: 50, def: 0, speed: 1 });
    let finishedAtStart = 0;
    for (let seed = 1; seed <= 40; seed++)
      for (const [pos, route] of [[1, "r0"], [4, "r1"], [5, "r0"], [10, "r0"]] as const) {
        const s = ok(at(1, pos, { hp: 1 }, { hero: slow, seed }), { type: "choose_route", optionId: route });
        if (s.phase === "combat" && s.battle!.status !== "ongoing") finishedAtStart++;
      }
    expect(finishedAtStart).toBe(0);
  });

  it("keeps the invariant 'combat phase => battle ongoing' along whole random runs", () => {
    for (let seed = 1; seed <= 25; seed++)
      for (const strat of STRATEGIES)
        for (const st of trace(init({ hero: MID, seed }), strat, seed, (x) => x.sector >= 6).states)
          if (st.phase === "combat") expect(st.battle!.status).toBe("ongoing");
  });
});

describe("season limit", () => {
  it("closes as 'limit' after node 500 and nothing can be played afterwards", () => {
    let s = at(50, 10, { nodes: 499, combats: 349 }, { hero: GOD });
    s = finishFight(ok(s, { type: "choose_route", optionId: "r0" }));
    expect(s.phase).toBe("reward");
    s = ok(s, { type: "decline_relic", offerId: s.offer!.id });
    expect(s.phase).toBe("ended");
    expect(s.end).toEqual({ reason: "limit", node: 500 });
    for (const t of EXP_ACTION_TYPES) if (t !== "suspend") expect(act(s, bodyOf(t)).error).toBeTruthy();
  });

  it("moves to the sector summary after node 10 and continues at node 1 of the next sector", () => {
    let s = finishFight(ok(at(1, 10, {}, { hero: TANK }), { type: "choose_route", optionId: "r0" }));
    s = ok(s, { type: "decline_relic", offerId: s.offer!.id });
    expect(s.phase).toBe("sector_summary");
    s = ok(s, { type: "continue" });
    expect([s.phase, s.sector, s.node]).toEqual(["route", 2, 1]);
  });
});

// ---- reducer robustness ------------------------------------------------------------------------

const bodyOf = (t: ExpActionType): Body =>
  ({
    begin: { type: "begin" },
    set_loadout: { type: "set_loadout", loadout: ["knight_advance", "knight_breaker"] },
    choose_route: { type: "choose_route", optionId: "r0" },
    combat_action: { type: "combat_action", a: "attack1" },
    combat_auto: { type: "combat_auto" },
    choose_relic: { type: "choose_relic", offerId: "nope", optionId: "o0" },
    decline_relic: { type: "decline_relic", offerId: "nope" },
    buy: { type: "buy", itemId: "g0" },
    choose_event: { type: "choose_event", optionId: "b" },
    choose_rest: { type: "choose_rest", optionId: "fragments" },
    choose_sanctuary: { type: "choose_sanctuary", optionId: "fragments" },
    continue: { type: "continue" },
    suspend: { type: "suspend" },
    retire: { type: "retire" },
  })[t] as Body;

describe("reducer robustness", () => {
  it("rejects a stale or future revision and leaves the state untouched", () => {
    const s = fresh();
    for (const rev of [s.revision - 1, s.revision + 1, 99]) {
      const r = applyExpeditionAction(s, { type: "begin", actionId: `rev${rev}`, expectedRevision: rev });
      expect(r.error).toBe("revision");
      expect(r.state).toBe(s);
    }
  });

  it("treats a repeated actionId as an idempotent duplicate, even with a stale revision", () => {
    const s = fresh();
    const a: ExpAction = { type: "begin", actionId: "same", expectedRevision: s.revision };
    const first = applyExpeditionAction(s, a);
    expect(first.error).toBeUndefined();
    const again = applyExpeditionAction(first.state, a);
    expect(again.duplicate).toBe(true);
    expect(again.error).toBeUndefined();
    expect(again.state).toBe(first.state);
    const retry = applyExpeditionAction(first.state, { ...a, expectedRevision: first.state.revision });
    expect(retry.duplicate).toBe(true);
    expect(first.state.revision).toBe(s.revision + 1); // one transition only
  });

  it("remembers only the last actionIds (bounded memory)", () => {
    let s = at(1, 3, {}, { hero: MID });
    for (let i = 0; i < MAX_RECENT + 5; i++) {
      s = ok(s, { type: "suspend" });
      s = ok(s, { type: "continue" });
    }
    expect(s.recent.length).toBeLessThanOrEqual(MAX_RECENT);
  });

  it("does not record a failed action: it can be retried with the same id", () => {
    const s = fresh();
    const bad: ExpAction = { type: "choose_route", optionId: "r0", actionId: "x1", expectedRevision: 0 };
    expect(applyExpeditionAction(s, bad).error).toBeTruthy();
    const next = ok(s, { type: "begin" });
    expect(next.recent).not.toContain("x1");
  });

  const ALLOWED: Record<Phase, ExpActionType[]> = {
    preparation: ["begin", "set_loadout"],
    initial_relic: ["choose_relic", "decline_relic"],
    route: ["choose_route"],
    combat: ["combat_action", "combat_auto"],
    event: ["choose_event", "continue"],
    shop: ["buy", "continue"],
    rest: ["choose_rest", "continue"],
    sanctuary: ["choose_sanctuary", "continue", "set_loadout"],
    reward: ["choose_relic", "decline_relic"],
    sector_summary: ["continue"],
    suspended: ["continue"],
    ended: [],
  };

  it("answers illegal-phase actions with an error and the very same state (every phase x every action)", () => {
    const byPhase = new Map<Phase, ExpState>();
    for (const strat of STRATEGIES)
      for (const s of trace(init({ hero: MID, seed: 6 }), strat, 6, (x) => x.sector >= 3).states)
        if (!byPhase.has(s.phase)) byPhase.set(s.phase, s);
    byPhase.set("suspended", ok(byPhase.get("route")!, { type: "suspend" }));
    byPhase.set("ended", ok(byPhase.get("route")!, { type: "retire" }));
    expect([...byPhase.keys()].sort()).toEqual(Object.keys(ALLOWED).sort());
    for (const [phase, s] of byPhase)
      for (const t of EXP_ACTION_TYPES) {
        if (t === "suspend" || t === "retire" || ALLOWED[phase].includes(t)) continue;
        const r = act(s, bodyOf(t));
        expect(r.error, `${t} in ${phase}`).toBeTruthy();
        expect(r.state, `${t} in ${phase}`).toBe(s);
      }
  });

  it("allows set_loadout only in preparation and sanctuary", () => {
    for (const phase of ["route", "combat", "reward", "shop", "event", "rest", "sector_summary", "initial_relic"] as Phase[])
      expect(act(patch(fresh({ hero: MID }), { phase }), bodyOf("set_loadout")).error, phase).toMatch(/preparación|santuario/);
    expect(act(patch(fresh({ hero: MID }), { phase: "sanctuary" }), bodyOf("set_loadout")).error).toBeUndefined();
    expect(act(fresh({ hero: MID }), bodyOf("set_loadout")).error).toBeUndefined();
    expect(act(patch(fresh({ hero: MID }), { phase: "suspended" }), bodyOf("set_loadout")).error).toBeTruthy();
  });

  it("suspends from every playable phase, refuses a second suspend, and only 'continue' resumes", () => {
    let s = at(1, 3, {}, { hero: MID });
    s = ok(s, { type: "suspend" });
    expect(err(s, { type: "suspend" })).toMatch(/suspendida/i);
    for (const t of EXP_ACTION_TYPES) if (t !== "continue" && t !== "retire" && t !== "suspend") err(s, bodyOf(t));
    expect(ok(s, { type: "continue" }).phase).toBe("route");
    expect(act(patch(fresh(), { phase: "ended" }), { type: "suspend" }).error).toBeTruthy();
  });

  it("keeps a fight and its RNG intact across suspend/resume and plays on identically", () => {
    const f = ok(at(1, 1, {}, { hero: MID }), { type: "choose_route", optionId: "r0" });
    const direct = ok(f, { type: "combat_action", a: "attack1" });
    const resumed = ok(ok(json(ok(f, { type: "suspend" })), { type: "continue" }), { type: "combat_action", a: "attack1" });
    expect(resumed.battle).toEqual(direct.battle);
    expect(resumed.rng).toBe(direct.rng);
  });

  it("retires from any playable phase, keeps the score, clears the battle and is final", () => {
    const f = ok(at(1, 4, { nodes: 3, combats: 2, turns: 17 }, { hero: MID }), { type: "choose_route", optionId: "r0" });
    expect(f.battle).not.toBeNull();
    for (const s of [f, ok(f, { type: "suspend" }), fresh(), at(1, 2)]) {
      const r = ok(s, { type: "retire" });
      expect(r.phase).toBe("ended");
      expect(r.end).toMatchObject({ reason: "retired" });
      expect(r.battle).toBeNull();
      expect([r.nodes, r.combats, r.turns]).toEqual([s.nodes, s.combats, s.turns]);
      err(r, { type: "retire" }); // a second retire is rejected, state unchanged: no double settlement
      for (const t of EXP_ACTION_TYPES) err(r, bodyOf(t));
    }
    expect(ok(f, { type: "retire" }).end!.node).toBe(3);
  });

  it("closes an expedition from another engine or catalog version instead of reinterpreting it", () => {
    const old = patch(fresh(), { engineVersion: ENGINE_VERSION - 1 });
    const r = act(old, { type: "begin" });
    expect(r.error).toBe("engine_outdated");
    expect(r.state.phase).toBe("ended");
    expect(r.state.end).toMatchObject({ reason: "engine" });
    const again = act(r.state, { type: "begin" });
    expect(again.error).toBe("engine_outdated");
    expect(again.state).toBe(r.state);
    expect(act(patch(fresh(), { catalogVersion: 0 }), { type: "begin" }).error).toBe("engine_outdated");
  });

  it("replayExpedition stops at the first rejected action and reports where", () => {
    const good: ExpAction = { type: "begin", actionId: "a0", expectedRevision: 0 };
    const bad: ExpAction = { type: "begin", actionId: "a1", expectedRevision: 1 };
    const r = replayExpedition(init(), [good, bad]);
    expect(r.rejectedAt).toBe(1);
    expect(r.applied).toBe(1);
    expect(r.state.phase).toBe("initial_relic");
  });

  it("never mutates its input state", () => {
    const { states, actions } = trace(init({ hero: MID, seed: 2 }), "random", 2, (s) => s.sector >= 3);
    for (let i = 0; i < Math.min(actions.length, 200); i++) {
      const before = JSON.stringify(states[i]);
      applyExpeditionAction(states[i], actions[i]);
      expect(JSON.stringify(states[i])).toBe(before);
    }
  });
});

describe("sanity of the relic catalog inside the expedition", () => {
  it("names a valid art id for every relic that can be offered or sold", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = ok(fresh({ hero: MID, seed }), { type: "begin" });
      for (const o of s.offer!.options) expect(RELICS[o.relicId]).toBeDefined();
    }
  });
});

describe("elite variants", () => {
  it("offers a lone elite and an escorted elite with different lead elements", () => {
    for (const seed of [1, 7, 99]) {
      const a = expeditionFight(seed, 1, 5, 0);
      const b = expeditionFight(seed, 1, 5, 1);
      expect(a.enemies).toHaveLength(1);
      expect(b.enemies.length).toBeGreaterThan(1);
      expect(b.enemies[0].element).not.toBe(a.enemies[0].element);
      expect(isRiskyOption(seed, 1, 5, 1)).toBe(true);
      expect(isRiskyOption(seed, 1, 5, 0)).toBe(false);
    }
  });
});
