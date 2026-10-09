import { describe, expect, it } from "vitest";
import { ASCEND } from "../game/ascend";
import { generateCharacter } from "../game/characters";
import { ENGINE_VERSION } from "../game/stage";
import { replayTower } from "../game/tower";
import { createRng } from "../game/rng";
import { derivePassword, safeEqual, syntheticEmail } from "./credentials";
import { parseEnv } from "./envSchema";
import { ApiError, checkOrigin, readJson } from "./http";
import { BAD_CREDENTIALS, login } from "./loginFlow";
import { limit } from "./rpc";
import { levelLoot } from "../game/levelLoot";
import { levelsOf } from "../game/levels";
import { heroFromOwned, migrate } from "../game/profile";
import {
  doBurn,
  doChooseSkill,
  doAscend,
  doUpgrade,
  doPull,
  finishLevelService,
  loadMe,
  startLevelService,
  startRunService,
  submitRunService,
} from "./services";
import { FakeDb, heroRow, playBot, playLevelBot } from "./testkit";
import {
  credsBody,
  ascendBody,
  upgradeBody,
  levelFinishBody,
  levelStartBody,
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
  it("weapon banner persists a weapon and keeps the (removed) pity counter at 0", async () => {
    const db = new FakeDb();
    await doPull(db.deps, "u1", body({ banner: "weapon" }));
    expect(db.rows[0].kind).toBe("weap");
    expect(db.pity.weapon).toBe(0);
  });
});

