import type { Character, ClassId } from "../game/characters";
import {
  migrate,
  pullCharacter,
  pullCost,
  pullWeapon,
  type Banner,
  type PullResult,
  type Profile,
} from "../game/profile";
import {
  isTowerMode,
  replayTower,
  towerHero,
  type TowerMode,
} from "../game/tower";
import { applyForge, type ForgeOp } from "../game/forge";
import type { RarityId } from "../game/rarity";
import { createRng } from "../game/rng";
import { ENGINE_VERSION, type StageAction } from "../game/stageReplay";
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
  dungeons?: Record<string, number>;
  ascensions?: Record<string, number>;
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
  fragments: Record<string, number>;
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
    coins: raw.coins,
    pity: raw.pity,
    dungeons: raw.dungeons,
    parts: raw.parts,
    pitySsr: raw.pitySsr,
    bestFloor: raw.bestFloor,
    equipped: raw.equipped,
    fragments: raw.fragments,
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

export async function loadMe(rpc: Rpc, playerId: string): Promise<Me> {
  try {
    const me = toMe(
      await call<RawProfile>(rpc, "get_profile", { p_player: playerId }),
    );
    const daily = await call<DailyState | null>(rpc, "get_streak", {
      p_player: playerId,
    });
    return daily ? migrateDaily(me, daily) : me;
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
  | { type: string; element: string; rarity: string; data: unknown };

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
// Only the weekly tower runs through a server-verified log today. Dungeon levels
// (stage engine) are verified by the level services of the server phase.

export interface RunStartBody {
  classId: ClassId;
  characterId: string | null;
  rank?: RarityId;
  ascension?: number;
  tower?: TowerMode; // weekly tower: the week's seed, no payout
}

// Opens the run row; a stale open run (page reloaded mid-run) is closed unpaid first.
async function openRunRow(
  d: Deps,
  playerId: string,
  args: Record<string, unknown>,
): Promise<{ run_id: string }> {
  try {
    return await call(d.rpc, "start_run", args);
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
    return await call(d.rpc, "start_run", args);
  }
}

export async function startRunService(
  d: Deps,
  playerId: string,
  body: RunStartBody,
) {
  await limit(d.rpc, `runstart:${playerId}`, 10, 60);
  await limit(d.rpc, `runstarth:${playerId}`, 20, 3600);
  const me = await loadMe(d.rpc, playerId);
  // ponytail: dungeon levels are verified by the stage-engine services of phase 4.
  if (!body.tower)
    throw new ApiError(
      501,
      "levels_not_supported",
      "Los niveles de dungeon todavía no se verifican en el servidor.",
    );
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
      // is only replayable by the engine that recorded it.
      p_hero: { ...hero, engineVersion: ENGINE_VERSION, tower: body.tower },
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
    ...hero
  } = row.hero as Character & { engineVersion?: number; tower?: string };
  const tower = isTowerMode(storedTower) ? storedTower : null;
  if (!tower)
    throw new ApiError(
      501,
      "levels_not_supported",
      "Los niveles de dungeon todavía no se verifican en el servidor.",
    );
  // Impossibly fast log: close the run unpaid (nothing is credited) and say why.
  const elapsed = row.startedAt ? Date.now() - row.startedAt : null;
  if (
    elapsed !== null &&
    elapsed + MIN_ACTION_GRACE_MS < body.actions.length * MIN_ACTION_MS
  ) {
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
    // Tower ranking: only a fully verified log counts; the best floor of the week stays.
    // ponytail: the tiebreak (rep.rounds, fewer is better) needs a tower_scores column (SQL phase).
    if (verdict === "accepted")
      await call(d.rpc, "tower_record", {
        p_player: playerId,
        p_mode: tower,
        p_floor: floors,
      });
    if (verdict !== "accepted" || r.capped)
      await audit(d.rpc, playerId, "run_" + verdict, {
        runId: body.runId,
        reason,
        capped: r.capped,
      });
    return { ...r, verdict, maxFloor: floors };
  } catch (e) {
    return mapRpcError(e);
  }
}

// ---- forge ----

// The server runs the same pure forge as the client and persists its diff
// atomically (apply_forge). Rejected combinations never reach the database.
export async function doForge(d: Deps, playerId: string, op: ForgeOp) {
  await limit(d.rpc, `forge:${playerId}`, 60, 60);
  const me = await loadMe(d.rpc, playerId);
  const r = applyForge(me.profile, op);
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
