"use client";

import {useState} from "react";
import {BattleArena} from "@/components/BattleArena";
import {ActionPanel} from "@/components/ActionPanel";
import {EnemySprite} from "@/components/EnemySprite";
import {useArt} from "@/components/ArtScope";
import {generateCharacter,type ClassId} from "@/lib/game/characters";
import {startBattle,step,type Action} from "@/lib/game/combat";
import {createRng} from "@/lib/game/rng";
import type {Loadout} from "@/lib/game/skills";
import {HoldDefenseReview} from "@/components/fx/PaintedDefense";

type Scenario="ready"|"empty"|"charge";
function makeGame(classId:ClassId,scenario:Scenario="ready") {
  const rng=createRng(15102026);
  const hero={...generateCharacter(rng,classId),name:({caballero:"Caballero",mago:"Mago",clerigo:"Clérigo",picaro:"Pícaro",berserker:"Berserker"})[classId],level:20};
  const foe={...generateCharacter(rng,"caballero"),name:"Gólem",level:8};
  const loadout:Loadout=classId==="caballero"?["knight_advance","knight_bastion"]:classId==="mago"?["mage_inscribe","mage_barrier"]:classId==="clerigo"?["cleric_restore","cleric_cleanse"]:["rogue_step","rogue_sabotage"];
  const b=startBattle(hero,[foe],rng,{loadout});
  b.player.res=3;
  if(scenario!=="empty"){
    b.player.hp=Math.max(1,Math.floor(b.player.hp*.6));
    b.player.statuses=[{id:"ruptura",stacks:1,turns:3}];
  }
  b.enemies[0].intent=scenario==="charge"?"charge":scenario==="ready"?"channeling":"attack1";
  return {rng,b};
}
export function DefenseBattle() {
  const art=useArt();
  const [game,setGame]=useState(()=>makeGame("clerigo"));
  const [scenario,setScenario]=useState<Scenario>("ready");
  const [hold,setHold]=useState(false);
  const classId=game.b.player.char.classId;
  const act=(a:Action,target:number)=>setGame({...game,b:step(game.b,a,game.rng,target)});
  return <section className="defense-battle">
    <h2>Prueba integrada · combate real</h2>
    <p>Elegí una clase y probá sus habilidades en los controles de abajo. Restaurar aparece al recuperar vida; Purificar, al quitar un estado; Sabotaje, al interrumpir un ritual. La prueba está aislada de tu partida. «Reiniciar combate» recupera recursos y enfriamientos.</p>
    <div className="vfx-controls">
      <label>Habilidad <select value={classId} onChange={e=>setGame(makeGame(e.target.value as ClassId,scenario))}><option value="caballero">Caballero · Bastión</option><option value="mago">Mago · Barrera arcana</option><option value="clerigo">Clérigo · Restaurar / Purificar</option><option value="picaro">Pícaro · Paso evasivo / Sabotaje</option></select></label>
      <label>Situación <select value={scenario} onChange={e=>{const next=e.target.value as Scenario;setScenario(next);setGame(makeGame(classId,next));}}><option value="ready">Herido · estado negativo · ritual</option><option value="empty">Vida completa · sin estado · ataque común</option><option value="charge">Herido · estado negativo · carga</option></select></label>
      <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label>
      <button onClick={()=>setGame(makeGame(classId,scenario))}>Reiniciar combate</button>
      <label><input type="checkbox" checked={hold} onChange={e=>{setHold(e.target.checked);setGame(makeGame(classId,scenario));}}/> Mantener fotograma al lanzar</label>
      <a href="#defense-field">Ver campo de batalla ↓</a>
    </div>
    <HoldDefenseReview.Provider value={hold}><div id="defense-field" className="defense-battle-stage"><BattleArena b={game.b} world={0} rank="swamp" playerExtra="Prueba local" enemyExtra={()=>"Nv 8"} enemy={0} enemyArt={()=><EnemySprite family="golem" element="tierra" action="idle"/>}/></div></HoldDefenseReview.Provider>
    <ActionPanel b={game.b} target={0} onAct={act} bar />
  </section>;
}
