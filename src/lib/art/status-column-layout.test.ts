import {describe,it,expect} from "vitest";
import {statusColumnLayout} from "./status-column-layout";
describe("combat status column separation",()=>{
  it("separates colliding hero and rival columns and keeps them inside the stage",()=>{
    for(const width of [320,390,768,1440]){
      for(const count of [3,4]){
        const columns=Array.from({length:count},(_,i)=>({left:width*.45+i*12,width:32}));
        const positions=statusColumnLayout(columns,4,width-4);
        for(let i=0;i<count;i++){
          expect(positions[i]).toBeGreaterThanOrEqual(4);
          expect(positions[i]+32).toBeLessThanOrEqual(width-4);
          if(i)expect(positions[i]-(positions[i-1]+32)).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
  it("preserves well separated positions and associates offsets with their own fighter",()=>{
    expect(statusColumnLayout([{left:400,width:32},{left:50,width:32}],0,500)).toEqual([400,50]);
  });
  it("reads browser rectangle properties even when they are inherited accessors",()=>{
    const rect=Object.create({left:50,width:32}) as {left:number;width:number};
    expect(statusColumnLayout([rect,rect],0,500)).toEqual([50,90]);
  });
});
