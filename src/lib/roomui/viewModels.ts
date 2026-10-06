// Pure helpers behind the room screens (no React): banner texts, countdown,
// ranking order, bet validation messages, settlement summary, phase completion.
import {
  ROOM_K,
  isBossFloor,
  settlePool,
  validateBet,
  type DoorKind,
  type Phase,
} from "../game/room";
import { worldOf } from "../game/worlds";
import type { PlayerView, RoomView } from "./types";

const ERRORS: Record<string, string> = {
  wrong_phase: "Ahora no se puede hacer eso.",
  forbidden: "Solo el anfitrión puede hacerlo.",
  not_member: "No estás en esta sala.",
  room_full: "La sala está llena (máximo 7).",
  room_closed: "La sala está cerrada.",
  not_enough_players: "Hacen falta al menos 2 jugadores conectados.",
  invalid_args: "Datos inválidos.",
  door_locked: "Ya elegiste tu puerta.",
  not_active: "No puedes hacerlo en este piso.",
  battle_not_found: "Esa pelea ya no admite apuestas.",
  self_bet: "No puedes apostar sobre ti mismo.",
  self_interfere: "No puedes interferirte a ti mismo.",
  stake_too_low: `La apuesta mínima es ${ROOM_K.minBet} fichas.`,
  insufficient_chips: "No te alcanzan las fichas.",
  duplicate_bet: "Ya apostaste en esta pelea.",
  already_interfered: "Esa pelea ya fue interferida.",
  seed_required: "Falta la semilla de la ronda.",
  coop_disabled: "El jefe cooperativo todavía no está disponible.",
  max_rounds: "La noche ya llegó a su límite de rondas.",
  network: "Sin conexión con el servidor. Reintenta.",
};
export const errorText = (code: string) =>
  ERRORS[code] ?? "No se pudo completar la acción.";

