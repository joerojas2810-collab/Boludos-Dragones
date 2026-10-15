// Server rules of the tower expedition: ownership, idempotency, stale revisions, two tabs, tampering,
// old engine, retire, weekly cap, season close, collection loadouts, pace and budget.
import { describe, expect, it } from "vitest";
import { generateCharacter } from "../game/characters";
import { applyExpeditionAction, nodePay, type ExpAction, type ExpState } from "../game/expedition";
import { nextAction } from "../game/expeditionBot";
import { createRng } from "../game/rng";
import { skillsOfClass } from "../game/skills";
import { EXP_ACTION_BUDGET } from "../game/tower";
import {
  expeditionActService,
  expeditionCodexService,
  expeditionCurrentService,
  expeditionStartService,
} from "./expedition";
import { FakeDb, heroRow } from "./testkit";
import { expeditionActBody } from "./validators";

const P = "u1";
const h0 = generateCharacter(createRng(7), "caballero");
const KEY = heroRow(h0, "f").key;
/** A db with a very strong collection hero: the bot clears many nodes. */
const strongDb = () => {
  const db = new FakeDb();
  db.rows.push(heroRow(h0, "f", 400));
  return db;
};
const startCol = (db: FakeDb, p = P) => expeditionStartService(db.deps, p, { mode: "coleccion", characterId: KEY });
const startNiv = (db: FakeDb) => expeditionStartService(db.deps, P, { mode: "nivelado", classId: "mago", element: "agua" });
const act = (db: FakeDb, mode: string, actions: ExpAction[], p = P) => expeditionActService(db.deps, p, { mode, actions });
const catchErr = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
};

