"use client";

import {useState} from "react";
import {ResultPresentation} from "@/components/ResultPresentation";
import {ItemCard,type ItemView} from "@/components/ItemCard";
import {Icon} from "@/components/Icon";
import {generateCharacter,type ClassId} from "@/lib/game/characters";
import {createRng} from "@/lib/game/rng";
import {EndView} from "@/components/torre/FlowViews";
import {startExpedition} from "@/lib/game/expedition";

export function IntegratedRewards({view,items,onPull,replayKey}:{view:string;items:ItemView[];onPull:()=>void;replayKey:number}){
  const [classId,setClassId]=useState<ClassId>("caballero");
  const [longName,setLongName]=useState(false);
  const [empty,setEmpty]=useState(false);
  const [saved,setSaved]=useState(true);
  const [notice,setNotice]=useState("");
  const hero={...generateCharacter(createRng(16102026),classId),element:"fuego" as const,name:longName?"Guardián de las antiguas tierras del Alba y de las montañas de la Marea interminable":"Guardián del Alba",level:20};
  const act=(label:string)=>setNotice(`Prueba de «${label}». Tu partida no cambió.`);
  const won=view!=="defeat";
  const tower=startExpedition({hero,mode:"nivelado",seed:16102026,weekKey:"2026-10-12"});
  tower.phase="ended";tower.end={reason:"death",node:0};
  return <section className="integrated-rewards">
    <div className="pr-controls"><label>Héroe <select value={classId} onChange={e=>setClassId(e.target.value as ClassId)}>{(["caballero","mago","picaro","clerigo","berserker"] as const).map(c=><option key={c} value={c}>{c}</option>)}</select></label><label><input type="checkbox" checked={longName} onChange={e=>setLongName(e.target.checked)}/> Nombre largo</label><label><input type="checkbox" checked={empty} onChange={e=>setEmpty(e.target.checked)}/> Sin piezas ni bono / EXP cero</label>{view==="tower"&&<label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/> Guardado confirmado</label>}</div>
    {view==="summon"?<div className="pr-integrated-summon"><h2>Invocación integrada</h2><p>El botón abre la misma presentación que usa el juego, con {items.length} resultados de ejemplo. No se realiza ninguna tirada.</p><button className="btn" onClick={onPull}>Revelar {items.length} {items.length===1?"resultado":"resultados"}</button></div>:view==="tower"?<EndView s={tower} save={saved?"saved":"saving"} pending={saved?0:2} onRetry={()=>act("Reintentar sincronización")} onNew={()=>act("Nueva expedición")}/>:<ResultPresentation key={`${view}-${replayKey}-${classId}`} title={won?"¡Nivel superado!":"Nivel perdido"} hero={hero} tone={won?"victory":"defeat"} scene="swamp_boss" className="mx-auto w-full max-w-2xl space-y-2 text-center">
      <div className="text-[#d9d2ca]">Pantano de Niebla · Nivel 4 · Ascensión +1</div>
      <div className="result-xp"><b className="text-green-300">+{empty?0:won?320:80} EXP</b> ({hero.name}){won&&!empty&&<div className="font-semibold text-yellow-300">¡Sube de nivel! Nv 20 → Nv 21</div>}</div>
      {won?<><div className="result-coins text-yellow-300"><Icon name="system_coin" className="h-5"/> +240 monedas{!empty&&<b>¡Cofre de primera limpieza: +120!</b>}</div><div className="result-loot">{empty?<span>Sin piezas esta vez.</span>:[{kind:"weapon" as const,type:"espada" as const,name:"Filo de la Marea",element:"agua" as const,rarity:"a" as const,stars:0},{kind:"weapon" as const,type:"peto" as const,name:longName?"Coraza de los guardianes de las montañas de la Marea interminable":"Coraza de la Marea",element:"agua" as const,rarity:"b" as const,stars:0}].map((item,i)=><ItemCard key={i} item={{...item,badge:undefined}} size={104}/>)}</div>{!empty&&<div className="flex flex-wrap justify-center gap-4 text-sm"><span><Icon name="material_scales" className="h-6"/> +3 Escamas</span><span><Icon name="material_loaded_die" className="h-6"/> +1 Dado cargado</span></div>}</>:<div className="result-loss text-sm">Sin monedas ni botín. Prueba con otro héroe o con mejor equipo.</div>}
      <div className="result-actions flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">{won&&<button className="btn" onClick={()=>act("Siguiente nivel")}>Siguiente nivel</button>}<button className="btn btn-gray" onClick={()=>act("Reintentar")}>{won?"Repetir":"Reintentar"}</button><button className="btn btn-gray" onClick={()=>act("Cambiar héroe")}>Cambiar héroe</button><button className="btn btn-gray" onClick={()=>act("Volver")}>Volver</button></div>
    </ResultPresentation>}
    <p className="pr-feedback" role="status">{notice||"Componentes del juego con datos aislados. Los importes son de ejemplo."}</p>
  </section>;
}
