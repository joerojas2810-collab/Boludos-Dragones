import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import {
  effectiveFloor,
  ROOM_K,
  type Battle,
  type DoorKind,
  type FightOutcome,
  type InterfereKind,
  type Phase,
  type RoomMode,
  type RoomPlayer,
} from "../game/room";
import type { Climb } from "../game/floorFights";
import type { SummaryRes } from "../rooms/api";
import { env } from "./env";
import { audit, call, limit, RpcError } from "./rpc";
import { loadMe } from "./services";
import { adminClient } from "./supabase";
import type { RarityId } from "../game/rarity";
import type { FloorRow, RoomDeps, RoomMeta, RoomStore } from "./roomsStore";

type Obj = Record<string, unknown>;
const ms = (t: unknown): number => (typeof t === "string" ? Date.parse(t) : 0);
const iso = (n: number) => new Date(n).toISOString();

interface RoomRow {
  host_id: string;
  turn_seconds: number;
  status: string;
}
interface StateRow {
  mode: RoomMode;
  rank: RarityId;
  phase: Phase;
  phase_seq: number;
  round: number;
  floor: number;
  round_seed: number | null;
  deadline: string | null;
  round_started_at: string | null;
  night_started_at: string | null;
}
interface PlayerRow {
  player_id: string;
  chips: number;
  joined_at: string;
  left_at: string | null;
  present: boolean;
  last_seen_at: string;
  ready: boolean;
  eliminated: boolean;
  active_from_floor: number;
  hero_key: string | null;
}
interface FloorDb {
  round: number;
  floor: number;
  player_id: string;
  door_kind: DoorKind | null;
  status: FloorRow["status"];
  outcome: FightOutcome | null;
  actions?: unknown;
  run_after?: Climb | null;
}
interface BattleDb {
  battle_key: string;
  fighter_id: string;
  status: Battle["status"];
  outcome: Battle["outcome"];
  void_reason: Battle["voidReason"];
}

function rows<T>(r: { data: unknown; error: { message: string } | null }): T[] {
  if (r.error) throw new Error("db_read");
  return (r.data ?? []) as T[];
}

