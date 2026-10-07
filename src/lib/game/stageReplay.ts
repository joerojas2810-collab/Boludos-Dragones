// Deterministic stage replay. The client records one StageAction per UI step; the
// server replays them from (seed, hero, fights) with the same engine and pays what
// the REPLAY says. Illegal action => stop there.
import { autoBlockReason, autoResolve } from "./auto";
import { step, type Action, type Battle } from "./combat";
import type { Character } from "./characters";
import type { Rng } from "./rng";
import {
  abandonStage,
  createStage,
  ENGINE_VERSION,
  finishFight,
  startFight,
  type FightSpec,
  type Stage,
} from "./stage";

export { ENGINE_VERSION };

export type StageAction =
  | { t: "act"; a: Action; target?: number } // target: index into LIVING enemies
  | { t: "auto" } // quick resolve (autoPolicy, see auto.ts)
  | { t: "fin" } // "Continuar" after a fight ended
  | { t: "quit" }; // abandon the stage = lose it

export const MAX_STAGE_ACTIONS = 3000;

export interface StageReplayState {
  stage: Stage;
  battle: Battle | null; // null once the stage ended
  rng: Rng | null;
  settled: Stage | null; // stage after the current fight, shown until "fin"
}

export function initialStageReplay(
  seed: number,
  hero: Character,
  fights: FightSpec[],
  asc = 0,
): StageReplayState {
  const stage = createStage(seed, hero, fights, asc);
  const f = startFight(stage);
  return { stage, battle: f.battle, rng: f.rng, settled: null };
}

function settle(s: StageReplayState, battle: Battle): StageReplayState {
  return {
    ...s,
    battle,
    settled: battle.status === "ongoing" ? null : finishFight(s.stage, battle),
  };
}

// null = illegal action in the current state.
export function applyStageAction(
  s: StageReplayState,
  a: StageAction,
): StageReplayState | null {
  if (s.stage.status !== "playing") return null;
  if (a.t === "quit")
    return {
      stage: abandonStage(s.stage),
      battle: null,
      rng: null,
      settled: null,
    };
  const { battle, rng } = s;
  if (!battle || !rng) return null;
  switch (a.t) {
    case "act": {
      if (s.settled) return null;
      const next = step(battle, a.a, rng, a.target);
      return next === battle ? null : settle(s, next);
    }
    case "auto": {
      if (s.settled || autoBlockReason(battle)) return null;
      return settle(s, autoResolve(battle, rng));
    }
    case "fin": {
      if (!s.settled) return null;
      const stage = s.settled;
      if (stage.status !== "playing")
        return { stage, battle: null, rng: null, settled: null };
      const f = startFight(stage);
      return { stage, battle: f.battle, rng: f.rng, settled: null };
    }
  }
}

export interface StageReplayResult {
  stage: Stage;
  applied: number;
  rejectedAt: number | null; // index of the first illegal action
  error?: "engine_version" | "too_many_actions";
}

// The stage as it stands after the actions (a finished last fight counts even
// without its "fin").
export function replayStage(
  seed: number,
  hero: Character,
  fights: FightSpec[],
  actions: readonly StageAction[],
  asc = 0,
  engineVersion: number = ENGINE_VERSION,
): StageReplayResult {
  let s = initialStageReplay(seed, hero, fights, asc);
  if (engineVersion !== ENGINE_VERSION)
    return { stage: s.stage, applied: 0, rejectedAt: null, error: "engine_version" };
  if (actions.length > MAX_STAGE_ACTIONS)
    return { stage: s.stage, applied: 0, rejectedAt: null, error: "too_many_actions" };
  for (let i = 0; i < actions.length; i++) {
    const n = applyStageAction(s, actions[i]);
    if (!n) return { stage: s.settled ?? s.stage, applied: i, rejectedAt: i };
    s = n;
  }
  return { stage: s.settled ?? s.stage, applied: actions.length, rejectedAt: null };
}
