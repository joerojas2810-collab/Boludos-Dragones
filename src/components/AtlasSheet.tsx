"use client";

import { useEffect, useRef } from "react";
import { atlasFrameStyle, type SpriteAtlas } from "@/lib/art/atlas-frame";
import { sheetImageSource } from "@/lib/art/atlas-image";

type Props = {
  anim: { src: string; frames: number; fps: number; loop: boolean; atlas: SpriteAtlas };
  flip?: boolean;
  className?: string;
  onDone?: () => void;
  last?: boolean;
};

export function AtlasSheet({ anim, flip, className = "", onDone, last }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { frames, fps, loop, atlas } = anim;
  const image = sheetImageSource(anim);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const el = box.current;
    if (!el || last) return;
    const sprites = Array.from(el.children) as HTMLElement[];
    const reduced=frames<2||window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced&&loop)return;
    let cancelled=false;
    let timer:number|undefined;
    let runs:Animation[]=[];
    async function play(){
      // Do not spend a short one-shot animation waiting for its first image download.
      const loaded=new window.Image();loaded.src=image;
      try{await loaded.decode();}catch{/* A failed image still completes its visual lifecycle. */}
      if(cancelled)return;
      if(reduced){
        sprites.forEach((sprite,i)=>{sprite.style.opacity=i===frames-1?"1":"0";});
        timer=window.setTimeout(()=>done.current?.(),fps>0?frames/fps*1000:0);
        return;
      }
      runs = sprites.map((sprite, i) => sprite.animate(
      Array.from({ length: frames + 1 }, (_, step) => ({
        opacity: Math.min(step, frames - 1) === i ? 1 : 0,
        offset: step / frames,
        easing: "step-end",
      })),
      { duration: frames / fps * 1000, iterations: loop ? Infinity : 1, fill: "forwards" },
    ));
      if (!loop) runs[0].onfinish = () => done.current?.();
    }
    void play();
    return () => {cancelled=true;if(timer!==undefined)window.clearTimeout(timer);runs.forEach(run=>run.cancel());};
  }, [image, frames, fps, loop, last]);
  // The framework serves a cached optimized image; crop percentages retain its aspect ratio.
  return <div ref={box} role="img" aria-hidden="true" className={`relative ${flip ? "-scale-x-100" : ""} ${className}`} style={{ aspectRatio: 1 }}>
    {atlas.frameRects.map((_, i) => <div key={i} style={{ ...atlasFrameStyle(atlas, i, image), opacity: i === (last ? frames - 1 : 0) ? 1 : 0, willChange: "opacity" }} />)}
  </div>;
}
