"use client";

import {useEffect,useState,type CSSProperties} from "react";
import Link from "next/link";
import {ItemCard,type ItemView} from "@/components/ItemCard";
import {HeroSprite} from "@/components/HeroSprite";
import {AnimSheet} from "@/components/AnimSheet";
import {CLASS_ART,ELEMENT_ART,HERO_ART_V} from "@/lib/art";
import {HERO_ACTIONS} from "@/lib/art/heroes";
import {Icon} from "@/components/Icon";
import {Panel} from "@/components/Panel";
import {PullReveal} from "@/components/PullReveal";
import {useArt} from "@/components/ArtScope";
import {paintedBackground} from "@/lib/art/painted-backgrounds";
import {RARITIES,RARITY_IDS,type RarityId} from "@/lib/game/rarity";
import {usePrefersReducedMotion} from "@/lib/motion";
import {IntegratedRewards} from "./IntegratedRewards";
import {generateCharacter,CLASS_IDS} from "@/lib/game/characters";
import {ELEMENTS} from "@/lib/game/elements";
import {createRng} from "@/lib/game/rng";
import "./rewards-review.css";

type View="summon"|"victory"|"defeat"|"loot"|"tower";
type Outcome="new"|"copy"|"refund";
const OUTCOMES:Record<Outcome,{badge:string;title:string;note:string}>={
  new:{badge:"NUEVO",title:"Nuevo en tu colección",note:"Se incorpora a tu colección."},
  copy:{badge:"+1 COPIA",title:"Duplicado · copia guardada",note:"La copia queda disponible en tu colección."},
  refund:{badge:"REEMBOLSO 60",title:"Reembolso · 60 monedas",note:"Ejemplo de un resultado convertido en monedas."},
};
const HERO:Extract<ItemView,{kind:"character"}>={kind:"character",classId:"caballero",name:"Guardián del Alba",rarity:"s",stars:0,element:"fuego",badge:"NUEVO",factors:generateCharacter(createRng(16102026),"caballero").factors};
const SWORD:Extract<ItemView,{kind:"weapon"}>={kind:"weapon",type:"espada",name:"Filo de la Marea",rarity:"a",stars:0,element:"agua",badge:"NUEVO"};
function sampleItems(rank:RarityId,outcome:Outcome,count:number):Extract<ItemView,{kind:"character"}>[]{
  const first={...HERO,rarity:rank,badge:OUTCOMES[outcome].badge};
  if(count===1)return [first];
  const names=["Guardián del Alba","Custodio arcano","Sombra de la Marea","Guardián del Santuario","Furia del Bosque"];
  return [first,...Array.from({length:9},(_,i):Extract<ItemView,{kind:"character"}>=>{
    const classId=CLASS_IDS[(i+1)%CLASS_IDS.length];
    const hero=generateCharacter(createRng(16102027+i),classId);
    return {kind:"character",classId,name:names[(i+1)%names.length],element:ELEMENTS[(i+1)%ELEMENTS.length],rarity:RARITY_IDS[Math.min(i%5,RARITY_IDS.indexOf(rank))],stars:0,factors:hero.factors,traits:hero.traits,badge:i%3===0?"+1 COPIA":"NUEVO"};
  })];
}

