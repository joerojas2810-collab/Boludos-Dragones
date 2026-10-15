import { SKILLS, type SkillId } from "@/lib/game/skills";
import { SKILL_FX } from "@/lib/art/skillFx";
import { IntegratedSkills } from "./IntegratedSkills";

const PROPOSALS: {id:SkillId;file:string;old:string;idea:string}[] = [
  {id:"rogue_sabotage",file:"rogue-sabotage",old:"relic_broken_clock",idea:"Una daga rompe el ritual. Sustituye el reloj de reliquia por una acción de interrupción."},
  {id:"knight_bastion",file:"knight-bastion",old:"passive_wall",idea:"Tres placas de acero forman una protección física. Silueta más amplia que Defender y distinta de la barrera arcana."},
  {id:"rogue_step",file:"rogue-step",old:"relic_winged_boots",idea:"Paso lateral y guardia. El pequeño escudo representa reducción de daño; no promete esquivar el golpe."},
  {id:"cleric_restore",file:"cleric-restore",old:"skill_prayer",idea:"Corazón verde sobre una mano: recuperación de vida. Se distingue de la limpieza de estados de Purificar."},
];
function ProposalImage({id,size}:{id:SkillId;size:number}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/art/icons/icon_${SKILL_FX[id].icon}.webp`} alt="" width={size} height={size} style={{width:size,height:size,objectFit:"contain"}}/>;
}
export function SkillProposals({light}:{light:boolean}) {
  return <section className="skill-proposals">
    <div className="icon-context"><b>Revisión final del lote de habilidades</b><p>Los cuatro diseños aprobados ya están conectados al juego pintado. Comparación con los anteriores, tamaños pequeños y panel real de habilidades. Pixel Art mantiene sus dibujos anteriores.</p></div>
    <IntegratedSkills/>
    <div className="icon-grid">{PROPOSALS.map(p=><article key={p.id}>
      <div className="icon-card-head"><span>HABILIDAD</span><b>APROBADO · INTEGRADO</b></div>
      <h2>{SKILLS[p.id].name}</h2>
      <div className={`pilot-comparison ${light?"is-light":""}`}>
        <div><CurrentIcon name={p.old}/><small>Anterior</small></div>
        <div><ProposalImage id={p.id} size={128}/><small>Integrado · Pintado</small></div>
      </div>
      <p>{p.idea}</p>
      <div className={`pilot-small ${light?"is-light":""}`}>{[24,40,56,96].map(size=><div key={size}><ProposalImage id={p.id} size={size}/><small>{size} px</small></div>)}</div>
      <div className="skill-proposal-button"><ProposalImage id={p.id} size={40}/><div><b>{SKILLS[p.id].name}</b><span>{SKILLS[p.id].description}</span></div></div>
    </article>)}</div>
    <div className="icon-context"><b>Para cerrar ICONOGRAFÍA</b><p>Puertas, Torre y Dungeons ya están aprobados e integrados localmente. El lote de habilidades ya está integrado. La fase queda preparada para tu revisión final y autorización de publicación. Sin commit ni push.</p></div>
  </section>;
}

function CurrentIcon({name}:{name:string}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/art/icons/icon_${name}.webp`} alt="" width={96} height={96}/>;
}
