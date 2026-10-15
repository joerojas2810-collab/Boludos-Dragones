"use client";

import { useState } from "react";
import Link from "next/link";
import { SKILLS } from "@/lib/game/skills";
import { CLASSES } from "@/lib/game/characters";
import { SKILL_FX } from "@/lib/art/skillFx";
import { PaintedDoorImage } from "@/components/PaintedDoorImage";
import { PAINTED_NAVIGATION } from "@/lib/art/painted-navigation";
import { SkillProposals } from "./SkillProposals";
import "./review.css";

type Entry = { id: string; label: string; where: string; note?: string; priority?: boolean };
const REVIEW: Record<string, string> = {
  rogue_sabotage: "Aprobado e integrado: daga que rompe un sello. Pixel Art conserva el dibujo anterior.",
  rogue_step: "Aprobado e integrado: paso lateral con guardia; comunica mitigación del siguiente impacto.",
  cleric_restore: "Aprobado e integrado: corazón verde y mano de curación, distinto de Purificar.",
  knight_bastion: "Aprobado e integrado: tres placas físicas, distintas de Defender y barrera arcana.",
};
const MENU: Entry[] = [
  {id:"door_boss",label:"Dungeons",where:"Navegación",note:"Puerta de jefe reutilizada como acceso general."},
  {id:"dungeon_rank_s",label:"Torre",where:"Navegación",note:"Emblema de rango reutilizado como acceso a expediciones."},
  {id:"class_knight",label:"Héroes",where:"Navegación",note:"Casco de Caballero representa la colección completa."},
  {id:"system_chest",label:"Invocar",where:"Navegación",note:"Revisar reconocimiento de invocación frente a recompensa."},
  {id:"upgrade_sharp_edge",label:"Forja",where:"Navegación",note:"Mejora de filo reutilizada como acceso a la forja."},
  {id:"event_whispering_book",label:"Misiones",where:"Navegación",note:"Libro de evento reutilizado para las misiones."},
  {id:"system_token",label:"Sala",where:"Navegación"},
  {id:"system_coin",label:"Monedas",where:"Economía de cuenta"},
  {id:"system_fragment",label:"Fragmentos",where:"Economía de expedición"},
  {id:"material_scales",label:"Escamas",where:"Material de forja"},
  {id:"material_loaded_die",label:"Dado cargado",where:"Material de forja"},
];
const GROUP: Record<string,string>={skill:"Habilidades",system:"Sistema",class:"Clases",element:"Elementos",stat:"Estadísticas",material:"Materiales",relic:"Reliquias",trait:"Rasgos",passive:"Pasivas",event:"Eventos",upgrade:"Mejoras",enemy:"Enemigos",door:"Puertas",dungeon:"Mazmorras"};
const DOORS: (Entry & {symbol:string})[] = [
  {id:"door_easy_fight",label:"Combate",where:"Puertas",symbol:"stat_attack"},
  {id:"door_hard_fight",label:"Combate difícil",where:"Puertas",symbol:"skill_double_strike"},
  {id:"door_boss",label:"Jefe",where:"Puertas",symbol:"relic_titan_crown"},
  {id:"door_chest",label:"Tesoro",where:"Puertas",symbol:"system_chest"},
  {id:"door_merchant",label:"Mercader",where:"Puertas",symbol:"relic_bottomless_purse"},
  {id:"door_rest",label:"Descanso",where:"Puertas",symbol:"event_abandoned_campfire"},
  {id:"door_event",label:"Evento",where:"Puertas",symbol:"event_whispering_book"},
];

function CleanDoor({symbol,size}:{symbol:string;size:number}) {
  return <PaintedDoorImage name={DOORS.find(d=>d.symbol===symbol)!.id as Parameters<typeof PaintedDoorImage>[0]["name"]} style={{width:size,height:size}} />;
}

function PaintedIcon({id,size}:{id:string;size:number}) {
  // This gallery deliberately inspects painted originals regardless of the player's art preference.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/art/icons/icon_${id}.webp`} alt="" width={size} height={size} style={{width:size,height:size,objectFit:"contain"}} loading="lazy" />;
}

