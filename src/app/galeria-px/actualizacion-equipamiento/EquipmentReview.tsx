"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import generatedDrafts from "./equipment-drafts.generated.json";
import { paintedEquipment } from "@/lib/art/painted-equipment";
import { ELEMENT_ART } from "@/lib/art";
import { ELEMENTS, ELEMENT_LABEL, type Element } from "@/lib/game/elements";
import type { WeaponType } from "@/lib/game/weapons";
import { PaintedEquipmentImage, equipmentPortraitInsets } from "@/components/PaintedEquipmentImage";

type EquipmentDraft = {
  id: string;
  name: string;
  oldSrc: string;
  src: string | null;
  width?: number;
  height?: number;
  note: string;
};

const EQUIPMENT = generatedDrafts as EquipmentDraft[];
const TYPE_BY_ID: Record<string,WeaponType> = {sword:"espada",axe:"hacha",bow:"arco",staff:"baston",dagger:"daga",mace:"maza",wand:"varita",book:"libro",greatsword:"mandoble",hammer:"martillo",helmet:"casco",chest:"peto",legs:"piernas",boots:"zapatos",necklace:"collar"};
const CHECKERBOARD = {
  backgroundColor: "#172033",
  backgroundImage:
    "linear-gradient(45deg, #273449 25%, transparent 25%), linear-gradient(-45deg, #273449 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #273449 75%), linear-gradient(-45deg, transparent 75%, #273449 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
};

function ArtifactPreview({
  src,
  label,
  size,
  dimensions,
}: {
  src: string;
  label: string;
  size: number;
  dimensions?: { width?: number; height?: number };
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-slate-700 p-3" style={CHECKERBOARD}>
      <Image
        src={src}
        alt={label}
        width={dimensions?.width || 512}
        height={dimensions?.height || 512}
        unoptimized
        className="object-contain"
        style={{ width: size, height: size }}
      />
      <span className="text-center text-xs text-slate-300">{label} · {size} px</span>
    </div>
  );
}