/** A client that plays locally with the shared reducer and keeps the unsent queue. */
class Client {
  queue: ExpAction[] = [];
  constructor(public state: ExpState) {}
  play(n: number, until?: (s: ExpState) => boolean) {
    const rng = createRng(5);
    for (let i = 0; i < n && !until?.(this.state); i++) {
      const a = nextAction(this.state, "greedy", rng);
      if (!a) break;
      const r = applyExpeditionAction(this.state, a);
      if (r.error) throw new Error(r.error);
      this.state = r.state;
      this.queue.push(a);
    }
    return this;
  }
  take() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

describe("tower mode parameter", () => {
  it("rejects unknown modes everywhere with a recovery-friendly 400", async () => {
    const db = new FakeDb();
    for (const call of [
      () => expeditionCurrentService(db.deps, P, "hax"),
      () => expeditionCurrentService(db.deps, P, null),
      () => expeditionStartService(db.deps, P, { mode: "x" }),
      () => act(db, "x", [{ type: "begin", actionId: "a", expectedRevision: 0 }]),
      () => expeditionCodexService(db.deps, P, "x"),
    ])
      expect(await catchErr(call())).toMatchObject({ status: 400, code: "invalid_mode", extra: { recover: "/torre" } });
    expect(db.calls.filter((c) => c.name.startsWith("tower_run"))).toHaveLength(0); // nothing reached the database
  });

  it("start needs a class and element (levelled) or an owned hero (collection)", async () => {
    const db = strongDb();
    expect(await catchErr(expeditionStartService(db.deps, P, { mode: "nivelado", classId: "mago" }))).toMatchObject({ code: "invalid_input" });
    expect(await catchErr(expeditionStartService(db.deps, P, { mode: "nivelado", classId: "x", element: "agua" }))).toMatchObject({ code: "invalid_input" });
    expect(await catchErr(expeditionStartService(db.deps, P, { mode: "coleccion" }))).toMatchObject({ code: "invalid_input" });
    expect(await catchErr(expeditionStartService(db.deps, P, { mode: "coleccion", characterId: "c-mago-fuego-f" }))).toMatchObject({ status: 404 });
    expect(db.towerRuns).toHaveLength(0);
  });
});

describe("expedition lifecycle", () => {
  it("one active run per player and mode: start returns the open one, modes are isolated", async () => {
    const db = strongDb();
    const a = await startCol(db);
    const b = await startCol(db);
    expect(b.resumed).toBe(true);
    expect(b.state).toEqual(a.state);
    expect(db.towerRuns).toHaveLength(1);
    expect(a.state).toMatchObject({ mode: "coleccion", weekKey: "2026-10-05", revision: 0, phase: "preparation" });
    const n = await startNiv(db); // another mode never closes the first
    expect(n.resumed).toBe(false);
    expect(db.towerRuns.map((r) => [r.mode, r.status])).toEqual([["coleccion", "active"], ["nivelado", "active"]]);
    // the server fixes week + seed; the client never sends them
    expect(db.towerRuns[0].week).toBe("2026-10-05");
    expect(db.towerRuns[0].seed).toBe(a.state.seed);
    expect(a.state.seed).not.toBe(n.state.seed); // separate streams per mode
    // a hero snapshot lives inside the state and the EXP hero is stored apart
    expect(a.state.hero.classId).toBe("caballero");
    expect(db.towerRuns[0].heroId).toBe(KEY);
    expect(db.towerRuns[1].heroId).toBeNull();
  });

  it("current returns the open run of that mode only", async () => {
    const db = strongDb();
    expect((await expeditionCurrentService(db.deps, P, "coleccion")).state).toBeNull();
    await startNiv(db);
    expect((await expeditionCurrentService(db.deps, P, "coleccion")).state).toBeNull();
    expect((await expeditionCurrentService(db.deps, P, "nivelado")).state).toMatchObject({ mode: "nivelado" });
    expect((await expeditionCurrentService(db.deps, "u2", "nivelado")).state).toBeNull(); // ownership
  });

  it("act folds on the STORED state and the result equals the client's local play", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(60);
    const r = await act(db, "coleccion", c.take());
    expect(r.rejectedAt).toBeNull();
    expect(r.applied).toBe(60);
    expect(r.state).toEqual(c.state);
    expect(r.cursor).toEqual({ revision: c.state.revision, lastActionId: c.state.recent.at(-1) });
    expect(db.towerRuns[0].state).toEqual(c.state);
    expect(db.towerRuns[0].actions).toBe(60);
    // payouts: every newly won node of the first 3 sectors is paid once with the fixed amounts
    const paid = c.state.ledger.reduce((s, e) => s + nodePay(e), 0);
    expect(paid).toBeGreaterThan(0);
    expect(db.paidCoins).toBe(paid);
    expect(db.scores[`${P}:coleccion`]).toEqual({ nodes: c.state.nodes, turns: c.state.turns });
    expect(r.prize).toMatchObject({ coins: paid });
    expect(db.paidXp.length).toBeGreaterThan(0); // collection mode: EXP for the hero
    expect(db.paidXp.every((x) => x.p_character_id === KEY)).toBe(true);
  });

  it("levelled mode never grants EXP", async () => {
    const db = new FakeDb();
    const c = new Client((await startNiv(db)).state).play(8);
    await act(db, "nivelado", c.take());
    expect(db.paidXp).toHaveLength(0);
  });

  it("never trusts the client: an offer, price or event it makes up is rejected without applying it", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(1); // begin: the relic offer is open
    expect(c.state.phase).toBe("initial_relic");
    await act(db, "coleccion", c.take());
    const rev = c.state.revision;
    const bad: ExpAction[] = [
      { type: "choose_relic", offerId: "99:9", optionId: "x", actionId: "f1", expectedRevision: rev },
    ];
    const r = await act(db, "coleccion", bad);
    expect(r).toMatchObject({ applied: 0, rejectedAt: 0, error: expect.any(String) });
    expect(r.state.revision).toBe(rev);
    expect(db.towerRuns[0].revision).toBe(rev);
    // a legal prefix is kept and the bad action ends the batch
    const offer = c.state.offer!;
    const good: ExpAction = { type: "choose_relic", offerId: offer.id, optionId: offer.options[0].id, actionId: "g1", expectedRevision: rev };
    const mixed = await act(db, "coleccion", [good, { type: "buy", itemId: "g0", actionId: "g2", expectedRevision: rev + 1 }]);
    expect(mixed.applied).toBe(1);
    expect(mixed.rejectedAt).toBe(1);
    expect(mixed.state.relics).toHaveLength(1);
  });
});

