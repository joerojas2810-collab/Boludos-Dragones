"use client";

import {createContext,useContext,useEffect,useState} from "react";
import {usePrefersReducedMotion} from "@/lib/motion";
import {PAINTED_SKILL_EFFECTS,type PaintedSkillEffectId} from "@/lib/art/painted-skill-effects";
import "./painted-defenses.css";

// Only the gallery provides this context; normal combat always removes its effects.
export const HoldSkillEffectReview=createContext(false);

export function PaintedSkillEffect({id,delay=0,className="",onDone}:{id:PaintedSkillEffectId;delay?:number;className?:string;onDone?:()=>void}){
  const reduced=usePrefersReducedMotion();
  const hold=useContext(HoldSkillEffectReview);
  const [gone,setGone]=useState(false);
  const [go,setGo]=useState(delay<=0);
  useEffect(()=>{
    if(delay<=0)return;
    const timer=setTimeout(()=>setGo(true),delay*1000);
    return ()=>clearTimeout(timer);
  },[delay]);
  useEffect(()=>{
    if(!go||hold)return;
    const timer=setTimeout(()=>{setGone(true);onDone?.();},reduced?1200:850);
    return ()=>clearTimeout(timer);
  },[go,reduced,onDone,hold]);
  if(!go||gone)return null;
  return <div aria-hidden className={className}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={PAINTED_SKILL_EFFECTS[id].src} alt="" draggable={false} data-skill-effect={id} className={`painted-defense-art painted-skill-${id}${reduced||hold?" is-still":""}`}/>
  </div>;
}
