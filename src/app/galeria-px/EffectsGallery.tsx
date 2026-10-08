"use client";

import { useState } from "react";
import { PIXEL_EFFECTS } from "@/lib/art/effects";
import { AnimSheet } from "@/components/AnimSheet";
import "@/components/fx/effects.css";
import { usePrefersReducedMotion } from "@/lib/motion";

const LABELS: Record<string, string> = { hit: "Golpes", element: "Ventaja elemental", boss: "Entrada de jefe", gacha: "Invocación", forge: "Forja", emote: "Emote", rank: "Brillo de rango", damage: "Daño", heal: "Curación" };
const NAMED: Record<string, string> = { victory: "Victoria", defeat: "Derrota", confetti: "Confeti", podium: "Podio", perfect_guard: "Guardia perfecta", shield: "Escudo", regeneration: "Regeneración", level_up: "Subir de nivel", dodge: "Esquive", critical_label: "Crítico" };
const END_LABELS: Record<string, string> = { remove: "Desaparece", hold: "Mantiene el final", loop: "En bucle" };
const label = (id: string) => PIXEL_EFFECTS[id]?.label ?? NAMED[id] ?? `${LABELS[id.split("_")[0]] ?? "Efecto"} · ${id}`;

function Still({ id, reduced, frame = 0, zoom = 1 }: { id: string; reduced: boolean; frame?: number; zoom?: number }) {
  const m = PIXEL_EFFECTS[id];
  const w = m.cell[0] * zoom, h = m.cell[1] * zoom;
  const row = m.glyphRow?.["4"] ?? 0;
  return <div className="relative shrink-0 overflow-hidden" style={{ width: w, height: h }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/art/effects-px/${reduced ? "reduced/" : ""}${id}.png`} alt={label(id)} draggable={false}
      width={w * (reduced ? 1 : m.frames)} height={h * m.rows} className="absolute max-w-none"
      style={{ width: w * (reduced ? 1 : m.frames), height: h * m.rows, left: reduced ? 0 : -frame * w, top: -row * h, imageRendering: "pixelated" }} />
  </div>;
}

function AnimatedPreview({ id, zoom, reduced }: { id: string; zoom: number; reduced: boolean }) {
  const m = PIXEL_EFFECTS[id];
  const anim = { src: `/art/effects-px/${reduced ? "reduced/" : ""}${id}.png`, frames: reduced ? 1 : m.frames, fps: reduced ? 0 : m.fps, loop: !reduced && m.loop, aspect: m.cell[0] / (m.cell[1] * m.rows) };
  if (!m.glyphRow) return reduced ? <Still id={id} reduced zoom={zoom} /> : <div style={{ width: m.cell[0] * zoom }}><AnimSheet anim={anim} className="pixel-effect" /></div>;
  const text = id === "heal_number" ? "+24" : "-24";
  const advance = (m.advance ?? m.cell[0]) * zoom;
  return <div className="relative overflow-hidden" aria-label={text} style={{ width: advance * text.length, height: m.cell[1] * zoom }}>
    {Array.from(text).map((char, index) => <div key={index} className="absolute" style={{ left: index * advance + (advance - m.cell[0] * zoom) / 2, top: -(m.glyphRow?.[char] ?? 0) * m.cell[1] * zoom, width: m.cell[0] * zoom }}><AnimSheet anim={anim} className="pixel-effect" /></div>)}
  </div>;
}

export function EffectsGallery({ zoom, bg }: { zoom: number; bg: string }) {
  const [selected, setSelected] = useState("hit_fire");
  const [reduced, setReduced] = useState(false);
  const [replay, setReplay] = useState(0);
  const platformReduced = usePrefersReducedMotion();
  const ids = Object.keys(PIXEL_EFFECTS);
  if (!ids.length) return <p className="text-sm">Los efectos pixel están pendientes de importación.</p>;
  const m = PIXEL_EFFECTS[selected];
  const staticPreview = reduced || platformReduced;
  return <section className="space-y-5">
    <h2 className="text-lg font-bold">Efectos</h2>
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Efecto de muestra" value={selected} onChange={(event) => { setSelected(event.target.value); setReplay((previous) => previous + 1); }}>{ids.map((id) => <option key={id} value={id}>{label(id)}</option>)}</select>
      <button className="btn" onClick={() => setReplay((previous) => previous + 1)}>Repetir</button>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} />Versión sin movimiento</label>
    </div>
    <p className="text-sm">{m.cell[0]}×{m.cell[1]} · {m.frames} cuadros · {m.fps} fps · {END_LABELS[m.finish]}{platformReduced ? " · Movimiento reducido activo en el navegador" : ""}</p>
    <div className="max-w-full overflow-auto">
      <div className="flex items-center justify-center p-2" style={{ width: m.cell[0] * zoom + 16, minHeight: m.cell[1] * zoom + 16, background: bg }}>
        <AnimatedPreview key={`${selected}_${replay}_${staticPreview}`} id={selected} zoom={zoom} reduced={staticPreview} />
      </div>
    </div>
    <div className="flex flex-wrap items-start gap-3">
      {ids.map((id) => <button key={id} aria-pressed={selected === id} className="max-w-full overflow-auto border border-slate-600 p-2 text-left" style={{ background: bg }} onClick={() => { setSelected(id); setReplay((previous) => previous + 1); }}>
        <Still id={id} reduced={reduced} frame={Math.floor(PIXEL_EFFECTS[id].frames / 2)} />
        <span className="mt-1 block max-w-80 text-xs">{label(id)}</span>
      </button>)}
    </div>
  </section>;
}
