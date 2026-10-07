import { describe, expect, it } from "vitest";
import { generateCharacter } from "../game/characters";
import { ENGINE_VERSION } from "../game/stage";
import { replayTower } from "../game/tower";
import { createRng } from "../game/rng";
import { derivePassword, safeEqual, syntheticEmail } from "./credentials";
import { parseEnv } from "./envSchema";
import { ApiError, checkOrigin, readJson } from "./http";
import { BAD_CREDENTIALS, login } from "./loginFlow";
import { limit } from "./rpc";
import { doForge, doPull, startRunService, submitRunService } from "./services";
import { FakeDb, playBot } from "./testkit";
import {
  credsBody,
  forgeBody,
  nameKeyOf,
  nameSchema,
  pinSchema,
  pullBody,
  registerBody,
  runActionSchema,
  runSubmitBody,
} from "./validators";

const UUID = "11111111-1111-4111-8111-111111111111";
const catchErr = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
};

describe("credentials", () => {
  it("derives a deterministic 64-hex password bound to pepper, name and pin", () => {
    const a = derivePassword("p".repeat(32), "ana", "1234");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(derivePassword("p".repeat(32), "ana", "1234")).toBe(a);
    expect(derivePassword("p".repeat(32), "ana", "1235")).not.toBe(a);
    expect(derivePassword("p".repeat(32), "anb", "1234")).not.toBe(a);
    expect(derivePassword("q".repeat(32), "ana", "1234")).not.toBe(a);
    expect(syntheticEmail("ana_1")).toBe("ana_1@players.invalid");
  });
  it("safeEqual compares correctly regardless of length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
  it("env validation fails fast with a readable message and no values", () => {
    expect(() => parseEnv({ PIN_PEPPER: "short-secret" })).toThrow(
      /Configuración del servidor inválida.*PIN_PEPPER/,
    );
    try {
      parseEnv({ PIN_PEPPER: "short-secret" });
    } catch (e) {
      expect(String(e)).not.toContain("short-secret");
    }
  });
});

describe("validators", () => {
  it("names", () => {
    for (const ok of ["Ana", "Juan Pérez", "ñandú_2", "ABC", "a".repeat(16)])
      expect(nameSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of [
      "ab",
      "a".repeat(17),
      "<b>x</b>",
      "ana!",
      "ana-1",
      "",
      "   ",
      "Иван",
      "x\u0000y",
      "ana;drop",
    ])
      expect(nameSchema.safeParse(bad).success, bad).toBe(false);
  });
  it("name key is case/accent/space insensitive", () => {
    expect(nameKeyOf("  José  Luis ")).toBe("jose_luis");
    expect(nameKeyOf("JOSE LUIS")).toBe(nameKeyOf("jose  luis"));
  });
  it("pins", () => {
    for (const ok of ["0000", "1234", "9999"])
      expect(pinSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["123", "12345", "12a4", " 123", "１２３４", "", "12.4"])
      expect(pinSchema.safeParse(bad).success, bad).toBe(false);
  });
  it("bodies reject unknown keys and bad pull params", () => {
    expect(
      credsBody.safeParse({ name: "Ana", pin: "1234", is_admin: true }).success,
    ).toBe(false);
    expect(registerBody.safeParse({ name: "Ana", pin: "1234" }).success).toBe(
      false,
    );
    const p = { banner: "character", count: 1, idempotencyKey: UUID };
    expect(pullBody.safeParse(p).success).toBe(true);
    expect(pullBody.safeParse({ ...p, count: 10 }).success).toBe(true);
    for (const count of [0, 2, 5, 11, -1, 1.5, "1"])
      expect(pullBody.safeParse({ ...p, count }).success, String(count)).toBe(
        false,
      );
    expect(pullBody.safeParse({ ...p, coins: 99999 }).success).toBe(false);
    expect(pullBody.safeParse({ ...p, idempotencyKey: "x" }).success).toBe(
      false,
    );
    expect(pullBody.safeParse({ ...p, banner: "gold" }).success).toBe(false);
  });
  it("run actions accept target, auto and quit and reject bad ones", () => {
    const ok = (a: unknown) => runActionSchema.safeParse(a).success;
    expect(ok({ t: "act", a: "attack3", target: 2 })).toBe(true);
    expect(ok({ t: "act", a: "attack1" })).toBe(true);
    expect(ok({ t: "act", a: "attack1", target: 3 })).toBe(false);
    expect(ok({ t: "act", a: "attack1", target: -1 })).toBe(false);
    expect(ok({ t: "act", a: "attack1", target: 0.5 })).toBe(false);
    expect(ok({ t: "act", a: "attack4" })).toBe(false);
    expect(ok({ t: "auto" })).toBe(true);
    expect(ok({ t: "auto", extra: 1 })).toBe(false);
    expect(ok({ t: "quit" })).toBe(true);
    expect(ok({ t: "door", i: 0 })).toBe(false); // doors are gone
    expect(
      runSubmitBody.safeParse({
        runId: UUID,
        actions: [],
        engineVersion: 2,
      }).success,
    ).toBe(true);
  });
  it("run submit rejects bad ids, too many actions and unknown action types", () => {
    const base = { runId: UUID, actions: [] as unknown[] };
    expect(runSubmitBody.safeParse(base).success).toBe(true);
    expect(
      runSubmitBody.safeParse({ ...base, actions: [{ t: "hack" }] }).success,
    ).toBe(false);
    expect(
      runSubmitBody.safeParse({
        ...base,
        actions: Array(8001).fill({ t: "fin" }),
      }).success,
    ).toBe(false);
    expect(runSubmitBody.safeParse({ ...base, runId: "1" }).success).toBe(
      false,
    );
  });
});

describe("http helpers", () => {
  const post = (headers: Record<string, string>, body = "{}") =>
    new Request("http://localhost:3001/api/x", {
      method: "POST",
      headers,
      body,
    });
  it("origin check", () => {
    const h = { host: "localhost:3001" };
    expect(() =>
      checkOrigin(post({ ...h, origin: "http://localhost:3001" })),
    ).not.toThrow();
    for (const origin of ["http://evil.com", "null", "not a url"])
      expect(() => checkOrigin(post({ ...h, origin }))).toThrow(ApiError);
    expect(() => checkOrigin(post(h))).toThrow(ApiError); // missing Origin
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3001/api/me", {
          headers: { host: "localhost:3001" },
        }),
      ),
    ).not.toThrow(); // GET is exempt
  });
  it("body limits and validation", async () => {
    const big = JSON.stringify({
      name: "Ana",
      pin: "1234",
      pad: "x".repeat(20_000),
    });
    expect(
      await catchErr(
        readJson(
          post({ "content-length": String(big.length) }, big),
          credsBody,
        ),
      ),
    ).toMatchObject({ status: 413 });
    // no declared length: the real stream is still capped
    const req = new Request("http://x/api", { method: "POST", body: big });
    expect(await catchErr(readJson(req, credsBody))).toMatchObject({
      status: 413,
    });
    expect(
      await catchErr(readJson(post({}, "{nope"), credsBody)),
    ).toMatchObject({ status: 400 });
    expect(
      await catchErr(
        readJson(
          post({}, JSON.stringify({ name: "Ana", pin: "12" })),
          credsBody,
        ),
      ),
    ).toMatchObject({ status: 400 });
    expect(
      await readJson(
        post({}, JSON.stringify({ name: " Ana ", pin: "1234" })),
        credsBody,
      ),
    ).toEqual({ name: "Ana", pin: "1234" });
  });
});

