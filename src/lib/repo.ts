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
  equipWeapon,
  heroFromOwned,
  lootOptions,
  pullCharacter,
  pullCost,
  pullWeapon,
  unequipWeapon,
  type Banner,
  type LevelBank,
  type Profile,
  type PullResult,
} from "./game/profile";
import {
  isLevelUnlocked,
  isStepUnlocked,
  maxAscension,
} from "./game/dungeonProgress";
import { levelLoot, rollDado, type LevelLoot } from "./game/levelLoot";
import { levelsOf, type RouteId } from "./game/levels";
import { levelFights, type Stage } from "./game/stage";
import { sweepBlock, sweepStage } from "./game/sweep";
import { dayPayMult } from "./game/economy";
import { localWeekSeed, towerHero, type TowerMode } from "./game/tower";
import { fuseHeroes, starUpHero, swapCopy, type Material, type HeroGrowthResult } from "./game/heroFusion";
import { ascendPiece, starUpPiece, swapPieceRoll, type PieceGrowthResult } from "./game/pieceGrowth";
import { upgradePiece } from "./game/upgrade";
import type { Weapon } from "./game/weapons";
import type { RunPiece } from "./game/loot";
import type { Difficulty } from "./game/rarity";
import type { Element } from "./game/elements";
import type { Slot } from "./game/weapons";
import { ENGINE_VERSION, type StageAction } from "./game/stageReplay";
import { createRng } from "./game/rng";
import { equipLoadout, loadoutFor } from "./game/loadout";
import type { Loadout } from "./game/skills";
import { claimDaily, dayKey } from "./game/streak";
import { artWeekKey, type ExpAction, type ExpState } from "./game/expedition";
import {
  browserKV,
  createLocalExpedition,
  ExpError,
  type KV,
  type ExpActResult,
  type ExpCodex,
  type ExpStartOpts,
} from "./localExpedition";

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
  rank: Difficulty | null; // null = weekly tower (no dungeon)
  ascension?: number;
  tower?: TowerMode;
  loadout?: Loadout; // the two skills the run is played (and verified) with
}
// A dungeon-level attempt: in remote mode the server fixes the seed and the hero snapshot.
export interface LevelStartInfo {
  attemptId: string;
  seed: number;
  hero: Character;
  loadout: Loadout; // the two skills the fight is played with
}
export interface LevelFinish {
  info: LevelStartInfo;
  heroId: string;
  route: RouteId;
  difficulty: Difficulty;
  level: number;
  asc: number;
  stage: Stage; // local mode banks from it; the server only looks at the action log
  actions: StageAction[];
}
export interface LevelOutcome {
  bank: LevelBank; // bank.profile = the profile after the attempt
  loot: LevelLoot;
}
export interface AscendOutcome {
  ok: true;
  message: string;
  newId: string;
  profile: Profile;
}
export interface UpgradeOutcome {
  ok: true;
  success: boolean;
  piece: Weapon;
  chance: number;
  spent: number;
  profile: Profile;
}
export interface RunBankInfo {
  coinsAdded: number; // total credited, bonus included
  bonus?: number; // first-clear chest part of coinsAdded
  verdict: "accepted" | "truncated" | "mismatch" | "local";
  capped: boolean;
  /** Weekly tower floors paid by this climb (remote mode). */
  towerPrize?: { floors: number; coins: number; dados: number };
}
export interface Me {
  name: string;
  isAdmin: boolean;
  profile: Profile;
}

