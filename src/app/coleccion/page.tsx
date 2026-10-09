"use client";
import { askConfirm, toast } from "@/lib/dialogs";

import { iconFor } from "@/lib/art";
import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/components/Chip";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { MatIcon } from "@/app/forja/Upgrade";
import { TipHover, Tooltip } from "@/components/Tooltip";
import { EquipmentEditor } from "@/components/EquipmentEditor";
import { GameSelect } from "@/components/GameSelect";
import { compareGear } from "@/lib/gearSort";
import { PieceFilterBar } from "@/components/PieceFilterBar";
import { filterPieces, isFiltering, NO_PIECE_FILTER, type PieceFilter } from "@/lib/pieceFilter";
import {
  CLASSES,
  CLASS_IDS,
  type Stats,
} from "@/lib/game/characters";
import { burnMany, burnValue } from "@/lib/game/burn";
import { ELEMENT_LABEL } from "@/lib/game/elements";
import {
  previewCombatant,
  statTip,
  STAT_NAME,
  traitTip,
} from "@/lib/game/explain";
import {
  heroFromOwned,
  heroPower,
  type OwnedCharacter,
  type Profile,
} from "@/lib/game/profile";
import {
  RARITIES,
  RARITY_IDS,
} from "@/lib/game/rarity";
import { TRAITS } from "@/lib/game/traits";
import { repo, useProfile } from "@/lib/useProfile";
import {
  characterView,
  filterSortCharacters,
  weaponEffect,
  weaponView,
  type CollectionFilter,
} from "@/lib/viewModels";

const STAT_ORDER: (keyof Stats)[] = [
  "hp",
  "atk",
  "def",
  "speed",
  "crit",
  "accuracy",
];
const FRACTION = ["hp", "atk", "def", "speed"];
const fmt = (k: keyof Stats, v: number) =>
  FRACTION.includes(k) ? `${+v.toFixed(1)}` : `${Math.round(v * 100)}%`;

// Destructive: asks for confirmation first. The coins are far below the gacha price.
function BurnButton({
  label,
  what,
  disabled,
  run,
}: {
  label: string;
  what: string;
  disabled?: boolean;
  run: () => void;
}) {
  return (
    <button
      className="btn btn-gray w-full text-center text-sm"
      disabled={disabled}
      title="Se pierde para siempre"
      onClick={() => {
        void askConfirm(`¿Quemar ${what}? No se puede deshacer.`, "Quemar").then((ok) => {
      if (ok) void run();
    });
      }}
    >
      {label}
    </button>
  );
}

// Bulk burn of what the filter shows: two clicks (ask, then confirm), no browser dialog.
function BurnShown({
  noun,
  count,
  shown,
  coins,
  run,
}: {
  noun: string;
  count: number;
  shown: number; // how many the filter shows (some are protected and never burned)
  coins: number;
  run: () => void;
}) {
  const [ask, setAsk] = useState(false);
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        className={`btn text-center text-sm ${ask ? "" : "btn-gray"}`}
        onClick={() => {
          if (!ask) return setAsk(true);
          setAsk(false);
          run();
        }}
      >
        {ask
          ? `Confirmar: quemar ${count} ${noun} (+${coins} monedas)`
          : count < shown
            ? `Quemar ${count} de las ${shown} ${noun} mostradas`
            : `Quemar las ${count} ${noun} mostradas`}
      </button>
      {ask && (
        <>
          <button className="btn btn-gray text-center text-sm" onClick={() => setAsk(false)}>
            Cancelar
          </button>
          <span className="text-xs text-[#d9d2ca]">Se conservan las equipadas y las que tienen estrellas (en héroes: con estrellas o nivel superior a 1), salvo que marques la casilla.</span>
        </>
      )}
    </div>
  );
}

