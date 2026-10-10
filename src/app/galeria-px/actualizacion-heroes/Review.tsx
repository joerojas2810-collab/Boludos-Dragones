"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimSheet } from "@/components/AnimSheet";
import { HeroSprite } from "@/components/HeroSprite";
import { ItemCard, type ItemView } from "@/components/ItemCard";
import { PullReveal } from "@/components/PullReveal";
import { useArt } from "@/components/ArtScope";
import { EquipmentEditor } from "@/components/EquipmentEditor";
import { BattleArena } from "@/components/BattleArena";
import { startBattle } from "@/lib/game/combat";
import { createProfile, slotKey, type OwnedCharacter } from "@/lib/game/profile";
import { generateCharacter } from "@/lib/game/characters";
import { createRng } from "@/lib/game/rng";
import { weaponName, weaponAtk, type Slot } from "@/lib/game/weapons";
import { RARITY_IDS } from "@/lib/game/rarity";
import { HERO_ACTIONS, type HeroAction } from "@/lib/art/heroes";
import { HERO_ART_V } from "@/lib/art";
import paintedHeroes from "@/lib/art/hero-integration.generated.json";
import pixelHeroes from "@/lib/art/pixel-heroes.generated.json";

const CLASSES = ["knight", "mage", "rogue", "cleric"] as const;
type ArtClass = (typeof CLASSES)[number];
type Style = "painted" | "pixel";
const CLASS_LABELS: Record<ArtClass, string> = { knight: "Caballero", mage: "Mago", rogue: "Asesina", cleric: "Clérigo" };
const GAME_CLASSES = { knight: "caballero", mage: "mago", rogue: "picaro", cleric: "clerigo" } as const;
const ELEMENTS = ["fire", "water", "earth", "lightning", "wind"] as const;
type ArtElement = (typeof ELEMENTS)[number];
const ELEMENT_LABELS: Record<ArtElement, string> = { fire: "Fuego", water: "Agua", earth: "Tierra", lightning: "Rayo", wind: "Viento" };
const GAME_ELEMENTS = { fire: "fuego", water: "agua", earth: "tierra", lightning: "rayo", wind: "viento" } as const;
const ACTION_LABELS: Record<HeroAction, string> = { idle: "Reposo", attack_1: "Ataque rápido", attack_2: "Ataque fuerte", attack_3: "Habilidad", defend: "Defender", perfect_guard: "Guardia perfecta", hit: "Recibir golpe", dodge: "Esquivar", defeat: "Derrota", victory: "Victoria" };
const PX_BOUNDS: Record<ArtClass, readonly [number, number, number, number]> = { knight: [10,25,121,155], mage: [13,13,113,167], rogue: [27,56,86,124], cleric: [10,25,107,155] };
const BACKGROUND_LAYERS = ["sky", "far", "mid", "ground", "foreground"];

// Isolated display fixture: no account or storage changes.
function EquipmentPreview() {
  const rng = createRng(71);
  const hero: OwnedCharacter = { ...generateCharacter(rng, "caballero"), id: "preview-knight", element: "rayo", rarity: "s", stars: 1 };
  const profile = createProfile();
  profile.characters = [hero];
  (["casco", "peto", "piernas", "arma", "zapatos", "collar"] as Slot[]).forEach((slot, i) => {
    const type = slot === "arma" ? "espada" as const : slot;
    const rarity = RARITY_IDS[i];
    const piece = { id: `preview-${slot}`, name: weaponName(type, "rayo", rarity), type, rarity, element: "rayo" as const, stars: 0, atkBonus: weaponAtk(rarity, 0, type) };
    profile.weapons.push(piece);
    profile.equipped[slotKey(hero.id, slot)] = piece.id;
  });
  return <div inert className="mx-auto max-w-md space-y-3 rounded border border-slate-600 bg-slate-800 p-4"><EquipmentEditor c={hero} profile={profile} act={() => {}} /></div>;
}

function BattlePreview() {
  const rng = createRng(72);
  const hero = { ...generateCharacter(rng, "caballero"), element: "rayo" as const };
  const foe = generateCharacter(rng, "mago");
  const battle = startBattle(hero, [foe], rng);
  return <div className="flex h-[420px] flex-col"><BattleArena b={battle} world={0} playerExtra="Muestra" enemyExtra={() => "Muestra"} enemy={0} enemyArt={(_, c) => <HeroSprite classId={c.char.classId} element={c.char.element} animated flip />} /></div>;
}

