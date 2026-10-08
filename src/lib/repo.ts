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
  bankLevel,
  bankRun,
  chooseHeroSkill,
  equipWeapon,
  heroFromOwned,
  lootOptions,
  pullCharacter,
  pullCost,
  pullWeapon,
  spendFragments,
  unequipWeapon,
  type Banner,
  type LevelBank,
  type Profile,
  type PullResult,
} from "./game/profile";
import {
  isLevelUnlocked,
  isRankUnlocked,
  maxAscension,
} from "./game/dungeonProgress";
import { levelLoot, type LevelLoot } from "./game/levelLoot";
import { levelsOf } from "./game/levels";
import type { SkillId } from "./game/skills";
import { levelFights, type Stage } from "./game/stage";
import { sweepBlock, sweepStage } from "./game/sweep";
import { dayPayMult } from "./game/economy";
import { localWeekSeed, towerHero, type TowerMode } from "./game/tower";
import { burn as burnItem, burnMany } from "./game/burn";
import { applyForge, type ForgeOp } from "./game/forge";
import type { RunPiece } from "./game/loot";
import type { Parts } from "./game/parts";
import type { RarityId } from "./game/rarity";
import type { Slot } from "./game/weapons";
import { ENGINE_VERSION, type StageAction } from "./game/stageReplay";
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
// A dungeon-level attempt: in remote mode the server fixes the seed and the hero snapshot.
export interface LevelStartInfo {
  attemptId: string;
  seed: number;
  hero: Character;
  engineVersion: number;
}
export interface LevelFinish {
  info: LevelStartInfo;
  heroId: string;
  rank: RarityId;
  level: number;
  asc: number;
  stage: Stage; // local mode banks from it; the server only looks at the action log
  actions: StageAction[];
}
export interface LevelOutcome {
  bank: LevelBank; // bank.profile = the profile after the attempt
  loot: LevelLoot;
}
export interface RunBankInfo {
  coinsAdded: number; // total credited, bonus included
  bonus?: number; // first-clear chest part of coinsAdded
  verdict: "accepted" | "truncated" | "mismatch" | "local";
  capped: boolean;
  /** Weekly tower floors paid by this climb (remote mode). */
  towerPrize?: { floors: number; coins: number; cores: number };
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
  burn(kind: "hero" | "piece", id: string): Promise<{ coins: number }>;
  burnMany(kind: "hero" | "piece", ids: string[]): Promise<{ coins: number; count: number }>;
  chooseSkill(characterId: string, skill: SkillId): Promise<void>;
  startLevel(
    heroId: string,
    rank: RarityId,
    level: number,
    asc: number,
  ): Promise<LevelStartInfo>;
  finishLevel(a: LevelFinish): Promise<LevelOutcome>;
  /** Instant resolution of an already-cleared level (see game/sweep.ts). */
  sweepLevel(
    heroId: string,
    rank: RarityId,
    level: number,
    asc: number,
  ): Promise<LevelOutcome & { stage: Stage }>;
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
    actions: StageAction[],
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
    burn: async (kind, id) => {
      const r = burnItem(store.get(), { kind, id });
      if (!r) throw new RepoError("burn_invalid", "No se puede quemar (¿está equipado o es tu único héroe?).");
      store.replace(r.profile);
      return { coins: r.coins };
    },
    burnMany: async (kind, ids) => {
      const r = burnMany(store.get(), kind, ids);
      if (r.count === 0) throw new RepoError("burn_invalid", "No hay nada que se pueda quemar.");
      store.replace(r.profile);
      return { coins: r.coins, count: r.count };
    },
    chooseSkill: async (id, skill) => {
      if (!chooseHeroSkill(store.get(), id, skill))
        throw new RepoError("skill_locked", "Esa habilidad no está disponible.");
      store.update((p) => chooseHeroSkill(p, id, skill) ?? p);
    },
    startLevel: async (heroId, rank, level, asc) => {
      const p = store.get();
      if (!isRankUnlocked(p.dungeons, rank))
        throw new RepoError("dungeon_locked", "Dungeon bloqueado.");
      if (!isLevelUnlocked(p.dungeons, rank, level, asc))
        throw new RepoError("level_locked", "Nivel bloqueado.");
      const hero = heroFromOwned(p, heroId);
      if (!hero)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const seed = Date.now();
      return { attemptId: `lv-${seed}`, seed, hero, engineVersion: ENGINE_VERSION };
    },
    finishLevel: async (a) => {
      const p = store.get();
      const owned = p.characters.find((c) => c.id === a.heroId);
      if (!owned)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const loot: LevelLoot =
        a.stage.status === "cleared"
          ? levelLoot(
              levelsOf(a.rank)[a.level],
              a.asc,
              owned.classId,
              a.stage.seed,
              lootOptions(p, a.rank, a.level, a.asc),
            )
          : { parts: {}, pieces: [] };
      const bank = bankLevel(p, {
        rank: a.rank,
        level: a.level,
        asc: a.asc,
        heroId: a.heroId,
        status: a.stage.status,
        xp: a.stage.xp,
        loot,
        attemptId: a.info.attemptId,
      });
      store.update(() => bank.profile);
      return { bank, loot };
    },
    sweepLevel: async (heroId, rank, level, asc) => {
      const p = store.get();
      const why = sweepBlock(p, heroId, rank, level, asc);
      if (why) throw new RepoError("sweep_locked", why);
      const hero = heroFromOwned(p, heroId);
      const spec = levelsOf(rank)[level];
      if (!hero || !spec)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const seed = Date.now();
      const stage = sweepStage(seed, hero, levelFights(spec, asc), asc);
      if (stage.status !== "cleared")
        throw new RepoError(
          "sweep_failed",
          "Tu héroe no logró barrer este nivel solo. Pelea tú el nivel.",
        );
      const loot = levelLoot(spec, asc, hero.classId, seed, lootOptions(p, rank, level, asc));
      const bank = bankLevel(p, {
        rank,
        level,
        asc,
        heroId,
        status: "cleared",
        xp: stage.xp,
        loot,
        attemptId: `sw-${seed}`,
      });
      store.update(() => bank.profile);
      return { bank, loot, stage };
    },
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
      if (!isRankUnlocked(p.dungeons, rank))
        throw new RepoError("dungeon_locked", "Dungeon bloqueado.");
      if (ascension > maxAscension(p.dungeons, rank))
        throw new RepoError("ascension_locked", "Ascensión bloqueada.");
      const seed = seedHint ?? Date.now();
      const hero =
        (characterId && heroFromOwned(store.get(), characterId)) ||
        generateCharacter(createRng(seed), classId);
      return { runId: `${seed}-${Date.now()}`, seed, hero, rank, ascension };
    },
    submitRun: async (runId, _actions, claimed) => {
      const before = store.get();
      const prior = before.runsDay?.day === dayKey() ? before.runsDay.n : 0;
      const paid = Math.floor(claimed.coins * dayPayMult(prior + 1));
      store.update((p) =>
        bankRun(
          p,
          claimed.coins,
          claimed.maxFloor,
          runId,
          claimed.loot,
          claimed.parts,
        ),
      );
      return {
        coinsAdded: paid,
        verdict: "local",
        capped: paid < claimed.coins,
      };
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
    burn: async (kind, id) => {
      const r = await api<{ coins: number; profile: Profile }>(
        "/api/collection/burn",
        { kind, id },
      );
      store.replace(r.profile);
      return { coins: r.coins };
    },
    burnMany: async (kind, ids) => {
      const r = await api<{ coins: number; count: number; profile: Profile }>(
        "/api/collection/burn-many",
        { kind, ids },
      );
      store.replace(r.profile);
      return { coins: r.coins, count: r.count };
    },
    chooseSkill: (characterId, skillId) =>
      withProfile("/api/collection/skill", { characterId, skillId }),
    startLevel: async (heroId, rank, level, asc) => {
      const r = await api<{
        runId: string;
        seed: number;
        hero: Character;
        engineVersion: number;
      }>("/api/level/start", {
        characterId: heroId,
        rank,
        level,
        ascension: asc,
      });
      return {
        attemptId: r.runId,
        seed: r.seed,
        hero: r.hero,
        engineVersion: r.engineVersion,
      };
    },
    finishLevel: async (a) => {
      // Only the action log travels: status, EXP and loot come from the server's replay.
      const r = await api<{
        bank: Omit<LevelBank, "profile">;
        loot: LevelLoot;
        profile: Profile;
      }>("/api/level/finish", {
        runId: a.info.attemptId,
        actions: a.actions,
        engineVersion: a.info.engineVersion,
      });
      store.replace(r.profile);
      return { bank: { ...r.bank, profile: r.profile }, loot: r.loot };
    },
    sweepLevel: async (heroId, rank, level, asc) => {
      const r = await api<{
        seed: number;
        hero: Character;
        bank: Omit<LevelBank, "profile">;
        loot: LevelLoot;
        profile: Profile;
      }>("/api/level/sweep", {
        characterId: heroId,
        rank,
        level,
        ascension: asc,
      });
      store.replace(r.profile);
      // The server paid from its own play; the same deterministic engine rebuilds it for display.
      const stage = sweepStage(r.seed, r.hero, levelFights(levelsOf(rank)[level], asc), asc);
      return { bank: { ...r.bank, profile: r.profile }, loot: r.loot, stage };
    },
    forge: async (op) => {
      const r = await api<{ text: string; profile: Profile }>("/api/forge", op);
      store.replace(r.profile);
      return { text: r.text };
    },
    startRun: async (classId, characterId, _seed, _rank, _ascension, tower) => {
      // /api/run/start is the weekly tower only; dungeon levels use startLevel.
      if (!tower)
        throw new RepoError("invalid_input", "Falta el modo de la torre.");
      return api<RunStartInfo>("/api/run/start", { classId, characterId, tower });
    },
    submitRun: async (runId, actions, claimed, keepalive) => {
      const r = await api<{
        coinsAdded: number;
        verdict: RunBankInfo["verdict"];
        capped: boolean;
        towerPrize?: RunBankInfo["towerPrize"];
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
