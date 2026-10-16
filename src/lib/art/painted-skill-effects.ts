import {PAINTED_DEFENSES,paintedDefenseFor} from "./painted-defenses";
import type {CombatEvent} from "@/lib/game/combat";

export const PAINTED_SKILL_EFFECTS = {
  ...PAINTED_DEFENSES,
  restore:{src:"/art/effects-painted-v2/restore-v1.webp",className:"bottom-[5%] w-[150%]"},
  cleanse:{src:"/art/effects-painted-v2/cleanse-v1.webp",className:"bottom-[5%] w-[150%]"},
  step:{src:"/art/effects-painted-v2/step-v1.webp",className:"bottom-[5%] w-[125%]"},
  sabotage:{src:"/art/effects-painted-v2/sabotage-v1.webp",className:"bottom-[8%] w-[100%]"},
} as const;
export type PaintedSkillEffectId = keyof typeof PAINTED_SKILL_EFFECTS;

export const DUEL_EFFECT_CLASS:Record<PaintedSkillEffectId,string>={
  bastion:"bottom-[12%] w-[80%]",barrier:"bottom-[8%] w-[85%]",
  restore:"bottom-[8%] w-[85%]",cleanse:"bottom-[8%] w-[85%]",
  step:"bottom-[8%] w-[80%]",sabotage:"bottom-[18%] w-[80%]",
};

export function paintedActionEffectFor(skill:string|undefined,pixel:boolean):PaintedSkillEffectId|null {
  if(pixel)return null;
  return paintedDefenseFor(skill,false) ?? (skill==="rogue_step"?"step":null);
}
type Outcome=Pick<CombatEvent,"type"|"actor"|"target"|"value"|"detail">;
/** Outcomes, not the cast alone, decide whether healing, cleansing or interruption actually happened. */
export function paintedOutcomeFor(skill:string|undefined,event:Outcome,pixel:boolean,caster=0):{id:PaintedSkillEffectId;at:number}|null {
  if(pixel)return null;
  if(skill==="cleric_restore"&&event.type==="healed"&&event.actor===caster&&event.target===caster&&(event.value??0)>0&&event.detail!=="phoenix")
    return {id:"restore",at:caster};
  if(skill==="cleric_cleanse"&&event.type==="statusRemoved"&&event.actor===caster&&event.target===caster)
    return {id:"cleanse",at:caster};
  if(skill==="rogue_sabotage"&&event.type==="telegraphCancelled"&&event.actor!==caster&&event.detail==="channeling")
    return {id:"sabotage",at:event.actor};
  return null;
}
