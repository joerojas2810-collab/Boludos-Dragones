// Room service layer: auth'd player id + validated input in, plain data out.
// All persistence goes through RoomStore (real = RPCs, tests = fake). TS decides
// (next phase via game/room.ts `advance`, floor results via engine replay);
// SQL persists, validates and makes it idempotent.
import type { z } from "zod";
import {
  coopNode,
  coopPool,
  coopPrizes,
  coopRank,
  coopTally,
  replayCoop,
} from "../game/coop";
import { isUnlocked } from "../game/dungeons";
import type { RarityId } from "../game/rarity";
import { enemyFor, doorsFor, type Run } from "../game/run";
import { ENGINE_VERSION } from "../game/replay";
import {
  advance as modelAdvance,
  battleKey,
  can,
  DEFAULT_HERO,
  endNight,
  isFightDoor,
  hasVote,
  rankByChips,
  rankByFloor,
  startCoop,
  validateBet,
  visibleBets,
  type RoomState,
} from "../game/room";
import {
  createRoomMsg,
  joinRoomMsg,
  MSG_VERSION,
  EMOTE_MIN_GAP_MS,
  type ClientMsg,
} from "../rooms/messages";
import {
  roomTopic,
  ROOM_ROUTES,
  type AdvanceRes,
  type PhaseView,
  type RoomSnapshot,
  type CoopView,
  type RunView,
  type VoteView,
  type SubmitRes,
  type SummaryRes,
} from "../rooms/api";
import { resolveVoteResult, voteClosesAt, VOTE_EVENT } from "../game/vote";
import { ApiError, E } from "./http";
import { RpcError } from "./rpc";
import {
  alignRun,
  heroForRound,
  newRoomRun,
  replayFloor,
  timeoutRun,
} from "./roomRun";
import type { FloorRow, RoomDeps } from "./roomsStore";
import { addEmote, readLive, setLive } from "./roomsLive";

void roomTopic;
void ROOM_ROUTES;

// ------------------------------------------------------------------- errors
const ERR: Record<string, [number, string]> = {
  room_not_found: [404, "Sala no encontrada."],
  room_full: [409, "La sala está llena."],
  room_closed: [409, "La sala está cerrada."],
  not_member: [403, "No estás en esta sala."],
  not_active: [409, "No puedes jugar este piso."],
  wrong_phase: [409, "Ahora no se puede hacer eso."],
  wrong_floor: [409, "Ese piso ya no está en juego."],
  door_locked: [409, "Ya elegiste otra puerta."],
  invalid_door: [400, "Esa puerta no existe."],
  not_fighting: [409, "No estás peleando."],
  not_enough_players: [409, "Se necesitan al menos 2 jugadores."],
  max_rounds: [409, "La noche ya no tiene más rondas."],
  coop_disabled: [409, "El jefe final aún no está disponible."],
  battle_not_found: [404, "Esa pelea no existe."],
  battle_locked: [409, "Las apuestas ya cerraron."],
  self_bet: [409, "No puedes apostar sobre ti."],
  self_interfere: [409, "No puedes interferirte."],
  stake_too_low: [409, "Apuesta mínima: 10 fichas."],
  insufficient_chips: [409, "No te alcanzan las fichas."],
  duplicate_bet: [409, "Ya apostaste en esta pelea."],
  already_interfered: [409, "Ya interfirieron esta pelea."],
  hero_not_owned: [404, "No tienes ese héroe."],
  rank_locked: [409, "Alguien en la sala aún no desbloqueó ese rango."],
  forbidden: [403, "No permitido."],
  invalid_args: [400, "Datos inválidos."],
  invalid_transition: [409, "Ahora no se puede hacer eso."],
  target_hosts_other_room: [409, "Esa persona ya es anfitriona de otra sala."],
  room_limit: [409, "Ya tienes una sala abierta."],
  engine_outdated: [409, "Versión del juego distinta. Recarga la página."],
  invalid_log: [409, "Tu registro de acciones no es válido."],
  rate_limited: [429, "Espera un momento."],
};