describe("idempotency and concurrency", () => {
  it("a repeated actionId is a no-op: the same batch twice changes and pays nothing", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(40);
    const batch = c.take();
    const first = await act(db, "coleccion", batch);
    const coins = db.paidCoins;
    const commits = db.commits;
    const again = await act(db, "coleccion", batch); // response lost: the client resends
    expect(again.applied).toBe(40);
    expect(again.rejectedAt).toBeNull();
    expect(again.state).toEqual(first.state);
    expect(db.paidCoins).toBe(coins);
    expect(db.commits).toBe(commits); // nothing was written
    // a longer retry (old batch + new actions) applies only the new part
    c.play(10);
    const more = c.take();
    const grown = await act(db, "coleccion", [...batch, ...more]);
    expect(grown.applied).toBe(50);
    expect(grown.state).toEqual(c.state);
  });

  it("a stale revision is rejected and the canonical state comes back", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(5);
    await act(db, "coleccion", c.take());
    const stale: ExpAction = { type: "continue", actionId: "old", expectedRevision: 0 };
    const r = await act(db, "coleccion", [stale]);
    expect(r).toMatchObject({ applied: 0, rejectedAt: 0, error: "revision" });
    expect(r.state.revision).toBe(c.state.revision);
  });

  it("out-of-order batches are rejected at the first action, nothing applied", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(12);
    const all = c.take();
    const r = await act(db, "coleccion", all.slice(6)); // the first half never arrived
    expect(r).toMatchObject({ applied: 0, rejectedAt: 0, error: "revision" });
    expect(db.towerRuns[0].revision).toBe(0);
    expect((await act(db, "coleccion", all)).applied).toBe(12); // in order it works
  });

  it("two tabs: the second one is told the canonical state and never mixes revisions", async () => {
    const db = strongDb();
    const base = (await startCol(db)).state;
    const tabA = new Client(base).play(10);
    const tabB = new Client(base).play(14);
    expect((await act(db, "coleccion", tabA.take())).applied).toBe(10);
    const own = tabB.take().map((x) => ({ ...x, actionId: `tabB-${x.actionId}` })); // real tabs have their own ids
    const rb = await act(db, "coleccion", own);
    expect(rb).toMatchObject({ applied: 0, rejectedAt: 0, error: "revision" });
    expect(rb.state).toEqual(tabA.state);
    expect(db.towerRuns).toHaveLength(1);
  });

  it("another request committing between load and commit is refolded on the new state", async () => {
    const db = strongDb();
    const base = (await startCol(db)).state;
    const c = new Client(base).play(6);
    const batch = c.take();
    // "tab B" lands first with the same actions: our commit conflicts, reloads and sees them as already done
    db.beforeCommit = () => {
      const run = db.towerRuns[0];
      const f = new Client(base).play(6);
      run.state = f.state as unknown as Record<string, unknown>;
      run.revision = f.state.revision;
    };
    const r = await act(db, "coleccion", batch);
    expect(r.state.revision).toBeGreaterThanOrEqual(c.state.revision);
    expect(db.towerRuns[0].state.revision).toBe(r.state.revision);
  });

  it("retiring twice never pays or ends twice", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(30);
    await act(db, "coleccion", c.take());
    const retire: ExpAction = { type: "retire", actionId: "r1", expectedRevision: c.state.revision };
    const r = await act(db, "coleccion", [retire]);
    expect(r.state).toMatchObject({ phase: "ended", end: { reason: "retired" } });
    const coins = db.paidCoins;
    expect(db.towerRuns[0].status).toBe("ended");
    // resent: there is no open run any more
    expect(await catchErr(act(db, "coleccion", [retire]))).toMatchObject({ status: 404, code: "no_expedition" });
    expect(db.paidCoins).toBe(coins);
    // and the slot is free again for a fresh run
    const fresh = await startCol(db);
    expect(fresh.resumed).toBe(false);
    expect(db.towerRuns).toHaveLength(2);
  });

  it("a dead run keeps its confirmed rewards and the best score", async () => {
    const db = new FakeDb(); // levelled preset dies quickly
    const c = new Client((await startNiv(db)).state);
    await act(db, "nivelado", c.play(400, (s) => s.phase === "ended").take());
    expect(c.state.phase).toBe("ended");
    expect(db.towerRuns[0].status).toBe("ended");
    expect(db.paidCoins).toBe(c.state.ledger.reduce((s, e) => s + nodePay(e), 0));
    const best = db.scores[`${P}:nivelado`];
    if (c.state.nodes > 0) expect(best).toEqual({ nodes: c.state.nodes, turns: c.state.turns });
  });
});

