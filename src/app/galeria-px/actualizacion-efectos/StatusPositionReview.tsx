"use client";

import {useMemo,useState} from "react";
import {BattleArena} from "@/components/BattleArena";
import {EnemySprite} from "@/components/EnemySprite";
import {useArt} from "@/components/ArtScope";
import {generateCharacter} from "@/lib/game/characters";
import {startBattle} from "@/lib/game/combat";
import {createRng} from "@/lib/game/rng";

export function StatusPositionReview(){
  const art=useArt();
  const [count,setCount]=useState(1);
  const battle=useMemo(()=>{
    const rng=createRng(15102026);
    const hero={...generateCharacter(rng,"caballero"),name:"Caballero",level:20};
    const foes=Array.from({length:count},(_,i)=>({...generateCharacter(rng,"caballero"),name:i?"Gólem II":"Gólem",level:8}));
    const b=startBattle(hero,foes,rng);
    const flags={exposed:true,defending:true,nextHitReduction:.4};
    Object.assign(b.player,flags);
    b.enemies.forEach(e=>Object.assign(e,flags));
    return b;
  },[count]);
  return <section><h2>Expuesto, Próx. golpe y Defiende · al costado</h2><p>Columna a la derecha del héroe y a la izquierda del rival. En pantallas pequeñas se conservan los símbolos y se ocultan las etiquetas para ahorrar espacio.</p><div className="vfx-controls">
    <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label>
    <label>Rivales <select value={count} onChange={e=>setCount(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
  </div><div className="status-position-battle"><BattleArena b={battle} world={0} rank="swamp" playerExtra="Prueba de avisos" enemyExtra={()=>"Prueba de avisos"} enemy={0} enemyArt={()=><EnemySprite family="golem" element="tierra" action="idle"/>}/></div></section>;
}