describe("mission claims", () => {
  it("rolls the promised pieces at the best cleared rank and passes them to SQL", async () => {
    const db = new FakeDb();
    db.bestRank = "c";
    db.missionProgress = { levels: 99, fights: 99, bosses: 99, pull: 99, forge: 99 }; // everything done
    db.deps.randomSeed = () => 5;
    const missions = await import("./missions");
    await missions.claimMissionService(db.deps, "u1", "daily");
    const a = db.missionClaims[0];
    expect(a).toMatchObject({ p_scope: "daily", p_reached: 3 });
    expect(a.p_pieces).toEqual([]); // daily pays coins only
    expect("p_parts" in a).toBe(false);
    await expect(
      missions.claimMissionService(
        Object.assign(new FakeDb(), { missionProgress: {} }).deps,
        "u1",
        "daily",
      ),
    ).rejects.toMatchObject({ code: "nothing_to_claim" });
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
    expect(r.towerPrize).toMatchObject({ floors: truth.floors }); // paid floors reach the client
    expect(db.towerRecords[0]).toMatchObject({
      p_mode: "coleccion",
      p_floor: truth.floors,
      p_rounds: truth.rounds, // the tiebreak is stored with the floor
    });
  });

  it("the tower gives a quarter of the dungeon EXP to the hero that climbed", async () => {
    const db = new FakeDb();
    db.run = {
      seed: 777,
      hero: {
        ...hero,
        engineVersion: ENGINE_VERSION,
        tower: "coleccion",
        heroId: "c-caballero-fuego-f",
      },
      status: "open",
    };
    const log = playBot(777, hero, 800);
    const truth = replayTower(777, hero, log);
    await sub(db, log);
    expect(truth.climb.wins).toBeGreaterThan(0);
    expect(db.xpGrants[0]).toMatchObject({
      p_character_id: "c-caballero-fuego-f",
    });
    expect(Number(db.xpGrants[0].p_xp)).toBeGreaterThan(0);
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
    // a dungeon-level attempt cannot be submitted as a tower run (and vice versa)
    expect(await catchErr(sub(db, []))).toMatchObject({
      status: 400,
      code: "wrong_run_kind",
    });
    expect(
      await catchErr(
        startRunService(db.deps, "u1", {
          classId: "mago",
          characterId: null,
        } as never),
      ),
    ).toMatchObject({ status: 400 });
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

describe("forge service (Ascender + Mejorar)", () => {
  const piece = (type: string, element: string, rarity: string, stars = 0, extra = {}) => ({
    key: `w-${type}-${element}-${rarity}`,
    kind: "weap" as const,
    a: type,
    element,
    rarity,
    stars,
    data: { name: "x", roll: 1, ...extra },
  });
  it("ascend: runs the pure rule, rolls with the server rng and persists base + materials", async () => {
    const db = new FakeDb();
    db.coins = 100;
    const mats = [
      ["hacha", "agua"],
      ["espada", "agua"],
      ["espada", "rayo"],
      ["espada", "tierra"],
    ];
    expect(mats).toHaveLength(ASCEND.f!.total - 1); // the base plus these are what F -> E asks for
    db.rows.push(piece("espada", "fuego", "f"), ...mats.map(([t, e]) => piece(t, e, "f")));
    const r = await doAscend(db.deps, "u1", "w-espada-fuego-f", mats.map(([t, e]) => `w-${t}-${e}-f`));
    expect(r.newId).toBe("w-espada-fuego-e");
    expect(db.forged[0]).toMatchObject({
      name: "apply_ascend",
      p_base: "w-espada-fuego-f",
      p_new: { type: "espada", element: "fuego", rarity: "e" },
    });
    // too few materials never reach the DB
    expect(
      await catchErr(doAscend(db.deps, "u1", "w-espada-fuego-f", ["w-hacha-agua-f"])),
    ).toMatchObject({ status: 400, code: "forge_invalid" });
    expect(db.forged).toHaveLength(1);
  });
  it("upgrade: the server rolls the success; costs and gates are checked before the DB", async () => {
    const db = new FakeDb();
    db.escamas = 10;
    db.rows.push(piece("espada", "fuego", "s", 5), piece("hacha", "fuego", "a", 5), piece("daga", "fuego", "s", 3));
    const r = await doUpgrade(db.deps, "u1", "w-espada-fuego-s", false);
    expect(r.success).toBe(true); // +1 is 100%
    expect(db.forged[0]).toMatchObject({ name: "apply_upgrade", p_key: "w-espada-fuego-s", p_use_dado: false, p_success: true });
    for (const id of ["w-hacha-fuego-a", "w-daga-fuego-s"])
      expect(await catchErr(doUpgrade(db.deps, "u1", id, false))).toMatchObject({ status: 400, code: "forge_invalid" });
    expect(await catchErr(doUpgrade(db.deps, "u1", "w-espada-fuego-s", true))).toMatchObject({ code: "forge_invalid" }); // no dice
    expect(db.forged).toHaveLength(1);
  });
  it("validates the request bodies", () => {
    expect(ascendBody.safeParse({ baseId: "w-a-b-c", materialIds: ["x", "y"] }).success).toBe(true);
    expect(ascendBody.safeParse({ baseId: "w-a-b-c", materialIds: ["x"] }).success).toBe(false);
    expect(ascendBody.safeParse({ baseId: "w-a-b-c", materialIds: Array(9).fill("x") }).success).toBe(false);
    expect(ascendBody.safeParse({ baseId: "w", materialIds: ["x", "y"], extra: 1 }).success).toBe(false);
    expect(upgradeBody.safeParse({ pieceId: "w-a-b-c", useDado: true }).success).toBe(true);
    expect(upgradeBody.safeParse({ pieceId: "w-a-b-c" }).success).toBe(false);
  });
});

describe("dungeon level services (fake DB)", () => {
  const h0 = generateCharacter(createRng(11), "caballero");
  const row = () => heroRow(h0, "f", 40); // strong enough to clear F level 1 with the bot
  const ID = row().key;
  const body = (over = {}) => ({
    characterId: ID,
    rank: "f" as const,
    level: 0,
    ascension: 0,
    ...over,
  });
  const fin = (db: FakeDb, actions: unknown[], extra = {}) =>
    finishLevelService(db.deps, "u1", {
      runId: UUID,
      actions: actions as never,
      ...extra,
    });
  const started = async (db: FakeDb) => {
    db.rows.push(row());
    const info = await startLevelService(db.deps, "u1", body());
    return info;
  };

  it("validates request bodies (strict, level range, no client-side loot or status)", () => {
    expect(levelStartBody.safeParse(body()).success).toBe(true);
    expect(levelStartBody.safeParse(body({ level: 12 })).success).toBe(false);
    expect(levelStartBody.safeParse(body({ rank: "zz" })).success).toBe(false);
    expect(levelStartBody.safeParse(body({ ascension: 6 })).success).toBe(false);
    const ok = { runId: UUID, actions: [{ t: "fin" }] };
    expect(levelFinishBody.safeParse(ok).success).toBe(true);
    for (const extra of [{ xp: 99999 }, { status: "cleared" }, { loot: {} }, { coins: 5 }])
      expect(levelFinishBody.safeParse({ ...ok, ...extra }).success).toBe(false);
    expect(
      levelFinishBody.safeParse({ ...ok, actions: Array(3001).fill({ t: "fin" }) })
        .success,
    ).toBe(false);
  });

  it("starts from the persisted hero (server snapshot, seed from the server) and opens the attempt", async () => {
    const db = new FakeDb();
    const info = await started(db);
    expect(info).toMatchObject({ rank: "f", level: 0, ascension: 0, seed: 12345 });
    expect(info.engineVersion).toBe(ENGINE_VERSION);
    expect(db.levelStarts[0]).toMatchObject({
      p_character_id: ID,
      p_rank: "f",
      p_level: 0,
      p_asc: 0,
      p_hero: { engineVersion: ENGINE_VERSION },
    });
  });

  it("refuses locked ranks, ascensions, levels out of order and heroes you do not own", async () => {
    const db = new FakeDb();
    db.rows.push(row());
    for (const [over, code] of [
      [{ rank: "e" }, "dungeon_locked"],
      [{ level: 1 }, "level_locked"],
      [{ ascension: 1 }, "level_locked"],
      [{ characterId: "c-mago-fuego-ssr" }, "character_not_found"],
    ] as const)
      expect(
        await catchErr(startLevelService(db.deps, "u1", body(over))),
        code,
      ).toMatchObject({ code });
    expect(db.levelStarts).toHaveLength(0);
    // after clearing the whole F dungeon rank E opens; ascension +1 of F opens too
    db.dungeons = { f: [6] };
    await startLevelService(db.deps, "u1", body({ rank: "e" }));
    await startLevelService(db.deps, "u1", body({ ascension: 1 }));
    expect(db.levelStarts).toHaveLength(2);
  });

  it("pays from the REPLAY: status, EXP and loot are derived, the log is all the client sends", async () => {
    const db = new FakeDb();
    const info = await started(db);
    const log = playLevelBot(info.seed, info.hero, "f", 0);
    const r = await fin(db, log, { engineVersion: info.engineVersion });
    expect(r.status).toBe("cleared");
    const b = db.levelBanks[0];
    expect(b).toMatchObject({
      p_status: "cleared",
      p_rank: "f",
      p_level: 0,
      p_asc: 0,
      p_hero_id: ID,
      p_repeat: false,
      p_verdict: "accepted",
      p_log: null,
    });
    expect(Number(b.p_xp)).toBeGreaterThan(0);
    // the loot is the one the engine rolls from the SERVER seed
    const expected = levelLoot(levelsOf("f")[0], 0, "caballero", info.seed, {
      repeat: false,
      payMult: 1,
    });
    expect(b.p_dados).toBe(expected.dados);
    expect(b.p_pieces).toEqual(expected.pieces);
    expect(r.loot).toEqual({ ...expected, escamas: 0, dados: expected.dados }); // escamas come from SQL (fake: 0)
    for (const piece of expected.pieces) expect(piece.roll).toBeGreaterThan(0.84);
  });

  it("a lost or abandoned level keeps the EXP of the replay and pays no loot", async () => {
    const db = new FakeDb();
    const info = await started(db);
    // fight one round, then quit
    const r = await fin(db, [{ t: "act", a: "attack1" }, { t: "quit" }]);
    expect(r.status).toBe("lost");
    expect(db.levelBanks[0]).toMatchObject({
      p_status: "lost",
      p_dados: 0,
      p_pieces: [],
      p_verdict: "accepted",
    });
    expect(info.seed).toBe(12345);
  });

  it("a log that stops early or has an illegal action pays only what the replay reached ('cut')", async () => {
    const db = new FakeDb();
    await started(db);
    const r = await fin(db, [{ t: "fin" }]); // nothing to continue
    expect(r.status).toBe("lost");
    expect(db.levelBanks[0]).toMatchObject({ p_verdict: "cut", p_status: "lost", p_xp: 0 });
    const db2 = new FakeDb();
    await started(db2);
    const info = db2.run!;
    const full = playLevelBot(info.seed, info.hero as never, "f", 0);
    await fin(db2, full.slice(0, 1)); // stops after one blow
    expect(db2.levelBanks[0]).toMatchObject({ p_status: "lost", p_verdict: "cut" });
  });

  it("a forged log (replayed on a different attempt) cannot win: the replay decides", async () => {
    const db = new FakeDb();
    const info = await started(db);
    const real = playLevelBot(info.seed + 1, info.hero, "f", 0); // recorded for another seed
    const r = await fin(db, real);
    expect(["cleared", "lost"]).toContain(r.status);
    // whatever it is, the paid status equals the server replay, never a client claim
    expect(db.levelBanks[0].p_status).toBe(r.status);
  });

  it("closed attempt, other engine, wrong kind and impossibly fast logs", async () => {
    const db = new FakeDb();
    const info = await started(db);
    const log = playLevelBot(info.seed, info.hero, "f", 0);
    expect(
      await catchErr(fin(db, log, { engineVersion: ENGINE_VERSION + 1 })),
    ).toMatchObject({ code: "engine_outdated" });
    // fast: 60 actions in half a second
    db.run!.startedAt = Date.now() - 500;
    const spam = Array(60).fill({ t: "act", a: "attack1" });
    expect(await catchErr(fin(db, spam))).toMatchObject({ status: 429, code: "too_fast" });
    expect(db.levelBanks[0]).toMatchObject({ p_verdict: "rejected", p_xp: 0 });
    db.run!.status = "closed";
    expect(await catchErr(fin(db, log))).toMatchObject({ code: "duplicate_run" });
    // a tower run is not a level
    db.run = { seed: 1, hero: { ...h0, engineVersion: ENGINE_VERSION, tower: "coleccion" }, status: "open" };
    expect(await catchErr(fin(db, []))).toMatchObject({ code: "wrong_run_kind" });
  });

  it("a conflict from bank_level (repeat flag changed) is retried with fresh state", async () => {
    const db = new FakeDb();
    const info = await started(db);
    const log = playLevelBot(info.seed, info.hero, "f", 0);
    const inner = db.deps.rpc;
    let n = 0;
    db.deps.rpc = async (name, args) => {
      if (name === "bank_level" && n++ === 0)
        return { data: null, error: { message: "conflict" } };
      return inner(name, args);
    };
    await fin(db, log);
    expect(db.audits).toContain("level_conflict");
    expect(db.levelBanks).toHaveLength(1);
  });
});

describe("burn / skill / profile mapping (fake DB)", () => {
  const h0 = generateCharacter(createRng(5), "mago");
  it("burn runs the pure rules first, then asks SQL with the profile version", async () => {
    const db = new FakeDb();
    db.rows.push(heroRow(h0, "f"), heroRow(generateCharacter(createRng(6), "picaro"), "e"));
    const key = db.rows[0].key;
    const r = await doBurn(db.deps, "u1", "hero", key);
    expect(r.coins).toBe(33); // 4% of 830
    expect(db.burned[0]).toMatchObject({ name: "burn_hero", p_key: key, p_version: 0 });
    // the only hero left cannot be burned: SQL is never reached
    const n = db.burned.length;
    expect(
      await catchErr(doBurn(db.deps, "u1", "hero", db.rows[0].key)),
    ).toMatchObject({ code: "burn_invalid" });
    expect(db.burned).toHaveLength(n);
    expect(
      await catchErr(doBurn(db.deps, "u1", "piece", "w-espada-fuego-f")),
    ).toMatchObject({ code: "burn_invalid" });
  });
  it("choose skill validates ownership and class before SQL, at any rank", async () => {
    const db = new FakeDb();
    const high = heroRow(h0, "c");
    db.rows.push(high, heroRow(generateCharacter(createRng(8), "picaro"), "f"));
    await doChooseSkill(db.deps, "u1", high.key, "tormenta");
    expect(db.skills[0]).toMatchObject({ p_skill: "tormenta" });
    expect(
      await catchErr(doChooseSkill(db.deps, "u1", high.key, "barrido")),
    ).toMatchObject({ code: "skill_locked" }); // a Caballero skill on a Mago
    await doChooseSkill(db.deps, "u1", db.rows[1].key, "golpeDoble"); // rank F: no unlock gate any more
    expect(db.skills[1]).toMatchObject({ p_skill: "golpeDoble" });
    expect(
      await catchErr(doChooseSkill(db.deps, "u1", high.key, "hackeo")),
    ).toMatchObject({ code: "invalid_skill" });
    expect(db.skills).toHaveLength(2);
  });
  it("rows from the database keep their legacy flag and are not 'saved before v5'", async () => {
    const db = new FakeDb();
    const fresh = heroRow(h0, "f");
    const old = heroRow(generateCharacter(createRng(9), "picaro"), "e");
    (old.data as Record<string, unknown>).legacy = true;
    (old.data as Record<string, unknown>).level = 12;
    (old.data as Record<string, unknown>).skill = "ejecutar";
    db.rows.push(fresh, old);
    db.dungeons = { f: [6, 2] };
    const me = await loadMe(db.deps.rpc, "u1");
    const byId = (id: string) => me.profile.characters.find((c) => c.id === id)!;
    expect(byId(fresh.key).legacy).toBeUndefined();
    expect(byId(old.key)).toMatchObject({ legacy: true, level: 12, skill: "ejecutar" });
    expect(me.profile.dungeons.f).toEqual([6, 2]);
    expect(heroFromOwned(me.profile, old.key)?.level).toBe(12);
    // migrate() of a client save without version still marks everything legacy
    expect(migrate({ characters: [fresh.data] }).characters).toHaveLength(0);
  });
  it("weapons pulled and forged carry their server-rolled roll and lines", async () => {
    const db = new FakeDb();
    await doPull(db.deps, "u1", {
      banner: "weapon",
      count: 10,
      idempotencyKey: UUID,
    });
    const items = db.calls.find((c) => c.name === "apply_pull")!.args.p_items as {
      roll?: number;
      type: string;
      lines?: { stat: string }[];
    }[];
    expect(items).toHaveLength(10);
    for (const it of items) {
      expect(it.roll).toBeGreaterThanOrEqual(0.85);
      expect(it.roll).toBeLessThanOrEqual(1.15);
    }
    // ascend: the new piece's roll comes from the injected server rng, not from the profile state
    const mk = (seed: number) => {
      const f = new FakeDb();
      f.deps.randomSeed = () => seed;
      f.coins = 100;
      for (const [t, e] of [["casco", "fuego"], ["casco", "agua"], ["casco", "rayo"], ["casco", "tierra"], ["peto", "agua"]])
        f.rows.push({ key: `w-${t}-${e}-f`, kind: "weap", a: t, element: e, rarity: "f", stars: 0, data: { name: "x", roll: 1 } });
      return f;
    };
    const run = async (f: FakeDb) => {
      await doAscend(f.deps, "u1", "w-casco-fuego-f", ["w-casco-agua-f", "w-casco-rayo-f", "w-casco-tierra-f", "w-peto-agua-f"]);
      return (f.forged[0].p_new as { roll: number }).roll;
    };
    const ra = await run(mk(1));
    const rb = await run(mk(2));
    const rc = await run(mk(1));
    expect(ra).toBe(rc);
    expect(ra).not.toBe(rb);
  });
});