export function RewardReview(){
  const art=useArt();
  const reduced=usePrefersReducedMotion();
  const [view,setView]=useState<View>("summon");
  const [rank,setRank]=useState<RarityId>("s");
  const [outcome,setOutcome]=useState<Outcome>("new");
  const [count,setCount]=useState(1);
  const [longCards,setLongCards]=useState(false);
  const [motion,setMotion]=useState(true);
  const [shown,setShown]=useState(10);
  const [integrated,setIntegrated]=useState(true);
  const [original,setOriginal]=useState(false);
  const [notice,setNotice]=useState("");
  const [run,setRun]=useState(0);
  const items=sampleItems(rank,outcome,count).map(item=>({...item,name:longCards?`${item.name} de las antiguas montañas de la Marea interminable`:item.name}));
  const playing=motion&&!reduced;
  useEffect(()=>{
    if(shown>=count)return;
    const timer=setTimeout(()=>setShown(n=>n+1),playing?(shown<0?850:240):0);
    return ()=>clearTimeout(timer);
  },[shown,count,playing]);
  const replay=()=>{setRun(n=>n+1);setShown(playing?-1:count);setNotice("");};
  const reset=()=>{setShown(10);setNotice("");};
  const act=(label:string)=>setNotice(`Prueba de «${label}». No se ejecutó ninguna acción sobre tu partida.`);
  const scene=paintedBackground(view==="summon"?"gacha":view==="loot"?"forge":"swamp_boss");
  const opening=view==="summon"&&shown<0;
  const pose=view==="defeat"?"defeat":"victory";
  const poseAnim={src:`/art/heroes/hero_${CLASS_ART.caballero}_${ELEMENT_ART.fuego}_${pose}.webp?v=${HERO_ART_V}`,...HERO_ACTIONS[pose]};
  const tint=RARITIES[rank].color;
  const reward=(label:string,value:string,icon:string)=><div className="pr-stat">{icon==="experience"?<span className="pr-exp-glyph" aria-hidden>XP</span>:<Icon name={icon} className="h-10 w-10"/>}<div><small>{label}</small><strong>{value}</strong></div></div>;
  return <main className="pr-review">
    <header className="pr-review-header"><p>FASE PRESENTACIONES Y RECOMPENSAS · INTEGRACIÓN LOCAL</p><h1>Que obtener algo se sienta especial.</h1><p>El mismo mundo pintado, con más protagonismo para el héroe y el botín. Conservamos la interfaz y el arte aprobados.</p><Link href="/galeria-px/actualizacion-efectos">← Efectos de combate</Link></header>
    <p className="pr-local-note">Galería local · datos de ejemplo · sin tiradas, gastos ni cambios en tu progreso. Rangos y cantidades son muestras, no probabilidades ni premios prometidos.</p>
    {art.pixel&&<p className="pr-local-note">Tu navegador está en Pixel Art. Esta propuesta se evalúa en el estilo Pintado. <button onClick={()=>art.set(false)}>Ver en Pintado</button></p>}
    <nav className="pr-tabs" aria-label="Presentaciones para revisar">{([["summon","Invocación"],["victory","Victoria"],["defeat","Derrota"],["loot","Botín y materiales"],["tower","Fin de Torre"]] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);if(id==="tower")setIntegrated(true);reset();}}>{label}</button>)}</nav>
    <div className="pr-controls">
      <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label><label><input type="checkbox" checked={integrated} onChange={e=>{setIntegrated(e.target.checked);if(view==="tower")setView("victory");}}/> Ver componentes integrados del juego</label>
      {view==="summon"&&<><label><input type="checkbox" checked={longCards} onChange={e=>setLongCards(e.target.checked)}/> Nombres largos en cartas</label><label>Resultados <select value={count} onChange={e=>{setCount(Number(e.target.value));reset();}}><option value={1}>Una invocación</option><option value={10}>Diez invocaciones</option></select></label><label>Mejor rango <select value={rank} onChange={e=>{setRank(e.target.value as RarityId);reset();}}>{RARITY_IDS.map(r=><option key={r} value={r}>{RARITIES[r].label}</option>)}</select></label><label>Primer resultado <select value={outcome} onChange={e=>{setOutcome(e.target.value as Outcome);reset();}}><option value="new">Nuevo</option><option value="copy">Copia guardada</option><option value="refund">Reembolso</option></select></label></>}
      {!integrated&&<label><input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/> Animar presentación</label>}
      <button onClick={()=>{if(integrated&&view==="summon")setOriginal(true);else replay();}}>Repetir presentación</button>
      {view==="summon"&&<button onClick={()=>setOriginal(true)}>Abrir invocación del juego</button>}
    </div>
    {reduced&&<p className="pr-local-note">Movimiento reducido activo: presentación inmediata y sin animaciones decorativas.</p>}
    {integrated?<IntegratedRewards replayKey={run} view={view} items={items} onPull={()=>setOriginal(true)}/>:<section key={`${view}-${run}`} className={`pr-stage pr-${view}${playing?" pr-motion":""}`} style={{"--pr-tint":tint,backgroundImage:`linear-gradient(180deg,#06121b80,#06121b30 45%,#06121bee),url(${scene?.src})`} as CSSProperties} aria-label="Borrador de presentación">
      <div className="pr-scene-shade"/>
      <div className="pr-content">
        <header className="pr-title"><span>{view==="summon"?"CÍRCULO DE INVOCACIÓN":view==="victory"?"PANTANO DE NIEBLA · NIVEL 4":view==="defeat"?"LA AVENTURA CONTINÚA":"RECOMPENSAS OBTENIDAS"}</span><h2>{opening?"Algo está por llegar…":view==="summon"?count===1?"Un nuevo destino":"Tu botín de invocación":view==="victory"?"¡Nivel superado!":view==="defeat"?"Nivel perdido":"El fruto de la aventura"}</h2><p>{view==="summon"?opening?"Reuniendo la energía del círculo.":`${count} ${count===1?"resultado":"resultados"} · Mejor rango ${RARITIES[rank].label}`:view==="victory"?"Ruta Agua · Dificultad A · Ascensión +1":view==="defeat"?"Tu héroe puede volver a intentarlo.":"Objetos y materiales, con su propia identidad."}</p></header>
        {view==="summon"?(opening?<div className="pr-opening"><div className="pr-circle"/><Icon name="system_chest" className="pr-opening-chest"/><p>Invocando…</p></div>:<>
          <div className={`pr-pulls ${count===1?"pr-single":"pr-multi"}`}>
            {items.slice(0,Math.max(0,shown)).map((item,i)=><article key={i} className={`pr-pull ${i===0?"pr-featured":""}`} style={{"--pr-rank":RARITIES[item.rarity].color} as CSSProperties}>
              <div className="pr-rank"><span>RANGO</span><b>{RARITIES[item.rarity].label}</b></div><div className="pr-card-host"><ItemCard item={{...item,badge:undefined}} size={count===1?186:80}/></div>
              <div className="pr-pull-copy"><h3>{item.name}</h3>{count===1&&<p>Caballero · Fuego</p>}<span className={`pr-outcome pr-outcome-${i===0?outcome:item.badge==="NUEVO"?"new":"copy"}`}>{i===0?OUTCOMES[outcome].title:item.badge==="NUEVO"?"Nuevo":"Duplicado · copia guardada"}</span>{count===1&&<p className="pr-outcome-note">{OUTCOMES[outcome].note}</p>}</div>
            </article>)}
          </div>
          <p className="pr-counter" role="status">{Math.min(count,shown)} de {count} resultados revelados{shown>=count?" · Presentación completa":""}</p>
        </>):view==="loot"?<div className="pr-loot-layout"><div className="pr-treasure"><Icon name="system_chest" className="pr-treasure-icon"/><h3>Botín del nivel</h3><p>Primera limpieza</p></div><div><div className="pr-loot-cards">{[SWORD,{...SWORD,type:"peto" as const,name:"Coraza de la Marea",rarity:"b" as const}].map(item=><div key={item.name}><ItemCard item={item} size={80}/><p>{item.name}</p></div>)}</div><div className="pr-stats">{reward("Escamas","+3","material_scales")}{reward("Dado cargado","+1","material_loaded_die")}</div></div></div>:<div className="pr-result-layout"><div className="pr-result-hero"><div className="pr-pedestal"/>{playing?<HeroSprite key={`${view}-${run}`} classId="caballero" element="fuego" animated action={pose} className="h-full w-full"/>:<AnimSheet anim={poseAnim} last className="h-full w-full"/>}<span>Guardián del Alba · Nv 20</span></div><div className="pr-result-copy"><p className="pr-verdict">{view==="victory"?"Aventura completada":"Reagrupá a tu equipo"}</p><h3>{view==="victory"?"Tu esfuerzo tiene recompensa.":"Cada intento te prepara mejor."}</h3><div className="pr-stats">{reward("Experiencia",view==="victory"?"+320 EXP":"+80 EXP","experience")}{view==="victory"&&reward("Monedas","+240","system_coin")}</div>{view==="victory"?<><div className="pr-bonus"><Icon name="system_chest" className="h-9 w-9"/><span>Cofre de primera limpieza <strong>+120 monedas adicionales</strong></span></div><p className="pr-level-up">¡Sube de nivel! <b>Nv 20 → 21</b></p><p>Tu próxima aventura te espera.</p></>:<div className="pr-loss-note"><strong>Sin monedas ni botín.</strong><p>Conservás la EXP que indique el resultado. Probá otro héroe, equipo o combinación de habilidades.</p></div>}</div></div>}
        <footer className="pr-actions">{view==="summon"?<button className="btn" onClick={()=>shown<count?setShown(count):act("Continuar")}>{shown<count?"Saltar":"Continuar"}</button>:view==="victory"?<><button className="btn" onClick={()=>act("Siguiente nivel")}>Siguiente nivel</button><button className="btn btn-gray" onClick={()=>act("Repetir")}>Repetir</button><button className="btn btn-gray" onClick={()=>act("Preparación")}>Preparación</button></>:view==="defeat"?<><button className="btn" onClick={()=>act("Reintentar")}>Reintentar</button><button className="btn btn-gray" onClick={()=>act("Preparación")}>Cambiar preparación</button></>:<button className="btn" onClick={()=>act("Continuar")}>Continuar</button>}</footer>
      </div>
    </section>}
    <p className="pr-feedback" role="status">{notice||"Controles de demostración. No se guardan recompensas."}</p>
    <section className="pr-audit"><h2>Qué cambia en esta propuesta</h2><div><article><h3>Invocación</h3><p>Escenario aprobado, círculo de luz y carta protagonista. Diez resultados mantienen lectura individual; nuevo, copia y reembolso tienen mensajes distintos.</p></article><article><h3>Resultado</h3><p>El héroe y su pose acompañan la victoria o derrota. EXP, monedas, primera limpieza y materiales se presentan por separado, respetando sus reglas actuales.</p></article><article><h3>Producción económica</h3><p>Reutilizamos ilustraciones, cartas, iconos, botones y poses existentes. La vista integrada usa los mismos componentes de invocación y resultados que el juego. Sin publicar todavía.</p></article></div></section>
    {view!=="summon"&&view!=="tower"&&<details className="pr-reference"><summary>Resultado actual · referencia de contenido</summary><Panel title={view==="defeat"?"Nivel perdido":"¡Nivel superado!"} className="mx-auto mt-8 max-w-xl space-y-3 text-center"><p>Pantano de Niebla · Nivel 4</p><b className="text-green-300">{view==="defeat"?"+80":"+320"} EXP</b>{view==="defeat"?<p>Sin monedas ni botín. Prueba con otro héroe o con mejor equipo.</p>:<><p>+240 monedas · Cofre de primera limpieza: +120</p><div className="flex justify-center"><ItemCard item={SWORD} size={72}/></div></>}<p>Referencia con datos de muestra del flujo actual de Progreso.</p></Panel></details>}
    {original&&<PullReveal items={items} onDone={()=>setOriginal(false)}/>}
  </main>;
}
