"use client";

import { useState } from "react";
import { PullReveal } from "@/components/PullReveal";
import type { ItemView } from "@/components/ItemCard";

const examples: ItemView[] = [
  { kind: "character", classId: "caballero", name: "Gortha", element: "rayo", rarity: "s", stars: 1, badge: "NUEVO" },
  { kind: "character", classId: "mago", name: "Zuren", element: "fuego", rarity: "c", stars: 2, badge: "+1 ★" },
  { kind: "character", classId: "picaro", name: "Sindralo", element: "viento", rarity: "d", stars: 4, badge: "+1 ★" },
  { kind: "character", classId: "clerigo", name: "Katha", element: "agua", rarity: "f", stars: 3, badge: "+1 ★" },
  { kind: "character", classId: "caballero", name: "Dralo", element: "fuego", rarity: "d", stars: 4, badge: "+1 ★" },
  { kind: "character", classId: "picaro", name: "Bothra", element: "tierra", rarity: "e", stars: 1, badge: "NUEVO" },
  { kind: "character", classId: "mago", name: "Tharen", element: "agua", rarity: "e", stars: 3, badge: "+1 ★" },
  { kind: "character", classId: "clerigo", name: "Zulobo", element: "fuego", rarity: "f", stars: 5, badge: "REEMBOLSO +125" },
  { kind: "character", classId: "caballero", name: "Bovel", element: "rayo", rarity: "d", stars: 4, badge: "+1 ★" },
  { kind: "character", classId: "mago", name: "Zuren", element: "fuego", rarity: "c", stars: 5, badge: "+1 ★" },
];

export function PullRevealPreview() {
  const [count, setCount] = useState<1 | 10 | null>(null);
  return <section className="space-y-3">
    <h3 className="text-base font-bold">Muestra de invocación</h3>
    <p className="text-sm text-slate-300">Ejemplos de presentación. No consume monedas ni modifica la colección.</p>
    <div className="flex flex-wrap gap-3">
      <button className="btn" onClick={() => setCount(10)}>Ver muestra de 10 resultados</button>
      <button className="btn btn-gray" onClick={() => setCount(1)}>Ver muestra de 1 resultado</button>
    </div>
    {count && <PullReveal items={examples.slice(0, count)} onDone={() => setCount(null)} />}
  </section>;
}
