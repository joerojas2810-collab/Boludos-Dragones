import { ELEMENT_ART } from "@/lib/art";
import type { Element } from "@/lib/game/elements";
import type { EnemyFamily } from "@/lib/game/worlds";
import type { SheetAnim } from "@/components/AnimSheet";
import { ENEMY_ANIMS, FINAL_BOSS_BY_RANK } from "./enemies.generated";

export type EnemyAction = "idle" | "attack" | "hit" | "defeat" | "entrance";
export type EnemyTier = "normal" | "elite" | "boss";

const FAMILY_ART: Record<EnemyFamily, string> = {
  limo: "slime",
  diablillo: "imp",
  arpia: "harpy",
  golem: "golem",
  espectro: "specter",
};

// Sheet for a family design (normal / elite / family boss), or the unique final
// boss of a dungeon rank when `finalRank` is given. Missing sheets fall back to idle.
export function enemyAnim(
  family: EnemyFamily,
  tier: EnemyTier,
  element: Element,
  action: EnemyAction,
  finalRank?: string | null,
): SheetAnim {
  const design =
    (tier === "boss" && finalRank && FINAL_BOSS_BY_RANK[finalRank]) ||
    `enemy_${FAMILY_ART[family]}_${tier}`;
  const e = ELEMENT_ART[element];
  let name = `${design}_${e}_${action}`;
  if (!ENEMY_ANIMS[name]) name = `${design}_${e}_idle`; // e.g. entrance on a non-boss
  const m = ENEMY_ANIMS[name];
  return {
    src: `/art/enemies/${name}.webp`,
    frames: m.frames,
    fps: m.fps,
    loop: m.loop,
  };
}
