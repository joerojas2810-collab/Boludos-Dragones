"use client";

// Start-of-run and end-of-run screens: hero pick, preparation, sector summary, suspension and the
// final result (docs/torre/02 UI01-UI03, UI11, UI22).
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { SkillPicker } from "@/components/SkillPicker";
import { ClassElementPicker } from "@/components/room/ClassElementPicker";
import { ElementIcon } from "@/components/ElementIcon";
import { END_REASON_TEXT, scoreLine } from "@/lib/expeditionView";
import type { ExpStartOpts } from "@/lib/repo";
import { SAVE_LABEL, type ExpActionInput, type SaveStatus } from "@/lib/expeditionSync";
import { CLASSES, type Character, type ClassId } from "@/lib/game/characters";
import { ELEMENT_LABEL, type Element } from "@/lib/game/elements";
import { maxHpOf, nodePay, type ExpState } from "@/lib/game/expedition";
import { loadoutFor, masteryOf } from "@/lib/game/loadout";
import { heroFromOwned, heroPower, type Profile } from "@/lib/game/profile";
import { RARITIES } from "@/lib/game/rarity";
import type { Loadout } from "@/lib/game/skills";
import { TOWER_BLURB, TOWER_LABEL, towerHero, type TowerMode } from "@/lib/game/tower";
import { WEAPON_TYPE_DATA, type WeaponType } from "@/lib/game/weapons";
import { characterView, statLine } from "@/lib/viewModels";
import { RelicRows } from "./BuildPanel";
import { BossPreview } from "./NodeViews";
import { FragmentsChip, ScopeTag, useConfirmGuard } from "./parts";

// ---- hero pick (before anything exists on the server) -----------------------------------------

export function HeroPick({
  mode,
  profile,
  starting,
  onStart,
  back,
}: {
  mode: TowerMode;
  profile: Profile;
  starting: boolean;
  onStart: (opts: ExpStartOpts) => void;
  back: ReactNode;
}) {
  const [nivelado, setNivelado] = useState<{ classId: ClassId; element: Element } | null>(null);
  const [owned, setOwned] = useState<string | null>(null);
  const heroes = [...profile.characters]
    .map((c) => ({ c, power: heroPower(profile, c.id) }))
    .sort((x, y) => y.power - x.power || x.c.name.localeCompare(y.c.name));
  const pickedHero = owned ? heroFromOwned(profile, owned) : null;
  // The skills saved in the profile travel with the run (the server replays with them).
  const startNivelado = () => {
    if (!nivelado) return;
    const hero = towerHero(profile, mode, null, nivelado.classId, nivelado.element);
    if (hero) onStart({ classId: nivelado.classId, element: nivelado.element, loadout: loadoutFor(profile, hero, mode) });
  };
  const startOwned = () => {
    if (!owned || !pickedHero) return;
    const c = profile.characters.find((x) => x.id === owned);
    if (c) onStart({ characterId: owned, classId: c.classId, element: c.element, loadout: loadoutFor(profile, pickedHero, mode) });
  };
  return (
    <Panel title={`Nueva expedición · ${TOWER_LABEL[mode]}`} className="mx-auto w-full max-w-4xl">
      <p className="mb-3 text-center text-base text-[#d9d2ca]">
        {TOWER_BLURB[mode]} Después elegirás una reliquia inicial, caminos entre combates, tiendas, descansos y eventos. Reliquias y fragmentos duran solo esta expedición.
      </p>
      {mode === "nivelado" ? (
        <div className="space-y-3">
          <ClassElementPicker value={nivelado} onPick={(classId, element) => setNivelado({ classId, element })} />
          <div className="flex justify-center">
            <button className="btn text-center" disabled={starting || !nivelado} onClick={startNivelado}>
              Preparar expedición
            </button>
          </div>
        </div>
      ) : heroes.length > 0 ? (
        <div className="space-y-3">
          <div className="grid max-h-[calc(100dvh-24rem)] min-h-40 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4 overflow-y-auto pr-1">
            {heroes.map(({ c, power }) => {
              const hero = heroFromOwned(profile, c.id);
              return (
                <button key={c.id} aria-label={c.name} aria-pressed={owned === c.id} className={owned === c.id ? "rounded ring-4 ring-green-400" : ""} onClick={() => setOwned(c.id)}>
                  <ItemCard item={characterView(c, { stats: hero?.stats, lines: [`Poder ${power}`] })} size={96} />
                </button>
              );
            })}
          </div>
          {pickedHero && (
            <p className="text-center text-sm">
              Elegido: <b>{pickedHero.name}</b> · poder {owned ? heroPower(profile, owned) : 0}. Su poder, equipo y habilidades de hoy quedan como instantánea.
            </p>
          )}
          <div className="flex justify-center">
            <button className="btn text-center" disabled={starting || !pickedHero} onClick={startOwned}>
              Preparar expedición
            </button>
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-yellow-300">Todavía no tienes héroes. Consigue uno antes de la torre de colección.</p>
      )}
      <div className="mt-4 flex justify-center">{back}</div>
    </Panel>
  );
}
// ---- preparation (state-driven: hero snapshot, skills, confirm) --------------------------------

