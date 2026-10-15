// 1v1 duel between two humans (rooms) on the shared turn-based engine (combat.ts): a duel is a
// `Battle` created with `humanFoe`, where side a is `player` and side b is `enemies[0]`. Actors
// alternate by speed (progress scheduler); `Battle.awaiting` says whose decision is pending and
// `step` resolves it. There are no secret simultaneous picks any more. Pure and deterministic:
// the duel is fully described by (seed, heroes, loadouts, actions in order).
import {
  actionError,
  startBattle,
  step,
  TURN_CAP,
  type Action,
  type Battle,
} from "./combat";
import { CLASSES, type Character, type ClassId } from "./characters";
import type { Element } from "./elements";
import { createRng, type Rng } from "./rng";
import type { Loadout } from "./skills";

export const DUEL_MAX_TURN = TURN_CAP; // resolved turns; past it the engine reports "draw"
export type DuelStatus = "ongoing" | "a" | "b" | "draw";
export type DuelSide = "a" | "b";

/** Everything that defines a duel (what the server persists besides the action list). */
export interface DuelSetup {
  seed: number;
  heroes: Record<DuelSide, Character>;
  loadouts: Record<DuelSide, Loadout>;
}

/** Fallback for a missing, late or illegal action: Defender is always legal (documented rule). */
export const FALLBACK_ACTION: Action = "defend";

/** Tie-break order alternates by the shared seed: odd seeds give side b the first claim. */
export const swapOrderOf = (seed: number): boolean => (seed & 1) === 1;

// Balanced mode evens the classes out (scripts/duel-sim.ts): the class templates are tuned for
// dungeons with gear and weapons, so in a plain 1v1 some are far ahead and some far behind.
export const DUEL_TUNE: Record<ClassId, { hp: number; atk: number }> = {
  caballero: { hp: 1.02, atk: 0.99 },
  mago: { hp: 1.0, atk: 0.99 },
  picaro: { hp: 1.1, atk: 1.04 },
  clerigo: { hp: 1.14, atk: 1.12 },
  berserker: { hp: 1.0, atk: 0.98 },
};

/** Balanced mode: pick a class, everyone gets the same plain hero of it. */
export function balancedHero(
  classId: ClassId,
  element: Element,
): Character {
  const t = CLASSES[classId];
  return {
    name: t.name,
    classId,
    element,
    stats: {
      ...t.stats,
      hp: Math.round(t.stats.hp * DUEL_TUNE[classId].hp),
      atk: Math.round(t.stats.atk * DUEL_TUNE[classId].atk * 10) / 10,
    },
    traits: [],
    catchphrase: "",
    level: 1,
    xp: 0,
  };
}

/** Starts the duel battle. `rng` must be `createRng(setup.seed)` (replays rely on it). */
export const startDuel = (setup: DuelSetup, rng: Rng): Battle =>
  startBattle(setup.heroes.a, [setup.heroes.b], rng, {
    humanFoe: true,
    loadout: setup.loadouts.a,
    foeLoadout: setup.loadouts.b,
    swapOrder: swapOrderOf(setup.seed),
  });

/** Side whose decision is pending (null once the duel is over). */
export const sideToMove = (b: Battle): DuelSide | null =>
  b.status !== "ongoing" ? null : b.awaiting === 0 ? "a" : "b";

/** Maps the engine status: won = side a won, lost = side b won, draw = cap / both fell. */
export const duelStatus = (b: Battle): DuelStatus =>
  b.status === "won" ? "a" : b.status === "lost" ? "b" : b.status === "draw" ? "draw" : "ongoing";

/** The action itself when legal for the side to move, otherwise the fallback (Defender). */
export const sanitize = (b: Battle, act: Action | null | undefined): Action =>
  act && actionError(b, act) === null ? act : FALLBACK_ACTION;

/** Plays `actions` in order from the start; each is sanitized exactly like the live server does. */
export function replayDuel(setup: DuelSetup, actions: readonly Action[]): { battle: Battle; rng: Rng } {
  const rng = createRng(setup.seed);
  let battle = startDuel(setup, rng);
  for (const act of actions) {
    if (battle.status !== "ongoing") break;
    battle = step(battle, sanitize(battle, act), rng);
  }
  return { battle, rng };
}
