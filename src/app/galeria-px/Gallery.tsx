"use client";

import { useState } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { HERO_ACTIONS } from "@/lib/art/heroes";
import { PX_ACTIONS } from "@/lib/art/enemies";
import pixelHeroes from "@/lib/art/pixel-heroes.generated.json";
import pixelEnemies from "@/lib/art/pixel-enemies.generated.json";
import { InventoryGallery } from "./InventoryGallery";
import { UiGallery } from "./UiGallery";
import { BackgroundGallery } from "./BackgroundGallery";
import { EffectsGallery } from "./EffectsGallery";
import { EnemyBattlePreview } from "./EnemyBattlePreview";

const ELEMENTS = ["fire", "water", "earth", "lightning", "wind"] as const;
const CLASSES = ["knight", "mage", "rogue", "cleric"];
const FAMILIES = ["slime", "imp", "harpy", "golem", "specter"];
const TIERS = ["normal", "elite", "boss"];
const FINALS = ["great_devourer", "ash_king", "withered_queen", "hollow_colossus", "eternal_watcher", "mother_hydra", "lord_of_flies", "faceless_one", "thunder_king"];
const BGS = { oscuro: "#1b2030", medio: "#6b7280", claro: "#d9d2c0", suelo: "#4a4338" } as const;

type Row = { label: string; file: (el: string, action: string) => string; entrance?: boolean };
const heroRows: Row[] = CLASSES.map((c) => ({ label: c, file: (e, a) => `heroes-px/hero_${c}_${e}_${a}` }));
const enemyRows: Row[] = [
  ...FAMILIES.flatMap((f) => TIERS.map((t) => ({ label: `${f} ${t}`, entrance: t === "boss", file: (e: string, a: string) => `enemies-px/enemy_${f}_${t}_${e}_${a}` }))),
  ...FINALS.map((b) => ({ label: `jefe ${b}`, entrance: true, file: (e: string, a: string) => `enemies-px/boss_${b}_${e}_${a}` })),
];

export function Gallery() {
  const [lot, setLot] = useState<"heroes" | "enemies" | "items" | "icons" | "frames" | "ui" | "backgrounds" | "effects">("heroes");
  const [action, setAction] = useState("idle");
  const [bg, setBg] = useState<keyof typeof BGS>("oscuro");
  const [zoom, setZoom] = useState(2);
  const [showEnemyCatalog, setShowEnemyCatalog] = useState(false);
  const actions = lot === "heroes" ? HERO_ACTIONS : PX_ACTIONS;
  const rows = lot === "heroes" ? heroRows : enemyRows;
  const animated = lot === "heroes" || lot === "enemies";
  const lotLabels = { heroes: "Héroes", enemies: "Enemigos y jefes", items: "Armas, equipo y forja", icons: "Íconos", frames: "Marcos", ui: "Interfaz", backgrounds: "Fondos", effects: "Efectos" };
  const a = action in actions ? action : "idle";
  const meta = (actions as Record<string, { frames: number; fps: number }>)[a];
  const cellWidth = lot === "heroes" ? pixelHeroes.runtime_frame_width : pixelEnemies.runtime_frame_width;
  const cellHeight = lot === "heroes" ? pixelHeroes.frame_height : pixelEnemies.frame_height;
  const w = cellWidth * zoom;
  const btn = (on: boolean) => `rounded border px-2 py-1 text-sm ${on ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-200"}`;
  return (
    <main className="min-h-screen bg-neutral-900 p-4 text-neutral-100">
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap gap-2 bg-neutral-900/95 py-2">
        {(["heroes", "enemies", "items", "icons", "frames", "ui", "backgrounds", "effects"] as const).map((l) => (
          <button key={l} className={btn(lot === l)} onClick={() => { setLot(l); setAction("idle"); setShowEnemyCatalog(false); }}>{lotLabels[l]}</button>
        ))}
        <span className="mx-2 border-l border-neutral-600" />
        {animated && Object.keys(actions).map((k) => (
          <button key={k} className={btn(a === k)} onClick={() => setAction(k)}>{k}</button>
        ))}
        <span className="mx-2 border-l border-neutral-600" />
        {Object.keys(BGS).map((k) => (
          <button key={k} className={btn(bg === k)} onClick={() => setBg(k as keyof typeof BGS)}>{k}</button>
        ))}
        {[1, 2, 3].map((z) => (
          <button key={z} className={btn(zoom === z)} onClick={() => setZoom(z)}>x{z}</button>
        ))}
      </div>
      {lot === "enemies" && <EnemyBattlePreview />}
      {lot === "enemies" && <button type="button" aria-expanded={showEnemyCatalog} className={`${btn(showEnemyCatalog)} mb-4`} onClick={() => setShowEnemyCatalog((previous) => !previous)}>{showEnemyCatalog ? "Ocultar catálogo de variantes" : "Mostrar catálogo de variantes"}</button>}
      {animated ? (lot !== "enemies" || showEnemyCatalog) && <div className="grid gap-1" style={{ gridTemplateColumns: `8rem repeat(5, ${w}px)` }}>
        <div />
        {ELEMENTS.map((e) => <div key={e} className="text-center text-xs text-neutral-400">{e}</div>)}
        {rows.map((r) => (
          <Row key={r.label} row={r} action={a} meta={meta} w={w} aspect={cellWidth / cellHeight} bg={BGS[bg]} />
        ))}
      </div> : lot === "effects" ? <EffectsGallery zoom={zoom} bg={BGS[bg]} /> : lot === "backgrounds" ? <BackgroundGallery zoom={zoom} /> : lot === "ui" ? <UiGallery zoom={zoom} bg={BGS[bg]} /> : <InventoryGallery lot={lot as "items" | "icons" | "frames"} zoom={zoom} bg={BGS[bg]} />}
    </main>
  );
}

function Row({ row, action, meta, w, aspect, bg }: { row: Row; action: string; meta: { frames: number; fps: number }; w: number; aspect: number; bg: string }) {
  const shown = action === "entrance" && row.entrance === false ? "idle" : action;
  const animation = shown === action ? meta : PX_ACTIONS.idle;
  return (
    <>
      <div className="self-center text-xs text-neutral-300">{row.label}</div>
      {ELEMENTS.map((e) => (
        <div key={e} style={{ width: w, background: bg, imageRendering: "pixelated" }}>
          <AnimSheet anim={{ src: `/art/${row.file(e, shown)}.png`, frames: animation.frames, fps: animation.fps, loop: true, aspect }} className="w-full" />
        </div>
      ))}
    </>
  );
}
