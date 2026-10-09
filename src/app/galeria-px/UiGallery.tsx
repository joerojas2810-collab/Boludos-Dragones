"use client";

import { useState, type CSSProperties } from "react";
import assets from "@/lib/art/pixel-ui.generated.json";

type UiAsset = { file: string; width: number; height: number; display_scale?: number; nine_slice?: { top: number; right: number; bottom: number; left: number } };
const GROUPS: Record<string, string> = {
  panel: "Paneles", button: "Botones", bar: "Barras", slot: "Casillas", tab: "Pestañas",
  input: "Campos de texto", select: "Selectores", checkbox: "Casillas de verificación", radio: "Opciones",
  toggle: "Interruptores", slider: "Deslizadores", scrollbar: "Barras de desplazamiento",
  frame: "Marcos de rango", glyph: "Símbolos", chest: "Cofres", favicon: "Íconos de aplicación",
  logo: "Logos", separator: "Separadores", title: "Títulos", modal: "Fondo de modal",
};
const BUTTON_VARIANTS = [["primary", "Principal"], ["secondary", "Acero"], ["gold", "Oro"], ["neutral", "Neutro"], ["danger", "Peligro"]] as const;
const BUTTON_STATES = [["normal", "Normal"], ["hover", "Al pasar"], ["pressed", "Pulsado"], ["focus", "Foco"], ["disabled", "Deshabilitado"]] as const;

function slice(file: string): CSSProperties {
  const entry = (assets as UiAsset[]).find((asset) => asset.file === file);
  if (!entry?.nine_slice) return { imageRendering: "pixelated" };
  const { top, right, bottom, left } = entry.nine_slice;
  const scale = entry.display_scale ?? 1;
  const visible = [top, right, bottom, left].map((cut) => `${cut * scale}px`).join(" ");
  return {
    borderStyle: "solid", borderColor: "transparent", borderWidth: visible,
    borderImage: `url(/art/ui-px/${file}) ${top} ${right} ${bottom} ${left} fill / ${visible} stretch`,
    imageRendering: "pixelated", background: "none",
  };
}

export function UiGallery({ zoom, bg }: { zoom: number; bg: string }) {
  const [wide, setWide] = useState(false);
  return <section className="space-y-6">
    <section>
      <h2 className="mb-2 text-lg font-bold">Interfaz en uso</h2>
      <button className="btn mb-3" onClick={() => setWide(!wide)}>Cambiar ancho</button>
      <div className="max-w-full space-y-3 p-3" style={{ ...slice("panel_default.png"), width: wide ? 640 : 320 }}>
        <h3 className="font-bold">Una aventura entre amigos</h3>
        <p className="text-sm">Las esquinas permanecen fijas al cambiar el ancho.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn">Continuar</button><button className="btn btn-gray">Volver</button><button className="btn" disabled>No disponible</button>
          <button className="btn btn-gold">Premio</button><button className="btn btn-danger">Abandonar</button><button className="btn btn-neutral">Detalles</button>
        </div>
        <label className="block text-sm">Nombre del héroe<input aria-label="Nombre del héroe de muestra" className="mt-1 w-full" defaultValue="Dragón con ñ" /></label>
        <select aria-label="Clase de muestra" defaultValue="caballero"><option value="caballero">Caballero</option><option value="mago">Mago</option></select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked />Jugar con amigos</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="sample-mode" defaultChecked />Modo aventura</label>
        <label className="block text-sm">Volumen<input type="range" aria-label="Volumen de muestra" className="ml-2" defaultValue={65} /></label>
        <div className="bar-track h-6"><div className="bar-fill h-full" style={{ width: "65%" }} /></div>
      </div>
    </section>
    <section aria-label="Comparación de estados de botón">
      <h2 className="mb-2 text-lg font-bold">Estados de los botones</h2>
      <div className="max-w-full overflow-x-auto">
        <div className="grid gap-2 text-sm" style={{ gridTemplateColumns: "5rem repeat(5, minmax(7rem, 1fr))" }}>
          <div />{BUTTON_STATES.map(([state, label]) => <div key={state} className="text-center text-xs text-neutral-300">{label}</div>)}
          {BUTTON_VARIANTS.map(([variant, label]) => <ButtonStateRow key={variant} variant={variant} label={label} />)}
        </div>
      </div>
    </section>
    {Object.entries(GROUPS).map(([family, title]) => {
      const entries = (assets as UiAsset[]).filter((entry) => entry.file === family + ".png" || entry.file.startsWith(family + "_"));
      return !entries.length ? null : <section key={family}>
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <div className="flex flex-wrap items-start gap-3">
          {entries.map((entry) => <figure key={entry.file} className="max-w-full overflow-auto">
            <div className="inline-flex p-2" style={{ background: bg }}>
              {/* Native assets are reviewed at integer zoom, including large favicon exports. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/art/ui-px/${entry.file}`} alt={entry.file.slice(0, -4)} draggable={false}
                width={entry.width * zoom} height={entry.height * zoom} style={{ imageRendering: "pixelated", maxWidth: "none" }} />
            </div>
            <figcaption className="mt-1 max-w-64 text-xs">{entry.file} · {entry.width}×{entry.height}</figcaption>
          </figure>)}
        </div>
      </section>;
    })}
  </section>;
}

function ButtonStateRow({ variant, label }: { variant: string; label: string }) {
  const gold = variant === "primary" || variant === "gold";
  return <>
    <div className="self-center text-xs text-neutral-300">{label}</div>
    {BUTTON_STATES.map(([state, stateLabel]) => <div key={state} role="img" aria-label={`${label}: ${stateLabel}`} className="flex h-10 items-center justify-center text-center text-sm font-bold"
      style={{ ...slice(`button_${variant}_${state}.png`), color: state === "disabled" ? "#abc1d3" : gold ? "#101522" : "#e7eeea" }}>Continuar</div>)}
  </>;
}