function Detail({
  c,
  profile,
  act,
}: {
  c: OwnedCharacter;
  profile: Profile;
  act: (job: () => Promise<void>) => void;
}) {
  const hero = heroFromOwned(profile, c.id);
  if (!hero) return null;
  const cmb = {
    ...previewCombatant(c.classId),
    char: hero,
    hp: hero.stats.hp,
  };
  return (
    <Panel title={c.name} className="space-y-3">
      <div className="flex items-center gap-3">
        <ItemCard item={characterView(c, { lines: [] })} size={96} />
        <div className="space-y-1 text-base">
          <div className="text-lg font-bold text-amber-300">
            Poder {heroPower(profile, c.id)}
          </div>
          <div>
            {CLASSES[c.classId].name} · {ELEMENT_LABEL[c.element]} · Nv{" "}
            {c.level}
          </div>
          <div style={{ color: RARITIES[c.rarity].color }}>
            {RARITIES[c.rarity].label}
          </div>
          <div className="flex flex-wrap gap-1">
            {c.traits.map((t) => (
              <Chip
                key={t}
                tone="trait"
                icon={iconFor("trait", t)}
                tip={traitTip(t)}
              >
                {TRAITS[t].name}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm italic text-[#d9d2ca]">“{c.catchphrase}”</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {STAT_ORDER.map((k) => (
          <Tooltip key={k} tip={statTip(k, cmb)}>
            <span className="stat-cell">
              <span className="stat-k">{STAT_NAME[k]}</span>
              <span className="stat-v text-orange-300">
                {fmt(k, hero.stats[k])}
              </span>
            </span>
          </Tooltip>
        ))}
      </div>

      <EquipmentEditor c={c} profile={profile} act={act} />

      <BurnButton
        label={`Quemar héroe (+${burnValue(c.rarity, c.legacy)} monedas)`}
        what={`a ${c.name} (${RARITIES[c.rarity].label}, ${c.stars}★)`}
        disabled={profile.characters.length <= 1}
        run={() => act(async () => {
            const r = await repo.burn("hero", c.id);
            toast(`${c.name} quemado: +${r.coins} monedas.`);
          })}
      />
    </Panel>
  );
}

export default function CollectionPage() {
  const { profile, ready } = useProfile();
  const [notice, setNotice] = useState<string | null>(null);
  const act = (job: () => Promise<void>) => {
    setNotice(null);
    job().catch((e: unknown) =>
      setNotice(
        `${repo.mode === "remote" ? "El servidor rechazó el cambio: " : ""}${e instanceof Error ? e.message : "error"}`,
      ),
    );
  };
  const [tab, setTab] = useState<"characters" | "weapons" | "materials">(
    "characters",
  );
  const [filter, setFilter] = useState<CollectionFilter>({
    classId: "all",
    rarity: "all",
    sort: "rarity",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [pf, setPf] = useState<PieceFilter>(NO_PIECE_FILTER);
  const [burnInvested, setBurnInvested] = useState(false); // include heroes and pieces with stars (or levels)

  if (!ready || !profile) return null;
  const list = filterSortCharacters(profile.characters, filter);
  const sel = profile.characters.find((c) => c.id === selected) ?? null;
  const shownPieces = filterPieces(
    profile.weapons,
    pf,
    new Set(Object.values(profile.equipped)),
  );
  const worn = new Set(Object.values(profile.equipped));
  const burnablePieces = shownPieces
    .filter((w) => !worn.has(w.id) && (burnInvested || w.stars === 0))
    .map((w) => w.id);
  const burnableHeroes = list
    .filter((c) => burnInvested || (c.stars === 0 && c.level <= 1))
    .map((c) => c.id);
  const owner = (wid: string) =>
    profile.characters.find((c) => profile.equipped[c.id] === wid);
  const empty = (what: string) => (
    <p className="py-6 text-center">
      Aún no tienes {what}.{" "}
      <Link href="/gacha" className="text-cyan-300 underline">
        Ir al gacha
      </Link>
    </p>
  );

  return (
    <TipHover value>
    <main className="flex flex-col gap-4 p-3 pt-4">
      {notice && (
        <p role="alert" className="text-center text-sm text-red-300">
          {notice}
        </p>
      )}
      <div className="mx-auto w-full max-w-6xl text-center text-base text-[#d9d2ca]">
        Runs jugadas: {profile.runsPlayed} · Mejor piso: {profile.bestFloor} ·
        Personajes: {profile.characters.length} · Equipo:{" "}
        {profile.weapons.length}
        {repo.mode === "remote" && (
          <>
            {" · "}
            <Link href="/mercado" className="text-cyan-300 underline">
              Mercado de trueque
            </Link>
          </>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-6xl gap-2" role="tablist">
        {(
          [
            ["characters", "Personajes"],
            ["weapons", "Equipo"],
            ["materials", "Materiales"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`btn min-w-0 flex-1 text-center max-md:!text-sm max-md:![border-width:8px_10px] max-md:![border-image-width:8px_10px] ${tab === k ? "" : "btn-gray"}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "materials" ? (
        <Panel title="Materiales de forja" className="mx-auto w-full max-w-6xl space-y-2">
          <p className="flex items-center gap-2"><MatIcon kind="escamas" className="h-8" /> Escamas <b>{profile.escamas}</b></p>
          <p className="flex items-center gap-2"><MatIcon kind="dado" className="h-8" /> Dados cargados <b>{profile.dados}</b></p>
          <p className="text-sm opacity-80">Salen de los dungeons S, SS y SSR y se usan en Forja &gt; Mejorar.</p>
        </Panel>
      ) : tab === "characters" ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:grid md:grid-cols-[1fr_22rem] lg:grid-cols-[1fr_32rem] md:items-start">
          <Panel title="Personajes" className="min-w-0">
            {profile.characters.length === 0 ? (
              empty("personajes")
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <GameSelect
                    label="Clase"
                    value={filter.classId}
                    onChange={(classId) => setFilter({ ...filter, classId })}
                    options={[
                      { value: "all", label: "Todas las clases" },
                      ...CLASS_IDS.map((id) => ({ value: id, label: CLASSES[id].name })),
                    ]}
                  />
                  <GameSelect
                    label="Rareza"
                    value={filter.rarity}
                    onChange={(rarity) => setFilter({ ...filter, rarity })}
                    options={[
                      { value: "all", label: "Todas las rarezas" },
                      ...RARITY_IDS.map((id) => ({ value: id, label: RARITIES[id].label })),
                    ]}
                  />
                  <GameSelect
                    label="Orden"
                    value={filter.sort}
                    onChange={(sort) => setFilter({ ...filter, sort })}
                    options={[
                      { value: "rarity", label: "Orden: rareza" },
                      { value: "stars", label: "Orden: estrellas" },
                    ]}
                  />
                </div>
                {(filter.classId !== "all" || filter.rarity !== "all") && (
                  <label className="mb-2 flex items-center gap-2 text-xs text-[#d9d2ca]">
                    <input
                      type="checkbox"
                      checked={burnInvested}
                      onChange={(e) => setBurnInvested(e.target.checked)}
                    />
                    Incluir héroes con estrellas o nivel
                  </label>
                )}
                {(filter.classId !== "all" || filter.rarity !== "all") && (
                  <BurnShown
                    noun="héroes"
                    count={burnableHeroes.length}
                    shown={list.length}
                    coins={burnMany(profile, "hero", burnableHeroes).coins}
                    run={() =>
                      act(async () => {
                        const r = await repo.burnMany("hero", burnableHeroes);
                        toast(`Quema realizada: ${r.count} ${r.count === 1 ? "héroe" : "héroes"}, +${r.coins} monedas.`);
                      })
                    }
                  />
                )}
                {list.length === 0 && (
                  <p className="py-4 text-center">
                    Ninguno coincide con el filtro.
                  </p>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4">
                  {list.map((c) => (
                    <button
                      key={c.id}
                      aria-label={c.name}
                      aria-pressed={selected === c.id}
                      onClick={() => setSelected(c.id)}
                    >
                      <ItemCard
                        item={characterView(c)}
                        size={96}
                        selected={selected === c.id}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>
          {sel ? (
            <div className="order-first min-w-0 md:order-none">
              <Detail c={sel} profile={profile} act={act} />
            </div>
          ) : (
            profile.characters.length > 0 && (
              <p className="text-center text-sm text-[#d9d2ca]">
                Toca un personaje para ver sus detalles.
              </p>
            )
          )}
        </div>
      ) : (
        <Panel title="Equipo" className="mx-auto w-full max-w-6xl">
          {profile.weapons.length === 0 ? (
            empty("equipo")
          ) : (
            <>
            <PieceFilterBar
              value={pf}
              onChange={setPf}
              shown={shownPieces.length}
              total={profile.weapons.length}
            />
            {isFiltering(pf) && (
              <label className="mb-2 flex items-center gap-2 text-xs text-[#d9d2ca]">
                <input
                  type="checkbox"
                  checked={burnInvested}
                  onChange={(e) => setBurnInvested(e.target.checked)}
                />
                Incluir piezas con estrellas
              </label>
            )}
            {isFiltering(pf) && (
              <BurnShown
                noun="piezas"
                count={burnablePieces.length}
                shown={shownPieces.length}
                coins={burnMany(profile, "piece", burnablePieces).coins}
                run={() =>
                  act(async () => {
                    const r = await repo.burnMany("piece", burnablePieces);
                    toast(`Quema realizada: ${r.count} ${r.count === 1 ? "pieza" : "piezas"}, +${r.coins} monedas.`);
                  })
                }
              />
            )}
            {shownPieces.length === 0 && (
              <p className="py-4 text-center">Ninguna pieza coincide con el filtro.</p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] justify-items-center gap-x-2 gap-y-5">
              {[...shownPieces]
                .sort(compareGear)
                .map((w) => {
                  const o = owner(w.id);
                  const worn = Object.values(profile.equipped).includes(w.id);
                  return (
                    <div key={w.id} className="flex w-full flex-col gap-1">
                    <ItemCard
                      item={weaponView(w, {
                        lines: [
                          weaponEffect(w),
                          o ? `Equipada: ${o.name}` : "Sin equipar",
                        ],
                      })}
                      size={96}
                      className="!w-full"
                    />
                    <BurnButton
                      label={`Quemar (+${burnValue(w.rarity, w.legacy)})`}
                      what={`${w.name} (${RARITIES[w.rarity].label})`}
                      disabled={worn}
                      run={() => act(async () => {
                        const r = await repo.burn("piece", w.id);
                        toast(`${w.name} quemada: +${r.coins} monedas.`);
                      })}
                    />
                    </div>
                  );
                })}
            </div>
            </>
          )}
        </Panel>
      )}
    </main>
    </TipHover>
  );
}
