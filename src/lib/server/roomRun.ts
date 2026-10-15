// Pure helpers: a player's climb inside a room (hero snapshot, floor alignment,
// timeouts) and the floor result derived from the client report. No I/O.
import type { Character } from "../game/characters";
import { generateCharacter } from "../game/characters";
import {
  alignClimb,
  newClimb,
  timeoutClimb,
  type Climb,
} from "../game/floorFights";
import { niveladoHero } from "../game/niveladoHero";
import { normalizeHero } from "../game/nivelado";
import { loadoutFor } from "../game/loadout";
import { heroFromOwned, type Profile } from "../game/profile";
import type { RarityId } from "../game/rarity";
import { createRng, hashSeed } from "../game/rng";
import { ENGINE_VERSION } from "../game/stage";
import {
  isFightDoor,
  DEFAULT_HERO,
  parsePickKey,
  type DoorKind,
  type FightOutcome,
  type RoomMode,
} from "../game/room";
import { applyReport, type FloorReport } from "../roomui/play";

const strHash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/** Hero for a round: owned character (normalized in nivelado) or a seeded Común. */
export function heroForRound(
  profile: Profile,
  heroKey: string | null,
  mode: RoomMode,
  roundSeed: number,
  playerId: string,
): Character {
  // nivelado: the player picked a class + element, nothing from the collection
  const pick = parsePickKey(heroKey);
  if (pick) return niveladoHero(pick.classId, pick.element);
  if (mode === "nivelado") {
    const candidate = generateCharacter(createRng(hashSeed(roundSeed, strHash(playerId))));
    return niveladoHero(candidate.classId, candidate.element);
  }
  const owned =
    heroKey && heroKey !== DEFAULT_HERO
      ? heroFromOwned(profile, heroKey)
      : null;
  const hero =
    owned ??
    generateCharacter(createRng(hashSeed(roundSeed, strHash(playerId))));
  return normalizeHero(hero, mode);
}

/**
 * Fresh climb of a room round. The loadout comes from the server-side profile (nivelado: the
 * per-class selection with all four skills; completo: the hero's selection limited by mastery),
 * never from the client.
 */
export const newRoomRun = (
  roundSeed: number,
  hero: Character,
  rank: RarityId,
  profile: Profile,
  mode: RoomMode,
): Climb =>
  newClimb(roundSeed, hero, rank, loadoutFor(profile, hero, mode === "nivelado" ? "nivelado" : "coleccion"));

/** A stored climb from another engine version cannot continue (the room is told to restart). */
export const isStaleRun = (c: Climb): boolean => c.engineVersion !== ENGINE_VERSION;

/** Brings a run to the START of room floor `floor` (a late joiner skips ahead). */
export const alignRun = alignClimb;

/** Server-applied loss (no submission / illegal log / incomplete fight): same as `lost`. */
export const timeoutRun = timeoutClimb;

export type FloorApplied =
  | { ok: false; reason: string }
  | {
      ok: true;
      outcome: FightOutcome | null; // null: non-fight floor
      run: Climb;
      eliminated: boolean;
    };

/**
 * The climb after a floor from the client's report (no replay). `kind` = the door the server
 * stored. A fight floor without a report is rejected.
 */
export function applyFloor(
  start: Climb,
  report: FloorReport | null,
  o: { kind: DoorKind },
): FloorApplied {
  if (!isFightDoor(o.kind))
    return { ok: true, outcome: null, run: start, eliminated: false };
  if (!report) return { ok: false, reason: "no_fight" };
  const r = applyReport(start, report, { kind: o.kind as "easy" | "hard" | "boss" });
  return { ok: true, outcome: r.outcome, run: r.run, eliminated: r.run.status === "over" };
}
