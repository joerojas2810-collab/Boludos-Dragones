import { randomBytes } from "node:crypto";
import { CLASS_IDS, type Character, type ClassId } from "../game/characters";
import { ELEMENTS, type Element } from "../game/elements";
import { createStarterHero } from "../game/tutorial";
import { fuseHeroes, starUpHero, swapCopy, type Material } from "../game/heroFusion";
import { isLevelUnlocked, isStepUnlocked } from "../game/dungeonProgress";
import { missionDeltas } from "../game/missions";
import { levelLoot, rollDado, type LevelLoot } from "../game/levelLoot";
import { LEVELS_PER_ROUTE, isRouteId, levelsOf, type RouteId } from "../game/levels";
import {
  heroFromOwned,
  heroPower,
  lootOptions,
  migrate,
  PROFILE_VERSION,
  pullCharacter,
  pullCost,
  pullWeapon,
  TUTORIAL_DONE,
  type Banner,
  type PullResult,
  type Profile,
} from "../game/profile";
import {
  isTowerMode,
  replayTower,
  towerHero,
  towerXp,
  type TowerMode,
} from "../game/tower";
import { loadoutFor, masteryOf } from "../game/loadout";
import { loadoutError, type Loadout } from "../game/skills";
import { ascendPiece, starUpPiece, swapPieceRoll } from "../game/pieceGrowth";
import { upgradePiece } from "../game/upgrade";
import { isDifficulty, type Difficulty } from "../game/rarity";
import { createRng } from "../game/rng";
import { recommendedPower } from "../game/recommended";
import { levelFights, resultFromWins } from "../game/stage";
import { sweepBlock, sweepStage } from "../game/sweep";
import {
  ENGINE_VERSION,
  type StageAction,
} from "../game/stageReplay";
import { isDayKey, type DailyState } from "../game/streak";
import { ApiError } from "./http";
import { trackMissions } from "./missions";
import {
  audit,
  call,
  limit,
  mapRpcError,
  RpcError,
  type Deps,
  type Rpc,
} from "./rpc";

// ---- profile ----

interface RawProfile {
  name: string;
  isAdmin: boolean;
  stateVersion: number;
  coins: number;
  pity: { character: number; weapon: number };
  pitySsr?: { character: number; weapon: number };
  dungeonProgress?: import("../game/dungeonProgress").DungeonProgress;
  levelsDay?: { day: string; n: number } | null;
  escamas?: number;
  dados?: number;
  dadosDay?: { day: string; n: number } | null;
  dungeonRewardsDay?: { day: string; escamas: number; dados: number } | null;
  classMastery?: Record<string, number>; // 0058: highest hero level per class (trigger-maintained)
  loadouts?: Record<string, string[]>; // 0058: hero key -> two skills
  levelLoadouts?: Record<string, string[]>; // 0058: nivelado selection per class
  characters: {
    id: string;
    classId: string;
    element: string;
    rarity: string;
    stars: number;
    data: Record<string, unknown>;
  }[];
  weapons: {
    id: string;
    type: string;
    element: string;
    rarity: string;
    stars: number;
    data: Record<string, unknown>;
  }[];
  equipped: Record<string, string>;
  bestFloor: number;
}

export interface Me {
  profile: Profile;
  version: number;
  name: string;
  isAdmin: boolean;
}

// migrate() re-validates everything and recomputes derived values (weapon atk).
export function toMe(raw: RawProfile): Me {
  const profile = migrate({
    // Rows come from the database: the legacy flags are columns, not "saved before v5".
    version: PROFILE_VERSION,
    coins: raw.coins,
    pity: raw.pity,
    dungeons: raw.dungeonProgress,
    levelsDay: raw.levelsDay,
    escamas: raw.escamas,
    dados: raw.dados,
    dadosDay: raw.dadosDay,
    dungeonRewardsDay: raw.dungeonRewardsDay,
    pitySsr: raw.pitySsr,
    classMastery: raw.classMastery,
    loadouts: raw.loadouts,
    levelLoadouts: raw.levelLoadouts,
    bestFloor: raw.bestFloor,
    equipped: raw.equipped,
    characters: raw.characters.map((c) => ({
      ...c.data,
      classId: c.classId,
      element: c.element,
      rarity: c.rarity,
      stars: c.stars,
    })),
    weapons: raw.weapons.map((w) => ({
      ...w.data,
      type: w.type,
      element: w.element,
      rarity: w.rarity,
      stars: w.stars,
    })),
  });
  return {
    profile,
    version: raw.stateVersion,
    name: raw.name,
    isAdmin: raw.isAdmin,
  };
}

// Brand-new account (no heroes, tutorial not started): grants one random rank-F hero and a
// starter weapon of its class, so the tutorial can start at its first step. Guarded in SQL.
async function grantStarter(rpc: Rpc, playerId: string, me: Me): Promise<boolean> {
  const rng = createRng(randomBytes(4).readUInt32BE(0));
  const given = createStarterHero(
    { ...me.profile, tutorial: 0 },
    rng.pick(CLASS_IDS),
    rng,
  );
  const hero = given.characters[0];
  const w = given.weapons[given.weapons.length - 1];
  if (!hero || !w) return false;
  const { name, stats, traits, factors, catchphrase } = hero;
  return call<boolean>(rpc, "grant_starter", {
    p_player: playerId,
    p_class: hero.classId,
    p_element: hero.element,
    p_data: { name, stats, traits, factors, catchphrase },
    p_type: w.type,
    p_name: w.name,
    p_roll: w.roll ?? null,
    p_lines: w.lines ?? null,
  });
}

