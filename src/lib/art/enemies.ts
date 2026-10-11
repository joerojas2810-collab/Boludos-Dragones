import { ELEMENT_ART } from "../art";
import { DUNGEON_THEMES } from "../game/levels";
import { isPixel } from "./pixel";
import type { Element } from "@/lib/game/elements";
import type { EnemyFamily } from "@/lib/game/worlds";
import type { SheetAnim } from "@/components/AnimSheet";
import { ENEMY_ANIMS, FINAL_BOSS_BY_ROUTE } from "./enemies.generated";
import pixelEnemies from "./pixel-enemies.generated.json";
import paintedVillains from "./painted-villains.generated.json";

// Native dimensions are imported independently of the heroes. Entrance is boss-only.
export const PX_FRAME_HEIGHT = pixelEnemies.frame_height;
export const PX_ASPECT = pixelEnemies.runtime_frame_width / PX_FRAME_HEIGHT;
export const PX_ACTIONS = {
  idle: { frames: 4, fps: 6, loop: true },
  attack: { frames: 4, fps: 10, loop: false },
  hit: { frames: 2, fps: 12, loop: false },
  defeat: { frames: 4, fps: 8, loop: false },
  entrance: { frames: 4, fps: 10, loop: false },
} as const;

export type EnemyAction = "idle" | "attack" | "hit" | "defeat" | "entrance";
export type EnemyTier = "normal" | "elite" | "boss";
export const PAINTED_FINAL_BOSS_BY_RANK:Record<string,string>=Object.fromEntries(
  Object.entries(DUNGEON_THEMES).map(([rank,theme])=>[rank,`boss_${theme.bossId}`]),
);

const FAMILY_ART: Record<EnemyFamily, string> = {
  limo: "slime",
  diablillo: "imp",
  arpia: "harpy",
  golem: "golem",
  espectro: "specter",
};

// Sheet for a family design (normal / elite / family boss), or the unique final
// boss of a dungeon route when `finalRank` is given. Missing sheets fall back to idle.
export function enemyAnim(
  family: EnemyFamily,
  tier: EnemyTier,
  element: Element,
  action: EnemyAction,
  finalRank?: string | null,
  artStyle?: "painted" | "pixel",
): SheetAnim {
  const design =
    (tier === "boss" && finalRank && FINAL_BOSS_BY_ROUTE[finalRank]) ||
    `enemy_${FAMILY_ART[family]}_${tier}`;
  const e = ELEMENT_ART[element];
  if (artStyle ? artStyle === "pixel" : isPixel()) {
    const a = action === "entrance" && tier !== "boss" ? "idle" : action;
    return { src: `/art/enemies-px/${design}_${e}_${a}.png`, ...PX_ACTIONS[a], aspect: PX_ASPECT };
  }
  const paintedDesign=(tier==="boss"&&finalRank&&PAINTED_FINAL_BOSS_BY_RANK[finalRank])||design;
  let name = `${paintedDesign}_${e}_${action}`;
  if (!ENEMY_ANIMS[name]) name = `${paintedDesign}_${e}_idle`; // e.g. entrance on a non-boss
  const updated=(paintedVillains as Record<string,SheetAnim>)[name];
  if(updated)return updated;
  const m = ENEMY_ANIMS[name];
  return {
    src: `/art/enemies/${name}.webp`,
    frames: m.frames,
    fps: m.fps,
    loop: m.loop,
  };
}
