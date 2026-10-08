"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LAYERS = [
  ["sky", "Cielo"], ["far", "Lejos"], ["mid", "Medio"],
  ["ground", "Suelo"], ["foreground", "Primer plano"],
] as const;
const VIEWS = {
  full_hd: { label: "1080p", width: 1920, aspect: "16 / 9" },
  qhd: { label: "2K", width: 2560, aspect: "16 / 9" },
  mobile: { label: "Móvil", width: 390, aspect: "390 / 844" },
} as const;

export function HdSample() {
  const [resolution, setResolution] = useState<"current" | "higher">("higher");
  const [view, setView] = useState<keyof typeof VIEWS>("full_hd");
  const [hidden, setHidden] = useState<string[]>([]);
  const [hero, setHero] = useState(true);
  const [hud, setHud] = useState(false);
  const [viewport, setViewport] = useState({ width: 960, height: 540 });
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Both options use the same camera and physical scene dimensions.
  // Ceil covers the viewport by cropping, never by stretching individual layers.
  const sceneScale = Math.max(1, Math.ceil(Math.max(viewport.width / 960, viewport.height / 540)));
  const width = 960 * sceneScale;
  const height = 540 * sceneScale;
  const left = Math.round((viewport.width - width) / 2);
  const top = Math.round((viewport.height - height) / 2);
  const heroScale = Math.max(1, Math.floor((viewport.height * 0.45) / 192));
  const higher = resolution === "higher";
  const heroWidth = (higher ? 128 : 140) * heroScale;
  const heroHeight = 192 * heroScale;
  const heroLeft = Math.round((viewport.width - heroWidth) / 2);
  const heroTop = Math.round(viewport.height * 0.88 - 180 * heroScale);
  const source = higher ? "pixel-hd-sample/backgrounds" : "backgrounds-px";
  const button = (active: boolean) => `border px-3 py-2 text-sm ${active ? "border-amber-300 bg-amber-300 text-black" : "border-slate-500 bg-slate-800 text-slate-100"}`;

  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
    <div className="mx-auto max-w-[2560px] space-y-3">
      <Link href="/galeria-px" className="text-sm underline">Volver a la galería</Link>
      <h1 className="text-xl font-bold">Muestra de mayor resolución</h1>
      <p className="text-sm text-amber-200">Propuesta pendiente de aprobación. Solo Pantano y Caballero en reposo.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={button(!higher)} aria-pressed={!higher} onClick={() => setResolution("current")}>Actual</button>
        <button className={button(higher)} aria-pressed={higher} onClick={() => setResolution("higher")}>Mayor resolución</button>
        <span className="px-2 text-sm">Vista:</span>
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((id) => <button key={id} className={button(view === id)} aria-pressed={view === id} onClick={() => setView(id)}>{VIEWS[id].label}</button>)}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {LAYERS.map(([id, label]) => <label key={id} className="flex items-center gap-1">
          <input type="checkbox" checked={!hidden.includes(id)} onChange={() => setHidden((previous) => previous.includes(id) ? previous.filter((layer) => layer !== id) : [...previous, id])} />{label}
        </label>)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={hero} onChange={(event) => setHero(event.target.checked)} />Caballero</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hud} onChange={(event) => setHud(event.target.checked)} />Vida y daño de muestra</label>
      </div>
      <p className="text-xs text-slate-300">
        Fondo: {higher ? "960×540" : "320×180"} a ×{higher ? sceneScale : sceneScale * 3}.
        {" "}Caballero: {higher ? "128×192" : "64×96, con margen de 3 px"} a ×{higher ? heroScale : heroScale * 2}.
        {" "}Mismo encuadre, escala entera y primer cuadro de reposo.
      </p>
      <div ref={container} role="img" aria-label={`Pantano con Caballero: ${higher ? "mayor resolución" : "arte actual"}`}
        className="relative mx-auto w-full overflow-hidden bg-black"
        style={{ maxWidth: VIEWS[view].width, aspectRatio: VIEWS[view].aspect }}>
        {LAYERS.filter(([id]) => !hidden.includes(id)).map(([id]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${resolution}_${id}`} src={`/art/${source}/swamp_normal_desktop_${id}.png`} alt="" draggable={false}
            width={width} height={height} className="absolute max-w-none"
            style={{ left, top, width, height, imageRendering: "pixelated" }} />
        ))}
        {hero && (higher ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/art/pixel-hd-sample/heroes/hero_knight_fire_idle.png" alt="" draggable={false}
            width={heroWidth} height={heroHeight} className="absolute max-w-none"
            style={{ left: heroLeft, top: heroTop, width: heroWidth, height: heroHeight, imageRendering: "pixelated" }} />
        ) : <div aria-hidden className="absolute"
          style={{ left: heroLeft, top: heroTop, width: heroWidth, height: heroHeight,
            backgroundImage: "url(/art/heroes-px/hero_knight_fire_idle.png)", backgroundRepeat: "no-repeat",
            backgroundSize: "400% 100%", backgroundPosition: "0 0", imageRendering: "pixelated" }} />)}
        {hud && <>
          <div className="absolute left-4 top-4 w-44 border border-slate-400 bg-slate-950/90 p-2 text-xs">
            <p>Caballero de fuego</p><p>Vida: 120 / 120</p>
            <div className="mt-1 h-2 bg-slate-700"><div className="h-full w-full bg-green-400" /></div>
          </div>
          {hero && <span className="absolute font-bold text-red-300" style={{ left: heroLeft + heroWidth - 20, top: heroTop + 32, textShadow: "1px 1px 0 #101522" }}>−24</span>}
        </>}
      </div>
      <p className="text-xs text-slate-400">La vista elegida se adapta al espacio disponible. En móvil se recortan los lados del fondo y el Caballero permanece centrado.</p>
    </div>
  </main>;
}
