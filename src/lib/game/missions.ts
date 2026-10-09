// Missions: daily (3, activity tiers, 1 reroll), weekly (3) and the Friday room event (3).
// Pure logic. Rotation is deterministic from the day / week key (same for every player, no
// table needed); only progress and claimed tiers are stored. The server derives progress
// events from already-verified actions (see missionDeltas, forge, pulls, rooms). Rewards
// (SCOPE_TIERS) are mirrored in SQL.
import { ELEMENT_LABEL, ELEMENTS, type Element } from "./elements";
import { rollGear } from "./gear";
import type { RunPiece } from "./loot";
import type { RarityId } from "./rarity";
import { createRng, hashSeed, type Rng } from "./rng";
import { isGearType, WEAPON_TYPE_DATA, WEAPON_TYPES } from "./weapons";
import { addDays } from "./streak";

export type MissionScope = "daily" | "weekly" | "event";

// What the server counts. `element` carries the element as param ("element:fuego").
export type MissionKind =
  | "levels"
  | "fights"
  | "bosses"
  | "dungeon"
  | "element"
  | "forge"
  | "pull"
  | "room_round"
  | "bet_win"
  | "aid"
  | "coop_damage"
  | "duel_win";

interface Def {
  kind: MissionKind;
  scope: MissionScope;
  target: number;
  label: string; // {n} = target, {p} = param
}

export const MISSION_POOL: readonly Def[] = [
  { kind: "levels", scope: "daily", target: 3, label: "Limpia {n} niveles" },
  { kind: "fights", scope: "daily", target: 15, label: "Gana {n} peleas" },
  { kind: "fights", scope: "daily", target: 30, label: "Gana {n} peleas" },
  {
    kind: "bosses",
    scope: "daily",
    target: 3,
    label: "Vence a {n} jefes de nivel",
  },
  {
    kind: "element",
    scope: "daily",
    target: 5,
    label: "Gana {n} peleas con héroe de {p}",
  },
  {
    kind: "pull",
    scope: "daily",
    target: 1,
    label: "Haz una tirada en Invocar",
  },
  { kind: "forge", scope: "daily", target: 1, label: "Usa la forja una vez" },
  { kind: "levels", scope: "weekly", target: 20, label: "Limpia {n} niveles" },
  { kind: "fights", scope: "weekly", target: 150, label: "Gana {n} peleas" },
  {
    kind: "bosses",
    scope: "weekly",
    target: 20,
    label: "Vence a {n} jefes de nivel",
  },
  { kind: "dungeon", scope: "weekly", target: 1, label: "Limpia 1 dungeon" },
  {
    kind: "forge",
    scope: "weekly",
    target: 3,
    label: "Usa la forja {n} veces",
  },
  { kind: "pull", scope: "weekly", target: 5, label: "Haz {n} tiradas" },
  {
    kind: "element",
    scope: "weekly",
    target: 25,
    label: "Gana {n} peleas con héroe de {p}",
  },
  {
    kind: "room_round",
    scope: "event",
    target: 2,
    label: "Juega {n} rondas en una sala",
  },
  { kind: "bet_win", scope: "event", target: 2, label: "Acierta {n} apuestas" },
  {
    kind: "aid",
    scope: "event",
    target: 1,
    label: "Ayuda a un amigo en plena pelea",
  },
  {
    kind: "coop_damage",
    scope: "event",
    target: 1,
    label: "Hazle daño al jefe cooperativo",
  },
  { kind: "duel_win", scope: "event", target: 1, label: "Gana un duelo 1v1" },
];

export interface Mission {
  slot: number;
  scope: MissionScope;
  kind: MissionKind;
  param?: Element;
  target: number;
  label: string;
  /** Counter key the server increments. */
  key: string;
}

const POINTS = 30; // every mission is worth the same; tiers fall at 1, 2 and 3 missions

