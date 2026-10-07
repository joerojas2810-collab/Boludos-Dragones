// ProfileRepo: the only way pages change the profile. Two implementations:
//  - local  : today's behaviour (browser decides, localStorage persists).
//  - remote : the server decides (pulls, equip, run start/bank); the local
//             store is just an in-memory read cache of the server profile.
import {
  generateCharacter,
  type Character,
  type ClassId,
} from "./game/characters";
import {
  bankRun,
  equipWeapon,
  heroFromOwned,
  pullCharacter,
  pullCost,
  pullWeapon,
  spendFragments,
  unequipWeapon,
  type Banner,
  type Profile,
  type PullResult,
} from "./game/profile";
import { isUnlocked, maxAscension } from "./game/dungeons";
import { localWeekSeed, towerHero, type TowerMode } from "./game/tower";
import { applyForge, type ForgeOp } from "./game/forge";
import type { RunPiece } from "./game/loot";
import type { Parts } from "./game/parts";
import type { RarityId } from "./game/rarity";
import type { Slot } from "./game/weapons";
import { ENGINE_VERSION, type RunAction } from "./game/replay";
import { createRng } from "./game/rng";
import { claimDaily, dayKey } from "./game/streak";

export class RepoError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export interface PullOutcome {
  results: PullResult[] | null; // null: repeated request, nothing to reveal
}
export interface RunStartInfo {
  runId: string;
  seed: number;
  hero: Character;
  rank: RarityId | null; // null = weekly tower (no dungeon)
  ascension?: number;
  tower?: TowerMode;
}
export interface RunBankInfo {
  coinsAdded: number;
  verdict: "accepted" | "truncated" | "mismatch" | "local";
  capped: boolean;
}
export interface Me {
  name: string;
  isAdmin: boolean;
  profile: Profile;
}

export interface ProfileRepo {
  readonly mode: "local" | "remote";
  load(): Promise<Me | null>; // null = not signed in
  pull(banner: Banner, count: 1 | 10): Promise<PullOutcome>;
  dailyPull(banner: Banner): Promise<PullOutcome>;
  equip(
    characterId: string,
    weaponId: string | null,
    slot?: Slot,
  ): Promise<void>;
  spendFragments(characterId: string): Promise<void>;
  forge(op: ForgeOp): Promise<{ text: string }>;
  startRun(
    classId: ClassId,
    characterId: string | null,
    seedHint?: number,
    rank?: RarityId,
    ascension?: number,
    tower?: TowerMode,
  ): Promise<RunStartInfo>;
  submitRun(
    runId: string,
    actions: RunAction[],
    claimed: {
      coins: number;
      maxFloor: number;
      loot?: RunPiece[];
      clear?: { rank: RarityId; lives: number; asc?: number }; // local mode only; the server replays
      parts?: Parts;
    },
    keepalive?: boolean,
  ): Promise<RunBankInfo>;
}

// Hooks into the profile store (kept outside this file: no React here).
export interface StoreApi {
  get(): Profile;
  update(fn: (p: Profile) => Profile): void; // persisting (local mode)
  replace(p: Profile): void; // cache only (remote mode)
}

export function createLocalRepo(store: StoreApi): ProfileRepo {
  const pull = async (banner: Banner, count: number) => {
    const rng = createRng(Date.now());
    const out: { rs: PullResult[] | null } = { rs: null };
    store.update((p) => {
      const r =
        banner === "character"
          ? pullCharacter(p, rng, count)
          : pullWeapon(p, rng, count);
      out.rs = r?.results ?? null;
      return r?.profile ?? p;
    });
    if (!out.rs)
      throw new RepoError(
        "insufficient_coins",
        "No te alcanzan las monedas para esta tirada.",
      );
    return { results: out.rs };
  };
  return {
    mode: "local",
    load: async () => ({ name: "Local", isAdmin: false, profile: store.get() }),
    pull: (b, n) => pull(b, n),
    dailyPull: async (banner) => {
      const rng = createRng(Date.now());
      const out: { rs: PullResult[] | null; claimed: boolean } = {
        rs: null,
        claimed: true,
      };
      store.update((p) => {
        const c = claimDaily(p.daily, dayKey());
        if (!c) return p;
        out.claimed = false;
        // Free pull: lend the coins for the cost, then keep the original balance.
        const loan = { ...p, coins: p.coins + pullCost(banner, 1) };
        const r =
          banner === "character"
            ? pullCharacter(loan, rng, 1)
            : pullWeapon(loan, rng, 1);
        out.rs = r?.results ?? null;
        return r
          ? { ...r.profile, daily: c.daily, coins: r.profile.coins + c.bonus }
          : p;
      });
      if (out.claimed)
        throw new RepoError(
          "already_claimed",
          "Ya reclamaste la tirada de hoy.",
        );
      return { results: out.rs };
    },
    equip: async (c, w, slot) =>
      store.update((p) =>
        w ? equipWeapon(p, c, w) : unequipWeapon(p, c, slot),
      ),
    spendFragments: async (c) => store.update((p) => spendFragments(p, c) ?? p),
    forge: async (op) => {
      const r = applyForge(store.get(), op);
      if (!r.ok) throw new RepoError("forge_invalid", r.error);
      store.replace(r.profile);
      return { text: r.text };
    },
    startRun: async (
      classId,
      characterId,
      seedHint,
      rank = "f",
      ascension = 0,
      tower,
    ) => {
      if (tower) {
        // Offline tower: the week's seed from the calendar, no ranking.
        const seed = localWeekSeed();
        const hero = towerHero(
          store.get(),
          tower,
          characterId,
          classId,
          seed,
          "local",
        );
        if (!hero)
          throw new RepoError(
            "character_not_found",
            "Personaje no encontrado.",
          );
        return {
          runId: `${seed}-${Date.now()}`,
          seed,
          hero,
          rank: null,
          tower,
        };
      }
      const p = store.get();
      if (!isUnlocked(p.dungeons, rank))
        throw new RepoError("dungeon_locked", "Dungeon bloqueado.");
      if (ascension > maxAscension(p.dungeons, p.ascensions, rank))
        throw new RepoError("ascension_locked", "Ascensión bloqueada.");
      const seed = seedHint ?? Date.now();
      const hero =
        (characterId && heroFromOwned(store.get(), characterId)) ||
        generateCharacter(createRng(seed), classId);
      return { runId: `${seed}-${Date.now()}`, seed, hero, rank, ascension };
    },
    submitRun: async (runId, _actions, claimed) => {
      store.update((p) =>
        bankRun(
          p,
          claimed.coins,
          claimed.maxFloor,
          runId,
          claimed.loot,
          claimed.clear,
          claimed.parts,
        ),
      );
      return { coinsAdded: claimed.coins, verdict: "local", capped: false };
    },
  };
}

