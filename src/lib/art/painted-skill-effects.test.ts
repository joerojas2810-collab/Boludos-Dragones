import {describe,it,expect} from "vitest";
import {existsSync} from "node:fs";
import path from "node:path";
import {paintedActionEffectFor as action,paintedOutcomeFor as outcome,PAINTED_SKILL_EFFECTS} from "./painted-skill-effects";
import {generateCharacter} from "@/lib/game/characters";
import {createRng} from "@/lib/game/rng";
import {startBattle,step,type CombatEvent} from "@/lib/game/combat";

describe("painted skill effects",()=>{
  const heal={type:"healed",actor:0,target:0,value:12} as const;
  const cleanse={type:"statusRemoved",actor:0,target:0,detail:"ruptura"} as const;
  const cancel={type:"telegraphCancelled",actor:1,detail:"channeling"} as const;
  it("routes protection casts, keeping Pixel and common defense intact",()=>{
    expect(action("knight_bastion",false)).toBe("bastion");
    expect(action("mage_barrier",false)).toBe("barrier");
    expect(action("rogue_step",false)).toBe("step");
    expect(action("defend",false)).toBeNull();
    for(const id of ["knight_bastion","mage_barrier","rogue_step"])expect(action(id,true)).toBeNull();
  });
  it("requires actual self healing, excluding Phoenix and other abilities",()=>{
    expect(outcome("cleric_restore",heal,false)).toEqual({id:"restore",at:0});
    for(const e of [{...heal,value:0},{...heal,target:1},{...heal,actor:1},{...heal,detail:"phoenix"}])expect(outcome("cleric_restore",e,false)).toBeNull();
    expect(outcome("cleric_cleanse",heal,false)).toBeNull();
  });
  it("only marks active purification and an actual enemy ritual cancellation",()=>{
    expect(outcome("cleric_cleanse",cleanse,false)).toEqual({id:"cleanse",at:0});
    expect(outcome("defend",cleanse,false)).toBeNull();
    expect(outcome("cleric_cleanse",{...cleanse,target:1},false)).toBeNull();
    expect(outcome("rogue_sabotage",cancel,false)).toEqual({id:"sabotage",at:1});
    expect(outcome("rogue_sabotage",{...cancel,detail:"charge"},false)).toBeNull();
    expect(outcome("mage_seal",cancel,false)).toBeNull();
    for(const [id,e] of [["cleric_restore",heal],["cleric_cleanse",cleanse],["rogue_sabotage",cancel]] as const)expect(outcome(id,e,true)).toBeNull();
  });
  it("supports the second duel player as caster",()=>{
    expect(outcome("cleric_restore",{...heal,actor:1,target:1},false,1)).toEqual({id:"restore",at:1});
    expect(outcome("rogue_sabotage",{...cancel,actor:0},false,1)).toEqual({id:"sabotage",at:0});
  });
  it("uses the actual engine outcomes for healing and purification",()=>{
    const rng=createRng(15102026);
    const hero=generateCharacter(rng,"clerigo"),foe=generateCharacter(rng,"caballero");
    const run=(skill:"cleric_restore"|"cleric_cleanse",ready:boolean)=>{
      const b=startBattle(hero,[foe],rng,{loadout:["cleric_restore","cleric_cleanse"]});
      b.player.res=3;
      if(ready){b.player.hp=Math.floor(b.player.hp*.6);b.player.statuses=[{id:"ruptura",stacks:1,turns:3}];}
      const next=step(b,skill,rng,0);
      return next.cev.flatMap((e:CombatEvent)=>{const fx=outcome(skill,e,false);return fx?[fx.id]:[];});
    };
    expect(run("cleric_restore",true)).toContain("restore");
    expect(run("cleric_restore",false)).not.toContain("restore");
    expect(run("cleric_cleanse",true)).toContain("cleanse");
    expect(run("cleric_cleanse",false)).not.toContain("cleanse");
  });
  it("shows Sabotaje only when the engine cancels a ritual",()=>{
    const rng=createRng(15102026);
    const hero=generateCharacter(rng,"picaro"),foe=generateCharacter(rng,"caballero");
    for(const intent of ["channeling","charge"] as const){
      const b=startBattle(hero,[foe],rng,{loadout:["rogue_step","rogue_sabotage"]});
      b.player.res=3;b.enemies[0].intent=intent;
      const next=step(b,"rogue_sabotage",rng,0);
      const effects=next.cev.flatMap(e=>{const fx=outcome("rogue_sabotage",e,false);return fx?[fx.id]:[];});
      expect(effects.includes("sabotage")).toBe(intent==="channeling");
    }
  });
  it("ships all six transparent effects",()=>{
    for(const fx of Object.values(PAINTED_SKILL_EFFECTS))expect(existsSync(path.join(process.cwd(),"public",fx.src))).toBe(true);
  });
});
