// Level sweep ("Barrido"): a level already cleared at this ascension can be resolved
// instantly when the hero is far stronger than recommended. The engine plays it with
// autoPolicy; if that play does not clear the level, the sweep is refused and the
// player fights it for real. Pays like a repeat clear (60%, daily decay).
import { autoPolicy } from "./auto";
import { step } from "./combat";
import type { Character } from "./characters";
import { clearedLevels, isLevelUnlocked } from "./dungeonProgress";
import { heroPower, type Profile } from "./profile";
import { recommendedPower } from "./recommended";
import type { RarityId } from "./rarity";
import {
  abandonStage,
  createStage,
  finishFight,
  startFight,
  type FightSpec,
  type Stage,
} from "./stage";

export const SWEEP_POWER_FACTOR = 1; // hero power / recommended power needed

const MAX_STEPS_PER_FIGHT = 400;

export function sweepStage(
  seed: number,
  hero: Character,
  fights: FightSpec[],
  asc = 0,
): Stage {
  let st = createStage(seed, hero, fights, asc);
  while (st.status === "playing") {
    const f = startFight(st);
    let b = f.battle;
    for (let k = 0; k < MAX_STEPS_PER_FIGHT && b.status === "ongoing"; k++) {
      const p = autoPolicy(b);
      b = step(b, p.action, f.rng, p.target);
    }
    st = b.status === "ongoing" ? abandonStage(st) : finishFight(st, b);
  }
  return st;
}

/** Why this hero cannot sweep this level (null = it can). */
export function sweepBlock(
  p: Profile,
  heroId: string,
  rank: RarityId,
  level: number,
  asc: number,
): string | null {
  if (!isLevelUnlocked(p.dungeons, rank, level, asc) || level >= clearedLevels(p.dungeons, rank, asc))
    return "Primero supera este nivel una vez.";
  if (heroPower(p, heroId) < SWEEP_POWER_FACTOR * recommendedPower(rank, level, asc))
    return `Necesitas poder ${Math.ceil(SWEEP_POWER_FACTOR * recommendedPower(rank, level, asc))} para barrerlo.`;
  return null;
}