describe("rate limit + login flow", () => {
  type Check = { allowed: boolean; reason: string; retry_after: number };
  const make = (opts: { exists: boolean; check?: Check; pin?: string }) => {
    const calls: string[] = [];
    const ctx = {
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "auth_check")
          return {
            data: opts.check ?? { allowed: true, reason: "ok", retry_after: 0 },
            error: null,
          };
        return { data: { ok: true }, error: null };
      },
      signIn: async (email: string, password: string) => {
        calls.push("signIn");
        return (
          opts.exists &&
          email === "ana@players.invalid" &&
          password === derivePassword("p".repeat(32), "ana", opts.pin ?? "1234")
        );
      },
      pepper: "p".repeat(32),
      adminName: "Paul",
    };
    return { ctx, calls };
  };
  it("unknown name and wrong PIN give the identical error and both count a failure", async () => {
    const a = make({ exists: false });
    const b = make({ exists: true, pin: "9999" });
    const ea = (await catchErr(
      login(a.ctx, "ghost", "1234", "1.1.1.1"),
    )) as ApiError;
    const eb = (await catchErr(
      login(b.ctx, "ana", "1234", "1.1.1.1"),
    )) as ApiError;
    expect([ea.status, ea.code, ea.message]).toEqual([
      401,
      "bad_credentials",
      BAD_CREDENTIALS,
    ]);
    expect([eb.status, eb.code, eb.message]).toEqual([
      ea.status,
      ea.code,
      ea.message,
    ]);
    expect(a.calls).toEqual(["auth_check", "signIn", "auth_fail"]);
    expect(b.calls).toEqual(a.calls);
  });
  it("success clears the counter; limits are checked BEFORE the PIN", async () => {
    const ok = make({ exists: true });
    await login(ok.ctx, "ana", "1234", "ip");
    expect(ok.calls).toEqual(["auth_check", "signIn", "auth_success"]);
    const locked = make({
      exists: true,
      check: { allowed: false, reason: "locked", retry_after: 0 },
    });
    const e = (await catchErr(
      login(locked.ctx, "ana", "1234", "ip"),
    )) as ApiError;
    expect(e.status).toBe(429);
    expect(e.message).toContain("Paul");
    expect(locked.calls).toEqual(["auth_check"]); // never even tried the PIN
    const wait = make({
      exists: true,
      check: { allowed: false, reason: "wait", retry_after: 60 },
    });
    const w = (await catchErr(
      login(wait.ctx, "ana", "1234", "ip"),
    )) as ApiError;
    expect([w.status, w.code, w.extra.retryAfter]).toEqual([
      429,
      "rate_limited",
      60,
    ]);
  });
  it("limit() calls the SQL counter and maps denial to 429", async () => {
    const db = new FakeDb();
    await limit(db.deps.rpc, "pull:u1", 30, 60);
    expect(db.calls[0]).toEqual({
      name: "rate_limit_hit",
      args: { p_key: "pull:u1", p_max: 30, p_window_seconds: 60 },
    });
    db.rateLimited = true;
    expect(await catchErr(limit(db.deps.rpc, "k", 1, 10))).toMatchObject({
      status: 429,
    });
  });
});

