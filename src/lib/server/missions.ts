import {
  claimTiers,
  isEventDay,
  missionDone,
  missionsFor,
  reroll,
  rollMissionRewards,
  SCOPE_TIERS,
  activityPoints,
  type MissionScope,
  type MissionState,
} from "../game/missions";
import { createRng } from "../game/rng";
import { dropRank, DUNGEON_IDS, type RarityId } from "../game/rarity";
import { ApiError } from "./http";
import { call, limit, mapRpcError, type Deps, type Rpc } from "./rpc";

interface RawScope {
  progress: Record<string, number>;
  claimed: number;
  rerolled: number | null;
}
interface Raw {
  day: string;
  week: string;
  daily: RawScope;
  weekly: RawScope;
  event: RawScope;
}

const SCOPES: readonly MissionScope[] = ["daily", "weekly", "event"];

const stateOf = (scope: MissionScope, raw: Raw): MissionState => ({
  period: scope === "daily" ? raw.day : raw.week,
  ...raw[scope],
});

/** Counts verified events toward missions. Best effort: it must never break the main flow. */
export async function trackMissions(
  rpc: Rpc,
  playerId: string,
  events: Record<string, number>,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(events)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => [k, Math.min(500, Math.floor(n))]),
  );
  if (!Object.keys(clean).length) return;
  try {
    await call(rpc, "mission_add", { p_player: playerId, p_events: clean });
  } catch {
    // ponytail: a lost count only costs that action's progress; add a retry queue if it shows up.
  }
}

/** All three scopes with their missions, progress and tiers (event only while it runs). */
export async function missionsStateService(d: Deps, playerId: string) {
  await limit(d.rpc, `missions:${playerId}`, 60, 60);
  const raw = await call<Raw>(d.rpc, "mission_get", { p_player: playerId });
  const live = isEventDay(raw.day);
  return {
    day: raw.day,
    scopes: SCOPES.filter(
      (s) =>
        s !== "event" || live || Object.keys(raw.event.progress).length > 0,
    ).map((scope) => {
      const st = stateOf(scope, raw);
      const ms = missionsFor(scope, raw.day, st.rerolled);
      return {
        scope,
        points: activityPoints(st, ms),
        claimed: st.claimed,
        canReroll: scope !== "event" && st.rerolled === null,
        tiers: SCOPE_TIERS[scope],
        open: scope !== "event" || live,
        missions: ms.map((m) => ({
          slot: m.slot,
          label: m.label,
          target: m.target,
          progress: Math.min(m.target, st.progress[m.key] ?? 0),
          done: missionDone(st, m),
        })),
      };
    }),
  };
}

export async function claimMissionService(
  d: Deps,
  playerId: string,
  scope: MissionScope,
) {
  await limit(d.rpc, `missions:${playerId}`, 60, 60);
  const raw = await call<Raw>(d.rpc, "mission_get", { p_player: playerId });
  const st = stateOf(scope, raw);
  const out = claimTiers(scope, st, missionsFor(scope, raw.day, st.rerolled));
  if (out.state.claimed === st.claimed)
    throw new ApiError(
      409,
      "nothing_to_claim",
      "No hay premios para reclamar.",
    );
  try {
    // Pieces are rolled here at the rank of the best cleared dungeon (F if none);
    // mission_claim validates counts, rank cap and each piece before paying.
    const best = await call<string>(d.rpc, "best_cleared_rank", {
      p_player: playerId,
    });
    // best cleared dungeon tier -> the item rank the rewards roll at (SS / SSR dungeons: S)
    const rank: RarityId = (DUNGEON_IDS as readonly string[]).includes(best)
      ? dropRank(best as (typeof DUNGEON_IDS)[number])
      : "f";
    const roll = rollMissionRewards(
      createRng(d.randomSeed()),
      rank,
      out.pieces,
    );
    return await call(d.rpc, "mission_claim", {
      p_player: playerId,
      p_scope: scope,
      p_reached: out.state.claimed,
      p_pieces: roll.pieces,
    });
  } catch (e) {
    return mapRpcError(e);
  }
}

export async function rerollMissionService(
  d: Deps,
  playerId: string,
  scope: MissionScope,
  slot: number,
) {
  await limit(d.rpc, `missions:${playerId}`, 60, 60);
  const raw = await call<Raw>(d.rpc, "mission_get", { p_player: playerId });
  if (!reroll(scope, raw.day, stateOf(scope, raw), slot))
    throw new ApiError(409, "cannot_reroll", "No puedes cambiar esa misión.");
  try {
    return await call(d.rpc, "mission_reroll", {
      p_player: playerId,
      p_scope: scope,
      p_slot: slot,
    });
  } catch (e) {
    return mapRpcError(e);
  }
}