/** Contract/model error code -> ApiError. Unknown errors propagate (500). */
export function roomError(e: unknown): never {
  if (e instanceof ApiError) throw e;
  const code =
    e instanceof RpcError ? e.message : typeof e === "string" ? e : "";
  const hit = ERR[code];
  if (hit) throw new ApiError(hit[0], code, hit[1]);
  throw e;
}
const fail = (code: keyof typeof ERR & string): never => roomError(code);

async function guarded<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    return roomError(e);
  }
}

// -------------------------------------------------------------------- views
export const phaseViewOf = (s: RoomState, nowMs: number): PhaseView => ({
  phase: s.phase,
  phaseSeq: s.phaseSeq,
  round: s.round,
  floor: s.floor,
  deadlineMs: s.deadline,
  hostId: s.hostId,
  mode: s.mode,
  rank: s.rank,
  turnSeconds: s.turnSeconds,
  serverNowMs: nowMs,
});

const pre = (id: string) => id.slice(0, 8);

/** Every listed player must have cleared the rank below (UNLOCK rules of dungeons.ts). */
async function assertUnlocked(d: RoomDeps, players: string[], rank: RarityId) {
  for (const id of players) {
    const { profile } = await d.loadProfile(id);
    if (!isUnlocked(profile.dungeons, rank)) return fail("rank_locked");
  }
}

async function load(d: RoomDeps, room: string): Promise<RoomState> {
  const s = await d.store.loadState(room);
  if (!s) return fail("room_not_found");
  return s;
}

/** Server -> channel events for the current state (compact, validated by tests). */
export function eventsFor(
  room: string,
  s: RoomState,
): Record<string, unknown>[] {
  const base = { v: MSG_VERSION, room, seq: s.phaseSeq };
  const out: Record<string, unknown>[] = [
    {
      ...base,
      type: "phase",
      phase: s.phase,
      phaseSeq: s.phaseSeq,
      deadlineMs: s.deadline,
      round: s.round,
      floor: s.floor,
    },
  ];
  if (s.phase === "reveal" || s.phase === "round_end") {
    out.push({
      ...base,
      type: "rank",
      by: "chips",
      r: rankByChips(s)
        .slice(0, 7)
        .map((x) => pre(x.id)),
    });
    out.push({
      ...base,
      type: "rank",
      by: "floor",
      r: rankByFloor(s)
        .slice(0, 7)
        .map((x) => pre(x.id)),
    });
  }
  if (s.phase === "reveal")
    for (const b of Object.values(s.battles))
      if (b.status === "settled" && b.outcome)
        out.push({
          ...base,
          type: "settle",
          fighter: b.fighter,
          out: b.outcome,
        });
  return out;
}

async function publish(d: RoomDeps, room: string, s: RoomState) {
  try {
    await d.broadcast(room, eventsFor(room, s));
  } catch {
    // realtime is a mirror: never fail the request because of it
  }
}

/** Present members who may vote (same set the SQL pays). */
const voters = (s: RoomState) =>
  s.players.filter((p) => !p.left && p.present).map((p) => p.id);

/** Vote shown during `reveal` of a vote floor (null elsewhere). */
async function voteViewOf(
  d: RoomDeps,
  s: RoomState,
  room: string,
  player: string,
  nowMs: number,
): Promise<VoteView | null> {
  if (s.phase !== "reveal" || !hasVote(s.floor)) return null;
  let v = await d.store.loadVote(room, s.round, s.floor);
  if (!v.result && nowMs >= voteClosesAt(s.deadline)) {
    await resolveFloorVote(d, s, room);
    v = await d.store.loadVote(room, s.round, s.floor);
  }
  const ids = voters(s);
  const yes = ids.filter((i) => v.votes[i] === true).length;
  const no = ids.filter((i) => v.votes[i] === false).length;
  return {
    floor: s.floor,
    title: VOTE_EVENT.title,
    question: VOTE_EVENT.question,
    open: !v.result && nowMs < voteClosesAt(s.deadline),
    yes,
    no,
    mine: v.votes[player] ?? null,
    result: v.result,
  };
}

