// Pure helpers: a player's Run inside a room (hero snapshot, floor alignment,
// timeouts) and the authoritative replay of one floor. No I/O.
import type { Character } from "../game/characters";
import { generateCharacter } from "../game/characters";
import { applyRoomAction } from "../game/interference";
import { normalizeHero } from "../game/nivelado";
import { heroFromOwned, type Profile } from "../game/profile";
import {
  applyRunAction,
  type ReplayState,
  type RunAction,
} from "../game/replay";
import type { RarityId } from "../game/rarity";
import { createRng, hashSeed } from "../game/rng";
import {
  isFightDoor,
  DEFAULT_HERO,
  type DoorKind,
  type FightOutcome,
  type InterfereKind,
  type RoomMode,
} from "../game/room";
import {
  chooseRelic,
  chooseSkill,
  createRun,
  doorsFor,
  LIFE_LOSS_HEAL,
  maxHp,
  nextFloor,
  pickUpgrade,
  skillOffer,
  upgradeOffer,
  type Run,
} from "../game/run";

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
): Run => createRun(roundSeed, hero, false, null, rank);

/** Resolves owed picks (and optionally the relic offer) with the first option. */
export function settleRun(run: Run, relic: boolean): Run {
  let r = run;
  for (let i = 0; i < 30; i++) {
    if (r.pendingSkill) r = chooseSkill(r, skillOffer(r)[0]);
    else if (r.pendingPicks > 0) {
      const o = upgradeOffer(r);
      if (!o.length) break;
      r = pickUpgrade(r, o[0]);
    } else if (relic && r.pendingRelic?.length)
      r = chooseRelic(r, r.pendingRelic[0]);
    else break;
  }
  return r;
}

/** Brings a run to the START of room floor `floor` (lost/fled/skipped floors do not advance it). */
export function alignRun(run: Run, floor: number): Run {
  let r = run;
  while (r.status === "active" && r.floor < floor) {
    const prev = r.floor;
    r = nextFloor(settleRun({ ...r, node: null, floorCleared: true }, true));
    if (r.floor === prev) break;
  }
  return settleRun(r, false);
}

/** Server-applied loss (no submission / illegal log / incomplete fight): same as `lost`. */
export function timeoutRun(run: Run): Run {
  const lives = run.lives - 1;
  return lives <= 0
    ? { ...run, lives: 0, status: "over", hp: 0, node: null }
    : {
        ...run,
        lives,
        hp: Math.max(1, Math.round(maxHp(run) * LIFE_LOSS_HEAL)),
        node: null,
      };
}

export type FloorReplay =
  | { ok: false; reason: string }
  | {
      ok: true;
      outcome: FightOutcome | null; // null: non-fight floor
      run: Run;
      eliminated: boolean;
    };

const BAD = (reason: string): FloorReplay => ({ ok: false, reason });

/**
 * Repeats the floor's action log from `start` (the aligned run). The result is
 * decided here, never by the client. `kind` = the door the server stored.
 */
export function replayFloor(
  start: Run,
  actions: readonly RunAction[],
  o: { kind: DoorKind; boost: InterfereKind | null },
): FloorReplay {
  let s: ReplayState = { run: start, fight: null, picks: null };
  if (start.pendingRelic?.length && actions[0]?.t !== "relic")
    s = { ...s, run: chooseRelic(start, start.pendingRelic[0]) };
  let doors = 0;
  for (const a of actions) {
    if (a.t === "door") {
      if (++doors > 1) return BAD("second_door");
      if (
        doorsFor(s.run.seed, s.run.floor, null, s.run.difficulty)[a.i]?.kind !==
        o.kind
      )
        return BAD("wrong_door");
    }
    const n = applyRoomAction(s, a, o.boost);
    if (!n) return BAD("illegal_action");
    s = n;
  }
  if (doors === 0) return BAD("no_door");
  const settlePicks = () => {
    while (s.picks) {
      const r = s.run;
      const n = applyRunAction(
        s,
        r.pendingSkill
          ? { t: "skill", id: skillOffer(r)[0] }
          : { t: "pick", id: upgradeOffer(r)[0] },
      );
      if (!n) break;
      s = n;
    }
  };
  if (isFightDoor(o.kind)) {
    const f = s.fight;
    if (!f) return BAD("no_fight");
    if (!f.result) {
      // unfinished fight when the log ends: counts as a loss
      const run = timeoutRun(start);
      return {
        ok: true,
        outcome: "timeout",
        run,
        eliminated: run.status === "over",
      };
    }
    const status = f.battle.status;
    const fin = applyRunAction(s, { t: "fin" });
    if (fin) s = fin;
    settlePicks();
    const outcome: FightOutcome =
      status === "won" ? "won" : status === "fled" ? "fled" : "lost";
    return {
      ok: true,
      outcome,
      run: s.run,
      eliminated: s.run.status === "over",
    };
  }
  if (!s.fight && !s.picks) {
    const left = applyRunAction(s, { t: "leave" });
    if (left) s = left;
  }
  settlePicks();
  return { ok: true, outcome: null, run: s.run, eliminated: false };
}
