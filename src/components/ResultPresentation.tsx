"use client";

import type {ReactNode} from "react";
import type {Character} from "@/lib/game/characters";
import {paintedBackground} from "@/lib/art/painted-backgrounds";
import {isPixel} from "@/lib/art/pixel";
import {Panel} from "./Panel";
import {HeroSprite} from "./HeroSprite";
import "./result-presentation.css";

/** Presentation only: amounts, unlock conditions, persistence and actions stay with the caller. */
export function ResultPresentation({title,hero,tone,scene="swamp_boss",children,className=""}:{
  title:string;
  hero:Pick<Character,"classId"|"element"|"name"|"level">;
  tone:"victory"|"defeat"|"neutral";
  scene?:string;
  children:ReactNode;
  className?:string;
}){
  if(isPixel())return <Panel title={title} className={className}>{children}</Panel>;
  return <section className={`result-presentation result-${tone}`} style={{backgroundImage:`linear-gradient(180deg,#06121b80,#06121b35 45%,#06121bee),url(${paintedBackground(scene)?.src})`}} aria-label={title}>
    <header className="result-presentation-title"><p>{tone==="victory"?"AVENTURA COMPLETADA":tone==="defeat"?"LA AVENTURA CONTINÚA":"TU RECORRIDO"}</p><h2>{title}</h2></header>
    <div className="result-presentation-layout"><div className="result-presentation-hero"><HeroSprite classId={hero.classId} element={hero.element} action={tone==="neutral"?"idle":tone} animated className="h-full w-full"/><p>{hero.name}<span>Nv {hero.level}</span></p></div><div className="result-presentation-content space-y-3">{children}</div></div>
  </section>;
}
