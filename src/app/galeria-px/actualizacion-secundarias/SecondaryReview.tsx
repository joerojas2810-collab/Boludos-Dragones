"use client";

import {useState} from "react";
import Link from "next/link";
import {useArt} from "@/components/ArtScope";
import {RestView,EventView,ShopView,SanctuaryView,OfferView} from "@/components/torre/NodeViews";
import {RelicRows} from "@/components/torre/BuildPanel";
import {MissionScopePanel,type ScopeState} from "@/components/MissionScopePanel";
import {SCOPE_TIERS,type MissionScope} from "@/lib/game/missions";
import {HeroSprite} from "@/components/HeroSprite";
import {CLASSES} from "@/lib/game/characters";
import {RELIC_IDS} from "@/lib/game/relics";
import {useConfirmGuard} from "@/components/torre/parts";
import {Podium} from "@/components/room/Podium";
import {Panel} from "@/components/Panel";
import {SecondaryPanel} from "@/components/SecondaryPanel";
import {generateCharacter,CLASS_IDS} from "@/lib/game/characters";
import {createRng} from "@/lib/game/rng";
import {startExpedition,EVENT_IDS,EVENT_TITLE,type EventId} from "@/lib/game/expedition";
import type {PlayerView} from "@/lib/roomui/types";
import "./secondary-review.css";

