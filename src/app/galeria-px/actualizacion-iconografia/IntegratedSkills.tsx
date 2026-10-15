"use client";

import { useMemo, useState } from "react";
import { useArt } from "@/components/ArtScope";
import { ActionPanel } from "@/components/ActionPanel";
import { generateCharacter, type ClassId } from "@/lib/game/characters";
import { startBattle } from "@/lib/game/combat";
import { createRng } from "@/lib/game/rng";
import type { Loadout } from "@/lib/game/skills";

const SETS: {id:ClassId;label:string;loadout:Loadout}[] = [
  {id:"picaro",label:"Pícaro · Paso evasivo / Sabotaje",loadout:["rogue_step","rogue_sabotage"]},
  {id:"caballero",label:"Caballero · Bastión",loadout:["knight_advance","knight_bastion"]},
  {id:"clerigo",label:"Clérigo · Restaurar / Purificar",loadout:["cleric_restore","cleric_cleanse"]},
];

export function IntegratedSkills() {
  const [classId,setClassId]=useState<ClassId>("picaro");
  const art=useArt();
  const battle=useMemo(()=>{
    const rng=createRng(15102026);
    const hero={...generateCharacter(rng,classId),level:20};
    const enemy={...generateCharacter(rng,"caballero"),name:"Gólem",level:8};
    const b=startBattle(hero,[enemy],rng,{loadout:SETS.find(s=>s.id===classId)!.loadout});
    b.player.res=3;
    return b;
  },[classId]);
  return <section className="integrated-skills">
    <h2>Iconos integrados · controles reales de combate</h2>
    <p>Vista de comprobación del panel actual del juego. Los botones son una muestra y no afectan tu partida.</p>
    <div className="integrated-controls">
      <label>Clase <select value={classId} onChange={e=>setClassId(e.target.value as ClassId)}>{SETS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label>
    </div>
    <ActionPanel b={battle} target={0} onAct={()=>{}} bar />
  </section>;
}