type Fetch = typeof fetch;

export function createRemoteRepo(store: StoreApi, f: Fetch): ProfileRepo {
  async function api<T>(
    path: string,
    body?: unknown,
    keepalive = false,
  ): Promise<T> {
    let res: Response;
    try {
      res = await f(path, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        keepalive,
      });
    } catch {
      throw new RepoError("network", "Sin conexión con el servidor.");
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string } } | null)
        ?.error;
      throw new RepoError(
        e?.code ?? "server_error",
        e?.message ?? "Algo salió mal. Intenta de nuevo.",
        res.status,
      );
    }
    return json as T;
  }
  const withProfile = async (path: string, body: unknown) =>
    store.replace((await api<{ profile: Profile }>(path, body)).profile);

  return {
    mode: "remote",
    load: async () => {
      try {
        const me = await api<Me>("/api/me");
        store.replace(me.profile);
        return me;
      } catch (e) {
        if (e instanceof RepoError && e.status === 401) return null;
        throw e;
      }
    },
    pull: async (banner, count) => {
      const r = await api<{ results: PullResult[] | null; profile: Profile }>(
        "/api/gacha/pull",
        { banner, count, idempotencyKey: crypto.randomUUID() },
      );
      store.replace(r.profile);
      return { results: r.results };
    },
    dailyPull: async (banner) => {
      const r = await api<{ results: PullResult[] | null; profile: Profile }>(
        "/api/gacha/daily",
        { banner },
      );
      store.replace(r.profile);
      return { results: r.results };
    },
    equip: (characterId, weaponId, slot) =>
      withProfile("/api/collection/equip", {
        characterId,
        weaponId,
        ...(slot ? { slot } : {}),
      }),
    spendFragments: (characterId) =>
      withProfile("/api/collection/spend-fragments", { characterId }),
    forge: async (op) => {
      const r = await api<{ text: string; profile: Profile }>("/api/forge", op);
      store.replace(r.profile);
      return { text: r.text };
    },
    startRun: (classId, characterId, _seed, rank = "f", ascension = 0, tower) =>
      api<RunStartInfo>(
        "/api/run/start",
        tower
          ? { classId, characterId, tower }
          : { classId, characterId, rank, ascension },
      ),
    submitRun: async (runId, actions, claimed, keepalive) => {
      const r = await api<{
        coinsAdded: number;
        verdict: RunBankInfo["verdict"];
        capped: boolean;
      }>(
        "/api/run/submit",
        {
          runId,
          actions,
          // Only coins/floor: the server replays the run and decides loot, parts and
          // clears itself (the body schema is strict and rejects anything else).
          claimed: { coins: claimed.coins, maxFloor: claimed.maxFloor },
          engineVersion: ENGINE_VERSION,
        },
        keepalive,
      );
      await api<Me>("/api/me")
        .then((me) => store.replace(me.profile))
        .catch(() => undefined);
      return r;
    },
  };
}

// Remote mode only when a Supabase URL is configured at build time.
export const selectRepo = (
  supabaseUrl: string | undefined,
  store: StoreApi,
  f: Fetch = (...a) => fetch(...a),
): ProfileRepo =>
  supabaseUrl ? createRemoteRepo(store, f) : createLocalRepo(store);