/** Leaving `reveal` of a vote floor: tally and pay once (idempotent in SQL). */
async function resolveFloorVote(d: RoomDeps, s: RoomState, room: string) {
  if (s.phase !== "reveal" || !hasVote(s.floor) || s.roundSeed === null) return;
  const v = await d.store.loadVote(room, s.round, s.floor);
  if (v.result) return;
  const r = resolveVoteResult(
    s.roundSeed,
    s.round,
    s.floor,
    v.votes,
    voters(s),
  );
  await d.store.resolveVote(
    room,
    s.round,
    s.floor,
    r.outcome !== null,
    r.delta,
  );
}

// ------------------------------------------------------------- coop boss
/** Your fresh hero and the boss fight everybody plays during `coop_boss`. */
async function coopRun(d: RoomDeps, s: RoomState, player: string) {
  if (s.roundSeed === null) return fail("wrong_phase");
  const { profile } = await d.loadProfile(player);
  const heroKey = s.players.find((p) => p.id === player)?.heroId ?? null;
  const hero = heroForRound(profile, heroKey, s.mode, s.roundSeed, player);
  return {
    run: newRoomRun(s.roundSeed, hero, s.rank),
    node: coopNode(s.roundSeed, coopRank(s.mode, s.rank)),
  };
}

/** Shared bar + per-player damage; null outside the boss and its summary. */
async function coopViewOf(
  d: RoomDeps,
  s: RoomState,
  room: string,
): Promise<CoopView | null> {
  if (s.roundSeed === null) return null;
  if (!["coop_boss", "night_summary", "closed"].includes(s.phase)) return null;
  const rows = await d.store.loadCoop(room);
  if (s.phase !== "coop_boss" && rows.length === 0) return null;
  const rank = coopRank(s.mode, s.rank);
  const pool = coopPool(
    s.roundSeed,
    rank,
    s.players.filter((p) => !p.left).length,
  );
  const damage = Object.fromEntries(rows.map((r) => [r.playerId, r.damage]));
  const t = coopTally(pool, damage);
  const prizes = coopPrizes(s.roundSeed, t, damage);
  if (s.phase !== "coop_boss" && rows.some((r) => !r.paid))
    await payCoop(d, room, prizes, rows);
  return {
    ...t,
    prizes,
    bossName: coopNode(s.roundSeed, rank).enemy.name,
    players: rows.map((r) => ({
      id: r.playerId,
      damage: r.damage,
      finished: r.finished,
    })),
  };
}

/** Pays the prizes once (coop_pay is idempotent per player and enforces the daily account limit); a failure retries on the next poll. */
async function payCoop(
  d: RoomDeps,
  room: string,
  prizes: ReturnType<typeof coopPrizes>,
  rows: { playerId: string; paid: boolean }[],
) {
  const unpaid = new Set(rows.filter((r) => !r.paid).map((r) => r.playerId));
  const out = prizes
    .filter((p) => unpaid.has(p.id))
    .map((p) => ({
      player: p.id,
      coins: p.coins,
      chips: p.chips,
      cores: p.cores,
    }));
  try {
    if (out.length) await d.store.payCoop(room, out);
  } catch {
    // keep the poll alive; unpaid rows are retried on the next snapshot
  }
}

/** Everybody present has finished their fight: the boss can end early. */
async function coopAllDone(d: RoomDeps, s: RoomState, room: string) {
  const rows = await d.store.loadCoop(room);
  const done = new Set(rows.filter((r) => r.finished).map((r) => r.playerId));
  const present = s.players.filter((p) => !p.left && p.present);
  return present.length > 0 && present.every((p) => done.has(p.id));
}

