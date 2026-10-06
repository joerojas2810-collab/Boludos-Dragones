// Interference (rooms): pure, shared by client and server replay.
import type { Character } from "./characters";
import { ELEMENTS, elementMultiplier } from "./elements";
import { applyRunAction, type ReplayState, type RunAction } from "./replay";
import { chooseDoor, startFight, type FightNode } from "./run";
import type { InterfereKind } from "./room";

export const STRONGER_ENEMY_MULT = 1.2; // [K] +20% hp/atk/def

const boostEnemy = (e: Character): Character => ({
  ...e,
  stats: {
    ...e.stats,
    hp: Math.round(e.stats.hp * STRONGER_ENEMY_MULT),
    atk: Math.round(e.stats.atk * STRONGER_ENEMY_MULT * 10) / 10,
    def: Math.round(e.stats.def * STRONGER_ENEMY_MULT * 10) / 10,
  },
});

/** First element that beats `el` (deterministic: list order). */
export const adverseElementFor = (el: Character["element"]) =>
  ELEMENTS.find((x) => elementMultiplier(x, el) > 1) ?? el;

/** Applies the interference to every enemy of a fight node. */
export function applyEnemyBoost(
  node: FightNode,
  kind: InterfereKind,
  hero: Pick<Character, "element">,
): FightNode {
  const enemies = node.enemies.map((e) =>
    kind === "stronger_enemy"
      ? boostEnemy(e)
      : { ...e, element: adverseElementFor(hero.element) },
  );
  return { ...node, enemies, enemy: enemies[0] };
}

/**
 * `applyRunAction` + interference: the `door` that opens a fight node gets the
 * boosted enemies. Client (playing) and server (replaying) both use this, so
 * the logs match. Without a boost it is exactly `applyRunAction`.
 */
export function applyRoomAction(
  s: ReplayState,
  a: RunAction,
  boost: InterfereKind | null,
): ReplayState | null {
  if (!boost || a.t !== "door") return applyRunAction(s, a);
  const { run } = s;
  if (s.fight || s.picks || run.pendingRelic) return null;
  if (run.pendingPicks > 0 || run.pendingSkill) return null;
  const r = chooseDoor(run, a.i);
  if (!r) return null;
  if (r.node.type !== "fight") return applyRunAction(s, a);
  const node = applyEnemyBoost(r.node, boost, run.hero);
  const f = startFight({ ...r.run, node });
  if (!f) return null;
  return {
    ...s,
    run: f.run,
    fight: { battle: f.battle, rng: f.rng, node, result: null },
  };
}
