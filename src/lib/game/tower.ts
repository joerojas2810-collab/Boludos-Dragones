// Weekly tower: everybody climbs the same endless run (the week's seed), in two
// separate modes with separate rankings and unlimited attempts (best floor counts).
// No coins, loot or parts from the run itself: only the weekly prizes (SQL tower_settle).
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  advanceClimb,
  climbScore,
  floorStage,
  newClimb,
  timeoutClimb,
  type Climb,
} from "./floorFights";
import { normalizeHero } from "./nivelado";
import { heroFromOwned, type Profile } from "./profile";
import type { RarityId } from "./rarity";
import { createRng, hashSeed } from "./rng";
import {
  applyStageAction,
  type StageAction,
  type StageReplayState,
} from "./stageReplay";
import { ENGINE_VERSION, FIGHT_XP, startFight } from "./stage";

export type TowerMode = "nivelado" | "coleccion";
export const TOWER_MODES: readonly TowerMode[] = ["nivelado", "coleccion"];
export const isTowerMode = (v: unknown): v is TowerMode =>
  v === "nivelado" || v === "coleccion";

export const TOWER_LABEL: Record<TowerMode, string> = {
  nivelado: "Torre nivelada",
  coleccion: "Torre de colección",
};
export const TOWER_BLURB: Record<TowerMode, string> = {
  nivelado: "Todos con poder base parecido: gana quien juega mejor.",
  coleccion: "Tu héroe con todo su poder: rango, estrellas y equipo cuentan.",
};

// Weekly prizes for the top 3 of each mode (needs TOWER_MIN_FLOOR). Keep in sync with
// tower_settle in 0022_tower.sql.
export const TOWER_MIN_FLOOR = 8;
export const TOWER_PRIZES = [
  { place: 1, coins: 300, cores: 2 },
  { place: 2, coins: 200, cores: 1 },
  { place: 3, coins: 100, cores: 1 },
] as const;

// Floor prizes: a 10-floor cycle that repeats; each floor is paid once per week.
// Daily #1 of each ranking and the "Torre N" badges. Mirror in SQL (tower migration).
export const TOWER_FLOOR_PRIZES = {
  normal: { coins: 5, cores: 0 },
  mid: { coins: 100, cores: 1 }, // floor 5 of the cycle
  big: { coins: 250, cores: 1 }, // floor 10 of the cycle
} as const;
export const towerFloorReward = (floor: number) => {
  const f = ((floor - 1) % 10) + 1;
  return f === 10
    ? TOWER_FLOOR_PRIZES.big
    : f === 5
      ? TOWER_FLOOR_PRIZES.mid
      : TOWER_FLOOR_PRIZES.normal;
};

export const TOWER_DAILY_PRIZE = {
  coins: 250,
  cores: 1,
  title: "Rey de la torre",
} as const;
export const TOWER_DAILY_HOUR_ART = 21; // Argentina is UTC-3 all year
const ART_OFFSET_H = 3;
const DAY_MS = 86_400_000;
/**
 * The game day of the daily prize: it ends every day at 21:00 ART (00:00 UTC).
 * `key` is the date (YYYY-MM-DD, ART) on which the window ends.
 */
