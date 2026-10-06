// RoomClient backed by the real server (docs/API_SALAS.md): fetch + polling of
// GET /api/rooms/{id}. Realtime needs a Supabase browser session that the
// server-side login does not give us, so the snapshot poll is the transport
// (the contract says the snapshot is the source of truth anyway).
// Fight HP and emotes ride on the snapshot (server keeps them in memory).
import { computeAwards } from "../game/awards";
import { interfereCostFor } from "../game/room";
import { doorsFor } from "../game/run";
import type { RunAction } from "../game/replay";
import type {
  BetPrediction,
  DoorKind,
  FightOutcome,
  InterfereKind,
  RoomMode,
} from "../game/room";
import { MSG_VERSION } from "../rooms/messages";
import {
  type RoomSnapshot,
  type RunView,
  type SummaryRes,
} from "../rooms/api";
import type {
  Award,
  BattleView,
  EmoteId,
  FloorRun,
  HeroSummary,
  PlayerView,
  Res,
  RoomClient,
  RoomEvent,
  RoomView,
  TurnInfo,
} from "./types";

const POLL_MS = 2_000;
const IDLE_POLL_MS = 5_000;
const HIDDEN_POLL_MS = 15_000; // background tab: poll rarely to spare server quota
const ID_RE = /^[0-9a-f-]{36}$/i;

interface ApiErr {
  error?: { code?: string };
}

