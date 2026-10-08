"use client";

import { useState } from "react";
import { AnimSheet } from "@/components/AnimSheet";
import { HERO_ACTIONS } from "@/lib/art/heroes";
import { PX_ACTIONS } from "@/lib/art/enemies";
import { InventoryGallery } from "./InventoryGallery";
import { UiGallery } from "./UiGallery";
import { BackgroundGallery } from "./BackgroundGallery";

const ELEMENTS = ["fire", "water", "earth", "lightning", "wind"] as const;
const CLASSES = ["knight", "mage", "rogue", "cleric"];
const FAMILIES = ["slime", "imp", "harpy", "golem", "specter"];
const TIERS = ["normal", "elite", "boss"];
const FINALS = ["great_devourer", "ash_king", "withered_queen", "hollow_colossus", "eternal_watcher", "mother_hydra", "lord_of_flies", "faceless_one", "thunder_king"];
const BGS = { oscuro: "#1b2030", medio: "#6b7280", claro: "#d9d2c0", suelo: "#4a4338" } as const;

type Row = { label: string; file: (el: string, action: string) => string };
const heroRows: Row[] = CLASSES.map((c) => ({ label: c, file: (e, a) => `heroes-px/hero_${c}_${e}_${a}` }));
const enemyRows: Row[] = [
  ...FAMILIES.flatMap((f) => TIERS.map((t) => ({ label: `${f} ${t}`, file: (e: string, a: string) => `enemies-px/enemy_${f}_${t}_${e}_${a}` }))),
  ...FINALS.map((b) => ({ label: `jefe ${b}`, file: (e: string, a: string) => `enemies-px/boss_${b}_${e}_${a}` })),
];

export function Gallery() {
  const [lot, setLot] = useState<"heroes" | "enemies" | "items" | "icons" | "frames" | "ui" | "backgrounds">("heroes");
  const [action, setAction] = useState("idle");
  const [bg, setBg] = useState<keyof typeof BGS>("oscuro");
  const [zoom, setZoom] = useState(2);
  const actions = lot === "heroes" ? HERO_ACTIONS : PX_ACTIONS;
  const rows = lot === "heroes" ? heroRows : enemyRows;
  const animated = lot === "heroes" || lot === "enemies";
  const lotLabels = { heroes: "Héroes", enemies: "Enemigos y jefes", items: "Armas, equipo y forja", icons: "Íconos", frames: "Marcos", ui: "Interfaz", backgrounds: "Fondos" };
  const a = action in actions ? action : "idle";
  const meta = (actions as Record<string, { frames: number; fps: number }>)[a];
  const w = 70 * zoom;
  const btn = (on: boolean) => `rounded border px-2 py-1 text-sm ${on ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-200"}`;
  return (
    <main className="min-h-screen bg-neutral-900 p-4 text-neutral-100">
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap gap-2 bg-neutral-900/95 py-2">
        {(["heroes", "enemies", "items", "icons", "frames", "ui", "backgrounds"] as const).map((l) => (
          <button key={l} className={btn(lot === l)} onClick={() => { setLot(l); setAction("idle"); }}>{lotLabels[l]}</button>
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
      {animated ? <div className="grid gap-1" style={{ gridTemplateColumns: `8rem repeat(5, ${w}px)` }}>
        <div />
        {ELEMENTS.map((e) => <div key={e} className="text-center text-xs text-neutral-400">{e}</div>)}
        {rows.map((r) => (
          <Row key={r.label} row={r} action={a} meta={meta} w={w} bg={BGS[bg]} />
        ))}
      </div> : lot === "backgrounds" ? <BackgroundGallery zoom={zoom} /> : lot === "ui" ? <UiGallery zoom={zoom} bg={BGS[bg]} /> : <InventoryGallery lot={lot as "items" | "icons" | "frames"} zoom={zoom} bg={BGS[bg]} />}
    </main>
  );
}

function Row({ row, action, meta, w, bg }: { row: Row; action: string; meta: { frames: number; fps: number }; w: number; bg: string }) {
  return (
    <>
      <div className="self-center text-xs text-neutral-300">{row.label}</div>
      {ELEMENTS.map((e) => (
        <div key={e} style={{ width: w, background: bg, imageRendering: "pixelated" }}>
          <AnimSheet anim={{ src: `/art/${row.file(e, action)}.png`, frames: meta.frames, fps: meta.fps, loop: true, aspect: 70 / 96 }} className="w-full" />
        </div>
      ))}
    </>
  );
}