export async function coopSubmitService(
  d: RoomDeps,
  player: string,
  room: string,
  msg: Extract<ClientMsg, { type: "coop_submit" }>,
) {
  return guarded(async () => {
    await d.store.limit(`roomcoop:${player}`, 90, 60);
    await touch(d, player, room);
    if (msg.engineVersion !== undefined && msg.engineVersion !== ENGINE_VERSION)
      return fail("engine_outdated");
    const s = await load(d, room);
    if (s.phase === "closed") return fail("room_closed");
    if (s.phase !== "coop_boss") return fail("wrong_phase");
    if (s.deadline > 0 && d.now() > s.deadline + FIGHT_GRACE_MS)
      return fail("wrong_phase");
    const { run, node } = await coopRun(d, s, player);
    if (run.engineVersion !== ENGINE_VERSION) return fail("engine_outdated");
    const rep = replayCoop(run, node, msg.actions);
    await d.store.saveCoop(room, player, {
      damage: rep.damage,
      finished: rep.finished,
      actions: msg.actions,
    });
    if (rep.rejectedAt !== null) {
      await d.store.audit(player, "room_coop_rejected", {
        room,
        at: rep.rejectedAt,
        n: msg.actions.length,
      });
      return fail("invalid_log");
    }
    return {
      ok: true,
      state: phaseViewOf(s, d.now()),
      damage: rep.damage,
      finished: rep.finished,
    };
  });
}

// ---------------------------------------------------------------- lobby-level
export async function createRoomService(
  d: RoomDeps,
  player: string,
  msg: z.infer<typeof createRoomMsg>,
) {
  return guarded(async () => {
    await d.store.limit(`roomcreate:${player}`, 5, 600);
    let made: Awaited<ReturnType<typeof d.store.createRoom>> | null = null;
    for (let i = 0; i < 8 && !made; i++) {
      try {
        made = await d.store.createRoom(player, d.randomCode());
      } catch (e) {
        if (!(e instanceof RpcError && e.message === "code_taken")) throw e;
      }
    }
    if (!made) throw new ApiError(503, "server_error", "Intenta de nuevo.");
    if (msg.mode && msg.mode !== "nivelado")
      await d.store.setMode(player, made.roomId, msg.mode);
    if (msg.rank && msg.rank !== "f") {
      await assertUnlocked(d, [player], msg.rank);
      await d.store.setRank(player, made.roomId, msg.rank);
    }
    if (msg.turnSeconds && msg.turnSeconds !== 30)
      await d.store.setTurnSeconds(player, made.roomId, msg.turnSeconds);
    const s = await load(d, made.roomId);
    return {
      roomId: made.roomId,
      code: made.code,
      expiresAt: made.expiresAt,
      state: phaseViewOf(s, d.now()),
    };
  });
}

export async function joinRoomService(
  d: RoomDeps,
  player: string,
  msg: z.infer<typeof joinRoomMsg>,
) {
  return guarded(async () => {
    await d.store.limit(`roomjoin:${player}`, 20, 60);
    const r = await d.store.joinRoom(player, msg.code);
    if (!r.ok) {
      await d.store.audit(player, "room_join_failed", { reason: r.error });
      return fail(r.error as "room_not_found");
    }
    await d.store.markPresence(player, r.roomId, true);
    return { roomId: r.roomId, code: r.code, hostId: r.hostId };
  });
}

/** Every room request: membership check + heartbeat + stale-presence sweep. */
async function touch(
  d: RoomDeps,
  player: string,
  room: string,
  present = true,
) {
  await d.store.markPresence(player, room, present); // not_member if not in the room
  await d.store.sweepPresence(room, d.now());
}

export async function snapshotService(
  d: RoomDeps,
  player: string,
  room: string,
): Promise<RoomSnapshot> {
  return guarded(async () => {
    await d.store.limit(`roomsnap:${player}`, 60, 60);
    await touch(d, player, room);
    const s = await load(d, room);
    const meta = await d.store.loadMeta(room);
    const live = s.players.filter((p) => !p.left);
    return {
      roomId: room,
      code: meta.code,
      you: player,
      state: phaseViewOf(s, d.now()),
      players: live.map((p) => ({
        id: p.id,
        name: meta.names[p.id] ?? "?",
        chips: p.chips,
        present: p.present,
        ready: p.ready,
        eliminated: p.eliminated,
        activeFromFloor: p.activeFromFloor,
        heroKey: p.heroId,
        door: p.door,
        outcome: p.outcome,
        roundMaxFloor: p.roundMaxFloor,
        nightMaxFloor: p.nightMaxFloor,
      })),
      battles: Object.values(s.battles).map((b) => ({
        key: b.key,
        fighter: b.fighter,
        status: b.status,
        outcome: b.outcome,
        interfered: b.interference !== null,
        interferedBy:
          s.phase === "reveal" ? (b.interference?.from ?? null) : null,
        interferedKind:
          s.phase === "reveal" ? (b.interference?.kind ?? null) : null,
        bets: visibleBets(s.phase, b, player),
      })),
      rankChips: rankByChips(s).map((x) => x.id),
      rankFloor: rankByFloor(s).map((x) => x.id),
      vote: await voteViewOf(d, s, room, player, d.now()),
      coop: await coopViewOf(d, s, room),
      ...readLive(room, `${s.round}:${s.floor}`, d.now()),
    };
  });
}