/** Typed fetch: parsed JSON or { ok:false, error } (never throws). */
async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const j: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: j as T };
    return { ok: false, error: (j as ApiErr | null)?.error?.code ?? "server_error" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Creates a room (POST /api/rooms) -> room code. */
export async function createRoom(
  mode: RoomMode,
  turnSeconds: number,
): Promise<Res<{ code: string }>> {
  const r = await call<{ code: string }>("POST", "/api/rooms", {
    v: MSG_VERSION,
    type: "create",
    mode,
    turnSeconds,
  });
  return r.ok ? { ok: true, code: r.data.code } : r;
}

/** Joins by 4-letter code (POST /api/rooms/join) -> room id (re-entry allowed). */
export async function joinRoom(
  code: string,
): Promise<Res<{ roomId: string; code: string }>> {
  const r = await call<{ roomId: string; code: string }>(
    "POST",
    "/api/rooms/join",
    { v: MSG_VERSION, type: "join", code },
  );
  return r.ok ? { ok: true, ...r.data } : r;
}

export interface RemoteOpts {
  roomId: string;
  /** Hero card for a heroKey (own collection only; others stay anonymous). */
  heroOf: (heroKey: string | null) => HeroSummary | null;
}

export class RemoteRoomClient implements RoomClient {
  readonly kind = "remote" as const;
  private view: RoomView | null = null;
  private viewCbs = new Set<(v: RoomView | null) => void>();
  private evCbs = new Set<(e: RoomEvent) => void>();
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private skew = 0; // server clock - client clock
  private seed: { round: number; value: number } | null = null;
  private awards: { phase: string; list: Award[] } | null = null;
  private summarizing = false;
  private seenTurn = new Map<string, number>(); // fighter -> last n emitted
  private seenEmote = 0;
  private lastLive = 0;

  constructor(private o: RemoteOpts) {
    if (!ID_RE.test(o.roomId)) throw new Error("bad room id");
    void this.poll();
  }

  // ------------------------------------------------------------ polling
  private schedule(ms: number) {
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!this.disposed)
      this.timer = setTimeout(
        () => void this.poll(),
        hidden ? Math.max(ms, HIDDEN_POLL_MS) : ms,
      );
  }
  private async poll() {
    const r = await call<RoomSnapshot>("GET", `/api/rooms/${this.o.roomId}`);
    if (this.disposed) return;
    if (!r.ok) {
      if (["not_member", "room_not_found", "forbidden"].includes(r.error))
        return this.emit({ type: "kicked" });
      this.failures += 1;
      if (this.view && this.failures >= 2)
        this.publish({ ...this.view, connection: "reconnecting" });
      return this.schedule(IDLE_POLL_MS);
    }
    this.failures = 0;
    const s = r.data;
    this.skew = s.state.serverNowMs - Date.now();
    if (s.state.phase === "closed") this.emit({ type: "closed" });
    await this.sideLoads(s);
    this.publish(this.build(s));
    this.emitExtras(s);
    this.schedule(
      s.state.phase === "lobby" || s.state.phase === "night_summary"
        ? IDLE_POLL_MS
        : POLL_MS,
    );
  }

  /** Round seed (for the doors) and the night summary (for the awards). */
  private async sideLoads(s: RoomSnapshot) {
    const st = s.state;
    if (
      ["doors", "betting", "fighting", "reveal"].includes(st.phase) &&
      this.seed?.round !== st.round
    ) {
      const g = await call<RunView>("GET", `/api/rooms/${this.o.roomId}/run`);
      if (g.ok) this.seed = { round: st.round, value: g.data.seed };
    }
    if (
      (st.phase === "night_summary" || st.phase === "closed") &&
      this.awards?.phase !== st.phase &&
      !this.summarizing
    ) {
      this.summarizing = true;
      const g = await call<SummaryRes>("GET", `/api/rooms/${this.o.roomId}/summary`);
      this.summarizing = false;
      if (g.ok) this.awards = { phase: st.phase, list: toAwards(g.data) };
    }
  }

  /** Turns snapshot live/emotes into the same events Realtime used to carry. */
  private emitExtras(s: RoomSnapshot) {
    for (const t of s.live) {
      if (this.seenTurn.get(t.fighter) === t.n) continue;
      this.seenTurn.set(t.fighter, t.n);
      if (t.fighter !== s.you) this.emit({ type: "turn", msg: t });
    }
    for (const e of s.emotes) {
      if (e.at <= this.seenEmote) continue;
      this.seenEmote = e.at;
      this.emit({ type: "emote", from: e.from, id: e.id as EmoteId });
    }
  }

  private build(s: RoomSnapshot): RoomView {
    const st = s.state;
    const fighters = new Set(s.battles.map((b) => b.fighter));
    const players: PlayerView[] = s.players.map((p) => ({
      id: p.id,
      name: p.name,
      hero: this.o.heroOf(p.heroKey),
      heroId: p.heroKey,
      chips: p.chips,
      lives: 0, // not in the snapshot
      eliminated: p.eliminated,
      present: p.present,
      ready: p.ready,
      isHost: p.id === st.hostId,
      activeFromFloor: p.activeFromFloor,
      roundMaxFloor: p.roundMaxFloor,
      nightMaxFloor: p.nightMaxFloor,
      doorChosen: p.door !== null,
      door: p.door,
      outcome: p.outcome,
      fights: fighters.has(p.id),
    }));
    const battles: Record<string, BattleView> = {};
    for (const b of s.battles)
      battles[b.fighter] = {
        fighter: b.fighter,
        bets: b.bets,
        status: b.status,
        outcome: b.outcome,
        voidReason: null,
        interferedByMe: null,
        interfered: b.interfered,
        interferenceFrom: b.interferedBy,
      };
    return {
      code: s.code,
      me: s.you,
      mode: st.mode,
      turnSeconds: st.turnSeconds,
      phase: st.phase,
      phaseSeq: st.phaseSeq,
      round: st.round,
      floor: st.floor,
      deadline: st.deadlineMs > 0 ? st.deadlineMs - this.skew : 0,
      seed: this.seed?.round === st.round ? this.seed.value : null,
      hostId: st.hostId,
      players,
      battles,
      awards: this.awards?.list ?? null,
      interfereCost: interfereCostFor(
        Object.fromEntries(players.map((p) => [p.id, p.chips])),
        s.you,
      ),
      vote: s.vote ?? null,
      connection: "online",
    };
  }

  private publish(v: RoomView) {
    this.view = v;
    this.viewCbs.forEach((cb) => cb(v));
  }
  private emit(e: RoomEvent) {
    this.evCbs.forEach((cb) => cb(e));
  }

  // ------------------------------------------------------------ actions
  private async act(
    type: string,
    extra: Record<string, unknown> = {},
  ): Promise<Res> {
    const r = await call("POST", `/api/rooms/${this.o.roomId}/${type}`, {
      v: MSG_VERSION,
      type,
      room: this.o.roomId,
      ...extra,
    });
    if (r.ok) {
      if (this.timer) clearTimeout(this.timer);
      void this.poll(); // reflect my own action right away
      return { ok: true };
    }
    return r;
  }

  getView = () => this.view;
  subscribe(cb: (v: RoomView | null) => void) {
    this.viewCbs.add(cb);
    cb(this.view);
    return () => void this.viewCbs.delete(cb);
  }
  onEvent(cb: (e: RoomEvent) => void) {
    this.evCbs.add(cb);
    return () => void this.evCbs.delete(cb);
  }
  hero = (heroId: string) => this.act("hero", { heroId });
  ready = (ready: boolean) => this.act("ready", { ready });
  setMode = (mode: RoomMode) => this.act("set_mode", { mode });
  setTurnSeconds = (seconds: number) => this.act("set_turn_seconds", { seconds });
  startRound = () => this.act("start_round");
  advance = (phaseSeq: number) => this.act("advance", { phaseSeq });
  door = (floor: number, door: DoorKind) => this.act("door", { floor, door });
  bet = (fighter: string, prediction: BetPrediction, stake: number) =>
    this.act("bet", { fighter, prediction, stake });
  interfere = (fighter: string, kind: InterfereKind) =>
    this.act("interfere", { fighter, kind });
  vote = (floor: number, yes: boolean) => this.act("vote", { floor, yes });
  kick = (target: string) => this.act("kick", { target });
  transferHost = (to: string) => this.act("transfer_host", { to });
  endNight = () => this.act("end_night");
  close = () => this.act("close");
  leave = () => this.act("leave");

  async getRun(): Promise<Res<{ floorRun: FloorRun }>> {
    const r = await call<RunView>("GET", `/api/rooms/${this.o.roomId}/run`);
    if (!r.ok) return r;
    const d = r.data;
    return {
      ok: true,
      floorRun: {
        run: d.run,
        floor: d.floor,
        seed: d.seed,
        door: d.door,
        enemyBoost: d.enemyBoost,
      },
    };
  }

  async submit(
    floor: number,
    actions: RunAction[],
  ): Promise<Res<{ outcome: FightOutcome | null; eliminated: boolean }>> {
    const r = await call<{ outcome: FightOutcome | null; eliminated: boolean }>(
      "POST",
      `/api/rooms/${this.o.roomId}/submit`,
      { v: MSG_VERSION, type: "submit", room: this.o.roomId, floor, actions },
    );
    if (!r.ok) return r;
    if (this.timer) clearTimeout(this.timer);
    void this.poll();
    return { ok: true, outcome: r.data.outcome, eliminated: r.data.eliminated };
  }

  // Fire-and-forget extras (throttled; failures are harmless).
  turn(msg: Omit<TurnInfo, "fighter">) {
    const t = Date.now();
    if (t - this.lastLive < 1_000 && msg.pHp > 0 && msg.eHp > 0) return;
    this.lastLive = t;
    void call("POST", `/api/rooms/${this.o.roomId}/live`, {
      v: MSG_VERSION,
      type: "live",
      room: this.o.roomId,
      ...msg,
    });
  }
  emote(id: EmoteId) {
    void call("POST", `/api/rooms/${this.o.roomId}/emote`, {
      v: MSG_VERSION,
      type: "emote",
      room: this.o.roomId,
      id,
    });
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.viewCbs.clear();
    this.evCbs.clear();
  }
}

function toAwards(s: SummaryRes): Award[] {
  return computeAwards(
    s.players.map((p) => ({
      id: p.player_id,
      chips: p.chips,
      maxFloor: p.max_floor,
      wins: p.wins,
      losses: p.losses,
      betNet: p.bet_net,
      interferences: p.interferences,
    })),
  );
}

/** Door index inside the floor's door list (what the floor log's `door` action needs). */
export const doorIndex = (seed: number, floor: number, kind: DoorKind) =>
  doorsFor(seed, floor).findIndex((d) => d.kind === kind);