export interface MissionTier {
  points: number;
  coins: number;
  /** Dado cargado (Mejorar, docs/FORJA_V9.md). */
  dados: number;
  /** Gear pieces (random type/element) at the rank of the player's best cleared dungeon. */
  pieces: number;
}
const tier = (
  points: number,
  coins: number,
  o: Partial<Omit<MissionTier, "points" | "coins">> = {},
): MissionTier => ({ points, coins, dados: 0, pieces: 0, ...o });

/**
 * Mission rewards per scope and tier. MUST be mirrored in SQL (`mission_claim`): any
 * change here needs the same change in the migration. Totals in coins: daily 250
 * (one pull), weekly 700, event 550.
 */
export const SCOPE_TIERS: Record<MissionScope, readonly MissionTier[]> = {
  daily: [tier(30, 20), tier(60, 30), tier(90, 250)],
  weekly: [
    tier(30, 120),
    tier(60, 100, { pieces: 1 }),
    tier(90, 500, { dados: 1 }),
  ],
  event: [tier(30, 50), tier(60, 100), tier(90, 400, { dados: 1 })],
};

/** Short Spanish description of a tier reward ("250 monedas · 1 núcleo"). */
export function rewardText(t: Omit<MissionTier, "points">): string {
  const out: string[] = [];
  if (t.coins) out.push(`${t.coins} monedas`);
  if (t.dados) out.push(`${t.dados} ${t.dados === 1 ? "Dado cargado" : "Dados cargados"}`);
  if (t.pieces)
    out.push(`${t.pieces} ${t.pieces === 1 ? "pieza" : "piezas"}`);
  return out.join(" · ");
}

/** Progress increments (keyed like `Mission.key`) from a finished stage / tower / room event. */
export interface StageResult {
  status: "playing" | "cleared" | "lost";
  won: { normal: number; elite: number; final: number };
  heroElement: Element;
  /** True when the cleared level was the last one of its rank (the dungeon's final level). */
  finalLevel?: boolean;
}
export function missionDeltas(r: StageResult): Record<string, number> {
  const fights = r.won.normal + r.won.elite + r.won.final;
  const out: Record<string, number> = {};
  const add = (k: string, n: number) => {
    if (n > 0) out[k] = n;
  };
  add("fights", fights);
  add(`element:${r.heroElement}`, fights);
  add("bosses", r.won.elite + r.won.final);
  if (r.status === "cleared") {
    add("levels", 1);
    if (r.finalLevel) add("dungeon", 1);
  }
  return out;
}

export const MISSIONS_PER_SCOPE = 3;
export const MAX_REROLLS = 1;

const strHash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

const weekday = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};

/** Monday of the week containing `day` (same week the tower uses). */
export const weekKey = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

/** The room event runs Friday and Saturday (the game night). */
export const isEventDay = (day: string) => [5, 6].includes(weekday(day));

export const periodKey = (scope: MissionScope, day: string) =>
  scope === "daily" ? day : weekKey(day);

function build(
  def: Def,
  slot: number,
  rng: ReturnType<typeof createRng>,
): Mission {
  const param = def.kind === "element" ? rng.pick(ELEMENTS) : undefined;
  return {
    slot,
    scope: def.scope,
    kind: def.kind,
    param,
    target: def.target,
    label: def.label
      .replace("{n}", String(def.target))
      .replace("{p}", param ?? ""),
    key: param ? `${def.kind}:${param}` : def.kind,
  };
}

/**
 * Missions of a scope for a period. Event missions are all three social ones (fixed).
 * For daily/weekly the pool is shuffled by the period seed with one mission per kind;
 * the first 3 are shown and `rerolled` (a slot index) swaps that slot for the 4th.
 */
