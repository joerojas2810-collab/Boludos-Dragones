import { describe, expect, it } from "vitest";
import { applyExpeditionAction, startExpedition, type ExpAction, type ExpState } from "./game/expedition";
import { niveladoHero } from "./game/niveladoHero";
import {
  BATCH_MAX_ACTIONS,
  BATCH_MAX_BYTES,
  flushDelay,
  flushDue,
  isOfflineError,
  keyGuardBlocks,
  parseQueue,
  reconcile,
  retryDelay,
  serializeQueue,
  stamp,
  takeBatch,
} from "./expeditionSync";

const s0 = startExpedition({ mode: "nivelado", seed: 4242, weekKey: "2026-10-12", hero: niveladoHero("caballero", "fuego") });
const play = (s: ExpState, input: Parameters<typeof stamp>[0], id: string) => {
  const a = stamp(input, s, id);
  const r = applyExpeditionAction(s, a);
  expect(r.error).toBeUndefined();
  return { a, s: r.state };
};
// begin -> pick the first initial relic -> choose the first route
const first = play(s0, { type: "begin" }, "a1");
const second = play(first.s, { type: "choose_relic", offerId: first.s.offer!.id, optionId: "o0" }, "a2");
const third = play(second.s, { type: "choose_route", optionId: "r0" }, "a3");
const chain: ExpAction[] = [first.a, second.a, third.a];

describe("takeBatch", () => {
  it("caps a batch at 256 actions", () => {
    const many = Array.from({ length: 300 }, (_, i) => stamp({ type: "continue" }, { revision: i }, `x${i}`));
    expect(takeBatch(many)).toHaveLength(BATCH_MAX_ACTIONS);
  });
  it("caps a batch at 64 KiB but never returns an empty batch", () => {
    const fat = (i: number) => ({ ...stamp({ type: "continue" }, { revision: i }, `f${i}`), pad: "x".repeat(20_000) }) as unknown as ExpAction;
    const batch = takeBatch([fat(0), fat(1), fat(2), fat(3), fat(4)]);
    expect(batch.length).toBeGreaterThan(0);
    expect(JSON.stringify(batch).length).toBeLessThanOrEqual(BATCH_MAX_BYTES);
    expect(batch.length).toBeLessThan(5);
  });
});

describe("flushDue", () => {
  const combat = (i: number) => stamp({ type: "combat_auto" }, { revision: i }, `c${i}`);
  it("sends right away when a node was resolved or the run stopped", () => {
    expect(flushDue({ nodes: 1, phase: "combat" }, { nodes: 2, phase: "route" }, [combat(0)], 0, 0)).toBe(true);
    expect(flushDue({ nodes: 1, phase: "route" }, { nodes: 1, phase: "suspended" }, [combat(0)], 0, 0)).toBe(true);
    expect(flushDue({ nodes: 1, phase: "combat" }, { nodes: 1, phase: "ended" }, [combat(0)], 0, 0)).toBe(true);
  });
  it("waits for 10 combat actions or 5 seconds, whichever comes first", () => {
    const st = { nodes: 1, phase: "combat" as const };
    expect(flushDue(st, st, Array.from({ length: 9 }, (_, i) => combat(i)), 0, 4_999)).toBe(false);
    expect(flushDue(st, st, Array.from({ length: 10 }, (_, i) => combat(i)), 0, 100)).toBe(true);
    expect(flushDue(st, st, [combat(0)], 0, 5_000)).toBe(true);
    expect(flushDue(st, st, [], 0, 99_999)).toBe(false);
  });
  it("counts the time left of the 5 s window", () => {
    expect(flushDelay(1_000, 3_000)).toBe(3_000);
    expect(flushDelay(1_000, 9_000)).toBe(0);
  });
});

describe("reconcile", () => {
  it("replays an unconfirmed queue on top of the canonical state", () => {
    const r = reconcile(s0, chain);
    expect(r.queue).toHaveLength(3);
    expect(r.state.revision).toBe(third.s.revision);
    expect(r.diverged).toBe(false);
  });
  it("skips actions the server already applied (lost response)", () => {
    const r = reconcile(second.s, chain);
    expect(r.queue.map((a) => a.actionId)).toEqual(["a3"]);
    expect(r.state.revision).toBe(third.s.revision);
  });
  it("has nothing left when everything is confirmed", () => {
    const r = reconcile(third.s, chain);
    expect(r.queue).toEqual([]);
    expect(r.diverged).toBe(false);
  });
  it("discards the queue when the server moved on from another lineage", () => {
    const foreign: ExpState = { ...third.s, recent: ["other-tab"] };
    const r = reconcile(foreign, chain);
    expect(r.queue).toEqual([]);
    expect(r.diverged).toBe(true);
  });
  it("drops a rejected action and everything after it", () => {
    const bad = stamp({ type: "choose_relic", offerId: "nope", optionId: "o0" }, second.s, "bad");
    const after = stamp({ type: "choose_route", optionId: "r0" }, second.s, "after");
    const r = reconcile(s0, [first.a, second.a, bad, after]);
    expect(r.queue.map((a) => a.actionId)).toEqual(["a1", "a2"]);
    expect(r.dropped).toBe(2);
  });
  it("is deterministic: the same queue gives the same state twice", () => {
    expect(reconcile(s0, chain).state).toEqual(reconcile(s0, chain).state);
  });
});

describe("stored queue", () => {
  it("round-trips for the same run and ignores another run", () => {
    const raw = serializeQueue(s0, chain);
    expect(parseQueue(raw, s0).map((a) => a.actionId)).toEqual(["a1", "a2", "a3"]);
    expect(parseQueue(raw, { seed: 1, weekKey: s0.weekKey })).toEqual([]);
    expect(parseQueue(raw, { seed: s0.seed, weekKey: "2026-10-19" })).toEqual([]);
  });
  it("survives garbage", () => {
    expect(parseQueue(null, s0)).toEqual([]);
    expect(parseQueue("{nope", s0)).toEqual([]);
    expect(parseQueue(JSON.stringify({ seed: 4242, weekKey: "2026-10-12", actions: [1, { a: 1 }] }), s0)).toEqual([]);
  });
});

describe("guards and retries", () => {
  it("blocks keyboard clicks (detail 0) and key repeat right after a view change, never real clicks", () => {
    expect(keyGuardBlocks(1_000, 1_450, 0)).toBe(true);
    expect(keyGuardBlocks(1_000, 1_450, 1)).toBe(false);
    expect(keyGuardBlocks(2_000, 1_450, 0)).toBe(false);
    expect(keyGuardBlocks(2_000, 1_450, 0, true)).toBe(true);
  });
  it("retries network trouble with growing delays and surfaces definite refusals", () => {
    expect(isOfflineError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOfflineError({ status: 503 })).toBe(true);
    expect(isOfflineError({ status: 429 })).toBe(true);
    expect(isOfflineError({ status: 403 })).toBe(false);
    expect(retryDelay(0)).toBeLessThan(retryDelay(1));
    expect(retryDelay(99)).toBe(30_000);
  });
});
