// Floor play helpers shared by the room UI (local play) and the fake server
// (which replays the submitted log like the real server does).
import {
  advanceClimb,
  timeoutClimb,
  type Climb,
  type FloorKind,
} from "../game/floorFights";
import { startRoomFloor } from "../game/interference";
import type { Stage } from "../game/stage";
import type { FightOutcome, InterfereKind } from "../game/room";
import {
  applyStageAction,
  type StageAction,
  type StageReplayState,
} from "../game/stageReplay";

export interface FloorReplay {
  state: StageReplayState;
  outcome: FightOutcome | null; // null: nothing was fought
  rejectedAt: number | null;
  run: Climb; // the climb after this floor
}

/** Server-side replay of one floor log from the floor-start climb. */
export function replayFloor(
  start: Climb,
  actions: readonly StageAction[],
  o: { kind: FloorKind; boost: InterfereKind | null },
): FloorReplay {
  let s = startRoomFloor(start, o.kind, o.boost);
  let end: { stage: Stage; turn: number } | null = null; // the finished fight
  const done = (rejectedAt: number | null): FloorReplay => {
    if (!end)
      return {
        state: s,
        outcome: "timeout", // unfinished fight when the log ends: a loss
        rejectedAt,
        run: timeoutClimb(start),
      };
    return {
      state: s,
      outcome: end.stage.status === "cleared" ? "won" : "lost",
      rejectedAt,
      run: advanceClimb(start, end.stage, end.stage.fights[0].role, end.turn),
    };
  };
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.t === "quit") return done(i);
    const n = applyStageAction(s, a);
    if (!n) return done(i);
    if (n.settled && n.battle) end = { stage: n.settled, turn: n.battle.turn };
    s = n;
  }
  return done(null);
}