export function IconReview({catalog}:{catalog:string[]}) {
  const [view,setView]=useState("lote");
  const [query,setQuery]=useState("");
  const [light,setLight]=useState(false);
  const skills: Entry[]=Object.values(SKILLS).map(s=>({id:SKILL_FX[s.id].icon,label:s.name,where:CLASSES[s.classId].name,note:REVIEW[s.id],priority:!!REVIEW[s.id]}));
  const entries: Entry[]=view==="puertas"?DOORS:view==="prioridad"?skills.filter(s=>s.priority):view==="habilidades"?skills:view==="menu"?MENU:catalog.map(id=>({id,label:id.replaceAll("_"," "),where:GROUP[id.split("_")[0]]??"Otros"}));
  const filtered=entries.filter(e=>`${e.label} ${e.id} ${e.where}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="icon-review">
    <header><p className="icon-eyebrow">FASE ICONOGRAFÍA · INVENTARIO INICIAL</p><h1>El lenguaje de nuestros iconos</h1><p>Revisión de los recursos pintados actuales. Primero legibilidad y significado; después, los diseños nuevos que hagan falta.</p><Link href="/galeria-px/actualizacion-equipamiento">← Equipamiento aprobado</Link></header>
    <div className="icon-summary"><span><b>{catalog.length}</b> archivos pintados en el catálogo</span><span><b>{skills.length}</b> habilidades conectadas al motor</span><span><b>{skills.filter(s=>s.priority).length}</b> candidatos iniciales</span></div>
    <p className="icon-context">La interfaz actual se conserva. Equipamiento, héroes, villanos y escenarios quedan como referencia del acabado. Esta galería no cambia tus iconos ni tu partida.</p>
    <nav aria-label="Grupos de iconos">{[["lote","Habilidades · lote final"],["accesos","Torre y Dungeons · aprobados"],["piloto","Piloto · Sabotaje"],["puertas","Puertas · antes/después"],["prioridad","Candidatos iniciales"],["habilidades","20 habilidades"],["menu","Menú y economía"],["catalogo","Catálogo completo"]].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</nav>
    <div className="icon-filters">{view!=="lote"&&view!=="piloto"&&view!=="accesos"&&<label>Buscar <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, clase o archivo" /></label>}<label><input type="checkbox" checked={light} onChange={e=>setLight(e.target.checked)} /> Comparar sobre fondo claro</label><span>{view==="lote"?"4 habilidades integradas":view==="accesos"?"2 aprobados":view==="piloto"?"1 boceto":`${filtered.length} entradas`}</span></div>
    <div hidden={view!=="lote"}><SkillProposals light={light}/></div>
    <div hidden={view==="lote"}>
    <div hidden={view!=="accesos"}><MenuPilots light={light}/></div>
    <div hidden={view==="accesos"}>
    {view==="piloto" ? <section className="icon-pilot"><div><span className="icon-eyebrow">PRIMER BOCETO · PENDIENTE DE REVISIÓN</span><h2>Sabotaje · Interrumpir el ritual</h2><p>La daga rompe un sello mágico. Acero, oro y contornos del equipamiento aprobado; lectura clara de interrupción.</p></div><div className={`pilot-comparison ${light?"is-light":""}`}><div><PaintedIcon id="relic_broken_clock" size={128}/><h3>Actual</h3><p>Reloj de reliquia</p></div><div><PilotIcon size={160}/><h3>Boceto nuevo</h3><p>Daga que rompe un sello</p></div></div><div className={`pilot-small ${light?"is-light":""}`}>{[24,40,56,96].map(size=><div key={size}><PilotIcon size={size}/><small>{size} px</small></div>)}</div><div className="pilot-command"><PilotIcon size={40}/><div><b>Sabotaje</b><p>Interrumpe ritual · Rompe Aguante</p></div></div><p className="icon-context">Sabotaje aprobado e integrado al juego pintado. Las puertas aprobadas ya usan el componente compartido en la versión local.</p></section> : <div className="icon-grid">{filtered.map((e,i)=><article key={`${e.id}-${i}`}>
      <div className="icon-card-head"><span>{e.where}</span>{e.priority&&<b>REVISAR SIGNIFICADO</b>}</div>
      {view==="puertas" ? <><div className={`icon-preview ${light?"is-light":""}`}><div><PaintedIcon id={e.id} size={96}/><small>Actual</small></div><div><CleanDoor symbol={DOORS.find(d=>d.id===e.id)!.symbol} size={96}/><small>Símbolo dentro del hueco</small></div></div><div className={`icon-preview door-size-preview ${light?"is-light":""}`}>{[48,80,128].map(size=><div key={size}><CleanDoor symbol={DOORS.find(d=>d.id===e.id)!.symbol} size={size}/><small>{size} px</small></div>)}</div></> : <div className={`icon-preview ${light?"is-light":""}`}><div><PaintedIcon id={e.id} size={96}/><small>Ampliado · 96 px</small></div><div className="icon-real-sizes">{[24,40,56].map(size=><div key={size}><PaintedIcon id={e.id} size={size}/><small>{size} px</small></div>)}</div></div>}
      <h2>{e.label}</h2><p>{view==="puertas"?"Composición aprobada y conectada localmente. Símbolo centrado dentro del hueco, sin invadir las piedras del arco.":e.note??(view==="habilidades"?"Icono actualmente conectado. Revisar silueta y acabado antes de decidir si hace falta reemplazarlo.":view==="menu"?"Uso actual comprobado en el juego. Revisar lectura y coherencia junto a los demás símbolos de esta sección.":"Recurso existente para revisión visual; su presencia en el catálogo no confirma que se use en una pantalla actual.")}</p><code>{e.id}</code>
    </article>)}</div>}
    </div>
    </div>
    <footer>Torre y Dungeons aprobados e integrados localmente. Cuatro habilidades aprobadas e integradas localmente. Fase lista para revisión final. El catálogo completo incluye recursos históricos; no es una lista de reemplazos.</footer>
  </main>;
}

function PilotIcon({size}:{size:number}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/art-review/painted-icons/rogue-sabotage-pilot-01.webp" alt="" width={size} height={size} style={{width:size,height:size,objectFit:"contain"}}/>;
}

const MENU_PILOTS: {id:keyof typeof PAINTED_NAVIGATION;label:string;old:string;note:string}[] = [
  {id:"tower",label:"Torre",old:"dungeon_rank_s",note:"Torre de tres niveles, almenas y estandarte azul. La silueta vertical representa el ascenso."},
  {id:"dungeons",label:"Dungeons",old:"door_boss",note:"Entrada de piedra con antorchas, escaleras y un dragón tallado. Un acceso a las profundidades, sin reutilizar el símbolo del jefe."},
];
function MenuPilotIcon({id,size}:{id:keyof typeof PAINTED_NAVIGATION;size:number}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={PAINTED_NAVIGATION[id]} alt="" width={size} height={size} style={{width:size,height:size,objectFit:"contain"}}/>;
}
function MenuPilots({light}:{light:boolean}) {
  return <section className="menu-pilots"><p className="icon-context">Diseños aprobados e integrados en el menú pintado local. Pixel Art conserva sus iconos.</p><div className="icon-grid">{MENU_PILOTS.map(p=><article key={p.id}><div className="icon-card-head"><span>NAVEGACIÓN</span><b>APROBADO</b></div><h2>{p.label}</h2><div className={`pilot-comparison ${light?"is-light":""}`}><div>{p.id==="dungeons"?<PaintedDoorImage name="door_boss" style={{width:96,height:96}}/>:<PaintedIcon id={p.old} size={96}/>}<small>Anterior</small></div><div><MenuPilotIcon id={p.id} size={128}/><small>Integrado localmente</small></div></div><p>{p.note}</p><div className={`pilot-small ${light?"is-light":""}`}>{[24,40,56,96].map(size=><div key={size}><MenuPilotIcon id={p.id} size={size}/><small>{size} px</small></div>)}</div></article>)}</div><div className="menu-pilot-bar" aria-label="Vista previa de los accesos">{MENU_PILOTS.map(p=><div key={p.id}><MenuPilotIcon id={p.id} size={48}/><strong>{p.label}</strong></div>)}<span>Prueba al tamaño del menú</span></div></section>;
}
