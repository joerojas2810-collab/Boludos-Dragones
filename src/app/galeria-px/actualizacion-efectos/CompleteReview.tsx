"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useArt} from "@/components/ArtScope";
import {usePrefersReducedMotion} from "@/lib/motion";
import {PhaseOverview,PhaseCard,PHASE_EFFECTS} from "./PhaseOverview";
import {ExistingEffects} from "./ExistingEffects";
import {DefenseBattle} from "./DefenseBattle";
import {StatusPositionReview} from "./StatusPositionReview";
import "./review.css";

export function CompleteReview(){
  const art=useArt();
  const reduced=usePrefersReducedMotion();
  const [tab,setTab]=useState("combat");
  const [selected,setSelected]=useState("sabotage");
  const [playing,setPlaying]=useState(false);
  const [tick,setTick]=useState(0);
  const [scene,setScene]=useState("swamp_normal");
  const [opacity,setOpacity]=useState(.8);
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    if(!playing||reduced)return;
    const timer=setInterval(()=>setTick(v=>v+1),2200);
    return ()=>clearInterval(timer);
  },[playing,reduced]);
  const settings={scene,opacity,visible,playing,tick,reduced};
  const effect=PHASE_EFFECTS.find(p=>p.id===selected)!;
  return <main className="vfx-review">
    <header><span>FASE EFECTOS DE COMBATE · REVISIÓN COMPLETA</span><h1>Toda la fase, antes de publicar</h1><p>Seis diseños principales sobre personajes y escenarios del juego, junto a los impactos y señales existentes. Revisá el conjunto y después ajustamos lo que haga falta.</p><Link href="/galeria-px/actualizacion-iconografia">← Iconografía publicada</Link></header>
    <div className="phase-summary"><span><b>6</b> diseños principales</span><span><b>20</b> efectos existentes para revisar</span><span><b>5</b> estados elementales</span><span><b>0</b> publicaciones de esta fase</span></div>
    <p className="vfx-note">Los seis efectos están integrados localmente en mazmorras y duelos para tu revisión. El juego publicado sigue sin estos cambios.</p>
    <nav className="phase-tabs" aria-label="Vistas de la fase">{[["status-position","Avisos al costado"],["complete","Vista completa · 6 diseños"],["compare","Antes / después"],["existing","Impactos y estados actuales"],["combat","Combate integrado · 6 habilidades"]].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setPlaying(false);}}>{label}</button>)}</nav>
    {art.pixel&&<p className="vfx-note">La vista de propuestas está diseñada para Pintado. <button onClick={()=>art.set(false)}>Ver en Pintado</button></p>}
    {tab!=="combat"&&tab!=="status-position"&&<div className="vfx-controls">
      <label>Escenario <select value={scene} onChange={e=>setScene(e.target.value)}><option value="swamp_normal">Pantano · oscuro</option><option value="peaks_normal">Volcán · luminoso</option><option value="canyon_normal">Cañón · cálido</option></select></label>
      <button aria-pressed={playing} onClick={()=>{setPlaying(v=>!v);setTick(v=>v+1);}}>{playing?"Pausar y ver fotograma":"Reproducir animaciones"}</button>
      <button onClick={()=>{setPlaying(true);setTick(v=>v+1);}}>Repetir</button>
      <label>Intensidad <input type="range" min=".35" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/><output>{Math.round(opacity*100)}%</output></label>
      <label><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/> Mostrar efectos</label>
    </div>}
    {tab==="complete"&&<><p className="vfx-note">Los nuevos diseños usan una ilustración transparente con aparición, desplazamiento y desvanecimiento. Son propuestas animadas económicas; no se presentan como secuencias dibujadas fotograma a fotograma. <a href="#phase-overview">Ver los seis diseños juntos ↓</a></p><PhaseOverview settings={settings}/></>}
    {tab==="compare"&&<section><h2>Comparar una habilidad</h2><label className="vfx-note">Habilidad <select value={selected} onChange={e=>{setSelected(e.target.value);setTick(v=>v+1);}}>{PHASE_EFFECTS.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><div className="phase-compare"><PhaseCard effect={effect} settings={settings} old/><PhaseCard effect={effect} settings={settings}/></div></section>}
    {tab==="existing"&&<ExistingEffects settings={settings}/>}
    {tab==="combat"&&<DefenseBattle/>}
    {tab==="status-position"&&<StatusPositionReview/>}
    <footer>Para revisar: tamaño, brillo, movimiento, visibilidad del personaje y diferencia entre habilidades. Los impactos y estados existentes se proponen conservar hasta evaluar el conjunto. La fase completa queda abierta a tus correcciones; sin commit ni push.</footer>
  </main>;
}
