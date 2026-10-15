"use client";

import { ElementalStatusOverlay } from "@/components/ElementalStatusOverlay";
import { HeroSprite } from "@/components/HeroSprite";
import { useArt } from "@/components/ArtScope";
import { LAYER_KINDS, LAYER_MAX } from "@/lib/art/statusLayers";

// Dev gallery: the 14 envelopes of the current style on a hero, one per cell (toggle the style above).
export default function EstadosGaleria() {
  const { pixel, set } = useArt();
  return (
    <main className="p-4 text-white">
      <button className="btn btn-gray mb-3" onClick={() => set(!pixel)}>Estilo: {pixel ? "pixel" : "pintado"} (cambiar)</button>
      {LAYER_KINDS.map((kind) => (
        <section key={kind} className="mb-3">
          <h2 className="font-bold">{kind}</h2>
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: LAYER_MAX[kind] }, (_, i) => i + 1).map((n) => (
              <figure key={n} className="m-0">
                <div className="relative h-56 w-44 overflow-hidden bg-[#3a2f3d]">
                  <div className="absolute inset-x-6 bottom-3 top-6">
                    <HeroSprite classId="caballero" element="fuego" traits={[]} />
                    <ElementalStatusOverlay
                      c={{ hp: 1, statuses: kind === "charge" ? [] : [{ id: ({ frost: "escarcha", burn: "quemadura", wind: "impulso", fracture: "ruptura" } as const)[kind], stacks: n, turns: 3 }], charge: kind === "charge" ? n : 0 }}
                      family="hero"
                    />
                  </div>
                </div>
                <figcaption className="text-xs">{kind} {n}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