/** m:ss, never negative; "—" when there is no deadline. Fixed width digits. */
export function formatCountdown(ms: number | null): string {
  if (ms === null) return "—:——";
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const msLeft = (deadline: number, now: number) =>
  deadline > 0 ? Math.max(0, deadline - now) : null;

/** Phase length used for the progress bar (ms); 0 = no bar. */
export function phaseTotalMs(phase: Phase, floor: number): number {
  switch (phase) {
    case "round_setup":
      return ROOM_K.setupMs;
    case "floor_intro":
      return ROOM_K.introMs;
    case "doors":
      return ROOM_K.doorsMs;
    case "betting":
      return ROOM_K.bettingMs;
    case "fighting":
      return ROOM_K.fightCapMs + (isBossFloor(floor) ? ROOM_K.bossExtraMs : 0);
    case "reveal":
      return ROOM_K.revealMs;
    case "round_end":
      return ROOM_K.roundEndMs;
    case "coop_boss":
      return ROOM_K.coopMs;
    default:
      return 0;
  }
}

export interface Banner {
  title: string;
  hint: string;
  tone: "info" | "boss" | "danger" | "gold";
}

export function phaseBanner(
  phase: Phase,
  floor: number,
  round: number,
): Banner {
  const boss = isBossFloor(floor);
  const where = floor > 0 ? `Piso ${floor} · ${worldOf(floor).name}` : "";
  switch (phase) {
    case "lobby":
      return {
        title: "Sala de espera",
        hint: "El anfitrión inicia la ronda.",
        tone: "info",
      };
    case "round_setup":
      return {
        title: `Ronda ${round}: elige tu héroe`,
        hint: "Sin elegir, el servidor te da un Común al azar.",
        tone: "gold",
      };
    case "floor_intro":
      return {
        title: boss ? `¡Jefe! ${where}` : where,
        hint: boss ? "Piso de jefe: una sola puerta." : "Prepárate.",
        tone: boss ? "boss" : "info",
      };
    case "doors":
      return {
        title: `Elige tu puerta · ${where}`,
        hint: "Todos ven las mismas puertas; cada uno elige la suya.",
        tone: boss ? "boss" : "info",
      };
    case "betting":
      return {
        title: `Apuestas · ${where}`,
        hint: "Apuesta si cada peleador gana o pierde. Interferir es secreto.",
        tone: "gold",
      };
    case "fighting":
      return {
        title: `A pelear · ${where}`,
        hint: "Cada uno pelea su combate; los demás miran.",
        tone: "danger",
      };
    case "reveal":
      return {
        title: `Resultados · ${where}`,
        hint: "Se liquidan las apuestas.",
        tone: "gold",
      };
    case "round_end":
      return {
        title: `Fin de la ronda ${round}`,
        hint: "Descanso: mira el ranking y marca Listo.",
        tone: "gold",
      };
    case "coop_boss":
      return {
        title: "Jefe cooperativo",
        hint: "Todos contra el mismo jefe.",
        tone: "boss",
      };
    case "night_summary":
      return {
        title: "Resumen de la noche",
        hint: "Premios y ranking final.",
        tone: "gold",
      };
    case "closed":
      return {
        title: "Sala cerrada",
        hint: "Gracias por jugar.",
        tone: "info",
      };
  }
}

export interface RankRow {
  id: string;
  name: string;
  chips: number;
  floor: number;
  pos: number;
  isMe: boolean;
}

/** Night ranking: chips desc then max floor; "floor": max floor then chips. */
export function rankRows(
  players: readonly PlayerView[],
  by: "chips" | "floor",
  me: string,
): RankRow[] {
  const sorted = [...players].sort((a, b) =>
    by === "chips"
      ? b.chips - a.chips ||
        b.nightMaxFloor - a.nightMaxFloor ||
        a.id.localeCompare(b.id)
      : b.nightMaxFloor - a.nightMaxFloor ||
        b.chips - a.chips ||
        a.id.localeCompare(b.id),
  );
  return sorted.map((p, i) => ({
    id: p.id,
    name: p.name,
    chips: p.chips,
    floor: p.nightMaxFloor,
    pos: i + 1,
    isMe: p.id === me,
  }));
}

/** Position change vs a previous order (positive = climbed). */
export function movement(
  before: readonly string[],
  after: readonly string[],
  id: string,
): number {
  const a = before.indexOf(id);
  const b = after.indexOf(id);
  return a < 0 || b < 0 ? 0 : a - b;
}

/** Spanish message for a bet that cannot be placed, or null if valid. */
export function betMessage(
  stake: number,
  chips: number,
  isSelf: boolean,
): string | null {
  const e = validateBet(stake, chips, isSelf);
  return e ? errorText(e) : null;
}

export function betBlockReason(
  v: RoomView,
  fighterId: string,
): string | null {
  const b = v.battles[fighterId];
  if (!b || b.status !== "open") return errorText("battle_not_found");
  if (fighterId === v.me) return errorText("self_bet");
  if (b.bets.some((x) => x.bettor === v.me)) return errorText("duplicate_bet");
  return null;
}

export interface Settlement {
  fighter: string;
  prediction: "win" | "lose";
  stake: number;
  payout: number;
}

/** What the viewer got from the settled battles (own bets + interference comp). */
export function mySettlements(v: RoomView): {
  rows: Settlement[];
  net: number;
  comp: number;
} {
  const rows: Settlement[] = [];
  let comp = 0;
  for (const b of Object.values(v.battles)) {
    if (b.status !== "settled" || !b.outcome) continue;
    const mine = b.bets.find((x) => x.bettor === v.me);
    if (mine) {
      const po = settlePool(b.bets, b.outcome).payouts.find(
        (x) => x.bettor === v.me,
      );
      rows.push({
        fighter: b.fighter,
        prediction: mine.prediction,
        stake: mine.stake,
        payout: po?.payout ?? 0,
      });
    }
    if (b.fighter === v.me && b.interfered && b.outcome === "win")
      comp += ROOM_K.interfereComp;
  }
  const net = rows.reduce((a, r) => a + r.payout - r.stake, 0) + comp;
  return { rows, net, comp };
}

/** Toast after a floor settles; null when there is nothing to tell. */
export function settlementToast(v: RoomView): string | null {
  const { rows, net, comp } = mySettlements(v);
  if (rows.length === 0 && comp === 0) return null;
  if (net > 0) return `Ganaste ${net} fichas`;
  if (net < 0) return `Perdiste ${-net} fichas`;
  return rows.every((r) => r.payout === r.stake)
    ? "Apuestas devueltas"
    : "Quedaste a mano";
}

export type StatusKind = "idle" | "ok" | "bad" | "warn" | "fight";

/** One short line for a mini-card. `hpPct` only while fighting. */
export function playerStatus(
  v: RoomView,
  p: PlayerView,
  hpPct: number | null,
): { text: string; kind: StatusKind } {
  if (!p.present) return { text: "Ausente", kind: "warn" };
  if (p.eliminated) return { text: "Eliminado", kind: "bad" };
  const late = v.floor < p.activeFromFloor;
  switch (v.phase) {
    case "lobby":
      return p.heroId
        ? { text: "Héroe listo", kind: "ok" }
        : { text: "Sin héroe", kind: "idle" };
    case "round_setup":
      return p.heroId
        ? { text: "Eligió héroe", kind: "ok" }
        : { text: "Eligiendo…", kind: "idle" };
    case "floor_intro":
      return { text: late ? "Entra luego" : "Listo", kind: "idle" };
    case "doors":
      if (late) return { text: "Espectador", kind: "idle" };
      return p.doorChosen
        ? { text: "Eligió puerta", kind: "ok" }
        : { text: "Dudando…", kind: "idle" };
    case "betting":
    case "fighting":
    case "reveal": {
      if (late) return { text: "Espectador", kind: "idle" };
      if (!p.fights)
        return {
          text: p.door ? DOOR_NAME[p.door] : "Sin pelea",
          kind: "idle",
        };
      if (p.outcome === "won") return { text: "Ganó", kind: "ok" };
      if (p.outcome === "lost" || p.outcome === "timeout")
        return { text: "Perdió", kind: "bad" };
      if (p.outcome === "fled") return { text: "Huyó", kind: "warn" };
      if (p.outcome === "skipped") return { text: "Sin pelea", kind: "idle" };
      if (v.phase === "betting")
        return { text: p.door ? DOOR_NAME[p.door] : "Por pelear", kind: "fight" };
      return {
        text: hpPct === null ? "Peleando" : `Peleando ${hpPct}%`,
        kind: "fight",
      };
    }
    default:
      return p.ready
        ? { text: "Listo", kind: "ok" }
        : { text: "En espera", kind: "idle" };
  }
}

export const DOOR_NAME: Record<DoorKind, string> = {
  easy: "Pelea fácil",
  hard: "Pelea difícil",
  boss: "Jefe",
  chest: "Cofre",
  merchant: "Mercader",
  rest: "Descanso",
  event: "Evento",
};

/** Mirrors room.phaseDone: every connected participant already acted. */
export function phaseComplete(v: RoomView): boolean {
  const present = v.players.filter((p) => p.present);
  switch (v.phase) {
    case "round_setup":
      return present.length > 0 && present.every((p) => p.heroId !== null);
    case "doors":
      return present
        .filter((p) => !p.eliminated && v.floor >= p.activeFromFloor)
        .every((p) => p.doorChosen);
    case "betting":
      return present.length > 0 && present.every((p) => p.ready);
    case "fighting":
      return v.players.filter((p) => p.fights).every((p) => p.outcome !== null);
    case "round_end":
      return present.length > 0 && present.every((p) => p.ready);
    default:
      return false;
  }
}

/** Fighters ordered for the bet list (not me). */
export const fightersOf = (v: RoomView) =>
  v.players.filter((p) => p.fights && Boolean(v.battles[p.id]));

/** Compact HP bar in text, e.g. "████░░░░". */
export function textBar(pct: number, width = 8): string {
  const n = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return "█".repeat(n) + "░".repeat(width - n);
}