export async function summaryService(
  d: RoomDeps,
  player: string,
  room: string,
): Promise<SummaryRes> {
  return guarded(async () => {
    await d.store.limit(`roomsummary:${player}`, 20, 60);
    await touch(d, player, room);
    const s = await load(d, room);
    if (s.phase !== "night_summary" && s.phase !== "closed")
      return fail("wrong_phase");
    return d.store.nightSummary(room);
  });
}

// ------------------------------------------------------------- player's run
const thisFloorRow = (rows: FloorRow[], floor: number) =>
  rows.find((r) => r.floor === floor);

/** The player's Run at the start of the room's current floor (see docs/API_SALAS.md). */
async function runAtFloorStart(
  d: RoomDeps,
  s: RoomState,
  room: string,
  player: string,
  rows: FloorRow[],
): Promise<Run> {
  if (s.roundSeed === null || s.round < 1 || s.floor < 1)
    return fail("wrong_phase");
  const prior = rows
    .filter((r) => r.floor < s.floor && r.runAfter)
    .sort((a, b) => b.floor - a.floor)[0];
  let base: Run | undefined = prior?.runAfter ?? undefined;
  if (!base) {
    const saved = rows
      .map((r) => (r.actions as { base?: Run } | null)?.base)
      .find((b): b is Run => !!b);
    base = saved;
  }
  if (!base) {
    const { profile } = await d.loadProfile(player);
    const heroKey = s.players.find((p) => p.id === player)?.heroId ?? null;
    const hero = heroForRound(profile, heroKey, s.mode, s.roundSeed, player);
    base = newRoomRun(s.roundSeed, hero, s.rank);
    await d.store.saveFloorRun(room, s.round, s.floor, player, {
      actions: { base },
    });
  }
  return alignRun(base, s.floor);
}

export async function runViewService(
  d: RoomDeps,
  player: string,
  room: string,
): Promise<RunView> {
  return guarded(async () => {
    await d.store.limit(`roomrun:${player}`, 60, 60);
    await touch(d, player, room);
    const s = await load(d, room);
    if (s.phase === "coop_boss") {
      const { run, node } = await coopRun(d, s, player);
      return {
        run,
        floor: s.floor,
        seed: run.seed,
        doors: [],
        door: null,
        enemyBoost: null,
        engineVersion: ENGINE_VERSION,
        coop: { node },
      };
    }
    const rows = await d.store.floorRows(room, s.round, player);
    const run = await runAtFloorStart(d, s, room, player, rows);
    const b = s.battles[player];
    const boost =
      s.phase === "fighting" && b
        ? await d.store.interferenceOn(room, b.key)
        : null;
    return {
      run,
      floor: s.floor,
      seed: run.seed,
      doors: doorsFor(run.seed, s.floor, null, s.rank),
      door: thisFloorRow(rows, s.floor)?.doorKind ?? null,
      enemyBoost: boost,
      engineVersion: ENGINE_VERSION,
    };
  });
}

// ------------------------------------------------------------------ submit
export const FIGHT_GRACE_MS = 3_000;