describe("weekly cap, week close, engine and budget", () => {
  it("a second run of the same week pays no node twice", async () => {
    const db = strongDb();
    const c1 = new Client((await startCol(db)).state).play(80);
    await act(db, "coleccion", c1.take());
    const paid = db.paidCoins;
    expect(paid).toBeGreaterThan(0);
    await act(db, "coleccion", [{ type: "retire", actionId: "r", expectedRevision: c1.state.revision }]);
    const c2 = new Client((await startCol(db)).state).play(80); // same seed, same path
    const r = await act(db, "coleccion", c2.take());
    expect(c2.state.ledger.length).toBeGreaterThan(0);
    expect(db.paidCoins).toBe(paid);
    expect(r.prize).toMatchObject({ coins: 0, xp: 0 });
  });

  it("past the week deadline nothing new is validated: the run ends as season", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(40);
    await act(db, "coleccion", c.take());
    const coins = db.paidCoins;
    const before = db.towerRuns[0].nodes;
    c.play(40);
    db.nowMs = db.weekDeadlineMs + 1; // Monday midnight (Buenos Aires) passed
    const r = await act(db, "coleccion", c.take());
    expect(r).toMatchObject({ applied: 0, error: "season" });
    expect(r.state).toMatchObject({ phase: "ended", end: { reason: "season" } });
    expect(db.towerRuns[0]).toMatchObject({ status: "ended", endReason: "season", nodes: before });
    expect(db.paidCoins).toBe(coins);
    // the run never lands in the new week: a new start gets a fresh week
    db.weekDeadlineMs += 7 * 86_400_000;
    expect((await startCol(db)).resumed).toBe(false);
  });

  it("current closes an old-week run once and shows it as season", async () => {
    const db = strongDb();
    await startCol(db);
    db.nowMs = db.weekDeadlineMs + 5;
    const a = await expeditionCurrentService(db.deps, P, "coleccion");
    expect(a.state).toMatchObject({ phase: "ended", end: { reason: "season" } });
    expect((await expeditionCurrentService(db.deps, P, "coleccion")).state).toBeNull();
  });

  it("a run made with another engine ends as 'engine' and keeps what was paid", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(30);
    await act(db, "coleccion", c.take());
    const coins = db.paidCoins;
    db.towerRuns[0].engineVersion -= 1; // the game was updated
    const r = await act(db, "coleccion", [{ type: "continue", actionId: "z", expectedRevision: c.state.revision }]);
    expect(r).toMatchObject({ applied: 0, error: "engine_outdated" });
    expect(r.state).toMatchObject({ phase: "ended", end: { reason: "engine" } });
    expect(db.towerRuns[0]).toMatchObject({ status: "ended", endReason: "engine" });
    expect(db.paidCoins).toBe(coins);
    expect((await expeditionCurrentService(db.deps, P, "coleccion")).state).toBeNull();
    expect((await startCol(db)).resumed).toBe(false);
  });

  it("runs out of action budget with an explicit 'limit' end, never a silent truncation", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(5);
    await act(db, "coleccion", c.take());
    db.towerRuns[0].actions = EXP_ACTION_BUDGET - 2;
    c.play(6);
    const r = await act(db, "coleccion", c.take());
    expect(r.error).toBe("limit");
    expect(r.applied).toBe(2);
    expect(r.state).toMatchObject({ phase: "ended", end: { reason: "limit" } });
    expect(db.towerRuns[0]).toMatchObject({ status: "ended", endReason: "limit" });
  });

  it("a batch faster than a person can click stays pending (429), nothing is applied", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(30);
    db.runAgeMs = 1000; // 30 actions in one second
    expect(await catchErr(act(db, "coleccion", c.take()))).toMatchObject({ status: 429, code: "too_fast" });
    expect(db.towerRuns[0].revision).toBe(0);
    expect(db.audits).toContain("expedition_too_fast");
  });

  it("is rate limited", async () => {
    const db = strongDb();
    await startCol(db);
    db.rateLimited = true;
    expect(await catchErr(act(db, "coleccion", [{ type: "begin", actionId: "b", expectedRevision: 0 }]))).toMatchObject({ status: 429 });
  });
});

