"use client";

import { useState, type CSSProperties } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { HeroSprite } from "@/components/HeroSprite";
import { EnemySprite } from "@/components/EnemySprite";
import type { EnemyFamily } from "@/lib/game/worlds";
import { ELEMENTS, ELEMENT_LABEL, type Element } from "@/lib/game/elements";
import type { EnemyAction } from "@/lib/art/enemies";

type Design = { id: string; label: string; family: EnemyFamily; tier: "normal" | "elite" | "boss"; rank?: string };
const FAMILIES: { id: string; family: EnemyFamily; label: string }[] = [
  { id: "slime", family: "limo", label: "Limo" },
  { id: "imp", family: "diablillo", label: "Diablillo" },
  { id: "harpy", family: "arpia", label: "Arpía" },
  { id: "golem", family: "golem", label: "Gólem" },
  { id: "specter", family: "espectro", label: "Espectro" },
];
const TIER_LABEL = { normal: "Normal", elite: "Élite", boss: "Jefe" };
const FINALS = [
  ["great_devourer", "Gran Devorador", "f", "limo"],
  ["ash_king", "Rey de Cenizas", "e", "diablillo"],
  ["withered_queen", "Reina Marchita", "d", "arpia"],
  ["hollow_colossus", "Coloso Hueco", "c", "golem"],
  ["eternal_watcher", "Vigía Eterno", "b", "espectro"],
  ["mother_hydra", "Madre Hidra", "a", "golem"],
  ["lord_of_flies", "Señor de las Moscas", "s", "diablillo"],
  ["faceless_one", "El Sin Rostro", "ss", "espectro"],
  ["thunder_king", "Rey del Trueno", "ssr", "golem"],
] as const;
const DESIGNS: Design[] = [
  ...FAMILIES.flatMap(({ id, family, label }) => (["normal", "elite", "boss"] as const).map((tier) => ({ id: `enemy_${id}_${tier}`, family, tier, label: `${label} · ${TIER_LABEL[tier]}` }))),
  ...FINALS.map(([id, label, rank, family]) => ({ id: `boss_${id}`, label, rank, family, tier: "boss" as const })),
];
const ACTION_LABEL: Record<EnemyAction, string> = { idle: "Reposo", attack: "Ataque", hit: "Recibir golpe", defeat: "Derrota", entrance: "Entrada" };

export function EnemyBattlePreview() {
  const [id, setId] = useState(DESIGNS[0].id);
  const [action, setAction] = useState<EnemyAction>("idle");
  const [element, setElement] = useState<Element>("fuego");
  const [rank, setRank] = useState("f");
  const [play, setPlay] = useState(0);
  const design = DESIGNS.find((entry) => entry.id === id)!;
  return <section className="mb-6 space-y-3" aria-label="Muestra de enemigos en el mapa">
    <h2 className="text-lg font-bold">Enemigos en el mapa</h2>
    <div className="flex flex-wrap gap-3 text-sm">
      <label>Diseño <select aria-label="Diseño de enemigo en mapa" value={id} onChange={(event) => setId(event.target.value)}>{DESIGNS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label>Acción <select aria-label="Acción de enemigo en mapa" value={action} onChange={(event) => setAction(event.target.value as EnemyAction)}>{(Object.keys(ACTION_LABEL) as EnemyAction[]).map((entry) => <option key={entry} value={entry}>{ACTION_LABEL[entry]}</option>)}</select></label>
      <label>Elemento <select aria-label="Elemento de enemigo en mapa" value={element} onChange={(event) => setElement(event.target.value as Element)}>{ELEMENTS.map((entry) => <option key={entry} value={entry}>{ELEMENT_LABEL[entry]}</option>)}</select></label>
      <label>Mapa <select aria-label="Mapa de muestra de enemigos" value={rank} onChange={(event) => setRank(event.target.value)}><option value="f">Pantano</option><option value="e">Volcán</option></select></label>
      <button type="button" className="rounded border px-2" onClick={() => setPlay((previous) => previous+1)}>Reproducir</button>
    </div>
    {action === "entrance" && design.tier !== "boss" && <p className="text-xs text-neutral-400">La entrada corresponde a los jefes; este enemigo muestra reposo.</p>}
    <div className="relative isolate h-[420px] w-full overflow-hidden rounded border border-neutral-700 md:h-[540px] min-[2200px]:h-[720px]" style={{ containerType: "size" }}>
      <ArenaBackground world={rank === "e" ? 1 : 0} rank={rank} boss={design.tier === "boss"} />
      <div className="absolute bottom-[3%] left-[5%] z-10 h-[192px] w-[140px] min-[2200px]:h-[384px] min-[2200px]:w-[280px]">
        <HeroSprite classId="caballero" element={element} animated action="idle" className="h-full w-full" />
      </div>
      <div className="absolute bottom-[3%] right-[5%] z-10 h-[192px] w-[140px] min-[2200px]:h-[384px] min-[2200px]:w-[280px]" style={{ "--es": 1 } as CSSProperties}>
        <EnemySprite key={`${id}-${action}-${element}-${play}`} family={design.family} element={element} boss={design.tier === "boss"} elite={design.tier === "elite"} finalRank={design.rank} action={action} />
      </div>
    </div>
  </section>;
}
