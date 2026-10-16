import {useMemo,useState} from "react";
import {EFFECTS} from "@/lib/art/effects.generated";
import {AnimSheet} from "@/components/AnimSheet";
import {VfxNumber} from "@/components/fx/Vfx";
import {HeroSprite} from "@/components/HeroSprite";
import {ElementalStatusOverlay} from "@/components/ElementalStatusOverlay";
import {paintedBackground} from "@/lib/art/painted-backgrounds";
import {STATUS_DATA,type StatusId} from "@/lib/game/statuses";
import type {PreviewSettings} from "./PhaseOverview";
import {StatusIcons} from "@/components/StatusIcons";
import {generateCharacter} from "@/lib/game/characters";
import {createRng} from "@/lib/game/rng";
import {startBattle} from "@/lib/game/combat";

const EXISTING=[
 ["hit_fire","Impacto de Fuego"],["hit_water","Impacto de Agua"],["hit_earth","Impacto de Tierra"],["hit_lightning","Impacto de Rayo"],["hit_wind","Impacto de Viento"],
 ["consume_fire","Consumir Quemadura"],["consume_water","Consumir Escarcha"],["consume_earth","Consumir Ruptura"],["consume_lightning","Consumir Sobrecarga"],["consume_wind","Consumir Impulso"],
 ["stagger_break","Quiebre"],["perfect_guard","Guardia perfecta"],["ritual_interrupt","Interrupción / Sello"],["armor_rebuild","Reconstrucción de armadura"],
 ["element_advantage","Ventaja elemental"],["element_disadvantage","Desventaja elemental"],["critical_label","Crítico"],["dodge","Fallo de ataque"],["victory","Victoria"],["defeat","Derrota"],
] as const;
const STATES=["escarcha","quemadura","impulso","ruptura","sobrecarga"] as const;
export function ExistingEffects({settings:s}:{settings:PreviewSettings}){
  const [frame,setFrame]=useState(50);
  const [stacks,setStacks]=useState(2);
  const sample=useMemo(()=>{const rng=createRng(1510);const hero=generateCharacter(rng,"caballero");return startBattle(hero,hero,rng).player;},[]);
  return <section id="existing-effects"><h2>Impactos y señales existentes · propuesta de conservar</h2><p>Recursos actuales del juego, no diseños recién generados. Revisalos junto al nuevo lote; podremos ajustar los que desentonen.</p>
    <label className="vfx-note">Fotograma de revisión <input type="range" min="0" max="100" value={frame} onChange={e=>setFrame(Number(e.target.value))}/> {frame}%</label>
    <div className="existing-grid">{EXISTING.map(([id,label])=>{
      const m=EFFECTS[id];const index=Math.min(m.frames-1,Math.floor(frame/100*m.frames));
      return <article key={id}><h3>{label}</h3><div className="existing-sample">{s.visible&&(s.playing&&!s.reduced?<AnimSheet key={s.tick} anim={{src:`/art/effects/${id}.webp?v=2`,frames:m.frames,fps:m.fps,loop:false,aspect:m.cell[0]/m.cell[1]}}/>:<div style={{width:"100%",aspectRatio:m.cell[0]/m.cell[1],backgroundImage:`url(/art/effects/${s.reduced?"reduced/":""}${id}.webp?v=2)`,backgroundSize:`${s.reduced?100:m.frames*100}% 100%`,backgroundPosition:`${s.reduced||m.frames===1?0:index/(m.frames-1)*100}% 0`}}/>)}</div><small>Existente · conservar para revisión</small></article>;
    })}</div>
    <h2>Daño, crítico y curación</h2><div className="vfx-number-samples">{(["damage_normal","damage_critical","heal_number"] as const).map((kind,i)=><div key={kind}><VfxNumber key={s.tick} text={i===2?"+24":i===1?"128":"42"} kind={kind} size={48} reviewFrame={s.playing?undefined:2}/><span>{i===2?"Curación":i===1?"Daño crítico":"Daño"}</span></div>)}</div>
    <h2>Estados elementales · capas actuales</h2><label className="vfx-note">Intensidad <select value={stacks} onChange={e=>setStacks(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} cargas (según máximo del estado)</option>)}</select></label>
    <div className="existing-states">{STATES.map(id=>{
      const count=id==="sobrecarga"?stacks:Math.min(stacks,STATUS_DATA[id].max);
      const statuses=id==="sobrecarga"?[]:[{id:id as StatusId,stacks:count,turns:2}];
      return <article key={id}><h3>{id==="sobrecarga"?"Sobrecarga":STATUS_DATA[id].label} · {count}</h3><div className="vfx-scene" style={{backgroundImage:`url(${paintedBackground(s.scene)?.src})`}}><div className="vfx-hero"><HeroSprite classId="caballero" element="agua" crop className="h-full w-full"/>{s.visible&&<ElementalStatusOverlay c={{hp:100,statuses,charge:id==="sobrecarga"?count:0}} family="hero" artStyle="painted" ended={!s.playing||s.reduced}/>}</div></div><small>Capas existentes del combate.</small></article>;
    })}</div>
    <h2>Expuesto, Defensa y mitigación</h2>
    <div className="vfx-scene status-signals-sample" style={{backgroundImage:`url(${paintedBackground(s.scene)?.src})`}}><div className="vfx-hero"><HeroSprite classId="caballero" element="agua" crop className="h-full w-full"/><StatusIcons c={{...sample,exposed:true,defending:true,nextHitReduction:.4}}/></div></div>
    <p className="vfx-note">Expuesto, Defensa y mitigación del próximo golpe conservan sus señales actuales. Los números y avisos siguen separados de las ilustraciones para mantener la lectura.</p>
  </section>;
}
