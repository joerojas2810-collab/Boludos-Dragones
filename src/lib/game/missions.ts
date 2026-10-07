// Missions: daily (3, activity tiers, 1 reroll), weekly (3) and the Friday room event (3).
// Pure logic. Rotation is deterministic from the day / week key (same for every player, no
// table needed); only progress and claimed tiers are stored. The server derives progress
// events from already-verified actions (bank_run, forge, pulls, rooms). Keep rewards in
// sync with the SQL when the migration is written.
import { ELEMENTS, type Element } from "./elements";
import { createRng, hashSeed } from "./rng";
import { addDays } from "./streak";

export type MissionScope = "daily" | "weekly" | "event";

// What the server counts. `element_win` carries the element as param ("element_win:fuego").
export type MissionKind =
  | "fight_win"
  | "boss_win"
  | "dungeon_clear"
  | "floors"
  | "element_win"
  | "forge"
  | "pull"
  | "room_round"
  | "bet_win"
  | "aid"
  | "coop_damage";

interface Def {
  kind: MissionKind;
  scope: MissionScope;
  target: number;
  label: string; // {n} = target, {p} = param
}

export const MISSION_POOL: readonly Def[] = [
  { kind: "fight_win", scope: "daily", target: 5, label: "Gana {n} peleas" },
  { kind: "fight_win", scope: "daily", target: 10, label: "Gana {n} peleas" },
  { kind: "floors", scope: "daily", target: 8, label: "Supera {n} pisos" },
  { kind: "boss_win", scope: "daily", target: 1, label: "Vence a un jefe" },
  {
    kind: "element_win",
    scope: "daily",
    target: 3,
    label: "Gana {n} peleas con héroe de {p}",
  },
  {
    kind: "dungeon_clear",
    scope: "daily",
    target: 1,
    label: "Limpia un dungeon",
  },
  {
    kind: "pull",
    scope: "daily",
    target: 1,
    label: "Haz una tirada en Invocar",
  },
  { kind: "forge", scope: "daily", target: 1, label: "Usa la forja una vez" },
  { kind: "fight_win", scope: "weekly", target: 40, label: "Gana {n} peleas" },
  { kind: "boss_win", scope: "weekly", target: 6, label: "Vence a {n} jefes" },
  {
    kind: "dungeon_clear",
    scope: "weekly",
    target: 4,
    label: "Limpia {n} dungeons",
  },
  { kind: "floors", scope: "weekly", target: 60, label: "Supera {n} pisos" },
  {
    kind: "forge",
    scope: "weekly",
    target: 3,
    label: "Usa la forja {n} veces",
  },
  { kind: "pull", scope: "weekly", target: 5, label: "Haz {n} tiradas" },
  {
    kind: "element_win",
    scope: "weekly",
    target: 15,
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
export const SCOPE_TIERS: Record<
  MissionScope,
  readonly { points: number; coins: number; cores: number }[]
> = {
  daily: [
    { points: 30, coins: 100, cores: 0 },
    { points: 60, coins: 150, cores: 0 },
    { points: 90, coins: 250, cores: 0 }, // full day = 500 = two pulls
  ],
  weekly: [
    { points: 30, coins: 250, cores: 0 },
    { points: 60, coins: 400, cores: 0 },
    { points: 90, coins: 600, cores: 1 }, // 1250 = five pulls
  ],
  event: [
    { points: 30, coins: 100, cores: 0 },
    { points: 60, coins: 200, cores: 0 },
    { points: 90, coins: 700, cores: 1 }, // 1000 = four pulls, mostly for finishing
  ],
};
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
  const param = def.kind === "element_win" ? rng.pick(ELEMENTS) : undefined;
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
    cores: fresh.reduce((a, t) => a + t.cores, 0),
  };
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
