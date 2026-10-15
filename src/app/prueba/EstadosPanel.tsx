"use client";

import { useState } from "react";
import type { Battle, Combatant } from "@/lib/game/combat";
import type { StatusEffect, StatusId } from "@/lib/game/statuses";
import { LAYER_KINDS, LAYER_MAX, type StatusLayerKind } from "@/lib/art/statusLayers";

// Dev sandbox (`/prueba?estados=1`): force elemental states on the bench fight to look at the envelopes.
const STATUS_ID: Partial<Record<StatusLayerKind, StatusId>> = { frost: "escarcha", burn: "quemadura", wind: "impulso", fracture: "ruptura" };
const LABEL: Record<StatusLayerKind, string> = { frost: "Escarcha", burn: "Quemadura", wind: "Impulso", fracture: "Ruptura", charge: "Sobrecarga" };

function setLayer(c: Combatant, kind: StatusLayerKind, stacks: number): Combatant {
  const id = STATUS_ID[kind];
  if (!id) return { ...c, charge: stacks };
  const rest = (c.statuses ?? []).filter((s) => s.id !== id);
  const add: StatusEffect[] = stacks > 0 ? [{ id, stacks, turns: 3 }] : [];
  return { ...c, statuses: [...rest, ...add] };
}

export function EstadosPanel({ b, onChange }: { b: Battle; onChange: (b: Battle) => void }) {
  const [who, setWho] = useState(0); // 0 = hero, k = enemies[k-1], -1 = everyone
  const apply = (f: (c: Combatant) => Combatant) =>
    onChange({
      ...b,
      player: who === 0 || who < 0 ? f(b.player) : b.player,
      enemies: b.enemies.map((e, i) => (who === i + 1 || who < 0 ? f(e) : e)),
    });
  return (
    <details open className="rounded border border-slate-600 bg-slate-900/80 p-2 text-sm text-white">
      <summary className="cursor-pointer font-bold">Estados elementales (prueba)</summary>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {[{ v: -1, t: "Todos" }, { v: 0, t: "Héroe" }, ...b.enemies.map((_, i) => ({ v: i + 1, t: `R${i + 1}` }))].map((o) => (
          <button key={o.v} onClick={() => setWho(o.v)} className={`rounded px-2 py-1 ${who === o.v ? "bg-amber-600" : "bg-slate-700"}`}>{o.t}</button>
        ))}
        <button className="ml-2 rounded bg-slate-700 px-2 py-1" onClick={() => apply((c) => ({ ...c, statuses: [], charge: 0 }))}>Limpiar</button>
        <button className="rounded bg-slate-700 px-2 py-1" onClick={() => apply((c) => LAYER_KINDS.reduce((x, k) => setLayer(x, k, LAYER_MAX[k]), c))}>Todos al máx.</button>
      </div>
      {LAYER_KINDS.map((k) => (
        <div key={k} className="mt-1 flex items-center gap-1">
          <span className="w-24">{LABEL[k]}</span>
          {Array.from({ length: LAYER_MAX[k] + 1 }, (_, n) => (
            <button key={n} className="w-8 rounded bg-slate-700 py-1" onClick={() => apply((c) => setLayer(c, k, n))}>{n}</button>
          ))}
        </div>
      ))}
      <a className="mt-2 block underline" href="/prueba/estados">Galería de las 14 capas</a>
    </details>
  );
}