describe("pull service (fake DB)", () => {
  const body = (over = {}) => ({
    banner: "character" as const,
    count: 1 as const,
    idempotencyKey: UUID,
    ...over,
  });
  it("charges the server price and persists the engine's result", async () => {
    const db = new FakeDb();
    const r = await doPull(db.deps, "u1", body());
    expect(db.coins).toBe(2750);
    expect(r.results).toHaveLength(1);
    expect(r.profile.coins).toBe(2750);
    expect(r.profile.characters).toHaveLength(1);
    const call = db.calls.find((c) => c.name === "apply_pull")!;
    expect(call.args).toMatchObject({
      p_player: "u1",
      p_cost: 250,
      p_banner: "character",
      p_daily: false,
      p_seed: 12345,
    });
  });
  it("x10 costs 2250 and never trusts anything from the client", async () => {
    const db = new FakeDb();
    db.coins = 2250;
    const r = await doPull(db.deps, "u1", body({ count: 10 }));
    expect(db.coins).toBe(0);
    expect(r.results).toHaveLength(10);
  });
  it("insufficient coins -> 409 and nothing changes", async () => {
    const db = new FakeDb();
    db.coins = 249;
    const e = await catchErr(doPull(db.deps, "u1", body()));
    expect(e).toMatchObject({ status: 409, code: "insufficient_coins" });
    expect(db.coins).toBe(249);
    expect(db.rows).toHaveLength(0);
  });
  it("repeating the same idempotency key charges once", async () => {
    const db = new FakeDb();
    const first = await doPull(db.deps, "u1", body());
    const again = await doPull(db.deps, "u1", body());
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.results).toBeNull();
    expect(db.coins).toBe(2750);
  });
  it("retries once on a version conflict", async () => {
    const db = new FakeDb();
    db.conflictOnce = true;
    await doPull(db.deps, "u1", body());
    expect(db.calls.filter((c) => c.name === "apply_pull")).toHaveLength(2);
    expect(db.coins).toBe(2750);
    expect(db.audits).toContain("pull_conflict");
  });
  it("rate limit applies", async () => {
    const db = new FakeDb();
    db.rateLimited = true;
    expect(await catchErr(doPull(db.deps, "u1", body()))).toMatchObject({
      status: 429,
    });
    expect(db.calls.some((c) => c.name === "apply_pull")).toBe(false);
  });
  it("weapon banner persists a weapon with pity after the pull", async () => {
    const db = new FakeDb();
    await doPull(db.deps, "u1", body({ banner: "weapon" }));
    expect(db.rows[0].kind).toBe("weap");
    expect(db.pity.weapon).toBe(1);
  });
});

