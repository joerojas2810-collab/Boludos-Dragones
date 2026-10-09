// Pure helpers: a player's climb inside a room (hero snapshot, floor alignment,
// timeouts) and the authoritative replay of one floor. No I/O.
import type { Character } from "../game/characters";
import { generateCharacter } from "../game/characters";
import {
  alignClimb,
  newClimb,
  timeoutClimb,
  type Climb,
} from "../game/floorFights";
import { balancedHero } from "../game/duel";
import { normalizeHero } from "../game/nivelado";
import { heroFromOwned, type Profile } from "../game/profile";
import type { RarityId } from "../game/rarity";
import { createRng, hashSeed } from "../game/rng";
import {
  isFightDoor,
  DEFAULT_HERO,
  parsePickKey,
  type DoorKind,
  type FightOutcome,
  type InterfereKind,
  type RoomMode,
} from "../game/room";
import type { StageAction } from "../game/stageReplay";
import { replayFloor as playFloor } from "../roomui/play";

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
  if (pick) return balancedHero(pick.classId, pick.element);
  const owned =
    heroKey && heroKey !== DEFAULT_HERO
      ? heroFromOwned(profile, heroKey)
      : null;
  const hero =
    owned ??
    generateCharacter(createRng(hashSeed(roundSeed, strHash(playerId))));
  return normalizeHero(hero, mode);
}

export const newRoomRun = (
  roundSeed: number,
  hero: Character,
  rank: RarityId = "f",
): Climb => newClimb(roundSeed, hero, rank);

/** Brings a run to the START of room floor `floor` (a late joiner skips ahead). */
export const alignRun = alignClimb;

/** Server-applied loss (no submission / illegal log / incomplete fight): same as `lost`. */
export const timeoutRun = timeoutClimb;

export type FloorReplay =
  | { ok: false; reason: string }
  | {
      ok: true;
      outcome: FightOutcome | null; // null: non-fight floor
      run: Climb;
      eliminated: boolean;
    };

const BAD = (reason: string): FloorReplay => ({ ok: false, reason });

/**
 * Repeats the floor's action log from `start` (the aligned run). The result is
 * decided here, never by the client. `kind` = the door the server stored.
 */
export function replayFloor(
  start: Climb,
  actions: readonly StageAction[],
  o: { kind: DoorKind; boost: InterfereKind | null },
): FloorReplay {
  if (!isFightDoor(o.kind))
    return { ok: true, outcome: null, run: start, eliminated: false };
  if (actions.length === 0) return BAD("no_fight");
  const r = playFloor(start, actions, { kind: o.kind as "easy" | "hard" | "boss", boost: o.boost });
  if (r.rejectedAt !== null) return BAD("illegal_action");
  return {
    ok: true,
    outcome: r.outcome,
    run: r.run,
    eliminated: r.run.status === "over",
  };
}
