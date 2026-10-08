import { randomBytes } from "node:crypto";
import { CLASS_IDS, type Character, type ClassId } from "../game/characters";
import { createStarterHero } from "../game/tutorial";
import { burn as burnItem, burnMany } from "../game/burn";
import { fuseHeroes } from "../game/heroFusion";
import { isLevelUnlocked, isRankUnlocked } from "../game/dungeonProgress";
import { missionDeltas } from "../game/missions";
import { levelLoot, type LevelLoot } from "../game/levelLoot";
import { LEVELS_PER_RANK, levelsOf } from "../game/levels";
import {
  chooseHeroSkill,
  heroFromOwned,
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
import { applyForge, type ForgeOp } from "../game/forge";
import { RARITY_IDS, type RarityId } from "../game/rarity";
import { createRng } from "../game/rng";
import { isSkillId } from "../game/skills";
import { levelFights } from "../game/stage";
import { sweepBlock, sweepStage } from "../game/sweep";
import {
  ENGINE_VERSION,
  replayStage,
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
  dungeons?: Record<string, number[]>;
  levelsDay?: { day: string; n: number } | null;
  parts?: Record<string, number>;
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
    dungeons: raw.dungeons,
    levelsDay: raw.levelsDay,
    parts: raw.parts,
    pitySsr: raw.pitySsr,
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
  const { name, stats, traits, catchphrase } = hero;
  return call<boolean>(rpc, "grant_starter", {
    p_player: playerId,
    p_class: hero.classId,
    p_element: hero.element,
    p_data: { name, stats, traits, catchphrase },
    p_type: w.type,
    p_name: w.name,
    p_roll: w.roll ?? null,
    p_lines: w.lines ?? null,
  });
}

export async function loadMe(rpc: Rpc, playerId: string): Promise<Me> {
  try {
    const get = async () =>
      toMe(await call<RawProfile>(rpc, "get_profile", { p_player: playerId }));
    // get_streak does not depend on the profile: run both round trips together.
    const dailyP = call<DailyState | null>(rpc, "get_streak", { p_player: playerId });
    let me = await get().catch((e) => (dailyP.catch(() => {}), Promise.reject(e)));
    // Until 0031 is applied the rpcs are missing: skip the tutorial instead of breaking login.
    if (!me.profile.characters.length && (await grantStarter(rpc, playerId, me).catch(() => false)))
      me = await get();
    const daily = await dailyP;
    const tutorial = await call<number | null>(rpc, "sync_tutorial", {
      p_player: playerId,
      p_init: me.profile.characters.length ? 1 : 4,
    }).catch(() => null);
    const withTut = { ...me, profile: { ...me.profile, tutorial: tutorial ?? TUTORIAL_DONE } };
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
    const { name, stats, traits, catchphrase, level, xp } = r.character;
    return {
      class: r.character.classId,
      element: r.character.element,
      rarity: r.character.rarity,
      data: { name, stats, traits, catchphrase, level, xp },
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

// ---- runs ----
// `runs` rows are generic attempts: the weekly tower (hero.tower) and dungeon levels
// (hero.kind = "level", written by start_level). Each has its own start/finish service.

export interface RunStartBody {
  classId: ClassId;
  characterId: string | null;
  tower?: TowerMode; // weekly tower: the week's seed, no payout
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
    const stale = await d.openRunId(playerId);
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
    seed,
    playerId,
  );
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  try {
    const r = await openRunRow(d, playerId, {
      p_player: playerId,
      p_character_id: body.characterId,
      p_seed: seed,
      // The engine version rides inside the hero json (no schema change): a log
      // is only replayable by the engine that recorded it. heroId: who gets the EXP.
      p_hero: {
        ...hero,
        engineVersion: ENGINE_VERSION,
        tower: body.tower,
        ...(body.characterId ? { heroId: body.characterId } : {}),
      },
    });
    return {
      runId: r.run_id,
      seed,
      hero,
      rank: null,
      tower: body.tower,
      engineVersion: ENGINE_VERSION,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

// Anti-farming (a script can replay the deterministic engine at CPU speed):
// a log cannot be faster than a person clicking.
export const MIN_ACTION_MS = 400; // fastest believable pace per logged action
export const MIN_ACTION_GRACE_MS = 3_000; // clock skew between app and database

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
    ...hero
  } = row.hero as Character & {
    engineVersion?: number;
    tower?: string;
    heroId?: string;
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
  const rep = replayTower(row.seed, hero, body.actions, stored);
  if (rep.error)
    throw new ApiError(
      409,
      "engine_outdated",
      "Esta run es de una versión anterior del juego y ya no se puede verificar.",
    );
  const floors = rep.floors;
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
    let towerPrize: { floors: number; coins: number; cores: number } | undefined;
    if (verdict === "accepted") {
      // tower_record also pays the floors not paid yet this week (once per floor and mode).
      const rec = await call<{
        prize: { floors: number; coins: number; cores: number };
      }>(d.rpc, "tower_record", {
        p_player: playerId,
        p_mode: tower,
        p_floor: floors,
        p_rounds: Math.min(rep.rounds, 1_000_000),
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
  rank: RarityId;
  level: number;
  ascension: number;
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
  const { rank, level, ascension: asc } = body;
  const me = await loadMe(d.rpc, playerId);
  if (!isRankUnlocked(me.profile.dungeons, rank))
    throw new ApiError(409, "dungeon_locked", "Ese dungeon todavía está bloqueado.");
  if (!isLevelUnlocked(me.profile.dungeons, rank, level, asc))
    throw new ApiError(409, "level_locked", "Ese nivel todavía está bloqueado.");
  const hero = heroFromOwned(me.profile, body.characterId);
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const seed = d.randomSeed();
  try {
    const r = await openRunRow(
      d,
      playerId,
      {
        p_player: playerId,
        p_character_id: body.characterId,
        p_seed: seed,
        p_hero: { ...hero, engineVersion: ENGINE_VERSION },
        p_rank: rank,
        p_level: level,
        p_asc: asc,
      },
      "start_level",
    );
    return {
      runId: r.run_id,
      seed,
      hero,
      rank,
      level,
      ascension: asc,
      engineVersion: ENGINE_VERSION,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

export interface LevelFinishBody {
  runId: string;
  actions: StageAction[];
  engineVersion?: number;
}

interface LevelBankRaw {
  cleared: boolean;
  repeat: boolean;
  coins: number;
  chest: number;
  refund?: number;
  xp: number;
  levelsGained: number;
  newLevel: number;
  dungeonDone: boolean;
  verdict: string;
  capped?: boolean;
}

const EMPTY_LOOT: LevelLoot = { parts: {}, pieces: [] };

/**
 * Replays the whole level from the persisted hero snapshot, rolls the loot with the
 * server seed and pays through bank_level. The client never sends status, EXP or loot:
 * only the action log. An illegal or unfinished log pays what the replay reached.
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
    engineVersion: stored = 1,
    kind,
    rank,
    level,
    asc,
    heroId,
    ...hero
  } = row.hero as Character & {
    engineVersion?: number;
    kind?: string;
    rank?: string;
    level?: number;
    asc?: number;
    heroId?: string;
  };
  if (
    kind !== "level" ||
    !RARITY_IDS.includes(rank as RarityId) ||
    !Number.isInteger(level) ||
    !Number.isInteger(asc) ||
    !heroId
  )
    throw new ApiError(
      400,
      "wrong_run_kind",
      "Esa run no es un nivel de dungeon.",
    );
  const r = rank as RarityId;
  const lv = level as number;
  const ascension = asc as number;
  const spec = levelsOf(r)[lv];
  if (!spec || lv >= LEVELS_PER_RANK[r])
    throw new ApiError(400, "invalid_input", "Datos inválidos.");

  const bank = async (args: Record<string, unknown>) => {
    try {
      return await call<LevelBankRaw>(d.rpc, "bank_level", {
        p_player: playerId,
        p_run_id: body.runId,
        p_hero_id: heroId,
        p_rank: r,
        p_level: lv,
        p_asc: ascension,
        ...args,
      });
    } catch (e) {
      return mapRpcError(e);
    }
  };

  // Impossibly fast log: close the attempt unpaid and say why.
  const elapsed = tooFast(row.startedAt, body.actions.length);
  if (elapsed !== null) {
    await bank({
      p_status: "lost",
      p_xp: 0,
      p_parts: {},
      p_pieces: [],
      p_repeat: false,
      p_log: body.actions.length <= 2000 ? body.actions : null,
      p_verdict: "rejected",
      p_reason: `too_fast ${elapsed}ms for ${body.actions.length} actions`,
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
      "El nivel se jugó con otra versión del juego. Recarga la página y empieza de nuevo.",
    );
  const rep = replayStage(
    row.seed,
    hero as Character,
    levelFights(spec, ascension),
    body.actions,
    ascension,
    stored,
  );
  if (rep.error)
    throw new ApiError(
      409,
      "engine_outdated",
      "Este nivel es de una versión anterior del juego y ya no se puede verificar.",
    );
  const stage = rep.stage;
  const cleared = stage.status === "cleared";
  // Illegal action, or a log that stops before the end: pay what the replay reached.
  const cut = rep.rejectedAt !== null || stage.status === "playing";
  const reason = cut
    ? rep.rejectedAt !== null
      ? `illegal action at ${rep.rejectedAt}`
      : "unfinished log"
    : null;

  let out: { raw: LevelBankRaw; loot: LevelLoot } | null = null;
  for (let attempt = 0; !out; attempt++) {
    const me = attempt === 0 && me0 ? me0 : await loadMe(d.rpc, playerId);
    const opts = lootOptions(me.profile, r, lv, ascension);
    const loot = cleared
      ? levelLoot(spec, ascension, (hero as Character).classId, row.seed, opts)
      : EMPTY_LOOT;
    try {
      const raw = await call<LevelBankRaw>(d.rpc, "bank_level", {
        p_player: playerId,
        p_run_id: body.runId,
        p_hero_id: heroId,
        p_rank: r,
        p_level: lv,
        p_asc: ascension,
        p_status: cleared ? "cleared" : "lost",
        p_xp: stage.xp,
        p_parts: loot.parts,
        p_pieces: loot.pieces,
        p_repeat: opts.repeat,
        p_log: cut ? body.actions : null,
        p_verdict: cut ? "cut" : "accepted",
        p_reason: reason,
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
    loot: out.loot,
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
  const { rank, level, ascension: asc, characterId } = body;
  const me = await loadMe(d.rpc, playerId);
  const spec = levelsOf(rank)[level];
  if (!spec) throw new ApiError(400, "invalid_input", "Datos inválidos.");
  const why = sweepBlock(me.profile, characterId, rank, level, asc);
  if (why) throw new ApiError(409, "sweep_locked", why);
  const hero = heroFromOwned(me.profile, characterId);
  if (!hero)
    throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const seed = d.randomSeed();
  const stage = sweepStage(seed, hero, levelFights(spec, asc), asc);
  if (stage.status !== "cleared")
    throw new ApiError(
      409,
      "sweep_failed",
      "Tu héroe no logró barrer este nivel solo. Pelea tú el nivel.",
    );
  const opts = lootOptions(me.profile, rank, level, asc);
  const loot = levelLoot(spec, asc, hero.classId, seed, opts);
  try {
    const r = await openRunRow(
      d,
      playerId,
      {
        p_player: playerId,
        p_character_id: characterId,
        p_seed: seed,
        p_hero: { ...hero, engineVersion: ENGINE_VERSION, sweep: true },
        p_rank: rank,
        p_level: level,
        p_asc: asc,
      },
      "start_level",
    );
    const raw = await call<LevelBankRaw>(d.rpc, "bank_level", {
      p_player: playerId,
      p_run_id: r.run_id,
      p_hero_id: characterId,
      p_rank: rank,
      p_level: level,
      p_asc: asc,
      p_status: "cleared",
      p_xp: stage.xp,
      p_parts: loot.parts,
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
      bank: {
        cleared: raw.cleared,
        repeat: raw.repeat,
        coins: raw.coins,
        chest: raw.chest,
        xp: raw.xp,
        levelsGained: raw.levelsGained,
        newLevel: raw.newLevel,
      },
      loot,
      profile: fresh.profile,
    };
  } catch (e) {
    return mapRpcError(e);
  }
}

// ---- burn / hero skill ----

export async function doBurn(
  d: Deps,
  playerId: string,
  kind: "hero" | "piece",
  id: string,
) {
  await limit(d.rpc, `burn:${playerId}`, 30, 60);
  const me = await loadMe(d.rpc, playerId);
  const r = burnItem(me.profile, { kind, id });
  if (!r)
    throw new ApiError(
      409,
      "burn_invalid",
      "No se puede quemar (¿está equipado o es tu único héroe?).",
    );
  try {
    await call(d.rpc, kind === "hero" ? "burn_hero" : "burn_item", {
      p_player: playerId,
      p_version: me.version,
      p_key: id,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await audit(d.rpc, playerId, "burn", { kind, id, coins: r.coins });
  const fresh = await loadMe(d.rpc, playerId);
  return { coins: r.coins, profile: fresh.profile };
}

export async function doBurnMany(
  d: Deps,
  playerId: string,
  kind: "hero" | "piece",
  ids: string[],
) {
  await limit(d.rpc, `burnmany:${playerId}`, 20, 60);
  const me = await loadMe(d.rpc, playerId);
  if (burnMany(me.profile, kind, ids).count === 0)
    throw new ApiError(409, "burn_invalid", "No hay nada que se pueda quemar.");
  let raw: { burned: number; gained: number };
  try {
    raw = await call(d.rpc, "burn_many", {
      p_player: playerId,
      p_version: me.version,
      p_kind: kind,
      p_keys: ids,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await audit(d.rpc, playerId, "burn_many", { kind, n: raw.burned, coins: raw.gained });
  const fresh = await loadMe(d.rpc, playerId);
  return { count: raw.burned, coins: raw.gained, profile: fresh.profile };
}

export async function doChooseSkill(
  d: Deps,
  playerId: string,
  characterId: string,
  skill: string,
) {
  await limit(d.rpc, `skill:${playerId}`, 30, 60);
  if (!isSkillId(skill))
    throw new ApiError(400, "invalid_skill", "Esa habilidad no existe.");
  const me = await loadMe(d.rpc, playerId);
  if (!chooseHeroSkill(me.profile, characterId, skill))
    throw new ApiError(
      409,
      "skill_locked",
      "Esa habilidad no está disponible para este héroe.",
    );
  try {
    await call(d.rpc, "choose_hero_skill", {
      p_player: playerId,
      p_character_id: characterId,
      p_skill: skill,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  const fresh = await loadMe(d.rpc, playerId);
  return { profile: fresh.profile };
}

// ---- hero fusion ----

export async function doFuseHeroes(
  d: Deps,
  playerId: string,
  baseId: string,
  materialIds: string[],
) {
  await limit(d.rpc, `fuse:${playerId}`, 30, 60);
  const me = await loadMe(d.rpc, playerId);
  const r = fuseHeroes(me.profile, { baseId, materialIds }, createRng(d.randomSeed()));
  if (!r.ok) throw new ApiError(400, "fusion_invalid", r.error);
  const h = r.fusion.hero;
  try {
    await call(d.rpc, "fuse_heroes", {
      p_player: playerId,
      p_version: me.version,
      p_base: baseId,
      p_materials: materialIds,
      p_coins: r.fusion.coins,
      p_data: h ? { name: h.name, stats: h.stats, traits: h.traits, catchphrase: h.catchphrase } : {},
      p_level: h?.level ?? 1,
      p_xp: h?.xp ?? 0,
      p_stars: h?.stars ?? 0,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await audit(d.rpc, playerId, "fuse_heroes", {
    base: baseId,
    materials: materialIds,
    coins: r.fusion.coins,
    result: h?.id ?? r.fusion.starTo,
  });
  const fresh = await loadMe(d.rpc, playerId);
  return { text: r.text, id: h?.id ?? r.fusion.starTo ?? baseId, profile: fresh.profile };
}

// ---- forge ----

// The server runs the same pure forge as the client and persists its diff
// atomically (apply_forge). Rejected combinations never reach the database.
export async function doForge(d: Deps, playerId: string, op: ForgeOp) {
  await limit(d.rpc, `forge:${playerId}`, 60, 60);
  const me = await loadMe(d.rpc, playerId);
  // A real rng for the rolls of new pieces: without it the forge derives them from the
  // profile state, which a player could steer. The grant carries each piece's roll/lines.
  const r = applyForge(me.profile, op, createRng(d.randomSeed()));
  if (!r.ok) throw new ApiError(400, "forge_invalid", r.error);
  try {
    await call(d.rpc, "apply_forge", {
      p_player: playerId,
      p_version: me.version,
      p_coins: r.diff.coins,
      p_spend: r.diff.spend,
      p_gain: r.diff.gain,
      p_grant: r.diff.grant,
      p_remove: r.diff.remove,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  await trackMissions(d.rpc, playerId, { forge: 1 });
  // Trace of every forge op (what was spent and gained), to check complaints later.
  await audit(d.rpc, playerId, "forge", {
    op: op.op,
    diff: r.diff,
    text: r.text,
  });
  const fresh = await loadMe(d.rpc, playerId);
  return { text: r.text, profile: fresh.profile };
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
