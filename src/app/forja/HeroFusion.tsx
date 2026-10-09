"use client";

import { useState } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { CLASSES } from "@/lib/game/characters";
import {
  HERO_FUSION,
  STAR_CARRY,
  STAR_UNITS,
  fuseHeroes,
  starUpHero,
  unitsOf,
  type Material,
} from "@/lib/game/heroFusion";
import { characterKey, heroPower, type OwnedCharacter, type Profile } from "@/lib/game/profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import { TRAITS, type TraitId } from "@/lib/game/traits";
import { characterView } from "@/lib/viewModels";

type Mode = "star" | "rank" | "trait";
const MODES: [Mode, string][] = [
  ["star", "Subir ★"],
  ["rank", "Subir de rango"],
  ["trait", "Rasgos"],
];
const traitName = (t: TraitId | undefined) => (t ? TRAITS[t].name : "—");

// Forja > Héroes: one guided panel for the three ways a hero grows. Material is counted in
// units: a hero of the same rank is 1 unit, every spare copy is 1 more (the base gives only copies).
export function HeroFusionPanel({
  profile,
  busy,
  onStarUp,
  onFuse,
  onSwap,
}: {
  profile: Profile;
  busy: boolean;
  // `gave` = what the player hands over, for the result screen.
  onStarUp: (baseId: string, materials: Material[], gave: string[]) => void;
  onFuse: (baseId: string, materials: Material[], keep: "base" | "existing", gave: string[]) => void;
  onSwap: (heroId: string, index: number, gave: string[]) => void;
}) {
  const ranks = RARITY_IDS.filter((r) => profile.characters.some((c) => c.rarity === r));
  const [picker, setRank] = useState<RarityId | null>(null);
  const rank = picker && ranks.includes(picker) ? picker : (ranks[0] ?? "f");
  const [mode, setMode] = useState<Mode>("star");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [keep, setKeep] = useState<"base" | "existing">("base");

  const pool = profile.characters
    .filter((c) => c.rarity === rank)
    .sort((a, b) => heroPower(profile, a.id) - heroPower(profile, b.id));
  const base = pool.find((c) => c.id === baseId) ?? null;
  const rule = HERO_FUSION[rank];
  const next = RARITY_IDS[RARITY_IDS.indexOf(rank) + 1] as RarityId | undefined;
  const need = mode === "star" ? STAR_UNITS : (rule?.ratio ?? 1) - 1;
  const materials: Material[] = Object.entries(qty)
    .filter(([id, n]) => n > 0 && pool.some((c) => c.id === id))
    .map(([id, n]) => ({ id, n }));
  const picked = materials.reduce((s, m) => s + m.n, 0);
  const limitOf = (c: OwnedCharacter) => (c.id === baseId ? (c.copies?.length ?? 0) : unitsOf(c));

  const existing = base && next ? profile.characters.find((c) => c.id === characterKey(base.classId, base.element, next)) : undefined;
  const ready = !!base && picked === need;
  const starDry = ready && mode === "star" ? starUpHero(profile, { baseId: base.id, materials }) : null;
  const rankDry = ready && mode === "rank" ? fuseHeroes(profile, { baseId: base.id, materials, keep }) : null;
  const dry = starDry ?? rankDry;
  const fusion = rankDry?.ok ? rankDry.fusion : null;
  const result = fusion?.hero ?? null;
  const lost = materials
    .map((m) => ({ m, c: pool.find((c) => c.id === m.id)! }))
    .filter(({ m, c }) => m.n === unitsOf(c) && (c.stars > 0 || c.level > 1))
    .map(({ c }) => c.name);

  const gave = [
    ...materials.map(({ id, n }) => {
      const c = pool.find((h) => h.id === id)!;
      const spare = c.copies?.length ?? 0;
      return `${c.name} (${n === unitsOf(c) ? (spare ? `el héroe y ${spare} ${spare === 1 ? "copia" : "copias"}` : "el héroe") : `${n} ${n === 1 ? "copia" : "copias"}`})`;
    }),
    ...(mode === "rank" && rule ? [`${rule.coins} monedas`] : []),
  ];
  const reset = (r?: RarityId) => {
    if (r) setRank(r);
    setBaseId(null);
    setQty({});
  };
  const step = (c: OwnedCharacter, d: number) =>
    setQty((q) => {
      const n = Math.max(0, Math.min(limitOf(c), (q[c.id] ?? 0) + d));
      return picked - (q[c.id] ?? 0) + n > need && d > 0 ? q : { ...q, [c.id]: n };
    });
  // The cheapest units first: copies (free), then heroes without stars or levels, weakest first.
  const autoPick = () => {
    const units = pool.flatMap((c) => {
      const copies = Array.from({ length: c.copies?.length ?? 0 }, () => ({ id: c.id, cost: 0 }));
      return c.id === baseId ? copies : [...copies, { id: c.id, cost: 1 + c.stars * 100 + c.level }];
    });
    const out: Record<string, number> = {};
    for (const u of units.sort((a, b) => a.cost - b.cost).slice(0, need)) out[u.id] = (out[u.id] ?? 0) + 1;
    setQty(out);
  };

  const status = !base
    ? "Elige el héroe base."
    : mode === "star" && base.stars >= MAX_STARS
      ? "Ese héroe ya tiene el máximo de estrellas."
      : picked < need
        ? `Faltan ${need - picked} unidades de material.`
        : dry && !dry.ok
          ? dry.error
          : null;

  return (
    <Panel title="Héroes" className="space-y-3">
      <div className="space-y-1 border-2 border-yellow-300/50 bg-yellow-300/10 p-2 text-sm">
        <p>
          Un héroe crece de tres formas. <b>Material</b> = héroes del <b>mismo rango</b> (1 unidad cada uno) y <b>copias</b> sobrantes (1
          unidad cada una). Una tirada repetida queda como copia con su propio rasgo.
        </p>
        <p>
          <b className="text-yellow-300">Subir ★:</b> {STAR_UNITS} unidades dan +1★ (más tope de nivel). <b className="text-yellow-300">Subir de
          rango:</b> el héroe pasa al rango siguiente y conserva rasgo, nivel y habilidad; sus ★ se convierten. <b className="text-yellow-300">Rasgos:</b> cambia
          el rasgo principal por el de una copia.
        </p>
      </div>

      <div className="flex gap-1.5" role="tablist">
        {MODES.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            className={`btn flex-1 text-center text-sm ${mode === k ? "" : "btn-gray"}`}
            onClick={() => {
              setMode(k);
              setQty({});
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-yellow-300">1. ¿De qué rango?</h4>
        <div className="flex flex-wrap gap-1.5">
          {ranks.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rank === r}
              className={`btn text-center text-sm ${rank === r ? "" : "btn-gray"}`}
              onClick={() => reset(r)}
            >
              {RARITIES[r].label} · {profile.characters.filter((c) => c.rarity === r).length}
            </button>
          ))}
        </div>
        {mode === "rank" &&
          (rule && next ? (
            <p className="text-xs opacity-80">
              Rango {RARITIES[rank].label} → {RARITIES[next].label}: <b>{need} unidades</b> de material y <b>{rule.coins} monedas</b>.
            </p>
          ) : (
            <p className="text-xs text-red-300">El rango S es el techo: ya no sube.</p>
          ))}
        {mode === "star" && (
          <p className="text-xs opacity-80">
            Cada ★ cuesta <b>{STAR_UNITS} unidades</b> del rango {RARITIES[rank].label}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-yellow-300">2. Elige el héroe</h4>
        <HeroGrid heroes={pool} isOn={(c) => c.id === baseId} onPick={(c) => (setBaseId(c.id), setQty({}))} />
      </div>

      {mode === "trait" ? (
        <TraitSwap hero={base} busy={busy} onSwap={(id, i) => onSwap(id, i, [`Su rasgo anterior pasa a ser una copia`])} />
      ) : mode === "rank" && !(rule && next) ? null : (
        <>
          <div className="space-y-1.5">
            <h4 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-yellow-300">
              <span>
                3. Material ({picked}/{need})
              </span>
              <span className="flex gap-1.5">
                <button type="button" className="btn btn-gray !min-h-8 text-center text-xs" disabled={!base} onClick={autoPick}>
                  Elegir lo más barato
                </button>
                <button type="button" className="btn btn-gray !min-h-8 text-center text-xs" onClick={() => setQty({})}>
                  Limpiar
                </button>
              </span>
            </h4>
            {base ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-3">
                {pool
                  .filter((c) => limitOf(c) > 0)
                  .map((c) => (
                    <div key={c.id} className="flex flex-col items-center gap-1">
                      <ItemCard item={characterView(c)} size={72} selected={(qty[c.id] ?? 0) > 0} />
                      <div className="flex items-center gap-1 text-sm">
                        <button type="button" aria-label={`Menos ${c.name}`} className="btn btn-gray !min-h-7 !px-2 text-center" onClick={() => step(c, -1)}>
                          −
                        </button>
                        <span className="min-w-12 text-center">
                          {qty[c.id] ?? 0}/{limitOf(c)}
                        </span>
                        <button type="button" aria-label={`Más ${c.name}`} className="btn btn-gray !min-h-7 !px-2 text-center" onClick={() => step(c, 1)}>
                          +
                        </button>
                      </div>
                      {c.id === baseId && <span className="text-[11px] opacity-70">solo sus copias</span>}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm opacity-80">Primero elige el héroe.</p>
            )}
          </div>

          {mode === "rank" && base && existing && (
            <div className="space-y-1 border-2 border-cyan-300/50 bg-cyan-300/10 p-2 text-sm">
              <p>
                Ya tienes a este héroe en rango {RARITIES[existing.rarity].label}: <b>se fusionan</b> y quedas con las ★ más altas. ¿Qué
                rasgo se queda como principal? El otro pasa a ser una copia.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["base", base.traits[0]],
                    ["existing", existing.traits[0]],
                  ] as const
                ).map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={keep === k} className={`btn text-center text-sm ${keep === k ? "" : "btn-gray"}`} onClick={() => setKeep(k)}>
                    {traitName(t)}
                    {k === "base" ? " (el de este héroe)" : " (el que ya tenías)"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-yellow-300">4. Resultado</h4>
            {mode === "rank" && base && next && (
              <p className="text-xs opacity-80">
                Tus {base.stars}★ pasan a <b>{STAR_CARRY[rank]?.[base.stars] ?? 0}★</b>.{" "}
                <details className="inline">
                  <summary className="inline cursor-pointer underline">Tabla de conversión</summary>
                  <span className="ml-1">
                    {STAR_CARRY[rank]?.map((to, from) => `${from}★→${to}★`).join(" · ")}
                  </span>
                </details>
              </p>
            )}
            {fusion && result ? (
              <div className="flex items-center gap-3 border-2 border-yellow-300/60 bg-yellow-300/10 p-2 text-sm">
                <ItemCard item={characterView(result)} size={88} />
                <div className="space-y-1">
                  <div className="font-semibold text-yellow-300">
                    {result.name} · {CLASSES[result.classId].name}
                  </div>
                  <div>
                    Rango {RARITIES[result.rarity].label}, {result.stars}★ · rasgo {traitName(result.traits[0])}
                  </div>
                  {fusion.split && (
                    <div className="opacity-80">
                      Sus {unitsOf(fusion.split)} copias sin gastar se quedan como un {CLASSES[fusion.split.classId].name} de rango {RARITIES[fusion.split.rarity].label}.
                    </div>
                  )}
                  <div>Gastas {need} unidades{rule && mode === "rank" ? ` y ${rule.coins} monedas` : ""}.</div>
                </div>
              </div>
            ) : starDry?.ok && base ? (
              <p className="text-sm">
                {base.name} sube de {base.stars}★ a <b>{base.stars + 1}★</b> (tope de nivel {20 + 10 * (base.stars + 1)}).
              </p>
            ) : (
              <p className="text-sm opacity-80">Aquí verás cómo queda el héroe.</p>
            )}
            {lost.length > 0 && (
              <p className="text-sm text-amber-300">
                ⚠ Se gasta por completo un héroe con estrellas o nivel ({lost.join(", ")}): pierdes sus ★ y su nivel.
              </p>
            )}
            {status ? <p className="text-sm text-red-300">{status}</p> : <p className="text-sm text-green-300">Listo.</p>}
          </div>

          <button
            className="btn w-full"
            disabled={busy || !!status}
            onClick={() => base && (mode === "star" ? onStarUp(base.id, materials, gave) : onFuse(base.id, materials, existing ? keep : "base", gave))}
          >
            {mode === "star" ? "Subir ★" : "Subir de rango"}
          </button>
        </>
      )}
    </Panel>
  );
}

function TraitSwap({ hero, busy, onSwap }: { hero: OwnedCharacter | null; busy: boolean; onSwap: (id: string, index: number) => void }) {
  if (!hero) return <p className="text-sm opacity-80">Elige un héroe para ver sus rasgos.</p>;
  const copies = hero.copies ?? [];
  const row = (t: TraitId | undefined, action: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 border-2 border-white/15 p-2 text-sm">
      <div>
        <b>{traitName(t)}</b>
        {t && <div className="text-xs opacity-80">{TRAITS[t].description}</div>}
      </div>
      {action}
    </div>
  );
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-yellow-300">3. Rasgo de {hero.name}</h4>
      {row(hero.traits[0], <span className="text-xs text-green-300">Principal</span>)}
      {copies.length === 0 && <p className="text-sm opacity-80">Sin copias: tira de nuevo en el gacha para probar otros rasgos.</p>}
      {copies.map((t, i) =>
        row(
          t,
          <button type="button" className="btn !min-h-8 text-center text-xs" disabled={busy} onClick={() => onSwap(hero.id, i)}>
            Usar este
          </button>,
        ),
      )}
      <p className="text-xs opacity-80">Al cambiar, el rasgo que tenías pasa a ser una copia: puedes volver a él cuando quieras.</p>
    </div>
  );
}

function HeroGrid({
  heroes,
  isOn,
  onPick,
}: {
  heroes: OwnedCharacter[];
  isOn: (c: OwnedCharacter) => boolean;
  onPick: (c: OwnedCharacter) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] justify-items-center gap-x-2 gap-y-3">
      {heroes.map((c) => (
        <button key={c.id} type="button" aria-label={c.name} aria-pressed={isOn(c)} onClick={() => onPick(c)}>
          <ItemCard item={characterView(c)} size={80} selected={isOn(c)} />
        </button>
      ))}
    </div>
  );
}