export function dailyKingWindow(now: Date = new Date()) {
  const end = (Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS;
  const endArt = new Date(end - ART_OFFSET_H * 3_600_000);
  return {
    start: new Date(end - DAY_MS),
    end: new Date(end),
    key: endArt.toISOString().slice(0, 10),
  };
}

export const TOWER_BADGE_FLOORS = [10, 20, 30] as const;
export const towerBadges = (bestFloor: number): string[] =>
  TOWER_BADGE_FLOORS.filter((f) => bestFloor >= f).map((f) => `Torre ${f}`);

// Tower fights give a quarter of the dungeon EXP; rooms give none.
export const TOWER_XP_FACTOR = 0.25;
/** EXP of a verified climb: normal floors pay like normal fights, boss floors like elites. */
export const towerXp = (c: Pick<Climb, "wins" | "bossWins">): number =>
  Math.round(
    TOWER_XP_FACTOR *
      ((c.wins - c.bossWins) * FIGHT_XP.normal + c.bossWins * FIGHT_XP.elite),
  );

const strHash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/**
 * The hero of a tower attempt: an owned character (levelled in `nivelado`, full power in
 * `coleccion`) or a random one from the week's seed. Null if the character is not owned.
 */
export function towerHero(
  profile: Profile,
  mode: TowerMode,
  characterId: string | null,
  classId: ClassId,
  seed: number,
  playerId: string,
): Character | null {
  let hero: Character | null;
  if (characterId) {
    hero = heroFromOwned(profile, characterId);
    if (!hero) return null;
  } else
    hero = generateCharacter(
      createRng(hashSeed(seed, strHash(playerId))),
      classId,
    );
  return normalizeHero(hero, mode === "nivelado" ? "nivelado" : "completo");
}

/** Week seed for local (offline) play: stable per ISO week, same for every player. */
export function localWeekSeed(d: Date = new Date()): number {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const week = Math.floor((t / 86_400_000 + 3) / 7); // weeks start on Monday
  return hashSeed(week, 7771);
}

// ---- the climb on the stage engine: ONE life, hp carried with a small heal ----
// Every floor is one fight (floorFights.ts). Score = floors cleared; tiebreak =
// fewer total battle rounds. The client plays with applyTowerAction and the server
// repeats exactly the same fold (replayTower).
export interface TowerState {
  climb: Climb;
  rs: StageReplayState; // the current floor's fight
  folded: boolean; // the finished fight is already counted in `climb`
}

function beginFloor(climb: Climb): StageReplayState {
  const stage = floorStage(climb);
  const f = startFight(stage);
  return { stage, battle: f.battle, rng: f.rng, settled: null };
}

export const startTower = (
  seed: number,
  hero: Character,
  rank: RarityId | null = null,
): TowerState => {
  const climb = newClimb(seed, hero, rank);
  return { climb, rs: beginFloor(climb), folded: false };
};

export const MAX_TOWER_ACTIONS = 8000;

/** null = illegal action. A won floor is counted when its last blow lands ("fin" starts the next). */
export function applyTowerAction(
  s: TowerState,
  a: StageAction,
): TowerState | null {
  if (s.climb.status !== "active") {
    // Only "Ver resultado" is accepted once the climb is over.
    return a.t === "fin" && s.folded ? { ...s, folded: false } : null;
  }
  if (a.t === "fin") {
    if (!s.rs.settled || !s.folded) return null;
    return { climb: s.climb, rs: beginFloor(s.climb), folded: false };
  }
  const rs = applyStageAction(s.rs, a);
  if (!rs) return null;
  if (a.t === "quit") return { climb: timeoutClimb(s.climb), rs, folded: true };
  if (rs.settled && !s.folded)
    return {
      climb: advanceClimb(
        s.climb,
        rs.settled,
        rs.stage.fights[0].role,
        rs.battle?.turn ?? 0,
      ),
      rs,
      folded: true,
    };
  return { ...s, rs };
}

export interface TowerReplay {
  climb: Climb;
  floors: number; // floors cleared
  rounds: number;
  applied: number;
  rejectedAt: number | null;
  error?: "engine_version" | "too_many_actions";
}

export function replayTower(
  seed: number,
  hero: Character,
  actions: readonly StageAction[],
  engineVersion: number = ENGINE_VERSION,
): TowerReplay {
  let s = startTower(seed, hero);
  const out = (applied: number, rejectedAt: number | null, error?: TowerReplay["error"]) => ({
    climb: s.climb,
    floors: climbScore(s.climb),
    rounds: s.climb.rounds,
    applied,
    rejectedAt,
    ...(error ? { error } : {}),
  });
  if (engineVersion !== ENGINE_VERSION) return out(0, null, "engine_version");
  if (actions.length > MAX_TOWER_ACTIONS) return out(0, null, "too_many_actions");
  for (let i = 0; i < actions.length; i++) {
    const n = applyTowerAction(s, actions[i]);
    if (!n) return out(i, i);
    s = n;
  }
  return out(actions.length, null);
}