export function HeroSummary({ hero, loadoutNames }: { hero: Character; loadoutNames?: string }) {
  const weapon = hero.weapon?.type ? WEAPON_TYPE_DATA[hero.weapon.type as WeaponType]?.label : null;
  return (
    <div className="tile-art flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 p-2 text-sm">
      <b className="text-base">{hero.name}</b>
      <span className="inline-flex items-center gap-1">
        {CLASSES[hero.classId].name} <ElementIcon element={hero.element} className="h-5" /> {ELEMENT_LABEL[hero.element]}
      </span>
      {hero.rarity && <span>Rango {RARITIES[hero.rarity].label}</span>}
      {!!hero.stars && <span>{hero.stars}★</span>}
      <span>Nv {hero.level}</span>
      <span>{statLine(hero.stats)}</span>
      {weapon && <span>Arma: {weapon}</span>}
      {loadoutNames && <span>Habilidades: {loadoutNames}</span>}
    </div>
  );
}

export function PrepView({
  s,
  profile,
  act,
  guard,
  error,
  loadoutNames,
}: {
  s: ExpState;
  profile: Profile;
  act: (i: ExpActionInput) => void;
  guard: ReturnType<typeof useConfirmGuard>;
  error: string | null;
  loadoutNames: string;
}) {
  const mastery = s.mode === "nivelado" ? null : masteryOf(profile, s.hero.classId);
  return (
    <Panel title="Preparación" className="mx-auto w-full max-w-4xl space-y-3">
      {error && (
        <p role="alert" className="rounded border border-rose-400/70 bg-rose-950/60 p-2 text-center text-sm text-rose-100">
          {error}
        </p>
      )}
      <p className="text-center text-sm text-[#d9d2ca]">
        Confirma héroe, equipo y las dos habilidades que llevarás. Es una instantánea: lo que cambies en tu cuenta después no altera esta expedición.
      </p>
      <HeroSummary hero={s.hero} loadoutNames={loadoutNames} />
      <SkillPicker classId={s.hero.classId} mastery={mastery} value={s.loadout} onChange={(l: Loadout) => act({ type: "set_loadout", loadout: l })} />
      <div className="flex justify-center">
        <button className="btn text-center" onClick={guard(() => act({ type: "begin" }))}>
          Comenzar expedición
        </button>
      </div>
    </Panel>
  );
}

// ---- sector summary / suspended ----------------------------------------------------------------