export async function submitService(
  d: RoomDeps,
  player: string,
  room: string,
  msg: Extract<ClientMsg, { type: "submit" }>,
): Promise<SubmitRes> {
  return guarded(async () => {
    await d.store.limit(`roomsubmit:${player}`, 30, 60);
    await touch(d, player, room);
    if (msg.engineVersion !== undefined && msg.engineVersion !== ENGINE_VERSION)
      return fail("engine_outdated");
    const s = await load(d, room);
    if (s.phase === "closed") return fail("room_closed");
    if (msg.floor !== s.floor) return fail("wrong_floor");
    const rows = await d.store.floorRows(room, s.round, player);
    const row = thisFloorRow(rows, s.floor);
    const view = (): PhaseView => phaseViewOf(s, d.now());
    if (!row?.doorKind) return fail("not_fighting");
    const fightFloor = isFightDoor(row.doorKind);
    if (row.outcome || (!fightFloor && row.runAfter))
      return {
        ok: true,
        state: view(),
        outcome: row.outcome,
        replayed: true,
        eliminated: row.runAfter?.status === "over",
      };
    if (fightFloor) {
      if (s.phase !== "fighting") return fail("wrong_phase");
      if (!can(s, player, "report_outcome")) return fail("not_fighting");
      if (s.deadline > 0 && d.now() > s.deadline + FIGHT_GRACE_MS)
        return fail("wrong_phase");
    } else if (s.phase !== "betting" && s.phase !== "fighting") {
      return fail("wrong_phase");
    }
    const start = await runAtFloorStart(d, s, room, player, rows);
    if (start.engineVersion !== ENGINE_VERSION) return fail("engine_outdated");
    if (start.status !== "active") return fail("not_active");
    const key = battleKey(s.round, s.floor, player);
    const boost = fightFloor ? await d.store.interferenceOn(room, key) : null;
    const rep = replayFloor(start, msg.actions, {
      kind: row.doorKind,
      boost,
    });
    if (!rep.ok) {
      await d.store.audit(player, "room_floor_rejected", {
        room,
        floor: s.floor,
        reason: rep.reason,
        n: msg.actions.length,
      });
      if (!fightFloor) return fail("invalid_log");
      const run = timeoutRun(start);
      const r = await d.store.submitFloorResult({
        player,
        room,
        floor: s.floor,
        outcome: "timeout",
        actions: [],
        runAfter: run,
        eliminated: run.status === "over",
      });
      return {
        ok: true,
        state: view(),
        outcome: r.outcome,
        replayed: r.replayed,
        eliminated: run.status === "over",
      };
    }
    if (!fightFloor || rep.outcome === null) {
      await d.store.saveFloorRun(room, s.round, s.floor, player, {
        actions: msg.actions,
        runAfter: rep.run,
      });
      return {
        ok: true,
        state: view(),
        outcome: null,
        replayed: false,
        eliminated: false,
      };
    }
    const r = await d.store.submitFloorResult({
      player,
      room,
      floor: s.floor,
      outcome: rep.outcome,
      actions: msg.actions,
      runAfter: rep.run,
      eliminated: rep.eliminated,
    });
    return {
      ok: true,
      state: view(),
      outcome: r.outcome,
      replayed: r.replayed,
      eliminated: rep.eliminated,
    };
  });
}

// ------------------------------------------------------------------ advance
async function timeoutMissing(d: RoomDeps, s: RoomState, room: string) {
  for (const p of s.players) {
    if (!s.battles[p.id] || p.outcome !== null) continue;
    const rows = await d.store.floorRows(room, s.round, p.id);
    const start = await runAtFloorStart(d, s, room, p.id, rows);
    const run = timeoutRun(start);
    await d.store.submitFloorResult({
      player: p.id,
      room,
      floor: s.floor,
      outcome: "timeout",
      actions: [],
      runAfter: run,
      eliminated: run.status === "over",
    });
  }
}