function source(cls: ArtClass, element: ArtElement, action: HeroAction, style: Style) {
  return style === "painted"
    ? `/art/heroes/hero_${cls}_${element}_${action}.webp?v=${HERO_ART_V}`
    : `/art/heroes-px/hero_${cls}_${element}_${action}.png?v=${HERO_ART_V}`;
}

function Portrait({ cls, element, style }: { cls: ArtClass; element: ArtElement; style: Style }) {
  const [x,y,width,height] = style === "painted" ? paintedHeroes.idle_bounds[cls] : PX_BOUNDS[cls];
  const frameWidth = style === "painted" ? paintedHeroes.frame_size : pixelHeroes.runtime_frame_width;
  const frameHeight = style === "painted" ? paintedHeroes.frame_size : pixelHeroes.frame_height;
  const sheetWidth = frameWidth * HERO_ACTIONS.idle.frames;
  return <div className="flex h-40 w-full items-center justify-center overflow-hidden" aria-hidden="true">
    <div style={{ width: `min(100%, ${160 * width / height}px)`, aspectRatio: `${width}/${height}`, backgroundImage: `url(${source(cls,element,"idle",style)})`, backgroundRepeat: "no-repeat", backgroundSize: `${sheetWidth / width * 100}% ${frameHeight / height * 100}%`, backgroundPosition: `${x / (sheetWidth-width) * 100}% ${y / (frameHeight-height) * 100}%`, imageRendering: style === "pixel" ? "pixelated" : "auto" }} />
  </div>;
}

function AnimatedHero({ cls, element, action, style }: { cls: ArtClass; element: ArtElement; action: HeroAction; style: Style }) {
  const frameWidth = style === "painted" ? paintedHeroes.frame_size : pixelHeroes.runtime_frame_width;
  const frameHeight = style === "painted" ? paintedHeroes.frame_size : pixelHeroes.frame_height;
  return <div style={{ width: `${192 * frameWidth / frameHeight}px`, maxWidth: "100%", imageRendering: style === "pixel" ? "pixelated" : "auto" }}>
    <AnimSheet key={`${style}-${cls}-${element}-${action}`} anim={{ src: source(cls,element,action,style), ...HERO_ACTIONS[action], aspect: frameWidth / frameHeight }} className="w-full" />
  </div>;
}

