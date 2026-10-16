import type {CSSProperties} from "react";
import {HeroSprite} from "@/components/HeroSprite";
import {AnimSheet} from "@/components/AnimSheet";
import {enemyAnim} from "@/lib/art/enemies";
import {atlasFrameStyle} from "@/lib/art/atlas-frame";
import {sheetImageSource} from "@/lib/art/atlas-image";
import {Vfx} from "@/components/fx/Vfx";
import {paintedBackground} from "@/lib/art/painted-backgrounds";
import {PAINTED_SKILL_EFFECTS} from "@/lib/art/painted-skill-effects";
import type {ClassId} from "@/lib/game/characters";
import {EFFECTS} from "@/lib/art/effects.generated";

export const PHASE_EFFECTS = [
  {id:"bastion",title:"Bastión",classId:"caballero",src:PAINTED_SKILL_EFFECTS.bastion.src,current:"shield",status:"Aprobado · integrado localmente",note:"Protección física baja y ancha. No reemplaza la guardia común."},
  {id:"barrier",title:"Barrera arcana",classId:"mago",src:PAINTED_SKILL_EFFECTS.barrier.src,current:"shield",status:"Aprobado · integrado localmente",note:"Óvalo de energía con centro transparente. Se distingue de Bastión."},
  {id:"restore",title:"Restaurar",classId:"clerigo",src:PAINTED_SKILL_EFFECTS.restore.src,current:"regeneration",status:"Integrado localmente · para revisar",note:"Cura activa: pulso verde ascendente. Se activa por curación efectiva."},
  {id:"cleanse",title:"Purificar",classId:"clerigo",src:PAINTED_SKILL_EFFECTS.cleanse.src,current:"ritual_interrupt",status:"Integrado localmente · para revisar",note:"Barrido dorado que disipa un estado negativo. El pequeño escudo es un efecto aparte."},
  {id:"step",title:"Paso evasivo",classId:"picaro",src:PAINTED_SKILL_EFFECTS.step.src,current:"shield",status:"Integrado localmente · para revisar",note:"Estela lateral y brillo de guardia. Reduce el próximo impacto; no representa una esquiva garantizada."},
  {id:"sabotage",title:"Sabotaje",classId:"picaro",src:PAINTED_SKILL_EFFECTS.sabotage.src,current:"ritual_interrupt",status:"Integrado localmente · para revisar",note:"Sello roto sobre el enemigo. La interrupción se muestra solo cuando se cancele un ritual."},
] as const;
export type PhaseEffect = typeof PHASE_EFFECTS[number];
export type PreviewSettings={scene:string;opacity:number;visible:boolean;playing:boolean;tick:number;reduced:boolean};

export function PhaseCard({effect:p,settings:s,old=false}:{effect:PhaseEffect;settings:PreviewSettings;old?:boolean}) {
  const meta=EFFECTS[p.current];
  const isTarget=p.id==="sabotage";
  const target=enemyAnim("golem","normal","tierra","idle",undefined,"painted");
  return <article className="phase-card"><h3>{p.title}{old?" · actual":""}</h3><div className="phase-status">{old?"Efecto compartido actual":p.status}</div>
    <div className="vfx-scene" style={{backgroundImage:`url(${paintedBackground(s.scene)?.src})`}}>
      <div className="vfx-hero">{isTarget?(s.playing&&!s.reduced?<AnimSheet anim={target} className="h-full w-full"/>:<div className="relative h-full w-full">{target.atlas&&<div style={atlasFrameStyle(target.atlas,0,sheetImageSource(target))}/>}</div>):<HeroSprite classId={p.classId as ClassId} element="agua" crop className="h-full w-full"/>}</div>
      {s.visible&&(old?<div className="vfx-original">{s.playing&&!s.reduced?<Vfx key={s.tick} id={p.current} className="w-40"/>:<div className="w-40" style={{aspectRatio:"1",backgroundImage:`url(/art/effects/${p.current}.webp?v=2)`,backgroundSize:`${meta.frames*100}% 100%`,backgroundPosition:"60% 0"}}/>}</div>:<div key={s.tick} className={`vfx-proposal vfx-${p.id}${s.playing&&!s.reduced?" is-playing":""}`} style={{"--pilot-opacity":s.opacity} as CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt={`Efecto ${p.title}`}/>
      </div>)}
    </div><p>{p.note}</p>{isTarget&&<small>Mostrado sobre el rival, donde ocurre la interrupción.</small>}
  </article>;
}
export function PhaseOverview({settings}:{settings:PreviewSettings}){
  return <section id="phase-overview"><h2>Los seis diseños de la fase</h2><p>Revisión conjunta del acabado. Los seis efectos están integrados en el combate local; todavía no se publicaron.</p><div className="phase-grid">{PHASE_EFFECTS.map(effect=><PhaseCard key={effect.id} effect={effect} settings={settings}/>)}</div></section>;
}