describe("weekly tower", () => {
  // A beefed-up hero so the bot climbs a few floors.
  const h0 = generateCharacter(createRng(7), "caballero");
  const hero = {
    ...h0,
    stats: {
      ...h0.stats,
      hp: h0.stats.hp * 25,
      atk: h0.stats.atk * 6,
      def: h0.stats.def * 6,
    },
  };
  const open = (db: FakeDb, startedAt?: number) => {
    db.run = {
      seed: 777,
      hero: { ...hero, engineVersion: ENGINE_VERSION, tower: "coleccion" },
      status: "open",
      startedAt,
    };
  };
  const sub = (
    db: FakeDb,
    actions: unknown[],
    claimed?: { coins: number; maxFloor: number },
  ) =>
    submitRunService(db.deps, "u1", {
      runId: UUID,
      actions: actions as never,
      claimed,
    });

  it("starts on the week's seed and records only a verified floor, paying nothing", async () => {
    const db = new FakeDb();
    const info = await startRunService(db.deps, "u1", {
      classId: "mago",
      characterId: null,
      tower: "nivelado",
    });
    expect(info).toMatchObject({ seed: 777, rank: null, tower: "nivelado" });
    expect(db.calls.find((c) => c.name === "start_run")!.args).toMatchObject({
      p_seed: 777,
      p_hero: { tower: "nivelado" },
    });
    const log = playBot(777, hero, 800);
    const truth = replayTower(777, hero, log);
    expect(truth.rejectedAt).toBeNull();
    expect(truth.floors).toBeGreaterThan(2);
    open(db);
    const r = await sub(db, log, { coins: 0, maxFloor: truth.floors });
    expect(r.verdict).toBe("accepted");
    expect(db.banked[0]).toMatchObject({ p_coins: 0, p_loot: [], p_parts: {} });
    expect(db.towerRecords[0]).toMatchObject({
      p_mode: "coleccion",
      p_floor: truth.floors,
    });
  });

  it("inflated claims are ignored: the replayed floor is what counts", async () => {
    const db = new FakeDb();
    open(db);
    const log = playBot(777, hero, 800);
    const truth = replayTower(777, hero, log);
    const r = await sub(db, log, { coins: 0, maxFloor: 99 });
    expect(r.verdict).toBe("mismatch");
    expect(db.banked[0].p_max_floor).toBe(truth.floors);
    expect(db.towerRecords).toHaveLength(0); // only fully verified logs rank
    expect(db.audits).toContain("run_mismatch");
  });

  it("an illegal action cuts the log there and never reaches the ranking", async () => {
    const db = new FakeDb();
    open(db);
    const r = await sub(db, [{ t: "fin" }]); // no fight has ended
    expect(r.verdict).toBe("truncated");
    expect(db.towerRecords).toHaveLength(0);
    expect(db.audits).toContain("run_truncated");
  });

  it("one submission per run, unknown run, other engine versions and dungeons", async () => {
    const db = new FakeDb();
    expect(await catchErr(sub(db, []))).toMatchObject({
      status: 404,
      code: "run_not_found",
    });
    db.run = { seed: 777, hero: { ...hero, tower: "coleccion" }, status: "open" };
    expect(await catchErr(sub(db, []))).toMatchObject({
      code: "engine_outdated", // recorded before versioning
    });
    open(db);
    const stale = submitRunService(db.deps, "u1", {
      runId: UUID,
      actions: [],
      engineVersion: ENGINE_VERSION + 1,
    });
    expect(await catchErr(stale)).toMatchObject({ code: "engine_outdated" });
    await sub(db, []);
    db.run!.status = "closed";
    expect(await catchErr(sub(db, []))).toMatchObject({
      status: 409,
      code: "duplicate_run",
    });
    db.run = { seed: 1, hero: { ...hero, engineVersion: ENGINE_VERSION }, status: "open" };
    expect(await catchErr(sub(db, []))).toMatchObject({ status: 501 });
    expect(
      await catchErr(
        startRunService(db.deps, "u1", { classId: "mago", characterId: null }),
      ),
    ).toMatchObject({ status: 501 });
  });

  it("a foreign or wrong-class character is refused", async () => {
    const db = new FakeDb();
    expect(
      await catchErr(
        startRunService(db.deps, "u1", {
          classId: "mago",
          characterId: "c-mago-fuego-legendario",
          tower: "coleccion",
        }),
      ),
    ).toMatchObject({ status: 404 });
  });

  it("a log faster than a person can click is closed unpaid", async () => {
    const db = new FakeDb();
    const log = playBot(777, hero, 800);
    open(db, Date.now() - 5_000); // hundreds of actions in 5 s
    expect(await catchErr(sub(db, log))).toMatchObject({
      status: 429,
      code: "too_fast",
    });
    expect(db.banked[0]).toMatchObject({ p_verdict: "rejected", p_coins: 0 });
    expect(db.audits).toContain("run_too_fast");
    const slow = new FakeDb();
    open(slow, Date.now() - log.length * 1000); // plausible pace
    expect((await sub(slow, log)).verdict).toBe("accepted");
  });
});

