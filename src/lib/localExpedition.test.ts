// Offline expedition + the repo API the UI calls (local and remote).
import { describe, expect, it } from "vitest";
import { applyExpeditionAction, type ExpAction, type ExpState } from "./game/expedition";
import { nextAction } from "./game/expeditionBot";
import { createProfile } from "./game/profile";
import { createRng } from "./game/rng";
import { createLocalExpedition, type KV } from "./localExpedition";
import { createLocalRepo, createRemoteRepo, RepoError, type StoreApi } from "./repo";

const mem = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void (v === null ? data.delete(k) : data.set(k, v)) };
};
const profile = createProfile();
const OPTS = { classId: "mago", element: "agua" } as const;
const MON = new Date(Date.UTC(2026, 9, 5, 12)); // Monday 2026-10-05
const play = (s: ExpState, n: number): { state: ExpState; actions: ExpAction[] } => {
  const rng = createRng(3);
  const actions: ExpAction[] = [];
  for (let i = 0; i < n; i++) {
    const a = nextAction(s, "greedy", rng);
    if (!a) break;
    const r = applyExpeditionAction(s, a);
    if (r.error) break;
    s = r.state;
    actions.push(a);
  }
  return { state: s, actions };
};

describe("local expedition", () => {
  it("one active run per mode, persisted, same week key authority as the server", async () => {
    const kv = mem();
    const exp = createLocalExpedition(kv, () => profile, () => MON);
    expect(await exp.current("nivelado")).toBeNull();
    const s = await exp.start("nivelado", OPTS);
    expect(s).toMatchObject({ mode: "nivelado", weekKey: "2026-10-05", phase: "preparation" });
    expect(await exp.start("nivelado", OPTS)).toEqual(s); // returns the existing one
    expect(await exp.current("coleccion")).toBeNull(); // modes are isolated
    expect(await exp.current("nivelado")).toEqual(s);
  });

  it("folds actions with the shared reducer and reports the first rejection", async () => {
    const exp = createLocalExpedition(mem(), () => profile, () => MON);
    const s = await exp.start("nivelado", OPTS);
    const { state, actions } = play(s, 20);
    const r = await exp.act("nivelado", s, actions);
    expect(r).toMatchObject({ applied: actions.length, rejectedAt: null });
    expect(r.state).toEqual(state);
    const bad = await exp.act("nivelado", s, [{ type: "continue", actionId: "q", expectedRevision: 0 }]);
    expect(bad).toMatchObject({ applied: 0, rejectedAt: 0, error: "revision" });
    expect((await exp.current("nivelado"))!.revision).toBe(state.revision);
  });

  it("retire ends the run, frees the slot and records history + codex", async () => {
    const kv = mem();
    const exp = createLocalExpedition(kv, () => profile, () => MON);
    const s = await exp.start("nivelado", OPTS);
    const { state, actions } = play(s, 3);
    await exp.act("nivelado", s, actions);
    const r = await exp.act("nivelado", s, [{ type: "retire", actionId: "r", expectedRevision: state.revision }]);
    expect(r.state.end).toMatchObject({ reason: "retired" });
    expect(await exp.current("nivelado")).toBeNull();
    const cod = await exp.codex("nivelado");
    expect(cod.history).toHaveLength(1);
    expect(cod.history[0]).toMatchObject({ reason: "retired", mode: "nivelado", weekKey: "2026-10-05" });
    expect(cod.relics.length).toBeGreaterThan(0);
    expect((await exp.codex()).relics).toEqual(cod.relics); // merged over both modes
    expect(await exp.start("nivelado", OPTS)).toMatchObject({ phase: "preparation" }); // a new run
  });

  it("a run left from an old week ends as season and never enters the new week", async () => {
    const kv = mem();
    await createLocalExpedition(kv, () => profile, () => MON).start("nivelado", OPTS);
    const sunday = new Date(Date.UTC(2026, 9, 12, 2)); // Sunday 23:00 ART: still the same week
    expect(await createLocalExpedition(kv, () => profile, () => sunday).current("nivelado")).toMatchObject({ phase: "preparation" });
    const nextWeek = new Date(Date.UTC(2026, 9, 12, 3)); // Monday 00:00 ART
    const exp = createLocalExpedition(kv, () => profile, () => nextWeek);
    expect(await exp.current("nivelado")).toMatchObject({ phase: "ended", end: { reason: "season" } });
    expect(await exp.current("nivelado")).toBeNull();
    expect((await exp.codex("nivelado")).history[0]).toMatchObject({ reason: "season", weekKey: "2026-10-05" });
    expect(await exp.start("nivelado", OPTS)).toMatchObject({ weekKey: "2026-10-12" });
  });

  it("needs a real hero in collection mode and validates a given loadout", async () => {
    const exp = createLocalExpedition(mem(), () => profile, () => MON);
    await expect(exp.start("coleccion", { characterId: "nope" })).rejects.toMatchObject({ code: "character_not_found" });
    await expect(exp.start("nivelado", { ...OPTS, loadout: ["x", "y"] as never })).rejects.toMatchObject({ code: "invalid_loadout" });
    await expect(exp.act("nivelado", {} as ExpState, [])).rejects.toMatchObject({ code: "no_expedition" });
  });
});