export function realRoomStore(): RoomStore {
  const sb = adminClient();
  const rpc = (name: string, args: Obj) => sb.rpc(name, args);
  const c = <T = Obj>(name: string, args: Obj) => call<T>(rpc, name, args);

  return {
    limit: (k, max, win) => limit(rpc, k, max, win),
    audit: (a, e, d) => audit(rpc, a, e, d) as Promise<void>,

    async createRoom(player, code) {
      const r = await c("create_room", { p_player: player, p_code: code });
      return {
        roomId: r.room_id as string,
        code: r.code as string,
        expiresAt: r.expiresAt as string,
      };
    },
    async joinRoom(player, code) {
      const r = await c("join_room", { p_player: player, p_code: code });
      return r.ok
        ? {
            ok: true as const,
            roomId: r.room_id as string,
            code: r.code as string,
            hostId: r.host_id as string,
          }
        : { ok: false as const, error: String(r.error) };
    },
    async leaveRoom(p, room) {
      await c("leave_room", { p_player: p, p_room: room });
    },
    async closeRoom(p, room) {
      await c("close_room", { p_player: p, p_room: room });
    },
    async kick(host, room, target) {
      await c("kick_player", { p_host: host, p_room: room, p_target: target });
    },
    async transferHost(host, room, to) {
      await c("transfer_host", { p_host: host, p_room: room, p_to: to });
    },
    async setMode(p, room, mode) {
      await c("set_room_mode", { p_player: p, p_room: room, p_mode: mode });
    },
    async setRank(p, room, rank) {
      await c("set_room_rank", { p_player: p, p_room: room, p_rank: rank });
    },
    async setTurnSeconds(p, room, secs) {
      await c("set_turn_seconds", {
        p_player: p,
        p_room: room,
        p_seconds: secs,
      });
    },
    async chooseHero(p, room, key) {
      await c("choose_hero", { p_player: p, p_room: room, p_hero_key: key });
    },
    async setReady(p, room, ready) {
      await c("set_ready", { p_player: p, p_room: room, p_ready: ready });
    },
    async startRound(p, room, seed, nowMs) {
      await c("start_round", {
        p_player: p,
        p_room: room,
        p_seed: seed,
        p_now: iso(nowMs),
      });
    },
    async advance(a) {
      const r = await c("advance_phase", {
        p_room: a.room,
        p_expected_seq: a.expectedSeq,
        p_to_phase: a.toPhase,
        p_deadline: a.deadlineMs > 0 ? iso(a.deadlineMs) : null,
        p_now: iso(a.nowMs),
        p_early: a.early,
        p_round: a.round,
        p_floor: a.floor,
        p_seed: a.seed,
        p_fighters: a.fighters ?? a.keepFighters,
      });
      return {
        advanced: r.advanced === true,
        reason: typeof r.reason === "string" ? r.reason : undefined,
      };
    },
    async chooseDoor(p, room, floor, door) {
      const r = await c("choose_door", {
        p_player: p,
        p_room: room,
        p_floor: floor,
        p_door_kind: door,
      });
      return { door: r.door_kind as DoorKind, replayed: r.replayed === true };
    },
    async submitFloorResult(a) {
      const r = await c("submit_floor_result", {
        p_player: a.player,
        p_room: a.room,
        p_floor: a.floor,
        p_outcome: a.outcome,
        p_actions: a.actions,
        p_run_after: a.runAfter,
        p_eliminated: a.eliminated,
      });
      return {
        outcome: r.outcome as FightOutcome,
        replayed: r.replayed === true,
      };
    },
    async placeBet(room, bettor, key, prediction, stake) {
      const r = await c("place_bet", {
        p_room: room,
        p_bettor: bettor,
        p_battle_key: key,
        p_prediction: prediction,
        p_stake: stake,
      });
      return { chips: Number(r.chips) };
    },
    async placeInterference(room, from, key, kind) {
      const r = await c("place_interference", {
        p_room: room,
        p_from: from,
        p_battle_key: key,
        p_kind: kind,
      });
      return { chips: Number(r.chips) };
    },
    async castVote(player, room, floor, yes) {
      await c("cast_vote", {
        p_player: player,
        p_room: room,
        p_floor: floor,
        p_yes: yes,
      });
    },
    async resolveVote(room, round, floor, opened, delta) {
      const r = await c("resolve_vote", {
        p_room: room,
        p_round: round,
        p_floor: floor,
        p_opened: opened,
        p_delta: delta,
      });
      return { opened: r.opened === true, delta: Number(r.delta) };
    },
    async loadVote(room, round, floor) {
      const vs = rows<{ player_id: string; yes: boolean }>(
        await sb
          .from("room_votes")
          .select("player_id, yes")
          .eq("room_id", room)
          .eq("round", round)
          .eq("floor", floor),
      );
      const [res] = rows<{ opened: boolean; delta: number }>(
        await sb
          .from("room_vote_results")
          .select("opened, delta")
          .eq("room_id", room)
          .eq("round", round)
          .eq("floor", floor)
          .limit(1),
      );
      return {
        votes: Object.fromEntries(vs.map((v) => [v.player_id, v.yes])),
        result: res ? { opened: res.opened, delta: Number(res.delta) } : null,
      };
    },
    async markPresence(player, room, present) {
      await c("mark_presence", {
        p_player: player,
        p_room: room,
        p_present: present,
      });
    },
    async sweepPresence(room, nowMs) {
      await c("sweep_presence", { p_room: room, p_now: iso(nowMs) });
    },
    async nightSummary(room) {
      return (await c("night_summary", {
        p_room: room,
      })) as unknown as SummaryRes;
    },

    async loadMeta(room): Promise<RoomMeta> {
      const rp = rows<{ player_id: string }>(
        await sb.from("room_players").select("player_id").eq("room_id", room),
      );
      const r = rows<{ code: string }>(
        await sb.from("rooms").select("code").eq("id", room).limit(1),
      );
      if (!r[0]) throw new RpcError("room_not_found");
      const ids = rp.map((x) => x.player_id);
      const pl = rows<{ id: string; name: string }>(
        await sb.from("players").select("id, name").in("id", ids),
      );
      return {
        code: r[0].code,
        names: Object.fromEntries(pl.map((x) => [x.id, x.name])),
      };
    },

    async loadState(room) {
      const [rm] = rows<RoomRow>(
        await sb
          .from("rooms")
          .select("host_id, turn_seconds, status")
          .eq("id", room)
          .limit(1),
      );
      const [st] = rows<StateRow>(
        await sb.from("room_state").select("*").eq("room_id", room).limit(1),
      );
      if (!rm || !st) return null;
      const pls = rows<PlayerRow>(
        await sb
          .from("room_players")
          .select("*")
          .eq("room_id", room)
          .order("joined_at"),
      );
      const fl = rows<FloorDb>(
        await sb
          .from("room_floor")
          .select("round, floor, player_id, door_kind, status, outcome")
          .eq("room_id", room),
      );
      const prefix = `r${st.round}f${st.floor}:`;
      const bts = rows<BattleDb>(
        await sb
          .from("room_battles")
          .select("battle_key, fighter_id, status, outcome, void_reason")
          .eq("room_id", room)
          .like("battle_key", `${prefix}%`),
      );
      const bets = rows<{
        battle_key: string;
        bettor_id: string;
        prediction: "win" | "lose";
        stake: number;
      }>(
        await sb
          .from("bets")
          .select("battle_key, bettor_id, prediction, stake")
          .eq("room_id", room)
          .like("battle_key", `${prefix}%`),
      );
      const itf = rows<{
        battle_key: string;
        from_player: string;
        kind: InterfereKind;
        cost: number;
      }>(
        await sb
          .from("interferences")
          .select("battle_key, from_player, kind, cost")
          .eq("room_id", room)
          .like("battle_key", `${prefix}%`),
      );
      const led = rows<{ delta: number; reason: string }>(
        await sb
          .from("chip_ledger")
          .select("delta, reason")
          .eq("room_id", room),
      );
      const sum = (f: (r: { delta: number; reason: string }) => boolean) =>
        led.filter(f).reduce((a, r) => a + r.delta, 0);

      const players: RoomPlayer[] = pls.map((p) => {
        const mine = fl.filter((f) => f.player_id === p.player_id);
        const cur = mine.find(
          (f) => f.round === st.round && f.floor === st.floor,
        );
        const won = (f: FloorDb) => f.outcome === "won";
        const lostRound = mine.filter(
          (f) =>
            f.round === st.round &&
            (f.outcome === "lost" || f.outcome === "timeout"),
        ).length;
        return {
          id: p.player_id,
          joinedAt: ms(p.joined_at),
          left: p.left_at !== null,
          present: p.present,
          absentSince: p.present ? null : ms(p.last_seen_at),
          chips: p.chips,
          lives: Math.max(0, ROOM_K.lives - lostRound),
          eliminated: p.eliminated,
          heroId: p.hero_key,
          ready: p.ready,
          activeFromFloor: p.active_from_floor,
          roundMaxFloor: Math.max(
            0,
            ...mine
              .filter((f) => won(f) && f.round === st.round)
              .map((f) => f.floor),
          ),
          nightMaxFloor: Math.max(
            0,
            ...mine.filter(won).map((f) => effectiveFloor(f.round, f.floor)),
          ),
          door: cur?.door_kind ?? null,
          outcome:
            cur?.outcome ?? (cur?.status === "skipped" ? "skipped" : null),
          // ponytail: not persisted; a missed turn counts as timeout instead of 2-miss flee
          missedTurns: 0,
        };
      });

      const battles: Record<string, Battle> = {};
      for (const b of bts)
        battles[b.fighter_id] = {
          key: b.battle_key,
          fighter: b.fighter_id,
          bets: bets
            .filter((x) => x.battle_key === b.battle_key)
            .map((x) => ({
              bettor: x.bettor_id,
              prediction: x.prediction,
              stake: x.stake,
            })),
          interference:
            itf
              .filter((x) => x.battle_key === b.battle_key)
              .map((x) => ({
                from: x.from_player,
                kind: x.kind,
                cost: x.cost,
              }))[0] ?? null,
          status: b.status,
          outcome: b.outcome,
          voidReason: b.void_reason,
        };

      return {
        phase: st.phase,
        phaseSeq: st.phase_seq,
        round: st.round,
        floor: st.floor,
        deadline: ms(st.deadline),
        mode: st.mode,
        rank: st.rank ?? "f",
        turnSeconds: rm.turn_seconds,
        hostId: rm.host_id,
        players,
        battles,
        roundSeed: st.round_seed === null ? null : Number(st.round_seed),
        roundStartedAt: ms(st.round_started_at),
        nightStartedAt: ms(st.night_started_at),
        totals: {
          issued: sum(
            (r) => r.reason === "initial" || r.reason === "night_start",
          ),
          interfereSpent: -sum(
            (r) => r.reason === "interfere" || r.reason === "interfere_refund",
          ),
          comp: sum((r) => r.reason === "interfere_comp"),
          dust: 0,
        },
      };
    },

    async floorRows(room, round, player) {
      return rows<FloorDb>(
        await sb
          .from("room_floor")
          .select(
            "round, floor, player_id, door_kind, status, outcome, actions, run_after",
          )
          .eq("room_id", room)
          .eq("round", round)
          .eq("player_id", player),
      ).map((f) => ({
        round: f.round,
        floor: f.floor,
        playerId: f.player_id,
        doorKind: f.door_kind,
        status: f.status,
        outcome: f.outcome,
        actions: f.actions ?? null,
        runAfter: f.run_after ?? null,
      }));
    },

    async saveFloorRun(room, round, floor, player, patch) {
      const upd: Obj = {};
      if (patch.actions !== undefined) upd.actions = patch.actions;
      if (patch.runAfter !== undefined) upd.run_after = patch.runAfter;
      if (!Object.keys(upd).length) return;
      const r = await sb
        .from("room_floor")
        .update(upd)
        .eq("room_id", room)
        .eq("round", round)
        .eq("floor", floor)
        .eq("player_id", player);
      if (r.error) throw new Error("db_write");
    },

    async loadCoop(room) {
      return rows<{
        player_id: string;
        damage: number;
        finished: boolean;
        paid: boolean;
      }>(
        await sb
          .from("room_coop")
          .select("player_id, damage, finished, paid")
          .eq("room_id", room),
      ).map((r) => ({
        playerId: r.player_id,
        damage: r.damage,
        finished: r.finished,
        paid: r.paid,
      }));
    },

    async payCoop(room, rows) {
      await c("coop_pay", { p_room: room, p_rows: rows });
    },

    async saveCoop(room, player, row) {
      const [old] = rows<{ damage: number }>(
        await sb
          .from("room_coop")
          .select("damage")
          .eq("room_id", room)
          .eq("player_id", player)
          .limit(1),
      );
      if (old && old.damage > row.damage) return;
      const r = await sb.from("room_coop").upsert({
        room_id: room,
        player_id: player,
        damage: row.damage,
        finished: row.finished,
        actions: row.actions,
        updated_at: iso(Date.now()),
      });
      if (r.error) throw new Error("db_write");
    },

    async interferenceOn(room, key) {
      const [r] = rows<{ kind: InterfereKind }>(
        await sb
          .from("interferences")
          .select("kind")
          .eq("room_id", room)
          .eq("battle_key", key)
          .limit(1),
      );
      return r?.kind ?? null;
    },
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function realRoomDeps(): RoomDeps {
  const sb = adminClient();
  return {
    store: realRoomStore(),
    async broadcast(room, events) {
      const e = env();
      const res = await fetch(
        `${e.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
        {
          method: "POST",
          headers: {
            apikey: e.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: events.map((p) => ({
              topic: `room:${room}`,
              event: String(p.type),
              payload: p,
              private: true,
            })),
          }),
        },
      );
      if (!res.ok) throw new Error("broadcast_failed");
    },
    async loadProfile(player) {
      const me = await loadMe(
        (n: string, a: Record<string, unknown>) => sb.rpc(n, a),
        player,
      );
      return { profile: me.profile, name: me.name };
    },
    randomSeed: () => randomBytes(4).readUInt32BE(0),
    randomCode: () =>
      Array.from({ length: 4 }, () => LETTERS[randomInt(26)]).join(""),
    now: () => Date.now(),
  };
}