// ---- tower expedition (docs/torre): server-authoritative runs, ranking by validated nodes ----
export type { ExpActResult, ExpCodex, ExpStartOpts };
export interface TowerRankRow {
  place: number;
  player?: string;
  name: string;
  nodes: number; // validated nodes (alias: floor)
  floor: number;
  turns: number; // tie-break: turns of the won fights (alias: rounds)
  rounds: number;
  at: string; // SERVER time the milestone was reached (second tie-break)
  eligible: boolean; // node 10 (first boss) cleared: can win the weekly top-3 prize
  class: ClassId | null;
  element: Element | null;
}
export interface TowerMine extends Omit<TowerRankRow, "player" | "name"> {
  paidFloors: number; // weekly nodes already paid
  pending: boolean; // the open run is ahead of the validated score
}
export interface TowerActiveRun {
  nodes: number;
  turns: number;
  revision: number;
  status: "active" | "suspended";
  week: string;
  deadline: string;
  stale: boolean; // past its week: the next load closes it as "season"
}
export interface TowerStateInfo {
  week: string;
  weekKey: string;
  deadline: string | null; // first instant of the next week (Buenos Aires); null offline
  modes: Record<TowerMode, { top: TowerRankRow[]; mine: TowerMine | null }>;
  last: Record<TowerMode, { place: number; name: string; floor: number }[]>;
  king: Record<TowerMode, { day: string; name: string; floor: number; me: boolean } | null>;
  activeByMode: Record<TowerMode, TowerActiveRun | null>;
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
  startLevel(
    heroId: string,
    route: RouteId,
    difficulty: Difficulty,
    level: number,
    asc: number,
  ): Promise<LevelStartInfo>;
  finishLevel(a: LevelFinish): Promise<LevelOutcome>;
  /** Instant resolution of an already-cleared level (see game/sweep.ts). */
  sweepLevel(
    heroId: string,
    route: RouteId,
    difficulty: Difficulty,
    level: number,
    asc: number,
  ): Promise<LevelOutcome & { stage: Stage }>;
  /**
   * Saves a skill selection (never called automatically). Remote: the server revalidates it against
   * the mastery it stores itself; local: against the profile.
   */
  saveLoadout(
    target: { key: string; classId: ClassId } | { classId: ClassId; nivelado: true },
    loadout: Loadout,
  ): Promise<void>;
  /** Rank-up of a piece (Forja > Equipo): `id` is the resulting piece (new rank, or the owned one it merged into). */
  ascendPiece(baseId: string, materials: Material[], keep?: "base" | "existing"): Promise<{ text: string; id: string }>;
  /** +1 star for 3 units of material of the piece's rank. */
  starUpPiece(baseId: string, materials: Material[]): Promise<{ text: string; id: string }>;
  /** Swaps the piece's main roll with the one of its spare copy `index`. */
  swapPieceRoll(pieceId: string, index: number): Promise<{ text: string; id: string }>;
  /** Mejorar (+N): spends Escamas (and a Dado cargado if asked); a failure never loses the piece. */
  upgradePiece(pieceId: string, useDado: boolean): Promise<UpgradeOutcome>;
  /** Rank-up (Forja > Héroes): `id` is the resulting hero (new rank, or the owned one it merged into). */
  fuseHeroes(baseId: string, materials: Material[], keep?: "base" | "existing"): Promise<{ text: string; id: string }>;
  /** +1 star for 3 units of material of the hero's rank. */
  starUpHero(baseId: string, materials: Material[]): Promise<{ text: string; id: string }>;
  /** Swaps the hero's main trait with the one of its spare copy `index`. */
  swapCopy(heroId: string, index: number): Promise<{ text: string; id: string }>;
  /** Open expedition of a mode (null if none). A just-closed one (season/engine) comes back ended, once. */
  expeditionCurrent(mode: TowerMode): Promise<ExpState | null>;
  /** Starts the expedition of a mode, or returns the open one. */
  expeditionStart(mode: TowerMode, opts: ExpStartOpts): Promise<ExpState>;
  /** Sends actions; the result carries the canonical state and where the first rejection happened. */
  expeditionAct(mode: TowerMode, state: ExpState, actions: ExpAction[], keepalive?: boolean): Promise<ExpActResult>;
  expeditionCodex(mode?: TowerMode): Promise<ExpCodex>;
  /** Week, rankings of both modes, my validated place and my open runs. */
  towerState(): Promise<TowerStateInfo>;
  startRun(
    classId: ClassId,
    characterId: string | null,
    seedHint?: number,
    rank?: Difficulty,
    ascension?: number,
    tower?: TowerMode,
    element?: Element | null,
  ): Promise<RunStartInfo>;
  submitRun(
    runId: string,
    actions: StageAction[],
    claimed: {
      coins: number;
      maxFloor: number;
      loot?: RunPiece[];
      clear?: { rank: Difficulty; lives: number; asc?: number }; // local mode only; the server replays
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

export function createLocalRepo(store: StoreApi, kv: KV = browserKV): ProfileRepo {
  // Applies a star-up / trait swap result to the local profile.
  const grew = <R extends HeroGrowthResult | PieceGrowthResult>(r: R, id: string | ((r: Extract<R, { ok: true }>) => string)) => {
    if (!r.ok) throw new RepoError("fusion_invalid", r.error);
    store.replace(r.profile);
    return { text: r.text, id: typeof id === "string" ? id : id(r as Extract<R, { ok: true }>) };
  };
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
  const exp = createLocalExpedition(kv, () => store.get());
  const asRepoError = async <T>(f: Promise<T>): Promise<T> =>
    f.catch((e) => {
      throw e instanceof ExpError ? new RepoError(e.code, e.message) : e;
    });
  return {
    mode: "local",
    load: async () => ({ name: "Local", isAdmin: false, profile: store.get() }),
    expeditionCurrent: (mode) => exp.current(mode),
    expeditionStart: (mode, opts) => asRepoError(exp.start(mode, opts)),
    expeditionAct: (mode, state, actions) => asRepoError(exp.act(mode, state, actions)),
    expeditionCodex: (mode) => exp.codex(mode),
    towerState: async () => {
      const weekKey = artWeekKey();
      const active = async (mode: TowerMode): Promise<TowerActiveRun | null> => {
        const s = await exp.current(mode);
        return s && s.phase !== "ended"
          ? { nodes: s.nodes, turns: s.turns, revision: s.revision, status: s.phase === "suspended" ? "suspended" : "active", week: s.weekKey, deadline: "", stale: false }
          : null;
      };
      return {
        week: weekKey,
        weekKey,
        deadline: null,
        modes: { nivelado: { top: [], mine: null }, coleccion: { top: [], mine: null } },
        last: { nivelado: [], coleccion: [] },
        king: { nivelado: null, coleccion: null },
        activeByMode: { nivelado: await active("nivelado"), coleccion: await active("coleccion") },
      };
    },
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
    startLevel: async (heroId, route, difficulty, level, asc) => {
      const p = store.get();
      if (!isStepUnlocked(p.dungeons, { difficulty, asc: asc as 0 | 1 | 2 | 3 | 4 | 5 }))
        throw new RepoError("dungeon_locked", "Escalón bloqueado.");
      if (!isLevelUnlocked(p.dungeons, route, difficulty, level, asc))
        throw new RepoError("level_locked", "Nivel bloqueado.");
      const hero = heroFromOwned(p, heroId);
      if (!hero)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const seed = Date.now();
      return { attemptId: `lv-${seed}`, seed, hero, loadout: loadoutFor(p, hero, "coleccion") };
    },
    finishLevel: async (a) => {
      const p = store.get();
      const owned = p.characters.find((c) => c.id === a.heroId);
      if (!owned)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const opts = lootOptions(p, a.route, a.difficulty, a.level, a.asc);
      const spec = levelsOf(a.route, a.difficulty)[a.level];
      const loot: LevelLoot =
        a.stage.status === "cleared"
          ? {
              ...levelLoot(spec, a.asc, owned.classId, a.stage.seed, opts),
              dados: rollDado(spec, createRng(Date.now()), opts.dadoLeft),
            }
          : { escamas: 0, dados: 0, pieces: [] };
      const bank = bankLevel(p, {
        route: a.route,
        difficulty: a.difficulty,
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
    saveLoadout: async (target, loadout) => {
      const next = equipLoadout(store.get(), target, loadout);
      if (!next) throw new RepoError("invalid_loadout", "Esa selección de habilidades no es válida.");
      store.update(() => next);
    },
    sweepLevel: async (heroId, route, difficulty, level, asc) => {
      const p = store.get();
      const why = sweepBlock(p, heroId, route, difficulty, level, asc);
      if (why) throw new RepoError("sweep_locked", why);
      const hero = heroFromOwned(p, heroId);
      const spec = levelsOf(route, difficulty)[level];
      if (!hero || !spec)
        throw new RepoError("character_not_found", "Personaje no encontrado.");
      const seed = Date.now();
      const stage = sweepStage(seed, hero, levelFights(spec, asc), asc, loadoutFor(p, hero, "coleccion"));
      if (stage.status !== "cleared")
        throw new RepoError(
          "sweep_failed",
          "Tu héroe no logró barrer este nivel solo. Pelea tú el nivel.",
        );
      const opts = lootOptions(p, route, difficulty, level, asc);
      const loot = {
        ...levelLoot(spec, asc, hero.classId, seed, opts),
        dados: rollDado(spec, createRng(Date.now() + 1), opts.dadoLeft),
      };
      const bank = bankLevel(p, {
        route,
        difficulty,
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
    ascendPiece: async (baseId, materials, keep) =>
      grew(ascendPiece(store.get(), { baseId, materials, keep }, createRng(Date.now())), (r) => r.id),
    starUpPiece: async (baseId, materials) => grew(starUpPiece(store.get(), { baseId, materials }), (r) => r.id),
    swapPieceRoll: async (pieceId, index) => grew(swapPieceRoll(store.get(), { id: pieceId, index }), (r) => r.id),
    upgradePiece: async (pieceId, useDado) => {
      const p = store.get();
      const r = upgradePiece(p, pieceId, useDado, createRng(Date.now()));
      if (!r.ok) throw new RepoError("forge_invalid", r.error);
      store.replace(r.profile);
      return r;
    },
    fuseHeroes: async (baseId, materials, keep) => {
      const r = fuseHeroes(store.get(), { baseId, materials, keep });
      if (!r.ok) throw new RepoError("fusion_invalid", r.error);
      store.replace(r.profile);
      return { text: r.text, id: r.fusion.hero.id };
    },
    starUpHero: async (baseId, materials) => grew(starUpHero(store.get(), { baseId, materials }), baseId),
    swapCopy: async (heroId, index) => grew(swapCopy(store.get(), { id: heroId, index }), heroId),
    startRun: async (
      classId,
      characterId,
      seedHint,
      rank = "f",
      ascension = 0,
      tower,
      element,
    ) => {
      if (tower) {
        // Offline tower: the week's seed from the calendar, no ranking.
        const seed = localWeekSeed();
        const hero = towerHero(
          store.get(),
          tower,
          characterId,
          classId,
          element ?? null,
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
          loadout: loadoutFor(store.get(), hero, tower),
        };
      }
      const p = store.get();
      if (!isStepUnlocked(p.dungeons, { difficulty: rank, asc: 0 }))
        throw new RepoError("dungeon_locked", "Dificultad bloqueada.");
      if (ascension > maxAscension(p.dungeons, rank))
        throw new RepoError("ascension_locked", "Ascensión bloqueada.");
      const seed = seedHint ?? Date.now();
      const hero =
        (characterId && heroFromOwned(store.get(), characterId)) ||
        generateCharacter(createRng(seed), classId);
      return { runId: `${seed}-${Date.now()}`, seed, hero, rank, ascension, loadout: loadoutFor(p, hero, "coleccion") };
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

  const modeQuery = (mode?: TowerMode) => (mode ? `?mode=${mode}` : "");
  return {
    mode: "remote",
    expeditionCurrent: async (mode) =>
      (await api<{ state: ExpState | null }>(`/api/tower/current${modeQuery(mode)}`)).state,
    expeditionStart: async (mode, opts) =>
      (await api<{ state: ExpState }>("/api/tower/start", { mode, ...opts })).state,
    expeditionAct: async (mode, _state, actions, keepalive) => {
      const r = await api<ExpActResult & { prize?: { coins: number; xp: number } }>(
        "/api/tower/act",
        { mode, actions },
        keepalive,
      );
      // Node payouts and Collection EXP land in the profile: refresh the cache (best effort).
      if (r.prize && (r.prize.coins > 0 || r.prize.xp > 0))
        await api<Me>("/api/me")
          .then((me) => store.replace(me.profile))
          .catch(() => undefined);
      return { state: r.state, applied: r.applied, rejectedAt: r.rejectedAt, ...(r.error ? { error: r.error } : {}) };
    },
    expeditionCodex: (mode) => api<ExpCodex>(`/api/tower/codex${modeQuery(mode)}`),
    towerState: () => api<TowerStateInfo>("/api/tower"),
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
    startLevel: async (heroId, route, difficulty, level, asc) => {
      const r = await api<{
        runId: string;
        seed: number;
        hero: Character;
        loadout: Loadout;
      }>("/api/level/start", {
        characterId: heroId,
        route,
        difficulty,
        level,
        ascension: asc,
        ...chosenLoadout(store.get(), heroId),
      });
      return {
        attemptId: r.runId,
        seed: r.seed,
        hero: r.hero,
        loadout: r.loadout,
      };
    },
    finishLevel: async (a) => {
      // Only the fights won travel: status, EXP and loot are derived on the server.
      const r = await api<{
        bank: Omit<LevelBank, "profile">;
        loot: LevelLoot;
        profile: Profile;
      }>("/api/level/finish", {
        runId: a.info.attemptId,
        wins: a.stage.won.normal + a.stage.won.elite + a.stage.won.final,
      });
      store.replace(r.profile);
      return { bank: { ...r.bank, profile: r.profile }, loot: r.loot };
    },
    sweepLevel: async (heroId, route, difficulty, level, asc) => {
      const r = await api<{
        seed: number;
        hero: Character;
        loadout: Loadout;
        bank: Omit<LevelBank, "profile">;
        loot: LevelLoot;
        profile: Profile;
      }>("/api/level/sweep", {
        characterId: heroId,
        route,
        difficulty,
        level,
        ascension: asc,
        ...chosenLoadout(store.get(), heroId),
      });
      store.replace(r.profile);
      // The server paid from its own play; the same deterministic engine rebuilds it for display.
      const stage = sweepStage(r.seed, r.hero, levelFights(levelsOf(route, difficulty)[level], asc), asc, r.loadout);
      return { bank: { ...r.bank, profile: r.profile }, loot: r.loot, stage };
    },
    saveLoadout: async (target, loadout) => {
      // The server derives mastery itself; this body only names the selection.
      const body =
        "nivelado" in target
          ? { mode: "nivelado", classId: target.classId, loadout }
          : { mode: "coleccion", key: target.key, loadout };
      store.replace((await api<{ profile: Profile }>("/api/loadout", body)).profile);
    },
    ascendPiece: async (baseId, materials, keep) => {
      const r = await api<{ text: string; id: string; profile: Profile }>("/api/forge/ascend", { baseId, materials, keep });
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    starUpPiece: async (baseId, materials) => {
      const r = await api<{ text: string; id: string; profile: Profile }>("/api/forge/star-up", { baseId, materials });
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    swapPieceRoll: async (pieceId, index) => {
      const r = await api<{ text: string; id: string; profile: Profile }>("/api/forge/swap-roll", { pieceId, index });
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    upgradePiece: async (pieceId, useDado) => {
      const r = await api<UpgradeOutcome>("/api/forge/upgrade", { pieceId, useDado });
      store.replace(r.profile);
      return r;
    },
    fuseHeroes: async (baseId, materials, keep) => {
      const r = await api<{ text: string; id: string; profile: Profile }>(
        "/api/collection/fuse-heroes",
        { baseId, materials, keep },
      );
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    starUpHero: async (baseId, materials) => {
      const r = await api<{ text: string; id: string; profile: Profile }>(
        "/api/collection/star-up",
        { baseId, materials },
      );
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    swapCopy: async (heroId, index) => {
      const r = await api<{ text: string; id: string; profile: Profile }>(
        "/api/collection/swap-copy",
        { heroId, index },
      );
      store.replace(r.profile);
      return { text: r.text, id: r.id };
    },
    startRun: async (classId, characterId, _seed, _rank, _ascension, tower, element) => {
      // /api/run/start is the weekly tower only; dungeon levels use startLevel.
      if (!tower)
        throw new RepoError("invalid_input", "Falta el modo de la torre.");
      return api<RunStartInfo>("/api/run/start", {
        classId,
        characterId,
        tower,
        ...(element ? { element } : {}),
      });
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
/** The skills the player equipped for `heroId` (sent explicitly; the server revalidates them against its own mastery). */
function chosenLoadout(p: Profile, heroId: string): { loadout?: Loadout } {
  const hero = heroFromOwned(p, heroId);
  return hero ? { loadout: loadoutFor(p, hero, "coleccion") } : {};
}

export const selectRepo = (
  supabaseUrl: string | undefined,
  store: StoreApi,
  f: Fetch = (...a) => fetch(...a),
): ProfileRepo =>
  supabaseUrl ? createRemoteRepo(store, f) : createLocalRepo(store);
