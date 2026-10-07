// Interference (rooms): pure, shared by client and server replay.
import type { Character } from "./characters";
import type { Battle } from "./combat";
import { ELEMENTS, elementMultiplier } from "./elements";
import {
  floorFight,
  floorStage,
  type Climb,
  type FloorKind,
} from "./floorFights";
import { isAid, type InterfereKind } from "./room";
import { startFight, type FightSpec } from "./stage";
import type { StageReplayState } from "./stageReplay";

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

/** Applies the interference to every enemy of a fight. */
export function applyEnemyBoost(
  spec: FightSpec,
  kind: InterfereKind,
  hero: Pick<Character, "element">,
): FightSpec {
  const enemies = spec.enemies.map((e) =>
    kind === "stronger_enemy"
      ? boostEnemy(e)
      : { ...e, element: adverseElementFor(hero.element) },
  );
  return { ...spec, enemies };
}

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
 * Opens the fight of a room floor (the door `kind` the player took) with the
 * interference somebody paid for. Client (playing) and server (replaying) both use
 * this, so the logs match. Without a boost it is the plain floor fight.
 */
export function startRoomFloor(
  c: Climb,
  kind: FloorKind,
  boost: InterfereKind | null,
): StageReplayState {
  const max = c.hero.stats.hp;
  const climb: Climb =
    boost === "heal"
      ? { ...c, hp: Math.min(max, c.hp + Math.round(max * HEAL_FRACTION)) }
      : c;
  let spec = floorFight(c.seed, c.floor, { rank: c.rank, kind });
  if (boost && !isAid(boost)) spec = applyEnemyBoost(spec, boost, c.hero);
  const stage = floorStage(climb, spec);
  const f = startFight(stage);
  return {
    stage,
    battle: boost === "ward" ? wardBattle(f.battle) : f.battle,
    rng: f.rng,
    settled: null,
  };
}