export function missionsFor(
  scope: MissionScope,
  day: string,
  rerolled: number | null = null,
): Mission[] {
  const rng = createRng(
    hashSeed(strHash(periodKey(scope, day)), strHash(scope)),
  );
  const pool = MISSION_POOL.filter((d) => d.scope === scope);
  if (scope === "event")
    return pool.map((d, i) => build(d, i, rng)).slice(0, MISSIONS_PER_SCOPE);
  const order = pool
    .map((d) => ({ d, r: rng.next() }))
    .sort((a, b) => a.r - b.r);
  const seen = new Set<string>();
  const picks = order
    .filter(({ d }) => !seen.has(d.kind) && !!seen.add(d.kind))
    .map((o) => o.d);
  const shown = picks.slice(0, MISSIONS_PER_SCOPE + 1);
  if (rerolled !== null && rerolled >= 0 && rerolled < MISSIONS_PER_SCOPE)
    shown[rerolled] = shown[MISSIONS_PER_SCOPE];
  return shown.slice(0, MISSIONS_PER_SCOPE).map((d, i) => build(d, i, rng));
}

export interface MissionState {
  period: string; // dayKey (daily) or weekKey (weekly / event)
  progress: Record<string, number>;
  claimed: number; // tiers already paid
  rerolled: number | null;
}

export const freshState = (scope: MissionScope, day: string): MissionState => ({
  period: periodKey(scope, day),
  progress: {},
  claimed: 0,
  rerolled: null,
});

/** Add `n` to the counters an event feeds. Progress is kept as raw totals per key. */
export function addProgress(
  s: MissionState,
  kind: MissionKind,
  n = 1,
  param?: Element,
): MissionState {
  const key = param ? `${kind}:${param}` : kind;
  return {
    ...s,
    progress: { ...s.progress, [key]: (s.progress[key] ?? 0) + n },
  };
}

export const missionDone = (s: MissionState, m: Mission) =>
  (s.progress[m.key] ?? 0) >= m.target;

export function activityPoints(s: MissionState, ms: readonly Mission[]) {
  return ms.filter((m) => missionDone(s, m)).length * POINTS;
}

/** Tiers reached and not yet claimed -> the reward of claiming them all. */
export function claimTiers(
  scope: MissionScope,
  s: MissionState,
  ms: readonly Mission[],
) {
  const pts = activityPoints(s, ms);
  const tiers = SCOPE_TIERS[scope];
  const reached = tiers.filter((t) => t.points <= pts).length;
  const fresh = tiers.slice(s.claimed, reached);
  return {
    state: { ...s, claimed: Math.max(s.claimed, reached) },
    coins: fresh.reduce((a, t) => a + t.coins, 0),
    dados: fresh.reduce((a, t) => a + t.dados, 0),
    pieces: fresh.reduce((a, t) => a + t.pieces, 0),
  };
}

/**
 * Pieces of a claim, rolled by the server (SQL cannot roll gear): random type and
 * element at `rank` (the rank of the player's best cleared dungeon, F if none). SQL checks
 * the counts, the rank cap and every piece (grant_piece).
 */
export function rollMissionRewards(
  rng: Rng,
  rank: RarityId,
  nPieces: number,
): { pieces: RunPiece[] } {
  const pieces: RunPiece[] = [];
  for (let i = 0; i < nPieces; i++) {
    const type = rng.pick(WEAPON_TYPES);
    const element = rng.pick(ELEMENTS);
    pieces.push({
      type,
      element,
      rarity: rank,
      name: `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]}`,
      ...(isGearType(type)
        ? rollGear(rng, type, rank)
        : { roll: rollGear(rng, "casco", rank).roll }),
    });
  }
  return { pieces };
}

/** Free reroll of one daily/weekly slot, once per period and only if it is not done. */
export function reroll(
  scope: MissionScope,
  day: string,
  s: MissionState,
  slot: number,
): MissionState | null {
  if (scope === "event" || s.rerolled !== null) return null;
  const m = missionsFor(scope, day)[slot];
  if (!m || missionDone(s, m)) return null;
  return { ...s, rerolled: slot };
}