export async function loadMe(rpc: Rpc, playerId: string): Promise<Me> {
  try {
    // Three independent round trips go together (each is a hop to the database): the profile,
    // the streak and the stored tutorial step (read only; seeded below when it is still empty).
    const get = async () =>
      toMe(await call<RawProfile>(rpc, "get_profile", { p_player: playerId }));
    const dailyP = call<DailyState | null>(rpc, "get_streak", { p_player: playerId });
    const stepP = call<number | null>(rpc, "sync_tutorial", { p_player: playerId }).catch(() => undefined);
    let me = await get().catch((e) => (dailyP.catch(() => {}), stepP, Promise.reject(e)));
    // Until 0031 is applied the rpcs are missing: skip the tutorial instead of breaking login.
    if (!me.profile.characters.length && (await grantStarter(rpc, playerId, me).catch(() => false)))
      me = await get();
    const daily = await dailyP;
    let step = await stepP;
    // First load of an account (or the starter was just granted): seed the step once.
    if (step === null)
      step = await call<number | null>(rpc, "sync_tutorial", {
        p_player: playerId,
        p_init: me.profile.characters.length ? 1 : 4,
      }).catch(() => undefined);
    const withTut = { ...me, profile: { ...me.profile, tutorial: step ?? TUTORIAL_DONE } };
    return daily ? migrateDaily(withTut, daily) : withTut;
  } catch (e) {
    return mapRpcError(e);
  }
}

const migrateDaily = (me: Me, daily: DailyState): Me =>
  isDayKey(daily.day) && Number.isInteger(daily.streak) && daily.streak > 0
    ? { ...me, profile: { ...me.profile, daily } }
    : me;

// ---- gacha ----

export interface PullBody {
  banner: Banner;
  count: 1 | 10;
  idempotencyKey: string;
}

type Item =
  | { class: string; element: string; rarity: string; data: unknown }
  | {
      type: string;
      element: string;
      rarity: string;
      data: unknown;
      roll?: number; // the piece's own roll and lines, rolled by the server rng
      lines?: unknown;
    };

const itemOf = (r: PullResult): Item | null => {
  if (r.character) {
    const { name, stats, traits, factors, catchphrase, level, xp } = r.character;
    return {
      class: r.character.classId,
      element: r.character.element,
      rarity: r.character.rarity,
      data: { name, stats, traits, factors, catchphrase, level, xp },
    };
  }
  if (r.weapon)
    return {
      type: r.weapon.type,
      element: r.weapon.element,
      rarity: r.weapon.rarity,
      data: { name: r.weapon.name },
      roll: r.weapon.roll,
      ...(r.weapon.lines?.length ? { lines: r.weapon.lines } : {}),
    };
  return null;
};

interface PullApplied {
  replayed: boolean;
  coins: number;
  version: number;
  pity: number;
}

// The server rolls (fresh crypto seed, never sent to the client); the TS
// engine decides; apply_pull persists atomically and is idempotent per key.
export async function doPull(
  d: Deps,
  playerId: string,
  body: PullBody,
  daily = false,
) {
  await limit(d.rpc, `pull:${playerId}`, 30, 60);
  const count = daily ? 1 : body.count;
  for (let attempt = 0; ; attempt++) {
    const me = await loadMe(d.rpc, playerId);
    const cost = daily ? 0 : pullCost(body.banner, count);
    // The engine only needs enough coins to run; the DB checks the real
    // balance (and replays stored results for a repeated idempotency key).
    const sim = {
      ...me.profile,
      coins: Math.max(me.profile.coins, pullCost(body.banner, count)),
    };
    const seed = d.randomSeed();
    const rng = createRng(seed);
    const out =
      body.banner === "character"
        ? pullCharacter(sim, rng, count)
        : pullWeapon(sim, rng, count);
    if (!out) throw new ApiError(400, "invalid_input", "Datos inválidos.");
    const items = out.results.map(itemOf);
    if (items.some((i) => i === null)) throw new Error("pull item missing");
    try {
      const r = await call<PullApplied>(d.rpc, "apply_pull", {
        p_player: playerId,
        p_version: me.version,
        p_idem: body.idempotencyKey,
        p_banner: body.banner,
        p_cost: cost,
        p_pity: out.profile.pity[body.banner],
        p_pity_ssr: out.profile.pitySsr[body.banner],
        p_seed: seed,
        p_daily: daily,
        p_items: items,
      });
      // ponytail: if this fails after the pull, the bonus is lost for that day.
      const streak = daily
        ? await call<{ streak: number; bonus: number }>(
            d.rpc,
            "settle_daily_streak",
            { p_player: playerId },
          )
        : null;
      if (!r.replayed) await trackMissions(d.rpc, playerId, { pull: count });
      const fresh = await loadMe(d.rpc, playerId);
      return {
        streak,
        replayed: r.replayed,
        results: r.replayed ? null : out.results,
        profile: fresh.profile,
      };
    } catch (e) {
      if (e instanceof RpcError && e.message === "conflict" && attempt < 2) {
        await audit(d.rpc, playerId, "pull_conflict", { attempt });
        continue;
      }
      return mapRpcError(e);
    }
  }
}

// ---- skill loadouts ----
type LoadoutMode = "nivelado" | "coleccion";

/**
 * The two skills a run is played with. The client may name a selection (it is validated), otherwise the
 * saved one is used. Mastery comes from the server-side profile (max hero level per class), never from
 * the client; nivelado (mastery null) has all four skills of the class available.
 */
export function resolveLoadout(
  profile: Profile,
  hero: Character,
  mode: LoadoutMode,
  requested?: readonly string[],
): Loadout {
  if (!requested) return loadoutFor(profile, hero, mode);
  const err = loadoutError(hero.classId, requested, mode === "nivelado" ? null : masteryOf(profile, hero.classId));
  if (err) throw new ApiError(400, "invalid_loadout", err);
  return [requested[0], requested[1]] as unknown as Loadout;
}

