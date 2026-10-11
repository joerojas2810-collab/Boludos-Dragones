import { afterEach, describe, expect, it } from "vitest";
import { enemyAnim, PAINTED_FINAL_BOSS_BY_RANK, PX_ACTIONS, PX_ASPECT } from "./enemies";
import { FINAL_BOSS_BY_ROUTE } from "./enemies.generated";
import { isPixel, setPixel } from "./pixel";
import { ELEMENTS } from "../game/elements";
import { DUNGEON_THEMES } from "../game/levels";
import type { EnemyFamily } from "../game/worlds";
import type { EnemyAction, EnemyTier } from "./enemies";
import registry from "./painted-villains.generated.json";

const initialPixel=isPixel();
afterEach(()=>setPixel(initialPixel));
const families:EnemyFamily[]=["limo","diablillo","arpia","golem","espectro"];
const actions:EnemyAction[]=["idle","attack","hit","defeat","entrance"];

describe("FASE VILLANOS combat coverage",()=>{
  it("covers all 370 active actions with four complete atlas rectangles",()=>{
    expect(Object.keys(registry)).toHaveLength(370);
    setPixel(false);
    let checked=0;
    function verify(anim:ReturnType<typeof enemyAnim>,action:EnemyAction){
      expect(anim.src).toMatch(/^\/art-review\/painted-enemies\/production\//);
      expect([anim.frames,anim.fps,anim.loop]).toEqual([4,6,action==="idle"]);
      expect(anim.atlas?.frameRects).toHaveLength(4);
      const atlas=anim.atlas!;
      expect(atlas.canvas).toBeGreaterThan(0);
      for(const rect of atlas.frameRects){
        expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThan(0);expect(rect.height).toBeGreaterThan(0);
        expect(rect.x+rect.width).toBeLessThanOrEqual(atlas.width);
        expect(rect.y+rect.height).toBeLessThanOrEqual(atlas.height);
      }
      checked++;
    }
    for(const family of families)for(const tier of ["normal","elite","boss"] as EnemyTier[])for(const element of ELEMENTS)
      for(const action of actions.slice(0,tier==="boss"?5:4))verify(enemyAnim(family,tier,element,action),action);
    for(const [rank,theme] of Object.entries(DUNGEON_THEMES))for(const action of actions)
      verify(enemyAnim("diablillo","boss",theme.bossElement,action,rank),action);
    expect(checked).toBe(370);
  });
  it("uses each dungeon's named painted boss and element",()=>{
    setPixel(false);
    const aliases:Record<string,string>={boss_lord_of_flies:"boss_fly_lord",boss_faceless_one:"boss_faceless"};
    for(const [rank,theme] of Object.entries(DUNGEON_THEMES)){
      const design="boss_"+theme.bossId;
      expect(PAINTED_FINAL_BOSS_BY_RANK[rank]).toBe(design);
      const anim=enemyAnim("diablillo","boss",theme.bossElement,"idle",rank);
      expect(anim.src).toContain(aliases[design]||design);
    }
  });
  it("preserves pixel URLs, timing, aspect and route-keyed final boss selection",()=>{
    setPixel(true);
    for(const action of actions){
      const anim=enemyAnim("golem","boss","tierra",action);
      expect(anim).toEqual({src:`/art/enemies-px/enemy_golem_boss_earth_${action}.png`,...PX_ACTIONS[action],aspect:PX_ASPECT});
    }
    const final=enemyAnim("golem","boss","agua","idle","lord_of_flies");
    expect(final.src).toBe(`/art/enemies-px/${FINAL_BOSS_BY_ROUTE.lord_of_flies}_water_idle.png`);
  });
  it("lets the gallery force painted art without changing the saved art choice",()=>{
    setPixel(true);
    expect(enemyAnim("limo","normal","agua","attack",undefined,"painted").atlas).toBeDefined();
    expect(isPixel()).toBe(true);
    expect(enemyAnim("limo","normal","agua","entrance",undefined,"painted")).toEqual(enemyAnim("limo","normal","agua","idle",undefined,"painted"));
  });
});