describe("repo API", () => {
  const store = (): StoreApi => {
    let p = profile;
    return { get: () => p, update: (fn) => void (p = fn(p)), replace: (n) => void (p = n) };
  };

  it("local repo exposes the same expedition functions (errors are RepoError)", async () => {
    const repo = createLocalRepo(store(), mem());
    expect(await repo.expeditionCurrent("nivelado")).toBeNull();
    const s = await repo.expeditionStart("nivelado", OPTS);
    const { actions } = play(s, 4);
    expect(await repo.expeditionAct("nivelado", s, actions)).toMatchObject({ applied: actions.length, rejectedAt: null });
    expect((await repo.towerState()).activeByMode.nivelado).toMatchObject({ status: "active" });
    expect((await repo.towerState()).activeByMode.coleccion).toBeNull();
    await expect(repo.expeditionStart("coleccion", { characterId: "nope" })).rejects.toBeInstanceOf(RepoError);
    expect((await repo.expeditionCodex("nivelado")).relics.length).toBeGreaterThan(0);
  });

  it("remote repo calls the tower endpoints with only actions (never state) and refreshes the profile after a payout", async () => {
    const sent: { url: string; body?: Record<string, unknown> }[] = [];
    const st = store();
    const f = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.startsWith("/api/tower/act")) return Response.json({ state: { revision: 3 }, applied: 2, rejectedAt: null, cursor: {}, prize: { nodes: 1, coins: 5, xp: 0 } });
      if (url === "/api/me") return Response.json({ name: "a", isAdmin: false, profile: { ...profile, coins: 999 } });
      if (url.startsWith("/api/tower/start")) return Response.json({ state: { revision: 0 }, resumed: false });
      if (url.startsWith("/api/tower/current")) return Response.json({ state: null });
      if (url.startsWith("/api/tower/codex")) return Response.json({ relics: [], events: [], best: null, history: [] });
      return Response.json({ week: "2026-10-05" });
    }) as unknown as typeof fetch;
    const repo = createRemoteRepo(st, f);
    expect(await repo.expeditionCurrent("coleccion")).toBeNull();
    await repo.expeditionStart("nivelado", OPTS);
    const state = { revision: 1, hero: "never sent" } as unknown as ExpState;
    const r = await repo.expeditionAct("nivelado", state, [{ type: "begin", actionId: "a", expectedRevision: 1 }]);
    expect(r).toEqual({ state: { revision: 3 }, applied: 2, rejectedAt: null });
    await repo.expeditionCodex("coleccion");
    await repo.towerState();
    expect(sent.map((x) => x.url)).toEqual([
      "/api/tower/current?mode=coleccion", "/api/tower/start", "/api/tower/act", "/api/me", "/api/tower/codex?mode=coleccion", "/api/tower",
    ]);
    expect(sent[1].body).toEqual({ mode: "nivelado", ...OPTS });
    expect(Object.keys(sent[2].body!).sort()).toEqual(["actions", "mode"]);
    expect(st.get().coins).toBe(999);
  });

  it("remote errors keep the server's code for recovery", async () => {
    const f = (async () => Response.json({ error: { code: "invalid_mode", message: "No existe." } }, { status: 400 })) as unknown as typeof fetch;
    await expect(createRemoteRepo(store(), f).expeditionCurrent("x" as never)).rejects.toMatchObject({ code: "invalid_mode", status: 400 });
  });
});