export async function advanceService(
  d: RoomDeps,
  player: string,
  room: string,
  phaseSeq: number,
): Promise<AdvanceRes> {
  return guarded(async () => {
    await d.store.limit(`roomadv:${player}`, 60, 60);
    await touch(d, player, room);
    const now = d.now();
    let s = await load(d, room);
    const stale = (reason: AdvanceRes["reason"]): AdvanceRes => ({
      advanced: false,
      reason,
      state: phaseViewOf(s, now),
    });
    if (s.phase === "closed") return fail("room_closed");
    if (s.phaseSeq !== phaseSeq) return stale("stale");
    const seed = d.randomSeed();
    const coopDone = s.phase === "coop_boss" && (await coopAllDone(d, s, room));
    let r = modelAdvance(s, now, phaseSeq, { seed, coopDone });
    if (!r.ok) return fail(r.error as "room_closed");
    if (!r.advanced) return stale(r.reason as AdvanceRes["reason"]);
    if (s.phase === "fighting") {
      await timeoutMissing(d, s, room);
      s = await load(d, room);
      if (s.phaseSeq !== phaseSeq) return stale("stale");
      r = modelAdvance(s, now, phaseSeq, { seed });
      if (!r.ok) return fail(r.error as "room_closed");
      if (!r.advanced) return stale(r.reason as AdvanceRes["reason"]);
    }
    await resolveFloorVote(d, s, room);
    const n = r.state;
    const seedNow = s.roundSeed ?? 0;
    const res = await d.store.advance({
      room,
      expectedSeq: phaseSeq,
      toPhase: n.phase,
      deadlineMs: n.deadline,
      nowMs: now,
      early: s.deadline > 0 && now < s.deadline,
      round: n.round,
      floor: n.floor,
      seed: n.phase === "round_setup" ? n.roundSeed : null,
      fighters:
        n.phase === "betting"
          ? Object.values(n.battles).map((b) => {
              const kind = n.players.find((p) => p.id === b.fighter)?.door;
              if (!kind || !isFightDoor(kind)) return fail("invalid_args");
              return {
                player: b.fighter,
                door_kind: kind,
                fight_seed: enemyFor(
                  seedNow,
                  n.floor,
                  kind as "easy",
                  null,
                  n.rank,
                ).battleSeed,
              };
            })
          : null,
      keepFighters:
        n.phase === "fighting"
          ? Object.values(n.battles)
              .filter((b) => b.status === "locked")
              .map((b) => b.fighter)
          : null,
    });
    const fresh = await load(d, room);
    if (res.advanced) await publish(d, room, fresh);
    return {
      advanced: res.advanced,
      reason: res.advanced ? undefined : (res.reason as AdvanceRes["reason"]),
      state: phaseViewOf(fresh, now),
    };
  });
}

// ------------------------------------------------------------------ actions
const LIMITS: Partial<Record<ClientMsg["type"], [number, number]>> = {
  heartbeat: [40, 60],
  live: [200, 60],
  emote: [40, 60],
  advance: [60, 60],
  submit: [30, 60],
  bet: [30, 60],
  interfere: [20, 60],
  vote: [20, 60],
};