export interface LoadoutSaveBody {
  mode: LoadoutMode;
  key?: string; // coleccion: characterKey of an owned hero
  classId?: ClassId; // nivelado
  loadout: readonly string[];
}

/** Persists a selection after revalidating it against the mastery the server stores. */
export async function saveLoadoutService(d: Deps, playerId: string, body: LoadoutSaveBody) {
  await limit(d.rpc, `loadout:${playerId}`, 60, 60);
  const me = await loadMe(d.rpc, playerId);
  let classId: ClassId;
  if (body.mode === "nivelado") {
    if (!body.classId || !CLASS_IDS.includes(body.classId))
      throw new ApiError(400, "invalid_input", "Elige una clase.");
    classId = body.classId;
  } else {
    const owned = body.key ? me.profile.characters.find((c) => c.id === body.key) : undefined;
    if (!owned) throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
    classId = owned.classId;
  }
  const err = loadoutError(classId, body.loadout, body.mode === "nivelado" ? null : masteryOf(me.profile, classId));
  if (err) throw new ApiError(400, "invalid_loadout", err);
  try {
    await call(d.rpc, "set_loadout", {
      p_player: playerId,
      p_scope: body.mode === "nivelado" ? "level" : "hero",
      p_key: body.mode === "nivelado" ? classId : body.key,
      p_skills: [body.loadout[0], body.loadout[1]],
    });
  } catch (e) {
    return mapRpcError(e);
  }
  return { profile: (await loadMe(d.rpc, playerId)).profile };
}

// ---- runs ----
// `runs` rows are generic attempts: the weekly tower (hero.tower) and dungeon levels
// (hero.kind = "level", written by start_level). Each has its own start/finish service.

export interface RunStartBody {
  classId: ClassId;
  characterId: string | null;
  tower?: TowerMode; // weekly tower: the week's seed, no payout
  element?: Element;
  loadout?: readonly string[]; // optional: validated; otherwise the saved selection
}

// Opens the run row; a stale open run (page reloaded mid-run) is closed unpaid first.
async function openRunRow(
  d: Deps,
  playerId: string,
  args: Record<string, unknown>,
  fn: "start_run" | "start_level" = "start_run",
): Promise<{ run_id: string }> {
  try {
    return await call(d.rpc, fn, args);
  } catch (e) {
    if (!(e instanceof RpcError && e.message === "run_open")) throw e;
    const stale = await d.openRunId(playerId, fn === "start_level");
    if (!stale) throw e;
    await call(d.rpc, "bank_run", {
      p_player: playerId,
      p_run_id: stale,
      p_coins: 0,
      p_max_floor: 0,
      p_log: null,
      p_verdict: "rejected", // SQL verdict that pays nothing: closes the stale run unpaid
      p_reason: "replaced",
    });
    await audit(d.rpc, playerId, "run_replaced", { stale });
    return await call(d.rpc, fn, args);
  }
}

