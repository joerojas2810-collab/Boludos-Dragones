"use client";

import { useState } from "react";
import assets from "@/lib/art/pixel-backgrounds.generated.json";
import { BG_COMBAT_SCENES, BG_SCREEN_SCENES, BG_LAYERS } from "@/lib/art/backgrounds.generated";
import { DUNGEONS } from "@/lib/game/dungeons";
import "@/components/bg.css";

type BackgroundAsset = { file: string; width: number; height: number; scene: string; layer: string; parallax: number };
const LAYER_LABELS: Record<string, string> = { sky: "Cielo", far: "Lejos", mid: "Medio", ground: "Suelo", foreground: "Primer plano", composite: "Escena completa" };
const SCENE_LABELS: Record<string, string> = { swamp: "Pantano", peaks: "Cumbres", canyon: "Cañón", caverns: "Cavernas", storm: "Tormenta", menu: "Menú", gacha: "Invocación", collection: "Colección", market: "Mercado", forge: "Forja", lobby: "Sala" };

function sceneLabel(scene: string) {
  const match = scene.match(/^(.*)_(normal|boss)$/);
  if (!match) return SCENE_LABELS[scene] ?? scene;
  const base = match[1];
  const rank = base.startsWith("dungeon_") ? base.slice(8) : undefined;
  const name = rank && rank in DUNGEONS ? DUNGEONS[rank as keyof typeof DUNGEONS].name : SCENE_LABELS[base] ?? base;
  return `${name} · ${match[2] === "boss" ? "Jefe" : "Normal"}`;
}

function sceneAssets(scene: string) {
  const order = [...BG_LAYERS, "composite"] as string[];
  return (assets as BackgroundAsset[]).filter((entry) => entry.scene === scene).sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer));
}

function ScenePreview({ scene, zoom = 1, hidden = [], motion = false }: { scene: string; zoom?: number; hidden?: string[]; motion?: boolean }) {
  return <div role="img" aria-label={sceneLabel(scene)} className="relative shrink-0 overflow-hidden bg-black" style={{ width: 320 * zoom, height: 180 * zoom }}>
    {sceneAssets(scene).filter((entry) => !hidden.includes(entry.layer)).map((entry) => {
      const drift = Math.round(entry.parallax * 32);
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={entry.file} src={`/art/backgrounds-px/${entry.file}`} alt="" draggable={false}
          className="bg-layer bg-layer-pixel" width={320 * zoom} height={180 * zoom}
          style={{ animation: motion ? undefined : "none", ["--px-drift" as string]: `${drift}px`, ["--px-steps" as string]: Math.max(1, drift * 2) }} />
      );
    })}
  </div>;
}

export function BackgroundGallery({ zoom }: { zoom: number }) {
  const [scene, setScene] = useState<string>(BG_COMBAT_SCENES[0]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [motion, setMotion] = useState(false);
  const availableCombat = BG_COMBAT_SCENES.filter((id) => sceneAssets(id).length === 5);
  const availableScreens = BG_SCREEN_SCENES.filter((id) => sceneAssets(id).length === 1);
  const pending = BG_SCREEN_SCENES.filter((id) => !availableScreens.includes(id));
  const scenes = [...availableCombat, ...availableScreens];
  const current = sceneAssets(scene);
  return <section className="space-y-6">
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Fondo y capas</h2>
      <select aria-label="Escenario de fondo" value={scene} onChange={(event) => { setScene(event.target.value); setHidden([]); }}>
        {scenes.map((id) => <option key={id} value={id}>{sceneLabel(id)}</option>)}
      </select>
      <div className="flex flex-wrap gap-3 text-sm">
        {current.map((entry) => <label key={entry.layer} className="flex items-center gap-1">
          <input type="checkbox" checked={!hidden.includes(entry.layer)} onChange={() => setHidden((previous) => previous.includes(entry.layer) ? previous.filter((layer) => layer !== entry.layer) : [...previous, entry.layer])} />
          {LAYER_LABELS[entry.layer]}
        </label>)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} />Movimiento</label>
      </div>
      <p className="text-xs text-neutral-400">El movimiento respeta la preferencia del navegador de reducir animaciones.</p>
      <div className="max-w-full overflow-auto"><ScenePreview scene={scene} zoom={zoom} hidden={hidden} motion={motion} /></div>
    </section>
    <section>
      <h2 className="mb-2 text-lg font-bold">Escenarios de combate</h2>
      <div className="flex flex-wrap gap-3">
        {availableCombat.map((id) => <button key={id} aria-pressed={scene === id} className="border border-neutral-600 p-1 text-left" onClick={() => { setScene(id); setHidden([]); }}>
          <ScenePreview scene={id} /><span className="mt-1 block text-sm">{sceneLabel(id)}</span>
        </button>)}
      </div>
    </section>
    <section>
      <h2 className="mb-2 text-lg font-bold">Pantallas del juego</h2>
      <div className="flex flex-wrap gap-3">
        {availableScreens.map((id) => <button key={id} aria-pressed={scene === id} className="border border-neutral-600 p-1 text-left" onClick={() => { setScene(id); setHidden([]); }}>
          <ScenePreview scene={id} /><span className="mt-1 block text-sm">{sceneLabel(id)}</span>
        </button>)}
      </div>
      {pending.length > 0 && <p className="mt-3 text-sm text-neutral-400">Fondos pendientes: {pending.map(sceneLabel).join(", ")}.</p>}
    </section>
    <details>
      <summary className="cursor-pointer text-sm">Archivos finales ({assets.length})</summary>
      <ul className="mt-2 space-y-1 text-xs">
        {(assets as BackgroundAsset[]).map((entry) => <li key={entry.file}><a href={`/art/backgrounds-px/${entry.file}`} target="_blank" rel="noreferrer" className="underline">{entry.file}</a> · {entry.width}×{entry.height} · {LAYER_LABELS[entry.layer]}</li>)}
      </ul>
    </details>
  </section>;
}
