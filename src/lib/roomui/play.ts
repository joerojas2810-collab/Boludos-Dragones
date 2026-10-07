// Floor play helpers shared by the room UI (local play) and the fake server
// (which replays the submitted log like the real server does).
import { applyEnemyBoost } from "../game/interference";
import {
  applyRunAction,
  type ReplayState,
  type RunAction,
} from "../game/replay";
import {
  chooseDoor,
  skillOffer,
  startFight,
  upgradeOffer,
  type FightNode,
  type Run,
} from "../game/run";
import type { FightOutcome, InterfereKind } from "../game/room";

export const startReplay = (run: Run): ReplayState => ({
  run,
  fight: null,
  picks: null,
});

const owes = (r: Run) => r.pendingPicks > 0 || r.pendingSkill;

/**
 * applyRunAction, except that a fight door also applies the enemy boost an
 * interferer paid for (the server repeats exactly this when replaying).
 */
export function applyLogged(
  s: ReplayState,
  a: RunAction,
  boost: InterfereKind | null,
): ReplayState | null {
  if (a.t !== "door" || !boost) return applyRunAction(s, a);
  const { run } = s;
  if (
    run.status !== "active" ||
    s.fight ||
    s.picks ||
    run.pendingRelic ||
    owes(run)
  )
    return null;
  const r = chooseDoor(run, a.i);
  if (!r) return null;
  if (r.node.type !== "fight") return { ...s, run: r.run };
  const node: FightNode = applyEnemyBoost(r.node, boost, run.hero);
  const f = startFight({ ...r.run, node });
  if (!f) return null;
  return {
    ...s,
    run: f.run,
    fight: { battle: f.battle, rng: f.rng, node, result: null },
  };
}

/** Takes the first offer of every owed pick (what the server does for you). */
export function autoResolvePicks(s: ReplayState): ReplayState {
  let cur = s;
  for (let i = 0; i < 20 && cur.picks; i++) {
    const r = cur.run;
    const a: RunAction = r.pendingSkill
      ? { t: "skill", id: skillOffer(r)[0] }
      : { t: "pick", id: upgradeOffer(r)[0] };
    const n = applyRunAction(cur, a);
    if (!n) break;
    cur = n;
  }
  return cur;
}

export interface FloorReplay {
  state: ReplayState;
  outcome: FightOutcome | null; // null: no fight on this floor
  rejectedAt: number | null;
}

/** Server-side replay of one floor log from the floor-start Run. */
export function replayFloor(
  start: Run,
  actions: readonly RunAction[],
  boost: InterfereKind | null,
): FloorReplay {
  let s = startReplay(start);
  let fought = false;
  let outcome: FightOutcome | null = null;
  const result = (rejectedAt: number | null): FloorReplay => ({
    state: s,
    outcome: fought && outcome === null ? "timeout" : outcome,
    rejectedAt,
  });
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.t === "fin" && s.fight) {
      const st = s.fight.battle.status;
      outcome = st === "won" ? "won" : "lost";
    }
    const n = applyLogged(s, a, boost);
    if (!n) return result(i);
    s = n;
    if (s.fight) fought = true;
  }
  return result(null);
}
