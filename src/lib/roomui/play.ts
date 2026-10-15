// Floor report helpers shared by the room UI (local play), the fake server and the real one.
import {
  advanceClimb,
  floorFight,
  timeoutClimb,
  type Climb,
  type FloorKind,
} from "../game/floorFights";
import { TURN_CAP } from "../game/combat";
import type { Stage } from "../game/stage";
import type { FightOutcome } from "../game/room";
import type { StageReplayState } from "../game/stageReplay";

// What the client says about a finished floor (no action log any more): the server derives the
// climb from it. Pace limits, chip caps and the turn clock keep it honest in a room of friends.
export interface FloorReport {
  outcome: "won" | "lost" | "fled";
  hp: number; // hero hp when the fight ended (before the win heal)
  turns: number; // resolved battle turns (combat.ts `turn`)
}

export interface FloorReplay {
  outcome: FightOutcome | null; // null: nothing was fought
  run: Climb; // the climb after this floor
}

/** The report of a floor the player just finished (null while it is still being fought). */
export function reportOf(s: StageReplayState, fled = false): FloorReport | null {
  if (fled) return { outcome: "fled", hp: 0, turns: s.battle?.turn ?? 0 };
  if (!s.settled || !s.battle) return null;
  return {
    // a "draw" (turn cap) leaves the stage lost: only a cleared stage is a win
    outcome: s.settled.status === "cleared" ? "won" : "lost",
    hp: Math.round(s.battle.player.hp),
    turns: s.battle.turn,
  };
}

/** The climb after a reported floor: a win keeps the (clamped) hp plus the usual heal. */
export function applyReport(
  start: Climb,
  r: FloorReport,
  o: { kind: FloorKind },
): FloorReplay {
  if (r.outcome === "fled") return { outcome: "fled", run: timeoutClimb(start) };
  const max = start.hero.stats.hp;
  const role = floorFight(start.seed, start.floor, { rank: start.rank, kind: o.kind }).role;
  const won = r.outcome === "won";
  // ponytail: advanceClimb only reads status and hp of the finished stage.
  const stage = { status: won ? "cleared" : "lost", hp: Math.min(max, Math.max(1, r.hp)) } as Stage;
  return {
    outcome: won ? "won" : "lost",
    run: advanceClimb(start, stage, role, Math.min(r.turns, TURN_CAP)),
  };
}