export async function roomAction(
  d: RoomDeps,
  player: string,
  room: string,
  msg: ClientMsg,
): Promise<Record<string, unknown>> {
  if (msg.room !== room) throw E.badInput();
  if (msg.type === "advance")
    return advanceService(d, player, room, msg.phaseSeq);
  if (msg.type === "submit") return submitService(d, player, room, msg);
  if (msg.type === "coop_submit")
    return coopSubmitService(d, player, room, msg);
  return guarded(async () => {
    const [max, win] = LIMITS[msg.type] ?? [120, 60];
    await d.store.limit(`roomact:${msg.type}:${player}`, max, win);
    const st = d.store;
    if (msg.type === "heartbeat") {
      await touch(d, player, room, msg.present);
      return { ok: true, state: phaseViewOf(await load(d, room), d.now()) };
    }
    await touch(d, player, room);
    const now = d.now();
    if (msg.type === "emote") {
      addEmote(room, { from: player, id: msg.id, at: now }, EMOTE_MIN_GAP_MS);
      return { ok: true, state: phaseViewOf(await load(d, room), now) };
    }
    if (msg.type === "live") {
      const s = await load(d, room);
      // only an active fighter may report, and only while fighting
      if (s.phase === "fighting" && s.battles[player]?.status === "locked") {
        const { n, actor, kind, dmg, pHp, eHp } = msg;
        const t = { fighter: player, n, actor, kind, dmg, pHp, eHp };
        setLive(room, `${s.round}:${s.floor}`, t, now);
      }
      return { ok: true, state: phaseViewOf(s, now) };
    }
    let publishAfter = false;
    let extra: Record<string, unknown> = {};
    switch (msg.type) {
      case "leave":
        await st.leaveRoom(player, room);
        publishAfter = true;
        break;
      case "start_round": {
        // A player who joined after the host picked the rank may not have it.
        const s = await load(d, room);
        if (s.rank !== "f") await assertUnlocked(d, voters(s), s.rank);
        await st.startRound(player, room, d.randomSeed(), now);
        publishAfter = true;
        break;
      }
      case "door": {
        const s = await load(d, room);
        if (s.roundSeed === null || msg.floor !== s.floor)
          return fail("wrong_floor");
        if (
          !doorsFor(s.roundSeed, s.floor, null, s.rank).some(
            (x) => x.kind === msg.door,
          )
        )
          return fail("invalid_door");
        const r = await st.chooseDoor(player, room, msg.floor, msg.door);
        extra = { door: r.door, replayed: r.replayed };
        break;
      }
      case "bet": {
        const s = await load(d, room);
        if (s.phase !== "betting") return fail("wrong_phase");
        const me = s.players.find((p) => p.id === player);
        const b = s.battles[msg.fighter];
        if (!me || me.left) return fail("not_member");
        if (!b) return fail("battle_not_found");
        const bad = validateBet(msg.stake, me.chips, msg.fighter === player);
        if (bad) return fail(bad as "self_bet");
        if (b.status !== "open") return fail("battle_locked");
        extra = await st.placeBet(
          room,
          player,
          b.key,
          msg.prediction,
          msg.stake,
        );
        break;
      }
      case "interfere": {
        const s = await load(d, room);
        if (s.phase !== "betting") return fail("wrong_phase");
        const b = s.battles[msg.fighter];
        if (!b) return fail("battle_not_found");
        if (msg.fighter === player) return fail("self_interfere");
        if (b.status !== "open") return fail("battle_locked");
        extra = await st.placeInterference(room, player, b.key, msg.kind);
        break;
      }
      case "vote": {
        const s = await load(d, room);
        if (s.phase !== "reveal" || !hasVote(s.floor))
          return fail("wrong_phase");
        if (msg.floor !== s.floor) return fail("wrong_floor");
        if (now >= voteClosesAt(s.deadline)) return fail("wrong_phase");
        await st.castVote(player, room, msg.floor, msg.yes);
        break;
      }
      case "hero": {
        if (msg.heroId !== DEFAULT_HERO) {
          const { profile } = await d.loadProfile(player);
          if (!profile.characters.some((c) => c.id === msg.heroId))
            return fail("hero_not_owned");
        }
        await st.chooseHero(player, room, msg.heroId);
        break;
      }
      case "ready":
        await st.setReady(player, room, msg.ready);
        break;
      case "set_mode":
        await st.setMode(player, room, msg.mode);
        break;
      case "set_rank": {
        const s = await load(d, room);
        await assertUnlocked(d, voters(s), msg.rank);
        await st.setRank(player, room, msg.rank);
        break;
      }
      case "set_turn_seconds":
        await st.setTurnSeconds(player, room, msg.seconds);
        break;
      case "kick":
        await st.kick(player, room, msg.target);
        await st.audit(player, "room_kick", { room, target: msg.target });
        break;
      case "transfer_host":
        await st.transferHost(player, room, msg.to);
        break;
      case "close":
        await st.closeRoom(player, room);
        publishAfter = true;
        break;
      case "end_night":
      case "start_coop": {
        const s = await load(d, room);
        const r =
          msg.type === "end_night"
            ? endNight(s, player, now)
            : startCoop(s, player, now);
        if (!r.ok) return fail(r.error as "forbidden");
        await st.advance({
          room,
          expectedSeq: s.phaseSeq,
          toPhase: r.state.phase,
          deadlineMs: r.state.deadline,
          nowMs: now,
          early: true,
          round: s.round,
          floor: s.floor,
          seed: null,
          fighters: null,
          keepFighters: null,
        });
        publishAfter = true;
        break;
      }
    }
    const fresh = await load(d, room);
    if (publishAfter) await publish(d, room, fresh);
    return { ok: true, state: phaseViewOf(fresh, now), ...extra };
  });
}
