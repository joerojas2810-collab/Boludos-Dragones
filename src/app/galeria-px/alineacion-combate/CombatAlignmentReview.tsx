"use client";

import {useMemo,useState} from "react";
import Link from "next/link";
import {BattleArena} from "@/components/BattleArena";
import {EnemySprite} from "@/components/EnemySprite";
import {useArt} from "@/components/ArtScope";
import {generateCharacter} from "@/lib/game/characters";
import {startBattle} from "@/lib/game/combat";
import {createRng} from "@/lib/game/rng";
import {DUNGEON_THEMES,type RouteId} from "@/lib/game/levels";
import {ELEMENTS,ELEMENT_LABEL,type Element} from "@/lib/game/elements";
import type {EnemyAction} from "@/lib/art/enemies";

export function CombatAlignmentReview(){
  const art=useArt();
  const [route,setRoute]=useState<RouteId>("lord_of_flies");
  const [count,setCount]=useState(1);
  const [guides,setGuides]=useState(true);
  const [element,setElement]=useState<Element|"native">("native");
  const [action,setAction]=useState<EnemyAction>("idle");
  const theme=DUNGEON_THEMES[route];
  const bossElement=element==="native"?theme.bossElement:element;
  const battle=useMemo(()=>{
    const rng=createRng(1501026);
    const hero={...generateCharacter(rng,"picaro"),name:"Bolo",element:"agua" as const,level:8};
    const enemies=Array.from({length:count},(_,i)=>({...generateCharacter(rng,"caballero"),name:i===0?theme.bossName:i===1?"Gólem":"Diablillo",element:bossElement,level:4,...(i===0?{bossId:theme.bossId}:{})}));
    const b=startBattle(hero,enemies,rng);
    // Skip the entrance overlay so HUD alignment can be inspected immediately.
    return {...b,actions:1};
  },[theme,count,bossElement]);
  return <main className="min-h-screen space-y-4 bg-slate-950 p-3 text-slate-100 sm:p-5">
    <h1 className="text-2xl font-bold">Alineación de jefes y barras de vida</h1>
    <p className="text-sm text-slate-300">Prueba con el mismo campo de batalla del juego. Las guías muestran el centro de cada enemigo; su barra debe quedar sobre esa línea. Esta prueba no modifica tu partida.</p>
    <nav className="flex gap-4 text-sm text-cyan-300"><Link href="/galeria-px/actualizacion-enemigos">Villanos</Link><Link href="/galeria-px/actualizacion-equipamiento">Equipamiento</Link></nav>
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")} className="rounded border border-slate-600 bg-slate-800 p-2"><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label>
      <label>Jefe <select value={route} onChange={e=>setRoute(e.target.value as RouteId)} className="rounded border border-slate-600 bg-slate-800 p-2">{Object.entries(DUNGEON_THEMES).map(([id,t])=><option key={id} value={id}>{t.bossName}</option>)}</select></label>
      <label>Enemigos <select value={count} onChange={e=>setCount(Number(e.target.value))} className="rounded border border-slate-600 bg-slate-800 p-2">{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>Elemento de combate <select value={element} onChange={e=>setElement(e.target.value as Element|"native")} className="rounded border border-slate-600 bg-slate-800 p-2"><option value="native">Original del jefe</option>{ELEMENTS.map(id=><option key={id} value={id}>{ELEMENT_LABEL[id]}</option>)}</select></label>
      <label>Pose <select value={action} onChange={e=>setAction(e.target.value as EnemyAction)} className="rounded border border-slate-600 bg-slate-800 p-2">{(["idle","attack","hit","defeat","entrance"] as const).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
      <label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)} /> Mostrar guías de centro</label>
    </div>
    <div className="alignment-review flex h-[clamp(23rem,66vh,48rem)] flex-col" data-guides={guides}>
      <BattleArena b={battle} boss world={theme.world} rank={route} finalRank={route} enemy={0} playerExtra="Pícaro · Nv 8" enemyExtra={i=>i===0?"JEFE · Nv 4":"Nv 4"} enemyArt={i=><EnemySprite key={`${route}-${bossElement}-${action}-${i}`} family={i===0?theme.families[0]:i===1?"golem":"diablillo"} element={bossElement} boss={i===0} finalRank={i===0?route:undefined} action={action} />} />
    </div>
    <style>{`.alignment-review[data-guides="true"] .stage-foe::after{content:"";position:absolute;pointer-events:none;left:50%;top:0;bottom:0;border-left:1px dashed #67e8f9;z-index:35}.alignment-review[data-guides="true"] .stage-enemy-hud{outline:1px solid #67e8f9}`}</style>
  </main>;
}