export function Review() {
  const art = useArt();
  const [style,setStyle] = useState<Style>(art.pixel ? "pixel" : "painted");
  const [action,setAction] = useState<HeroAction>("idle");
  const [element,setElement] = useState<ArtElement>("fire");
  const [replay,setReplay] = useState(0);
  const [showPull, setShowPull] = useState(false);
  const pullSample: ItemView[] = Array.from({ length: 10 }, (_, i) => ({ kind: "character", name: CLASS_LABELS[CLASSES[i % 4]], classId: GAME_CLASSES[CLASSES[i % 4]], element: GAME_ELEMENTS[ELEMENTS[i % 5]], rarity: RARITY_IDS[i % 7], stars: i % 4, badge: i % 3 === 0 ? "+1 COPIA" : "NUEVO" }));
  return <main className="min-h-screen bg-slate-950 p-3 text-slate-100 sm:p-6">
    {showPull && <PullReveal items={pullSample} onDone={() => setShowPull(false)} />}
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-amber-300">Revisión de héroes</h1>
        <p className="text-sm text-slate-300">Los cuatro diseños, sus elementos y animaciones. La Asesina también tiene su versión pixel art.</p>
        <nav className="flex flex-wrap gap-4 text-sm text-cyan-300"><Link href="/coleccion">Colección</Link><Link href="/prueba?n=3">Combate de prueba</Link><Link href="/galeria-px">Galería pixel art</Link></nav>
        <button className="btn" onClick={() => setShowPull(true)}>Ver invocación ×10</button>
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-600 bg-slate-900 p-3">
          <label className="flex flex-col gap-1 text-sm">Estilo<select className="rounded border border-slate-600 bg-slate-800 p-2" value={style} onChange={e=>{setStyle(e.target.value as Style);art.set(e.target.value === "pixel");}}><option value="painted">Pintado</option><option value="pixel">Pixel art</option></select></label>
          <label className="flex flex-col gap-1 text-sm">Acción<select className="max-w-full rounded border border-slate-600 bg-slate-800 p-2" value={action} onChange={e=>{setAction(e.target.value as HeroAction);setReplay(n=>n+1);}}>{(Object.keys(HERO_ACTIONS) as HeroAction[]).map(a=><option key={a} value={a}>{ACTION_LABELS[a]}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Elemento del escenario<select className="rounded border border-slate-600 bg-slate-800 p-2" value={element} onChange={e=>setElement(e.target.value as ArtElement)}>{ELEMENTS.map(e=><option key={e} value={e}>{ELEMENT_LABELS[e]}</option>)}</select></label>
          <button type="button" className="rounded border border-amber-400 bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={()=>setReplay(n=>n+1)}>Repetir animación</button>
        </div>
      </header>
      <section aria-labelledby="cards-title" className="space-y-3">
        <h2 id="cards-title" className="text-lg font-semibold">Tarjetas del juego</h2>
        <div className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-4">
          {CLASSES.map(cls => <ItemCard key={cls} size={120} item={{ kind: "character", name: CLASS_LABELS[cls], classId: GAME_CLASSES[cls], element: GAME_ELEMENTS[element], rarity: "s", stars: 3 }} />)}
        </div>
      </section>
      <section aria-labelledby="equipment-title" className="space-y-3">
        <h2 id="equipment-title" className="text-lg font-semibold">Proporción y rangos del equipo</h2>
        <p className="text-sm text-slate-300">Muestra visual del panel real con objetos de distintos rangos.</p>
        <EquipmentPreview />
      </section>
      <section aria-labelledby="battle-title" className="space-y-3">
        <h2 id="battle-title" className="text-lg font-semibold">Centrado en combate</h2>
        <BattlePreview />
      </section>
      <section aria-labelledby="game-title" className="space-y-3">
        <h2 id="game-title" className="text-lg font-semibold">Vista en el juego</h2>
        <p className="text-sm text-slate-300">Esta vista usa el estilo elegido en el juego. El selector de esta página cambia las muestras de abajo.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{CLASSES.map(cls=><article key={cls} className="flex min-w-0 flex-col items-center gap-3 rounded-lg border border-slate-600 bg-slate-900 p-2">
          <h3 className="text-sm font-semibold">{CLASS_LABELS[cls]}</h3>
          <div className="h-[140px] w-[108px] overflow-hidden"><HeroSprite classId={GAME_CLASSES[cls]} element={GAME_ELEMENTS[element]} crop fitBox className="h-full w-full" /></div>
          <div className="w-full max-w-[192px] aspect-square"><HeroSprite key={`${replay}-${cls}`} classId={GAME_CLASSES[cls]} element={GAME_ELEMENTS[element]} animated action={action} className="h-full w-full" /></div>
        </article>)}</div>
      </section>
      <section aria-labelledby="scene-title" className="space-y-2">
        <h2 id="scene-title" className="text-lg font-semibold">Sobre el escenario</h2>
        <div className="relative isolate overflow-hidden rounded-lg border border-slate-600 bg-slate-900">
          {BACKGROUND_LAYERS.map(layer=><div key={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ backgroundImage: `url(/art/backgrounds-px/canyon_normal_desktop_${layer}.png)`, backgroundSize: "cover", backgroundPosition: "center", imageRendering: "pixelated" }} />)}
          <div className="grid grid-cols-2 items-end gap-2 px-2 pb-6 pt-24 sm:grid-cols-4 sm:gap-4 sm:px-6 sm:pt-40">
            {CLASSES.map(cls=><div key={cls} className="flex min-w-0 flex-col items-center">
              <div key={`${replay}-${cls}`} className="flex h-48 w-full items-end justify-center"><AnimatedHero cls={cls} element={element} action={action} style={style} /></div>
              <span className="rounded bg-slate-950/85 px-2 py-1 text-sm font-semibold">{CLASS_LABELS[cls]}</span>
            </div>)}
          </div>
        </div>
      </section>
      <section aria-labelledby="elements-title" className="space-y-4">
        <h2 id="elements-title" className="text-lg font-semibold">Retratos y cinco elementos</h2>
        {CLASSES.map(cls=><div key={cls} className="space-y-2"><h3 className="font-semibold text-amber-200">{CLASS_LABELS[cls]}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{ELEMENTS.map(el=><article key={el} className="min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-3">
            <Portrait cls={cls} element={el} style={style} /><p className="mt-2 text-center text-sm">{ELEMENT_LABELS[el]}</p>
          </article>)}</div>
        </div>)}
      </section>
      <section aria-labelledby="actions-title" className="space-y-3">
        <h2 id="actions-title" className="text-lg font-semibold">{ACTION_LABELS[action]} · {ELEMENT_LABELS[element]}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{CLASSES.map(cls=><article key={`${replay}-${cls}`} className="flex min-w-0 flex-col items-center rounded-lg border border-slate-600 bg-slate-900 p-2"><AnimatedHero cls={cls} element={element} action={action} style={style}/><p className="mt-2 text-sm">{CLASS_LABELS[cls]}</p></article>)}</div>
      </section>
    </div>
  </main>;
}