describe("forge service", () => {
  it("runs the pure forge and persists exactly its diff; invalid combos never reach the DB", async () => {
    const db = new FakeDb();
    db.parts = { "p-espada-f": 3, "core-fuego": 1 };
    const r = await doForge(db.deps, "u1", {
      op: "craft",
      type: "espada",
      element: "fuego",
      rank: "f",
    });
    expect(r.text).toMatch(/Forjas/);
    expect(db.forged[0]).toMatchObject({
      p_coins: 3,
      p_spend: { "p-espada-f": 3, "core-fuego": 1 },
      p_gain: {},
      p_remove: [],
      p_grant: [{ type: "espada", element: "fuego", rarity: "f" }],
    });
    db.parts = {};
    expect(
      await catchErr(
        doForge(db.deps, "u1", {
          op: "craft",
          type: "espada",
          element: "fuego",
          rank: "f",
        }),
      ),
    ).toMatchObject({ status: 400, code: "forge_invalid" });
    expect(db.forged).toHaveLength(1);
  });
  it("bulk shortcuts are planned by the server and persisted as ONE net diff", async () => {
    const db = new FakeDb();
    db.parts = { "p-espada-f": 9, "p-hacha-f": 4, "core-fuego": 5 };
    const r = await doForge(db.deps, "u1", { op: "mergeAll", rank: "f" });
    expect(r.text).toMatch(/3 operaciones/);
    expect(db.forged).toHaveLength(1);
    expect(db.forged[0]).toMatchObject({
      p_coins: 9,
      p_spend: { "p-espada-f": 8, "p-hacha-f": 4, "core-fuego": 3 },
      p_gain: { "p-espada-e": 2, "p-hacha-e": 1 },
      p_grant: [],
      p_remove: [],
    });
  });
  it("validates the request body (unknown op / bad key / too many ids)", () => {
    expect(
      forgeBody.safeParse({
        op: "craft",
        type: "espada",
        element: "fuego",
        rank: "f",
      }).success,
    ).toBe(true);
    expect(
      forgeBody.safeParse({
        op: "craft",
        type: "sable",
        element: "fuego",
        rank: "f",
      }).success,
    ).toBe(false);
    expect(forgeBody.safeParse({ op: "hack" }).success).toBe(false);
    expect(
      forgeBody.safeParse({ op: "chain", maxRank: "c", refine: true }).success,
    ).toBe(true);
    expect(
      forgeBody.safeParse({ op: "chain", maxRank: "zz", refine: true }).success,
    ).toBe(false);
    expect(
      forgeBody.safeParse({ op: "dismantleLow", maxRank: "d", maxStars: 9 })
        .success,
    ).toBe(false);
    expect(
      forgeBody.safeParse({
        op: "combinePieces",
        ids: Array(9).fill("w-a-b-c"),
        element: "agua",
      }).success,
    ).toBe(false);
  });
});
