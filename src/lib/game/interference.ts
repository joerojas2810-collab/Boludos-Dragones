// Interference (rooms): pure, shared by client and server replay.
import type { Character } from "./characters";
import { ELEMENTS, elementMultiplier } from "./elements";
import { applyRunAction, type ReplayState, type RunAction } from "./replay";
import type { Battle } from "./combat";
import { chooseDoor, maxHp, startFight, type FightNode, type Run } from "./run";
import { isAid, type InterfereKind } from "./room";

export const STRONGER_ENEMY_MULT = 1.2; // [K] +20% hp/atk/def
export const HEAL_FRACTION = 0.4; // [K] aid "heal": hp restored before the fight (of max hp)
export const WARD_MULT = 1.15; // [K] aid "ward": +15% atk and def during the fight

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

const healRun = (r: Run): Run => ({
  ...r,
  hp: Math.min(maxHp(r), r.hp + Math.round(maxHp(r) * HEAL_FRACTION)),
});

const wardBattle = (b: Battle): Battle => ({
  ...b,
  player: {
    ...b.player,
    char: {
      ...b.player.char,
      stats: {
        ...b.player.char.stats,
        atk: Math.round(b.player.char.stats.atk * WARD_MULT * 10) / 10,
        def: Math.round(b.player.char.stats.def * WARD_MULT * 10) / 10,
      },
    },
  },
});

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
  const aid = isAid(boost);
  const node = aid ? r.node : applyEnemyBoost(r.node, boost, run.hero);
  const f = startFight({
    ...(boost === "heal" ? healRun(r.run) : r.run),
    node,
  });
  if (!f) return null;
  return {
    ...s,
    run: f.run,
    fight: {
      battle: boost === "ward" ? wardBattle(f.battle) : f.battle,
      rng: f.rng,
      node,
      result: null,
    },
  };
}