export function EquipmentReview() {
  const [selectedId, setSelectedId] = useState(EQUIPMENT[0]?.id ?? "sword");
  const [size, setSize] = useState(80);
  const [element, setElement] = useState<Element>("fuego");
  const base = EQUIPMENT.find((item) => item.id === selectedId) ?? EQUIPMENT[0];
  if (!base) return null;
  const selected = {...base,...paintedEquipment(TYPE_BY_ID[base.id],element),note:base.note.replace("Fuego",ELEMENT_LABEL[element]),oldSrc:base.oldSrc.replace("_fire.",`_${ELEMENT_ART[element]}.`)};

  const heroSrc = selected.id === "greatsword" || selected.id === "hammer"
    ? `/art/heroes/big/berserker_${ELEMENT_ART[element]}.webp`
    : `/art/heroes/big/knight_${ELEMENT_ART[element]}.webp`;
  const selectedImage=paintedEquipment(TYPE_BY_ID[base.id],element);

  return (
    <main className="min-h-screen bg-slate-950 p-3 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Fase equipamiento · Revisión local</p>
          <h1 className="text-3xl font-bold">Equipamiento pintado · Catálogo completo</h1>
          <p className="max-w-3xl text-slate-300">
            Quince tipos y cinco elementos: 75 ilustraciones con el acabado aprobado. Integradas localmente para revisión; pendientes de aprobación final y publicación.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-cyan-300">
            <Link href="/galeria-px/actualizacion-escenarios">Escenarios pintados</Link>
            <Link href="/galeria-px/actualizacion-enemigos">Villanos pintados</Link>
          </nav>
        </header>

        <section aria-label="Pilotos de equipamiento" className="rounded-xl border border-slate-700 bg-slate-900 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Armas, armaduras y accesorios</h2>
            <label className="text-sm">Elemento de equipamiento <select value={element} onChange={e=>setElement(e.target.value as Element)} className="rounded border border-slate-600 bg-slate-800 p-2">{ELEMENTS.map(e=><option key={e} value={e}>{ELEMENT_LABEL[e]}</option>)}</select></label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {EQUIPMENT.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-pressed={selected.id === item.id}
                className={`min-h-16 rounded-lg border p-3 text-left transition-colors ${selected.id === item.id ? "border-amber-300 bg-amber-950/50" : "border-slate-700 bg-slate-950/60 hover:border-slate-500"}`}
              >
                <span className="block font-medium">{item.name}</span>
                {item.src && <Image src={paintedEquipment(TYPE_BY_ID[item.id],element)?.src ?? item.src} alt="" width={144} height={144} unoptimized className="mx-auto my-2 h-36 w-36 max-w-full object-contain" />}
                <span className={`mt-1 block text-xs ${item.src ? "text-emerald-300" : "text-amber-200"}`}>
                  {item.src ? "Disponible" : "Pendiente de generación"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Comparación de propuestas" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-amber-100">{selected.name}</h2>
              <p className="mt-1 text-sm text-slate-300">{selected.note}</p>
              {selected.src && <a href={selected.src} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-cyan-300">Ampliar boceto</a>}
            </div>
            <label className="flex items-center gap-2 text-sm">Tamaño de muestra
              <select value={size} onChange={(event) => setSize(Number(event.target.value))} className="rounded border border-slate-600 bg-slate-800 p-2">
                {[48, 80, 128].map((value) => <option key={value} value={value}>{value} px</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <h3 className="text-sm font-semibold text-slate-200">Icono actual</h3>
              <ArtifactPreview src={selected.oldSrc} label="Actual" size={size} />
            </div>
            <div className="space-y-2 rounded-lg border border-amber-800/70 bg-slate-950/60 p-3">
              <h3 className="text-sm font-semibold text-amber-100">Boceto pintado</h3>
              {selected.src ? (
                <ArtifactPreview
                  src={selected.src}
                  label="Boceto nuevo"
                  size={size}
                  dimensions={{ width: selected.width, height: selected.height }}
                />
              ) : (
                <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-600 bg-slate-950/70 p-5 text-center">
                  <div><p className="font-medium text-amber-200">Boceto pendiente de generación</p><p className="mt-2 max-w-sm text-sm text-slate-400">La generación de esta imagen todavía no está disponible. Cuando se complete, aparecerá aquí para compararla con el icono actual.</p></div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Muestra de escala en tarjeta" className="rounded-xl border border-slate-700 bg-slate-900 p-3 sm:p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Muestra de escala junto a un héroe</h2>
            <p className="text-sm text-slate-400">El icono está integrado localmente en el inventario pintado. Esta comparación no cambia el equipo que sostiene el personaje.</p>
          </div>
          <div className="flex flex-wrap items-end justify-center gap-5 rounded-lg bg-slate-950/70 p-4 sm:gap-10 sm:p-6">
            <div className="space-y-2 text-center">
              <div className="relative aspect-[3/4] w-36 overflow-hidden sm:w-44">
                <div className="absolute inset-[14%_17%_13.5%]">
                  <div className="absolute" style={equipmentPortraitInsets(true)}>
                    {selectedImage && <PaintedEquipmentImage image={selectedImage} className="h-full w-full" />}
                  </div>
                  {!selected.src && <span className="text-center text-xs text-slate-500">Boceto pendiente</span>}
                  <Image src={`/art/icons/icon_element_${ELEMENT_ART[element]}.webp`} alt={`Elemento ${ELEMENT_LABEL[element]}`} width={24} height={24} unoptimized className="absolute right-0.5 top-0.5 h-6 w-6" />
                  <span className="absolute left-0.5 top-0.5 rounded-full bg-cyan-300 px-1 text-xs font-bold text-black">×3</span>
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-px bg-gradient-to-t from-black/85 to-transparent px-1 pb-1 text-white">
                    <span className="w-full truncate text-xs font-bold">{selected.name} · {ELEMENT_LABEL[element]}</span>
                    <span className="flex">{[0,1,2,3,4].map(i=><Image key={i} src="/art/icons/icon_system_star.webp" alt="" width={12} height={12} unoptimized className={`h-3 w-3 ${i>=3?"opacity-30 grayscale":""}`} />)}</span>
                  </div>
                </div>
                <Image src="/art/frames/card_s.webp" alt="" width={376} height={500} unoptimized className="pointer-events-none absolute inset-0 h-full w-full" />
              </div>
              <span className="text-xs text-slate-400">Marco pintado S</span>
            </div>
            <div className="space-y-2 text-center">
              <div className="grid h-48 w-36 place-items-end sm:h-56 sm:w-44">
                <Image src={heroSrc} alt={`${selected.id === "greatsword" || selected.id === "hammer" ? "Berserker" : "Caballero"} de ${ELEMENT_LABEL[element]}, muestra de escala`} width={300} height={400} unoptimized className="max-h-full w-full object-contain object-bottom" />
              </div>
              <span className="text-xs text-slate-400">Héroe de {ELEMENT_LABEL[element]} · referencia</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
