import {describe,it,expect} from "vitest";
import {existsSync} from "node:fs";
import path from "node:path";
import {paintedDefenseFor,PAINTED_DEFENSES} from "./painted-defenses";

describe("painted defense routing",()=>{
  it("only replaces the two approved casts in painted mode",()=>{
    expect(paintedDefenseFor("knight_bastion",false)).toBe("bastion");
    expect(paintedDefenseFor("mage_barrier",false)).toBe("barrier");
    for(const id of ["knight_bastion","mage_barrier","rogue_step","defend","cleric_cleanse",undefined]){
      expect(paintedDefenseFor(id,true)).toBeNull();
    }
    for(const id of ["rogue_step","defend","cleric_cleanse",undefined]){
      expect(paintedDefenseFor(id,false)).toBeNull();
    }
  });
  it("ships both approved overlays",()=>{
    for(const d of Object.values(PAINTED_DEFENSES)){
      expect(existsSync(path.join(process.cwd(),"public",d.src))).toBe(true);
    }
  });
});
