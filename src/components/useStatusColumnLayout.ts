"use client";

import {useLayoutEffect,type RefObject} from "react";
import {statusColumnLayout} from "@/lib/art/status-column-layout";

export function useStatusColumnLayout(ref:RefObject<HTMLDivElement|null>,signature:string){
  useLayoutEffect(()=>{
    const stage=ref.current;
    if(!stage)return;
    const columns=Array.from(stage.querySelectorAll<HTMLElement>(".combat-status-icons"));
    const apply=()=>{
      columns.forEach(el=>el.style.setProperty("--status-shift","0px"));
      const bounds=stage.getBoundingClientRect();
      const boxes=columns.map(el=>el.getBoundingClientRect());
      const positions=statusColumnLayout(boxes,bounds.left+4,bounds.right-4);
      columns.forEach((el,i)=>el.style.setProperty("--status-shift",`${positions[i]-boxes[i].left}px`));
    };
    apply();
    const observer=new ResizeObserver(apply);
    observer.observe(stage);
    columns.forEach(el=>observer.observe(el));
    return ()=>observer.disconnect();
  },[ref,signature]);
}
