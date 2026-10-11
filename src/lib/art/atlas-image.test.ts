import { describe,expect,it } from "vitest";
import { sheetImageSource } from "./atlas-image";
describe("sprite image delivery",()=>{
  it("leaves existing hero and pixel animation URLs unchanged",()=>{
    for(const src of ["/art/enemies-px/enemy_golem_normal_earth_idle.png","/art/heroes/hero_knight_fire_idle.webp"])
      expect(sheetImageSource({src})).toBe(src);
  });
  it("preloads the same cached optimized atlas URL used by the combat player",()=>{
    const anim={src:"/art-review/painted-enemies/production/variants/imp-boss-water-atlas-01.png",atlas:{width:1024,height:1280,canvas:300,frameRects:[{x:20,y:20,width:100,height:200}]}};
    const src=sheetImageSource(anim);
    expect(src.startsWith("/_next/image?")).toBe(true);
    expect(new URL(src,"http://localhost").searchParams.get("url")).toBe(anim.src);
    expect(sheetImageSource({...anim})).toBe(src);
  });
});
