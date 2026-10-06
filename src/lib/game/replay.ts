// Deterministic run replay. The client records one RunAction per UI step; the
// server replays them from (seed, hero) with the same engine and pays what the
// REPLAY says, never what the client claims. Illegal action => stop there.
import { autoBlockReason, autoResolve } from "./auto";
import { step, type Action, type Battle } from "./combat";
import type { Character } from "./characters";
import {
  buyItem,
  chooseDoor,
  chooseLoot,
  chooseRelic,
  chooseSkill,
  createRun,
  ENGINE_VERSION,
  skillOffer,
  leaveNode,
  topFloor,
  nextFloor,
  pickUpgrade,
  resolveEvent,
  startFight,
  upgradeOffer,
  applyBattleResult,
  type FightNode,
  type Run,
} from "./run";
import type { RarityId } from "./rarity";
import type { RelicId } from "./relics";
import type { Rng } from "./rng";
import type { UpgradeId } from "./progression";
import type { SkillId } from "./skills";

export { ENGINE_VERSION };

export type RunAction =
  | { t: "door"; i: number }
  | { t: "act"; a: Action; target?: number } // target: index into LIVING enemies
  | { t: "auto" } // quick resolve of an easy fight (autoPolicy, see auto.ts)
  | { t: "skill"; id: SkillId } // class skill pick at SKILL_LEVEL
  | { t: "fin" } // "Continuar" after a fight ended
  | { t: "pick"; id: UpgradeId }
  | { t: "relic"; id: RelicId }
  | { t: "loot"; i: number } // take loot piece i of the offer, -1 = skip
  | { t: "buy"; id: string }
  | { t: "event"; i: number }
  | { t: "leave" }; // leave chest / rest / shop / resolved event

export const MAX_RUN_ACTIONS = 6000;

// Shared with the run page: leaves a finished node (owed picks first, then
// the next floor + relic offer when `advance`).
export type NextScreen = "doors" | "picks" | "relic" | "over";
const owes = (r: Run) => r.pendingPicks > 0 || r.pendingSkill;
export function proceedRun(
  r0: Run,
  advance: boolean,
): { run: Run; next: NextScreen } {
  let r = advance ? leaveNode(r0) : r0;
  if (r.status === "over") return { run: r, next: "over" };
  // Last floor of the dungeon: level-ups no longer matter, finish straight away.
  if (advance && r.floor >= topFloor(r))
    r = { ...r, pendingPicks: 0, pendingSkill: false };
  if (owes(r)) return { run: r, next: "picks" };
  const n = advance ? nextFloor(r) : r;
  return { run: n, next: n.pendingRelic ? "relic" : "doors" };
}

export interface ReplayState {
  run: Run;
  fight: {
    battle: Battle;
    rng: Rng;
    node: FightNode;
    result: Run | null;
  } | null;
  picks: { advance: boolean } | null;
}

export const initialReplay = (
  seed: number,
  hero: Character,
  rank: RarityId | null = null,
  ascension = 0,
): ReplayState => ({
  run: createRun(seed, hero, true, rank, null, ascension),
  fight: null,
  picks: null,
});

type Fight = NonNullable<ReplayState["fight"]>;

function settle(s: ReplayState, f: Fight, next: Battle): ReplayState {
  const result =
    next.status === "ongoing" ? null : applyBattleResult(s.run, next, f.node);
  return { ...s, fight: { ...f, battle: next, result } };
}

// null = illegal action in the current state.
export function applyRunAction(
  s: ReplayState,
  a: RunAction,
): ReplayState | null {
  const { run } = s;
  if (run.status !== "active") return null;
  const idle = !s.fight && !s.picks;
  switch (a.t) {
    case "door": {
      if (!idle || run.pendingRelic || run.pendingLoot || owes(run))
        return null;
      const r = chooseDoor(run, a.i);
      if (!r) return null;
      if (r.node.type !== "fight") return { ...s, run: r.run };
      const f = startFight(r.run);
      if (!f) return null;
      return {
        ...s,
        run: f.run,
        fight: { battle: f.battle, rng: f.rng, node: r.node, result: null },
      };
    }
    case "act": {
      const f = s.fight;
      if (!f || f.result) return null;
      const next = step(f.battle, a.a, f.rng, a.target);
      if (next === f.battle) return null; // not allowed right now
      return settle(s, f, next);
    }
    case "auto": {
      const f = s.fight;
      if (!f || f.result || autoBlockReason(f.battle, f.node.kind)) return null;
      return settle(s, f, autoResolve(f.battle, f.rng));
    }
    case "fin": {
      const f = s.fight;
      if (!f?.result) return null;
      const p = proceedRun(f.result, f.battle.status === "won");
      return {
        run: p.run,
        fight: null,
        picks:
          p.next === "picks" ? { advance: f.battle.status === "won" } : null,
      };
    }
    case "skill": {
      if (!s.picks || !run.pendingSkill || !skillOffer(run).includes(a.id))
        return null;
      const p = proceedRun(chooseSkill(run, a.id), s.picks.advance);
      return {
        ...s,
        run: p.run,
        picks: p.next === "picks" ? s.picks : null,
      };
    }
    case "pick": {
      if (!s.picks || run.pendingSkill || !upgradeOffer(run).includes(a.id))
        return null;
      const p = proceedRun(pickUpgrade(run, a.id), s.picks.advance);
      return {
        ...s,
        run: p.run,
        picks: p.next === "picks" ? s.picks : null,
      };
    }
    case "relic": {
      if (!idle || !run.pendingRelic?.includes(a.id)) return null;
      return { ...s, run: chooseRelic(run, a.id) };
    }
    case "loot": {
      if (!idle || !run.pendingLoot) return null;
      const r = chooseLoot(run, a.i);
      return r === run ? null : { ...s, run: r };
    }
    case "buy": {
      if (!idle) return null;
      const r = buyItem(run, a.id);
      return r && { ...s, run: r };
    }
    case "event": {
      if (!idle) return null;
      const r = resolveEvent(run, a.i);
      return r && { ...s, run: r.run };
    }
    case "leave": {
      if (!idle || run.pendingRelic || run.pendingLoot) return null;
      const n = run.node;
      const canLeave = n
        ? n.type === "chest" || n.type === "rest" || n.type === "shop"
        : run.floorCleared;
      if (!canLeave) return null;
      const p = proceedRun(run, true);
      return {
        ...s,
        run: p.run,
        picks: p.next === "picks" ? { advance: true } : null,
      };
    }
  }
}

export interface ReplayResult {
  run: Run;
  applied: number;
  rejectedAt: number | null; // index of the first illegal action
  // Set (and nothing replayed) when the log was recorded by another engine.
  error?: "engine_version";
}

export function replayRun(
  seed: number,
  hero: Character,
  actions: readonly RunAction[],
  engineVersion: number = ENGINE_VERSION,
  rank: RarityId | null = null,
  ascension = 0,
): ReplayResult {
  let s = initialReplay(seed, hero, rank, ascension);
  if (engineVersion !== ENGINE_VERSION)
    return {
      run: s.run,
      applied: 0,
      rejectedAt: null,
      error: "engine_version",
    };
  for (let i = 0; i < actions.length; i++) {
    // Clients from before the final-boss change still send their (now moot) level-up picks
    // after the run is already won: ignore them instead of voiding the clear.
    const a = actions[i];
    if (s.run.status === "over" && (a.t === "pick" || a.t === "skill"))
      continue;
    const n = applyRunAction(s, a);
    if (!n) return { run: s.run, applied: i, rejectedAt: i };
    s = n;
  }
  return { run: s.run, applied: actions.length, rejectedAt: null };
}