export async function startRunService(
  d: Deps,
  playerId: string,
  body: RunStartBody,
) {
  await limit(d.rpc, `runstart:${playerId}`, 10, 60);
  await limit(d.rpc, `runstarth:${playerId}`, 20, 3600);
  // Dungeon levels have their own route (startLevelService).
  if (!body.tower)
    throw new ApiError(400, "invalid_input", "Falta el modo de la torre.");
  if (body.tower === "nivelado" && !ELEMENTS.includes(body.element as Element))
    throw new ApiError(400, "invalid_input", "Elige un elemento para la torre.");
  const me = await loadMe(d.rpc, playerId);
  // Weekly tower: everybody gets the week's seed (first request of the week fixes it).
  const ws = await call<{ seed: number }>(d.rpc, "get_weekly_seed", {
    p_seed: d.randomSeed(),
  });
  const seed = Number(ws.seed);
  const hero = towerHero(
    me.profile,
    body.tower,
    body.characterId,
    body.classId,
    body.element ?? null,
  );
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const loadout = resolveLoadout(me.profile, hero, body.tower, body.loadout);
  try {
    const r = await openRunRow(d, playerId, {
      p_player: playerId,
      p_character_id: body.tower === "coleccion" ? body.characterId : null,
      p_seed: seed,
      // The engine version and the validated loadout ride inside the hero json (no schema change):
      // a log is only replayable by the engine and with the skills that recorded it.
      // heroId: who gets the EXP.
      p_hero: {
        ...hero,
        engineVersion: ENGINE_VERSION,
        loadout,
        tower: body.tower,
        ...(body.tower === "coleccion" && body.characterId
          ? { heroId: body.characterId }
          : {}),
      },
    });
    return {
      runId: r.run_id,
      seed,
      hero,
      rank: null,
      tower: body.tower,
      loadout,
      engineVersion: ENGINE_VERSION,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

// Anti-farming (a script can replay the deterministic engine at CPU speed):
// a log cannot be faster than a person clicking.
const TOWER_SQL_MAX_FLOOR = 500; // tower_record rejects more; keep in sync with 0055
export const MIN_ACTION_MS = 400; // fastest believable pace per logged action
export const MIN_ACTION_GRACE_MS = 3_000; // clock skew between app and database

// Even quick resolve takes a person about a second per fight (click + "Continuar"). This only
// stops scripts finishing a level instantly; the real brake is the hourly cap and the daily pay decay.
export const MIN_FIGHT_MS = 1_000;
// A full clear from a hero this far under the recommended power is not believable: the client
// only reports wins, so this is the one plausibility check. Skill clears at ~25-45 % of the
// recommended power exist, hence the low bar. ponytail: raise if the sim shows safe headroom.
export const CLAIM_POWER_FACTOR = 0.2;
const FIGHT_GRACE_MS = 1_000; // clock skew between app and database
const tooFastFights = (startedAt: number | undefined, wins: number) => {
  const elapsed = startedAt ? Date.now() - startedAt : null;
  return elapsed !== null && elapsed + FIGHT_GRACE_MS < wins * MIN_FIGHT_MS
    ? elapsed
    : null;
};

const tooFast = (startedAt: number | undefined, actions: number) => {
  const elapsed = startedAt ? Date.now() - startedAt : null;
  return elapsed !== null && elapsed + MIN_ACTION_GRACE_MS < actions * MIN_ACTION_MS
    ? elapsed
    : null;
};

export interface RunSubmitBody {
  runId: string;
  actions: StageAction[];
  claimed?: { coins: number; maxFloor: number };
  engineVersion?: number; // engine the client played with
}

export type Verdict = "accepted" | "truncated" | "mismatch";

// bank_run only accepts accepted|capped|rejected|cut; both replay problems pay the replayed value ("cut").
const SQL_VERDICT: Record<Verdict, "accepted" | "cut"> = {
  accepted: "accepted",
  truncated: "cut",
  mismatch: "cut",
};

export async function submitRunService(
  d: Deps,
  playerId: string,
  body: RunSubmitBody,
) {
  await limit(d.rpc, `runsubmit:${playerId}`, 20, 60);
  const row = await d.getRun(playerId, body.runId);
  if (!row) throw new ApiError(404, "run_not_found", "Run no encontrada.");
  if (row.status !== "open")
    throw new ApiError(409, "duplicate_run", "Esta run ya fue entregada.");
  const {
    engineVersion: stored = 1,
    tower: storedTower,
    heroId,
    loadout: storedLoadout,
    ...hero
  } = row.hero as Character & {
    engineVersion?: number;
    tower?: string;
    heroId?: string;
    loadout?: readonly string[];
  };
  const tower = isTowerMode(storedTower) ? storedTower : null;
  if (!tower)
    throw new ApiError(
      400,
      "wrong_run_kind",
      "Esa run no es de la torre: los niveles se entregan en /api/level/finish.",
    );
  // Impossibly fast log: close the run unpaid (nothing is credited) and say why.
  const elapsed = tooFast(row.startedAt, body.actions.length);
  if (elapsed !== null) {
    try {
      await call(d.rpc, "bank_run", {
        p_player: playerId,
        p_run_id: body.runId,
        p_coins: 0,
        p_max_floor: 0,
        p_log: body.actions.length <= 2000 ? body.actions : null,
        p_verdict: "rejected",
        p_reason: `too_fast ${elapsed}ms for ${body.actions.length} actions`,
      });
    } catch (e) {
      return mapRpcError(e);
    }
    await audit(d.rpc, playerId, "run_too_fast", {
      runId: body.runId,
      elapsed,
      n: body.actions.length,
    });
    throw new ApiError(
      429,
      "too_fast",
      "Ese intento se jugó demasiado rápido para ser real y no se registró.",
    );
  }
  if (body.engineVersion !== undefined && body.engineVersion !== stored)
    throw new ApiError(
      409,
      "engine_outdated",
      "La run se jugó con otra versión del juego. Recarga la página y empieza una nueva.",
    );
  // Old-engine logs are never reinterpreted, and a run without a valid stored loadout cannot be replayed.
  if (stored !== ENGINE_VERSION)
    throw new ApiError(
      409,
      "engine_outdated",
      "Esta run es de una versión anterior del juego y ya no se puede verificar. Empieza una nueva.",
    );
  const loadoutProblem = loadoutError(hero.classId, storedLoadout, null);
  if (loadoutProblem)
    throw new ApiError(409, "invalid_loadout", `La run no guardó unas habilidades válidas: ${loadoutProblem}`);
  const rep = replayTower(row.seed, hero, body.actions, stored, [storedLoadout![0], storedLoadout![1]] as unknown as Loadout);
  if (rep.error === "too_many_actions") {
    await call(d.rpc, "bank_run", {
      p_player: playerId,
      p_run_id: body.runId,
      p_coins: 0,
      p_max_floor: 0,
      p_log: null,
      p_verdict: "rejected",
      p_reason: "too_many_actions",
    }).catch(() => undefined);
    throw new ApiError(400, "too_many_actions", "Ese intento fue demasiado largo para verificarse.");
  }
  if (rep.error)
    throw new ApiError(
      409,
      "engine_outdated",
      "Esta run es de una versión anterior del juego y ya no se puede verificar.",
    );
  const floors = Math.min(rep.floors, TOWER_SQL_MAX_FLOOR);
  let verdict: Verdict = "accepted";
  let reason: string | null = null;
  if (rep.rejectedAt !== null) {
    verdict = "truncated";
    reason = `illegal action at ${rep.rejectedAt}`;
  } else if (body.claimed && body.claimed.maxFloor !== floors) {
    verdict = "mismatch";
    reason = `claimed floor ${body.claimed.maxFloor} replay ${floors}`;
  }
  try {
    // The tower pays nothing per run (no coins, loot or parts): only the weekly prizes.
    const r = await call<{
      coinsAdded: number;
      coins: number;
      bestFloor: number;
      capped: boolean;
    }>(d.rpc, "bank_run", {
      p_player: playerId,
      p_run_id: body.runId,
      p_coins: 0,
      p_max_floor: floors,
      p_log: verdict === "accepted" ? null : body.actions,
      p_verdict: SQL_VERDICT[verdict],
      p_reason: reason,
      p_parts: {},
      p_clear: null,
      p_loot: [],
    });
    // Tower ranking: only a fully verified log counts; the best floor of the week stays,
    // and at equal floors the climb with fewer battle rounds wins.
    let towerPrize: { floors: number; coins: number; dados: number } | undefined;
    if (verdict === "accepted") {
      // tower_record also pays the floors not paid yet this week (once per floor and mode).
      const rec = await call<{
        prize: { floors: number; coins: number; dados: number };
      }>(d.rpc, "tower_record", {
        p_player: playerId,
        p_mode: tower,
        p_floor: floors,
        p_rounds: Math.min(rep.rounds, 1_000_000), // resolved turns
        p_class: hero.classId,
        p_element: hero.element,
      }).catch(async (e) => {
        // The run is already closed: leave a trail so the score can be restored by hand.
        await audit(d.rpc, playerId, "tower_record_failed", {
          runId: body.runId,
          floors,
          rounds: rep.rounds,
        });
        throw e;
      });
      towerPrize = rec?.prize;
      // A quarter of the dungeon EXP for the hero that climbed (best effort).
      const xp = towerXp(rep.climb);
      if (heroId && xp > 0)
        await call(d.rpc, "grant_hero_xp", {
          p_player: playerId,
          p_character_id: heroId,
          p_xp: xp,
        }).catch(() => undefined);
    }
    if (verdict !== "accepted" || r.capped)
      await audit(d.rpc, playerId, "run_" + verdict, {
        runId: body.runId,
        reason,
        capped: r.capped,
      });
    return { ...r, verdict, maxFloor: floors, towerPrize };
  } catch (e) {
    return mapRpcError(e);
  }
}

// ---- dungeon levels (stage engine) ----

export interface LevelStartBody {
  characterId: string;
  route: RouteId;
  difficulty: Difficulty;
  level: number;
  ascension: number;
  loadout?: readonly string[]; // optional: validated; otherwise the saved selection
}

/**
 * Opens a verified attempt: checks the unlock rules, snapshots the hero (stats with rank,
 * stars, level and gear) and fixes the battle seed. The fights themselves are
 * deterministic from (rank, level, ascension), so the client derives them locally.
 */
export async function startLevelService(
  d: Deps,
  playerId: string,
  body: LevelStartBody,
) {
  await Promise.all([
    limit(d.rpc, `lvstart:${playerId}`, 10, 60, "Demasiados intentos seguidos. Espera un minuto."),
    // Levels are short (a minute or so): 60 an hour was reachable by a normal player.
    limit(
      d.rpc,
      `lvstarth:${playerId}`,
      200,
      3600,
      "Llegaste al límite de niveles por hora. Descansa un rato y vuelve.",
    ),
  ]);
  const { route, difficulty, level, ascension: asc } = body;
  const me = await loadMe(d.rpc, playerId);
  if (!isRouteId(route) || !isDifficulty(difficulty) || !Number.isInteger(asc) || asc < 0 || asc > 5 || !Number.isInteger(level) || level < 0 || level >= LEVELS_PER_ROUTE)
    throw new ApiError(400, "invalid_input", "Datos inválidos.");
  if (!isStepUnlocked(me.profile.dungeons, { difficulty, asc: asc as 0 | 1 | 2 | 3 | 4 | 5 }))
    throw new ApiError(409, "dungeon_locked", "Ese escalón todavía está bloqueado.");
  if (!isLevelUnlocked(me.profile.dungeons, route, difficulty, level, asc))
    throw new ApiError(409, "level_locked", "Ese nivel todavía está bloqueado.");
  const hero = heroFromOwned(me.profile, body.characterId);
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const loadout = resolveLoadout(me.profile, hero, "coleccion", body.loadout);
  const seed = d.randomSeed();
  try {
    const r = await openRunRow(
      d,
      playerId,
      {
        p_player: playerId,
        p_character_id: body.characterId,
        p_seed: seed,
        p_hero: { ...hero, engineVersion: ENGINE_VERSION, loadout },
        p_route: route,
        p_difficulty: difficulty,
        p_level: level,
        p_asc: asc,
      },
      "start_level",
    );
    return {
      runId: r.run_id,
      seed,
      hero,
      route,
      difficulty,
      level,
      ascension: asc,
      loadout,
      engineVersion: ENGINE_VERSION,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

export interface LevelFinishBody {
  runId: string;
  wins: number; // fights won; the server derives status, EXP and loot
}

interface LevelBankRaw {
  cleared: boolean;
  repeat: boolean;
  coins: number;
  chest: number;
  escamas?: number;
  dados?: number;
  refund?: number;
  xp: number;
  levelsGained: number;
  newLevel: number;
  dungeonDone: boolean;
  verdict: string;
  capped?: boolean;
}

const EMPTY_LOOT: LevelLoot = { escamas: 0, dados: 0, pieces: [] };

/**
 * Pays a level from the persisted hero snapshot: the client only says how many fights it won;
 * status, EXP and loot are derived here (loot rolled with the server seed) and paid through
 * bank_level. Pace (MIN_FIGHT_MS), run tokens and rate limits replace the old replay.
 */
export async function finishLevelService(
  d: Deps,
  playerId: string,
  body: LevelFinishBody,
) {
  // Independent round trips go together (each one costs a network hop to the database);
  // the profile is only needed once the log is verified, but loading it now hides its latency.
  const [, row, me0] = await Promise.all([
    limit(d.rpc, `lvfinish:${playerId}`, 20, 60),
    d.getRun(playerId, body.runId),
    loadMe(d.rpc, playerId).catch(() => null),
  ]);
  if (!row) throw new ApiError(404, "run_not_found", "Run no encontrada.");
  if (row.status !== "open")
    throw new ApiError(409, "duplicate_run", "Este nivel ya fue entregado.");
  const {
    kind,
    route,
    difficulty,
    level,
    asc,
    heroId,
    engineVersion: storedEngine,
    loadout: _storedLoadout,
    ...hero
  } = row.hero as Character & {
    engineVersion?: number;
    loadout?: readonly string[];
    kind?: string;
    route?: string;
    difficulty?: string;
    level?: number;
    asc?: number;
    heroId?: string;
  };
  if (
    kind !== "level" ||
    !isRouteId(route) || !isDifficulty(difficulty) ||
    !Number.isInteger(level) ||
    !Number.isInteger(asc) ||
    !heroId
  )
    throw new ApiError(
      400,
      "wrong_run_kind",
      "Esa run no es un nivel de dungeon.",
    );
  // A level started under another engine was played with rules that no longer exist: refuse, never pay.
  if (storedEngine !== ENGINE_VERSION)
    throw new ApiError(
      409,
      "engine_outdated",
      "Este nivel se empezó con una versión anterior del juego y ya no se puede registrar. Empieza el nivel de nuevo.",
    );
  const routeId = route as RouteId;
  const diff = difficulty as Difficulty;
  const lv = level as number;
  const ascension = asc as number;
  const spec = levelsOf(routeId, diff)[lv];
  if (!spec || lv >= LEVELS_PER_ROUTE)
    throw new ApiError(400, "invalid_input", "Datos inválidos.");

  const bank = async (args: Record<string, unknown>) => {
    try {
      return await call<LevelBankRaw>(d.rpc, "bank_level", {
        p_player: playerId,
        p_run_id: body.runId,
        p_hero_id: heroId,
        p_route: routeId,
        p_difficulty: diff,
        p_level: lv,
        p_asc: ascension,
        ...args,
      });
    } catch (e) {
      return mapRpcError(e);
    }
  };

  // Too fast to be a person (a script claiming fights at CPU speed): close it unpaid.
  const fights = levelFights(spec, ascension);
  const wins = Math.min(body.wins, fights.length);
  const elapsed = tooFastFights(row.startedAt, wins);
  if (elapsed !== null) {
    await bank({
      p_status: "lost",
      p_xp: 0,
      p_dados: 0,
      p_pieces: [],
      p_repeat: false,
      p_log: null,
      p_verdict: "rejected",
      p_reason: `too_fast ${elapsed}ms for ${wins} fights`,
    });
    throw new ApiError(
      429,
      "too_fast",
      "Ese intento se jugó demasiado rápido para ser real y no se registró.",
    );
  }
  if (wins >= fights.length) {
    const me = me0 ?? (await loadMe(d.rpc, playerId));
    const need = CLAIM_POWER_FACTOR * recommendedPower(diff, lv, ascension);
    if (heroPower(me.profile, heroId) < need) {
      await bank({
        p_status: "lost",
        p_xp: 0,
        p_dados: 0,
        p_pieces: [],
        p_repeat: false,
        p_log: null,
        p_verdict: "rejected",
        p_reason: `implausible_clear power<${Math.ceil(need)}`,
      });
      await audit(d.rpc, playerId, "level_implausible", { runId: body.runId, need });
      throw new ApiError(409, "implausible_clear", "Ese resultado no es creíble para el poder de tu héroe y no se registró.");
    }
  }
  const stage = resultFromWins(hero as Character, fights, wins);
  const cleared = stage.status === "cleared";

  let out: { raw: LevelBankRaw; loot: LevelLoot } | null = null;
  // The Dado is rolled HERE with a server-only rng, never from row.seed (the client knows that one).
  const dadoRng = createRng(d.randomSeed());
  for (let attempt = 0; !out; attempt++) {
    const me = attempt === 0 && me0 ? me0 : await loadMe(d.rpc, playerId);
    const opts = lootOptions(me.profile, routeId, diff, lv, ascension);
    const loot = cleared
      ? {
          ...levelLoot(spec, ascension, (hero as Character).classId, row.seed, opts),
          dados: rollDado(spec, dadoRng, opts.dadoLeft),
        }
      : EMPTY_LOOT;
    try {
      const raw = await call<LevelBankRaw>(d.rpc, "bank_level", {
        p_player: playerId,
        p_run_id: body.runId,
        p_hero_id: heroId,
        p_route: routeId,
        p_difficulty: diff,
        p_level: lv,
        p_asc: ascension,
        p_status: cleared ? "cleared" : "lost",
        p_xp: stage.xp,
        p_dados: loot.dados,
        p_pieces: loot.pieces,
        p_repeat: opts.repeat,
        p_log: null,
        p_verdict: "accepted",
        p_reason: null,
      });
      out = { raw, loot };
    } catch (e) {
      if (e instanceof RpcError && e.message === "conflict" && attempt < 2) {
        await audit(d.rpc, playerId, "level_conflict", { attempt });
        continue;
      }
      return mapRpcError(e);
    }
  }
  const [, fresh] = await Promise.all([
    trackMissions(
      d.rpc,
      playerId,
      missionDeltas({
        status: cleared ? "cleared" : "lost",
        won: stage.won,
        heroElement: (hero as Character).element,
        finalLevel: out.raw.dungeonDone,
      }),
    ),
    loadMe(d.rpc, playerId),
  ]);
  return {
    bank: {
      cleared: out.raw.cleared,
      repeat: out.raw.repeat,
      coins: out.raw.coins,
      chest: out.raw.chest,
      xp: out.raw.xp,
      levelsGained: out.raw.levelsGained,
      newLevel: out.raw.newLevel,
    },
    loot: { ...out.loot, escamas: out.raw.escamas ?? 0, dados: out.raw.dados ?? 0 },
    status: cleared ? "cleared" : "lost",
    verdict: out.raw.verdict,
    profile: fresh.profile,
  };
}

/**
 * Sweeps a level already cleared at this ascension: the engine plays it with the auto
 * policy from a fresh server seed and pays as a repeat clear. Needs a hero well above
 * the recommended power (sweepBlock) and an auto play that really clears the level.
 */
export async function sweepLevelService(
  d: Deps,
  playerId: string,
  body: LevelStartBody,
) {
  await Promise.all([
    limit(d.rpc, `lvsweep:${playerId}`, 30, 60, "Demasiados barridos seguidos. Espera un minuto."),
    limit(
      d.rpc,
      `lvsweeph:${playerId}`,
      600,
      3600,
      "Llegaste al límite de barridos por hora. Descansa un rato y vuelve.",
    ),
  ]);
  const { route, difficulty, level, ascension: asc, characterId } = body;
  if (!isRouteId(route) || !isDifficulty(difficulty) || !Number.isInteger(asc) || asc < 0 || asc > 5 || !Number.isInteger(level) || level < 0 || level >= LEVELS_PER_ROUTE)
    throw new ApiError(400, "invalid_input", "Datos inválidos.");
  const me = await loadMe(d.rpc, playerId);
  const spec = levelsOf(route, difficulty)[level];
  if (!spec) throw new ApiError(400, "invalid_input", "Datos inválidos.");
  const why = sweepBlock(me.profile, characterId, route, difficulty, level, asc);
  if (why) throw new ApiError(409, "sweep_locked", why);
  const hero = heroFromOwned(me.profile, characterId);
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const loadout = resolveLoadout(me.profile, hero, "coleccion", body.loadout);
  const seed = d.randomSeed();
  const stage = sweepStage(seed, hero, levelFights(spec, asc), asc, loadout);
  if (stage.status !== "cleared")
    throw new ApiError(
      409,
      "sweep_failed",
      "Tu héroe no logró barrer este nivel solo. Pelea tú el nivel.",
    );
  const opts = lootOptions(me.profile, route, difficulty, level, asc);
  const loot = {
    ...levelLoot(spec, asc, hero.classId, seed, opts),
    dados: rollDado(spec, createRng(d.randomSeed()), opts.dadoLeft),
  };
  try {
    const r = await openRunRow(
      d,
      playerId,
      {
        p_player: playerId,
        p_character_id: characterId,
        p_seed: seed,
        p_hero: { ...hero, engineVersion: ENGINE_VERSION, loadout, sweep: true },
        p_route: route,
        p_difficulty: difficulty,
        p_level: level,
        p_asc: asc,
      },
      "start_level",
    );
    const raw = await call<LevelBankRaw>(d.rpc, "bank_level", {
      p_player: playerId,
      p_run_id: r.run_id,
      p_hero_id: characterId,
      p_route: route,
        p_difficulty: difficulty,
      p_level: level,
      p_asc: asc,
      p_status: "cleared",
      p_xp: stage.xp,
      p_dados: loot.dados,
      p_pieces: loot.pieces,
      p_repeat: opts.repeat,
      p_log: null,
      p_verdict: "accepted",
      p_reason: "sweep",
    });
    const [, fresh] = await Promise.all([
      trackMissions(
        d.rpc,
        playerId,
        missionDeltas({
          status: "cleared",
          won: stage.won,
          heroElement: hero.element,
          finalLevel: raw.dungeonDone,
        }),
      ),
      loadMe(d.rpc, playerId),
    ]);
    return {
      seed,
      hero,
      loadout,
      bank: {
        cleared: raw.cleared,
        repeat: raw.repeat,
        coins: raw.coins,
        chest: raw.chest,
        xp: raw.xp,
        levelsGained: raw.levelsGained,
        newLevel: raw.newLevel,
      },
      loot: { ...loot, escamas: raw.escamas ?? 0, dados: raw.dados ?? 0 },
      profile: fresh.profile,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

// ---- hero fusion ----

// The heroes that differ between two profiles, as the rows apply_hero_change writes: whole hero
// rows to upsert, keys that disappear, and where each worn piece goes (null = unequipped).
function heroChange(before: Profile, after: Profile) {
  const was = new Map(before.characters.map((c) => [c.id, c]));
  const now = new Set(after.characters.map((c) => c.id));
  const owner = (k: string) => k.split("|")[0];
  const worn = new Map(Object.entries(after.equipped).map(([k, w]) => [w, owner(k)]));
  return {
    upsert: after.characters
      .filter((c) => was.get(c.id) !== c) // unchanged heroes keep their object
      .map((c) => ({
        class: c.classId,
        element: c.element,
        rarity: c.rarity,
        stars: c.stars,
        level: c.level,
        xp: c.xp,
        legacy: !!c.legacy,
        copies: c.copies ?? [],
        data: { name: c.name, stats: c.stats, traits: c.traits, factors: c.factors, catchphrase: c.catchphrase },
      })),
    remove: before.characters.filter((c) => !now.has(c.id)).map((c) => c.id),
    equip: Object.entries(before.equipped).flatMap(([k, w]) => {
      const to = worn.get(w) ?? null;
      return to === owner(k) ? [] : [{ weapon: w, to }];
    }),
  };
}

// The pieces that differ between two profiles, as the rows apply_piece_change writes (same shape as
// heroChange): whole piece rows to upsert, keys that disappear, and where each worn slot now points.
function pieceChange(before: Profile, after: Profile) {
  const was = new Map(before.weapons.map((w) => [w.id, w]));
  const now = new Set(after.weapons.map((w) => w.id));
  return {
    upsert: after.weapons
      .filter((w) => was.get(w.id) !== w) // unchanged pieces keep their object
      .map((w) => ({
        type: w.type,
        element: w.element,
        rarity: w.rarity,
        stars: w.stars,
        name: w.name,
        roll: w.roll ?? null,
        lines: w.lines ?? null,
        legacy: !!w.legacy,
        plus: w.plus ?? 0,
        plusStreak: w.plusStreak ?? 0,
        copies: (w.copies ?? []).map((c) => ({ roll: c.roll ?? null, lines: c.lines ?? null })),
      })),
    remove: before.weapons.filter((w) => !now.has(w.id)).map((w) => w.id),
    equip: Object.entries(before.equipped).flatMap(([slot, wid]) => {
      const to = after.equipped[slot] ?? null;
      return to === wid ? [] : [{ weapon: wid, to }];
    }),
  };
}

type GrowResult = { ok: true; profile: Profile; text: string; id: string } | { ok: false; error: string };

// Star-up, rank-up and roll / trait swap: the pure code (heroFusion.ts, pieceGrowth.ts) decides, one
// atomic RPC writes the result (optimistic version).
async function growWith(
  d: Deps,
  playerId: string,
  rpc: "apply_hero_change" | "apply_piece_change",
  change: (before: Profile, after: Profile) => { upsert: unknown[]; remove: string[]; equip: unknown[] },
  action: string,
  meta: Record<string, unknown>,
  run: (p: Profile) => GrowResult,
) {
  await limit(d.rpc, `fuse:${playerId}`, 30, 60);
  const me = await loadMe(d.rpc, playerId);
  const r = run(me.profile);
  if (!r.ok) throw new ApiError(400, "fusion_invalid", r.error);
  const ch = change(me.profile, r.profile);
  try {
    await call(d.rpc, rpc, {
      p_player: playerId,
      p_version: me.version,
      p_coins: me.profile.coins - r.profile.coins,
      p_upsert: ch.upsert,
      p_delete: ch.remove,
      p_equip: ch.equip,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await trackMissions(d.rpc, playerId, { forge: 1 });
  await audit(d.rpc, playerId, action, { ...meta, coins: me.profile.coins - r.profile.coins, result: r.id });
  const fresh = await loadMe(d.rpc, playerId);
  return { text: r.text, id: r.id, profile: fresh.profile };
}

const growHero = (d: Deps, playerId: string, action: string, meta: Record<string, unknown>, run: (p: Profile) => GrowResult) =>
  growWith(d, playerId, "apply_hero_change", heroChange, action, meta, run);
const growPiece = (d: Deps, playerId: string, action: string, meta: Record<string, unknown>, run: (p: Profile) => GrowResult) =>
  growWith(d, playerId, "apply_piece_change", pieceChange, action, meta, run);

export const doFuseHeroes = (
  d: Deps,
  playerId: string,
  baseId: string,
  materials: Material[],
  keep?: "base" | "existing",
) =>
  growHero(d, playerId, "fuse_heroes", { base: baseId, materials }, (p) => {
    const r = fuseHeroes(p, { baseId, materials, keep });
    return r.ok ? { ...r, id: r.fusion.hero.id } : r;
  });

export const doStarUpHero = (d: Deps, playerId: string, baseId: string, materials: Material[]) =>
  growHero(d, playerId, "star_up_hero", { base: baseId, materials }, (p) => {
    const r = starUpHero(p, { baseId, materials });
    return r.ok ? { ...r, id: baseId } : r;
  });

export const doSwapCopy = (d: Deps, playerId: string, id: string, index: number) =>
  growHero(d, playerId, "swap_trait", { hero: id, index }, (p) => {
    const r = swapCopy(p, { id, index });
    return r.ok ? { ...r, id } : r;
  });

// ---- forge (Ascender + Mejorar) ----

export const doStarUpPiece = (d: Deps, playerId: string, baseId: string, materials: Material[]) =>
  growPiece(d, playerId, "star_up_piece", { base: baseId, materials }, (p) => {
    const r = starUpPiece(p, { baseId, materials });
    return r.ok ? { ...r, id: baseId } : r;
  });

// A real rng for the lines a rank-up adds (a state-derived one could be steered).
export const doAscend = (d: Deps, playerId: string, baseId: string, materials: Material[], keep?: "base" | "existing") =>
  growPiece(d, playerId, "ascend", { base: baseId, materials }, (p) => {
    const r = ascendPiece(p, { baseId, materials, keep }, createRng(d.randomSeed()));
    return r.ok ? { ...r } : r;
  });

export const doSwapRoll = (d: Deps, playerId: string, id: string, index: number) =>
  growPiece(d, playerId, "swap_roll", { piece: id, index }, (p) => swapPieceRoll(p, { id, index }));

export async function doUpgrade(d: Deps, playerId: string, pieceId: string, useDado: boolean) {
  await limit(d.rpc, `forge:${playerId}`, 60, 60);
  const me = await loadMe(d.rpc, playerId);
  const r = upgradePiece(me.profile, pieceId, useDado, createRng(d.randomSeed()));
  if (!r.ok) throw new ApiError(400, "forge_invalid", r.error);
  try {
    await call(d.rpc, "apply_upgrade", {
      p_player: playerId,
      p_version: me.version,
      p_key: pieceId,
      p_use_dado: useDado,
      p_success: r.success,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await trackMissions(d.rpc, playerId, { forge: 1 });
  await audit(d.rpc, playerId, "upgrade", {
    piece: pieceId,
    useDado,
    success: r.success,
    chance: r.chance,
    spent: r.spent,
    plus: r.piece.plus ?? 0,
  });
  const fresh = await loadMe(d.rpc, playerId);
  const piece = fresh.profile.weapons.find((w) => w.id === pieceId) ?? r.piece;
  return { ok: true as const, success: r.success, piece, chance: r.chance, spent: r.spent, profile: fresh.profile };
}

// ---- weekly tower ----

/** Week, boards of both modes, my place and last week's podium (settles finished weeks). */
export async function towerStateService(d: Deps, playerId: string) {
  await limit(d.rpc, `tower:${playerId}`, 60, 60);
  try {
    return await call<Record<string, unknown>>(d.rpc, "tower_state", {
      p_player: playerId,
    });
  } catch (e) {
    return mapRpcError(e);
  }
}

export async function doTutorialStep(d: Deps, playerId: string, step: number) {
  try {
    await call<number>(d.rpc, "sync_tutorial", { p_player: playerId, p_step: step });
    return { step };
  } catch (e) {
    return mapRpcError(e);
  }
}