export function SummaryView({ s, act, guard }: { s: ExpState; act: (i: ExpActionInput) => void; guard: ReturnType<typeof useConfirmGuard> }) {
  return (
    <Panel title={`Sector ${s.sector} superado`} className="mx-auto w-full max-w-3xl space-y-3">
      <p className="text-center text-sm text-[#d9d2ca]">Resumen: no añade premios ni cuenta como un nodo.</p>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ["Nodos superados", s.nodes],
          ["Combates ganados", s.combats],
          ["Turnos ganados", s.turns],
          ["PV", `${s.hp}/${maxHpOf(s)}`],
        ].map(([k, v]) => (
          <div key={k} className="tile-art p-2 text-center">
            <dt className="text-xs opacity-80">{k}</dt>
            <dd className="text-lg font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <FragmentsChip value={s.fragments} /> <ScopeTag scope="expedicion" />
      </p>
      <RelicRows owned={s.relics} compact />
      <BossPreview s={s} sector={s.sector + 1} />
      <div className="flex justify-center">
        <button className="btn text-center" onClick={guard(() => act({ type: "continue" }))}>
          Continuar al sector {s.sector + 1}
        </button>
      </div>
    </Panel>
  );
}

export function SuspendedView({
  s,
  act,
  guard,
  back,
  onRetire,
}: {
  s: ExpState;
  act: (i: ExpActionInput) => void;
  guard: ReturnType<typeof useConfirmGuard>;
  back: ReactNode;
  onRetire: () => void;
}) {
  return (
    <Panel title="Expedición suspendida" className="mx-auto w-full max-w-xl space-y-3 text-center">
      <p className="text-sm text-[#d9d2ca]">Tu progreso está guardado. Suspender no termina la expedición ni cobra nada.</p>
      <HeroSummary hero={s.hero} />
      <p className="text-sm">
        Sector {s.sector} · nodo {s.node} · PV {s.hp}/{maxHpOf(s)} · {s.relics.length}/6 reliquias · {s.fragments} fragmentos (Esta expedición)
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn text-center" onClick={guard(() => act({ type: "continue" }))}>
          Reanudar
        </button>
        {back}
        <button className="btn btn-gray text-center" onClick={onRetire}>
          Retirarse
        </button>
      </div>
    </Panel>
  );
}

// ---- final result ------------------------------------------------------------------------------

export function EndView({
  s,
  save,
  pending,
  onRetry,
  onNew,
}: {
  s: ExpState;
  save: SaveStatus;
  pending: number;
  onRetry: () => void;
  onNew: () => void;
}) {
  const end = s.end ?? { reason: "death" as const, node: s.nodes };
  const coins = s.ledger.reduce((sum, e) => sum + nodePay(e), 0);
  const settled = pending === 0 && save === "saved";
  return (
    <Panel title="Fin de la expedición" className="mx-auto w-full max-w-3xl space-y-3">
      <p className="text-center text-lg text-yellow-300">{END_REASON_TEXT[end.reason]}</p>
      <div className="text-center text-sm">
        <b>Nodo validado: {end.node}</b> · {scoreLine(s.nodes, s.turns)} · {s.combats} combates ganados · llegaste al sector {s.sector}
      </div>
      {end.killer && end.killer.length > 0 && (
        <p className="text-center text-sm">
          Te derrotó: <b>{end.killer.join(", ")}</b>. <Link className="underline" href="/torre?vista=historial">Ver en el historial</Link>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="tile-art space-y-1 p-2 text-sm">
          <ScopeTag scope="cuenta" />
          <p>Premios por combates ganados: hasta {coins} monedas (solo primera vez por semana y modo, sectores 1–3). El servidor confirma lo cobrado.</p>
          <p>Tu récord y tu puesto del ranking se actualizan con el nodo validado.</p>
        </div>
        <div className="tile-art space-y-1 p-2 text-sm">
          <ScopeTag scope="expedicion" />
          <p>Se pierden al terminar: reliquias, niveles, pactos y {s.fragments} fragmentos.</p>
          <p>Build final guardada en el historial:</p>
        </div>
      </div>
      <RelicRows owned={s.relics} compact />
      <p role="status" className="text-center text-sm">
        Guardado en el servidor: {settled ? "confirmado" : `${SAVE_LABEL[save]}${pending ? ` · ${pending} jugadas sin confirmar` : ""}`}{" "}
        {!settled && (
          <button className="underline" onClick={onRetry}>
            Reintentar sincronización
          </button>
        )}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button className="btn text-center" disabled={!settled} onClick={onNew}>
          Nueva expedición
        </button>
        <Link href="/torre" className="btn text-center">
          Ver ranking
        </Link>
        <Link href="/torre?vista=historial" className="btn text-center">
          Historial y récord
        </Link>
        <Link href="/" className="btn btn-gray text-center">
          Menú
        </Link>
      </div>
    </Panel>
  );
}