export function SecondaryReview(){
 const art=useArt();
 const [view,setView]=useState("rest");
 const [longNames,setLongNames]=useState(false);
 const [eventId,setEventId]=useState<EventId>("fountain");
 const [notice,setNotice]=useState("");
 const [missionScope,setMissionScope]=useState<MissionScope>("daily");
 const [fullBuild,setFullBuild]=useState(false);
 const [poor,setPoor]=useState(false);
 const guard=useConfirmGuard(view+eventId);
 const hero=generateCharacter(createRng(161026),"caballero");
 const s=startExpedition({hero,mode:"nivelado",seed:161026,weekKey:"2026-10-12"});
 s.phase=view==="event"?"event":"rest";s.hp=Math.round(s.hp*.6);s.fragments=120;s.event={id:eventId,stage:"choose"};
 s.relics=RELIC_IDS.slice(0,fullBuild?6:2).map((id,i)=>({id,tier:i===1?2:1}));
 s.fragments=poor?0:120;
 s.shop={bought:false,goods:[{id:"relic",kind:"relic",price:60,relicId:"runic_shield"},{id:"heal",kind:"heal",price:30},{id:"upgrade",kind:"upgrade",price:40,relicId:"bear_heart"}]};
 if(view==="offer")s.offer={id:"review",source:"combat",canDecline:true,options:[{id:"one",relicId:"runic_shield",tier:1},{id:"two",relicId:"phoenix_heart",tier:1},{id:"three",relicId:"bottomless_purse",tier:1}]};
 const missionSample:ScopeState={scope:missionScope,points:60,claimed:1,canReroll:true,open:true,tiers:[...SCOPE_TIERS[missionScope]],missions:[{slot:0,label:"Completa niveles",target:3,progress:3,done:true},{slot:1,label:longNames?"Gana combates con héroes de las antiguas montañas de la Marea interminable":"Gana combates",target:15,progress:9,done:false},{slot:2,label:"Usa la forja",target:1,progress:0,done:false}]};
 const players:PlayerView[]=CLASS_IDS.slice(0,3).map((classId,i)=>({id:String(i),name:longNames?[
 "Guardián de las montañas de la Marea interminable","Custodia de las estrellas del Alba","Sombra de los bosques del antiguo reino"
 ][i]:["Renboelu","Sirvelsin","Bolo"][i],hero:{name:"Héroe de muestra",classId,element:"fuego",rarity:"s",stars:0,traits:[]},heroId:null,chips:120-i*30,lives:3,eliminated:false,present:true,ready:true,isHost:i===0,activeFromFloor:1,roundMaxFloor:8,nightMaxFloor:8,doorChosen:false,door:null,outcome:null,fights:false}));
 const preview=()=>setNotice("Acción de muestra. Tu partida no cambió.");
 return <main className="secondary-review">
 <header><p>FASE PANTALLAS SECUNDARIAS · BORRADOR LOCAL</p><h1>El mismo mundo, entre aventuras.</h1><p>Descanso, eventos y salas con el arte aprobado. Conservamos los controles y las reglas actuales.</p><Link href="/galeria-px/actualizacion-recompensas">← Presentaciones y recompensas</Link></header>
 <p className="secondary-note">Datos de ejemplo. Sin conexión a partidas, gastos ni recompensas reales.</p>
 <nav aria-label="Pantallas de muestra">{[["rest","Descanso de Torre"],["event","Eventos de Torre"],["shop","Tienda"],["sanctuary","Santuario"],["offer","Oferta de reliquias"],["relics","Reliquias"],["podium","Podio de salas"],["portraits","Retratos"],["missions","Misiones"]].map(([id,label])=><button key={id} className="btn" aria-pressed={view===id} onClick={()=>{setView(id);setNotice("");}}>{label}</button>)}</nav>
 <div className="secondary-controls"><label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label><label><input type="checkbox" checked={longNames} onChange={e=>setLongNames(e.target.checked)}/> Nombres largos</label>{view==="event"&&<label>Evento <select value={eventId} onChange={e=>setEventId(e.target.value as EventId)}>{EVENT_IDS.map(id=><option key={id} value={id}>{EVENT_TITLE[id]}</option>)}</select></label>}</div>
 {view==="missions"&&<label>Tipo de misión <select value={missionScope} onChange={e=>setMissionScope(e.target.value as MissionScope)}><option value="daily">Diarias</option><option value="weekly">Semanales</option><option value="event">Evento</option></select></label>}
 {["shop","sanctuary","offer","relics"].includes(view)&&<div className="secondary-controls"><label><input type="checkbox" checked={fullBuild} onChange={e=>setFullBuild(e.target.checked)}/> Seis reliquias equipadas</label><label><input type="checkbox" checked={poor} onChange={e=>setPoor(e.target.checked)}/> Sin fragmentos</label></div>}
 <p>Integración local: los mismos componentes y acabados que se publicarán en el juego.</p>
 <div className="secondary-stage">
 {view==="rest"?<RestView key={view} s={s} act={preview} guard={guard} error={null}/>:view==="event"?<EventView key={eventId} s={s} act={preview} guard={guard} error={null}/>:view==="shop"?<ShopView key={String(fullBuild)+poor} s={s} act={preview} guard={guard} error={null}/>:view==="sanctuary"?<SanctuaryView s={s} act={preview} guard={guard} error={null} mastery={null}/>:view==="offer"?<OfferView key={String(fullBuild)} s={s} act={preview} guard={guard} error={null}/>:view==="relics"?<Panel title="Reliquias de la expedición"><RelicRows owned={s.relics}/></Panel>:view==="missions"?<MissionScopePanel s={missionSample} onAction={preview}/>:view==="portraits"?<Panel title="Retratos de sala"><div className="secondary-portraits">{CLASS_IDS.map(classId=><div key={classId}><HeroSprite classId={classId} element="fuego" crop fitBox className="relative grid h-32 w-full place-items-center"/><b>{CLASSES[classId].name}</b><p>{longNames?"Guardián de las montañas de la Marea interminable":"Jugador de muestra"}</p></div>)}</div></Panel>:<SecondaryPanel title="Podio de la noche" className="mx-auto max-w-3xl"><Podium ranked={players} titles={{"0":"Campeón de la noche","1":"Superviviente","2":"Aventurero"}}/></SecondaryPanel>}
 </div><p className="secondary-note" role="status">{notice||"Componentes reales con datos aislados. Ningún cambio de esta propuesta se publicó."}</p>
 <section className="secondary-note"><h2>Alcance de esta revisión</h2><p>La galería permite revisar Torre, salas y misiones sin consumir recursos. Las propuestas de acabado permanecen locales; la integración final y publicación requieren revisión.</p></section>
 </main>;
}
