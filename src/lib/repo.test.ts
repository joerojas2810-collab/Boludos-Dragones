import { describe, expect, it } from "vitest";
import { pullCharacter, createProfile, type Profile } from "./game/profile";
import { heroKey } from "./game/loadout";
import { createRng } from "./game/rng";
import { SKILLS } from "./game/skills";
import { RepoError, selectRepo, type StoreApi } from "./repo";
import { runSubmitBody } from "./server/validators";

const memStore = (init: Profile = createProfile()) => {
  let p = init;
  const store: StoreApi = {
    get: () => p,
    update: (fn) => void (p = fn(p)),
    replace: (n) => void (p = n),
  };
  return { store, cur: () => p };
};

describe("selectRepo", () => {
  it("is local without a Supabase URL and remote with one", () => {
    const { store } = memStore();
    expect(selectRepo(undefined, store).mode).toBe("local");
    expect(selectRepo("", store).mode).toBe("local");
    expect(selectRepo("https://abc.supabase.co", store).mode).toBe("remote");
  });
  it("local pull with no coins throws and charges nothing; with coins it works offline", async () => {
    const { store, cur } = memStore();
    const repo = selectRepo(undefined, store);
    await expect(repo.pull("character", 1)).rejects.toBeInstanceOf(RepoError);
    store.replace({ ...createProfile(), coins: 250 });
    const r = await repo.pull("character", 1);
    expect(r.results).toHaveLength(1);
    expect(cur().coins).toBe(0);
  });
  it("local submitRun banks exactly once per runId", async () => {
    const { store, cur } = memStore();
    const repo = selectRepo(undefined, store);
    await repo.submitRun("r1", [], { coins: 50, maxFloor: 4 });
    await repo.submitRun("r1", [], { coins: 50, maxFloor: 4 });
    expect(cur().coins).toBe(50);
    expect(cur().bestFloor).toBe(4);
  });
  it("remote pull sends only banner/count/key and caches the server profile", async () => {
    const { store, cur } = memStore();
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return Response.json({
        results: [],
        profile: { ...createProfile(), coins: 777 },
      });
    }) as unknown as typeof fetch;
    const repo = selectRepo("https://abc.supabase.co", store, f);
    await repo.pull("weapon", 10);
    expect(sent!.url).toBe("/api/gacha/pull");
    expect(Object.keys(sent!.body).sort()).toEqual([
      "banner",
      "count",
      "idempotencyKey",
    ]);
    expect(cur().coins).toBe(777);
  });
  it("remote submitRun sends a body the strict server schema accepts (no loot/parts/clear)", async () => {
    const { store } = memStore();
    let body: unknown = null;
    const f = (async (url: string, init: RequestInit) => {
      if (url === "/api/run/submit") body = JSON.parse(String(init.body));
      return Response.json(
        url === "/api/me"
          ? { name: "x", isAdmin: false, profile: createProfile() }
          : { coinsAdded: 0, verdict: "accepted", capped: false },
      );
    }) as unknown as typeof fetch;
    const repo = selectRepo("https://abc.supabase.co", store, f);
    await repo.submitRun(
      "11111111-1111-4111-8111-111111111111",
      [{ t: "fin" }],
      {
        coins: 5,
        maxFloor: 2,
        loot: [{ type: "casco", element: "agua", rarity: "f", name: "x" }],
        clear: { rank: "f", lives: 3 },
      },
    );
    expect(runSubmitBody.safeParse(body).success).toBe(true);
    expect((body as { claimed: object }).claimed).toEqual({
      coins: 5,
      maxFloor: 2,
    });
  });
  it("remote errors surface the server message; 401 on load means signed out", async () => {
    const { store } = memStore();
    const f = (async (url: string) =>
      url === "/api/me"
        ? Response.json(
            { error: { code: "unauthorized", message: "Inicia sesión." } },
            { status: 401 },
          )
        : Response.json(
            {
              error: {
                code: "insufficient_coins",
                message: "No te alcanzan las monedas.",
              },
            },
            { status: 409 },
          )) as unknown as typeof fetch;
    const repo = selectRepo("https://abc.supabase.co", store, f);
    expect(await repo.load()).toBeNull();
    await expect(repo.pull("character", 1)).rejects.toMatchObject({
      code: "insufficient_coins",
      message: "No te alcanzan las monedas.",
    });
  });
});

describe("equipped skills reach the server", () => {
  const heroProfile = (): Profile => {
    const base = pullCharacter({ ...createProfile(), coins: 5000 }, createRng(3))!.profile;
    return { ...base, classMastery: { caballero: 12, mago: 12, picaro: 12, clerigo: 12, berserker: 12 } };
  };

  it("remote startLevel sends the equipped loadout of the hero explicitly", async () => {
    const profile = heroProfile();
    const c = profile.characters[0];
    const hero = { classId: c.classId, element: c.element, rarity: c.rarity };
    const ids = Object.values(SKILLS).filter((d) => d.classId === c.classId && d.unlock === 0).map((d) => d.id);
    const chosen = [ids[1], ids[0]] as const;
    const withChoice: Profile = { ...profile, loadouts: { [heroKey(hero as never)]: chosen } };
    const { store } = memStore(withChoice);
    const sent: Record<string, unknown>[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ runId: "r", seed: 1, hero: {}, loadout: chosen });
    }) as unknown as typeof fetch;
    await selectRepo("https://abc.supabase.co", store, f).startLevel(c.id, "lord_of_flies", "f", 0, 0);
    expect(sent[0].loadout).toEqual([...chosen]);
  });

  it("remote saveLoadout posts the selection to /api/loadout and caches the server profile", async () => {
    const { store, cur } = memStore(heroProfile());
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return Response.json({ profile: { ...createProfile(), coins: 42 } });
    }) as unknown as typeof fetch;
    await selectRepo("https://abc.supabase.co", store, f).saveLoadout(
      { classId: "caballero", nivelado: true },
      ["knight_advance", "knight_breaker"],
    );
    expect(sent!.url).toBe("/api/loadout");
    expect(sent!.body).toEqual({ mode: "nivelado", classId: "caballero", loadout: ["knight_advance", "knight_breaker"] });
    expect(cur().coins).toBe(42);
  });
});