describe("collection loadouts", () => {
  it("set_loadout is revalidated against the mastery the server stores", async () => {
    const db = strongDb(); // the hero is level 1: only the unlock-0 skills are available
    const s = (await startCol(db)).state;
    const locked = skillsOfClass("caballero").filter((k) => k.unlock > 1);
    const open = skillsOfClass("caballero").filter((k) => k.unlock <= 1);
    expect(locked.length).toBeGreaterThan(0);
    const r = await act(db, "coleccion", [
      { type: "set_loadout", loadout: [open[0].id, locked[0].id], actionId: "l1", expectedRevision: s.revision },
    ]);
    expect(r).toMatchObject({ applied: 0, rejectedAt: 0, error: "Habilidad todavía bloqueada." });
    expect(db.towerRuns[0].revision).toBe(0);
    const ok = await act(db, "coleccion", [
      { type: "set_loadout", loadout: [open[1].id, open[0].id], actionId: "l2", expectedRevision: s.revision },
    ]);
    expect(ok.applied).toBe(1);
    expect(ok.state.loadout).toEqual([open[1].id, open[0].id]);
  });

  it("the levelled tower allows every skill of the class", async () => {
    const db = new FakeDb();
    const s = (await expeditionStartService(db.deps, P, { mode: "nivelado", classId: "caballero", element: "fuego" })).state;
    const ids = skillsOfClass("caballero").map((k) => k.id);
    const r = await act(db, "nivelado", [{ type: "set_loadout", loadout: [ids[2], ids[3]], actionId: "l", expectedRevision: s.revision }]);
    expect(r.applied).toBe(1);
  });
});

describe("request bodies", () => {
  const a = (extra: object) => ({ type: "begin", actionId: "x", expectedRevision: 0, ...extra });
  it("accepts up to 256 well-formed actions and nothing else", () => {
    const ok = (n: number) => expeditionActBody.safeParse({ mode: "nivelado", actions: Array.from({ length: n }, () => a({})) }).success;
    expect(ok(1)).toBe(true);
    expect(ok(256)).toBe(true);
    expect(ok(257)).toBe(false);
    expect(ok(0)).toBe(false);
    expect(expeditionActBody.safeParse({ mode: "nivelado", actions: [a({ type: "give_money" })] }).success).toBe(false);
    expect(expeditionActBody.safeParse({ mode: "nivelado", actions: [a({ price: 0 })] }).success).toBe(false); // strict
    expect(expeditionActBody.safeParse({ mode: "nivelado", state: {}, actions: [a({})] }).success).toBe(false); // never a client state
  });
});

describe("codex", () => {
  it("returns discovered relics and events from the database", async () => {
    const db = strongDb();
    const c = new Client((await startCol(db)).state).play(20);
    await act(db, "coleccion", c.take());
    const cod = await expeditionCodexService(db.deps, P, "coleccion");
    expect(cod.relics).toEqual(expect.arrayContaining(c.state.seen.relics));
    expect((await expeditionCodexService(db.deps, P, undefined)).relics).toBeDefined(); // all modes
  });
});
