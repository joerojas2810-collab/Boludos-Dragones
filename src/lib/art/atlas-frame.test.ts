import { describe, expect, it } from "vitest";
import { atlasFrameStyle, type SpriteAtlas } from "./atlas-frame";

const atlas: SpriteAtlas = {width:1500,height:2000,canvas:500,frameRects:[{x:300,y:400,width:200,height:300},{x:700,y:900,width:300,height:100}]};
describe("painted atlas layout",()=>{
  it("the CSS background offset lands exactly on the selected source rectangle",()=>{
    const style=atlasFrameStyle(atlas,0,"/sprite.png");
    const [x,y]=style.backgroundPosition.split(" ").map(parseFloat);
    expect(x/100*(atlas.width-atlas.frameRects[0].width)).toBeCloseTo(300);
    expect(y/100*(atlas.height-atlas.frameRects[0].height)).toBeCloseTo(400);
    expect(style.width).toBe("40%");expect(style.height).toBe("60%");
  });
  it("doubling source resolution leaves its on-screen crop and scale unchanged",()=>{
    const twice={...atlas,width:3000,height:4000,canvas:1000,frameRects:atlas.frameRects.map(f=>({x:f.x*2,y:f.y*2,width:f.width*2,height:f.height*2}))};
    expect(atlasFrameStyle(twice,0,"/sprite.png")).toEqual(atlasFrameStyle(atlas,0,"/sprite.png"));
  });
  it("fallen poses keep the same floor and right-anchored attacks keep their body side",()=>{
    const fallen=atlasFrameStyle(atlas,1,"/sprite.png");
    expect(fallen.bottom).toBe(atlasFrameStyle(atlas,0,"/sprite.png").bottom);
    expect(fallen.height).toBe("20%");
    const slime=atlasFrameStyle({...atlas,anchorRight:true},0,"/sprite.png");
    expect(slime.right).toBe("5%");expect(slime.left).toBeUndefined();expect(slime.transform).toBeUndefined();
  });
  it("a full-image frame has finite zero background offsets",()=>{
    expect(atlasFrameStyle({width:100,height:100,canvas:100,frameRects:[{x:0,y:0,width:100,height:100}]},0,"/sprite.png").backgroundPosition).toBe("0% 0%");
  });
});
