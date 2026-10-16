"use client";

import {useState} from "react";
import Link from "next/link";
import {useArt} from "@/components/ArtScope";
import {SecondaryPanel} from "@/components/SecondaryPanel";
import {ResultPresentation} from "@/components/ResultPresentation";
import {BuildPanel} from "@/components/torre/BuildPanel";
import {RELIC_IDS} from "@/lib/game/relics";
import "./polish-review.css";

const LINKS=[
  ["Pantallas secundarias","actualizacion-secundarias"],
  ["Invocación y recompensas","actualizacion-recompensas"],
  ["Alineación de combate","alineacion-combate"],
  ["Efectos y avisos","actualizacion-efectos"],
  ["Equipamiento","actualizacion-equipamiento"],
];

export function PolishReview(){
  const art=useArt();
  const [modal,setModal]=useState(false);
  const [longName,setLongName]=useState(false);
  const [scene,setScene]=useState("menu");
  const [view,setView]=useState("panel");
  const hero={classId:"caballero" as const,element:"fuego" as const,level:20,name:longName?"Guardián de las antiguas montañas de la Marea interminable":"Guardián del Alba"};
  return <main className="polish-review">
    <header><p>FASE PULIDO FINAL · REVISIÓN LOCAL</p><h1>Los últimos detalles del mismo mundo.</h1><p>Escenas adaptables, retratos, lectura y navegación. Se mantiene la dirección de arte aprobada.</p></header>
    <p className="polish-note">Comprobación visual pendiente: la automatización del navegador no pudo acceder a esta galería. Las pruebas de código se registran por separado.</p>
    <nav aria-label="Áreas de revisión">{LINKS.map(([label,path])=><Link key={path} href={"/galeria-px/"+path}>{label} →</Link>)}</nav>
    <div className="polish-controls">
      <label>Estilo <select value={art.pixel?"pixel":"painted"} onChange={e=>art.set(e.target.value==="pixel")}><option value="painted">Pintado</option><option value="pixel">Pixel Art</option></select></label>
      <label>Escenario <select value={scene} onChange={e=>setScene(e.target.value)}><option value="menu">Ciudad</option><option value="gacha">Invocación</option><option value="swamp_boss">Pantano</option></select></label>
      <label><input type="checkbox" checked={longName} onChange={e=>setLongName(e.target.checked)}/> Nombre largo</label>
      <label>Muestra <select value={view} onChange={e=>setView(e.target.value)}><option value="panel">Panel y ventana de reliquias</option><option value="result">Resultado de aventura</option></select></label>
    </div>
    {view==="panel"?<SecondaryPanel title="Entre aventuras" scene={scene} className="space-y-4 text-center">
      <h2 className="break-words text-xl text-[#f0d69f]">{hero.name}</h2>
      <p>En móvil vertical, el panel usa la composición móvil existente. En apaisado conserva la composición amplia. Pixel mantiene sus recursos.</p>
      <button className="btn" aria-haspopup="dialog" onClick={()=>setModal(true)}>Revisar seis reliquias</button>
    </SecondaryPanel>:<ResultPresentation title="¡Nivel superado!" hero={hero} tone="victory" scene={scene}>
      <p className="result-xp">+320 EXP · valores de ejemplo</p><p className="result-coins">+240 monedas · sin guardar recompensas</p><button className="btn" aria-haspopup="dialog" onClick={()=>setModal(true)}>Revisar seis reliquias</button>
    </ResultPresentation>}
    {modal&&<BuildPanel owned={RELIC_IDS.slice(0,6).map(id=>({id,tier:1}))} onClose={()=>setModal(false)}/>}
    <section className="polish-note"><h2>Recorrido de revisión</h2><ol><li>Comparar móvil vertical, apaisado, notebook y pantalla 2K.</li><li>Probar nombres largos y zoom del navegador al 200%.</li><li>Abrir reliquias: Tab y Mayús+Tab deben permanecer dentro; Escape cierra y devuelve el foco.</li><li>Revisar en las otras galerías las diez invocaciones, varios rivales y ambos estilos.</li></ol><p>Los controles de esta página solo cambian muestras locales. La revisión multijugador real y las mediciones de carga aún están pendientes.</p></section>
  </main>;
}
