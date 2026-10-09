"use client";

import { useState } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { HERO_FUSION, STAR_CARRY, STAR_UNITS } from "@/lib/game/heroFusion";
import { ascendPiece, starUpPiece, unitsOf, type Material } from "@/lib/game/pieceGrowth";
import type { OwnedWeapon, Profile } from "@/lib/game/profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import { createRng } from "@/lib/game/rng";
import { cheapestUnits } from "@/lib/game/units";
import { weaponKey, WEAPON_TYPE_DATA } from "@/lib/game/weapons";
import { compareGear } from "@/lib/gearSort";
import { pieceLine, weaponView } from "@/lib/viewModels";
import { MaterialGrid, stepQty } from "./MaterialPicker";

type Mode = "star" | "rank" | "roll";
const MODES: [Mode, string][] = [
  ["star", "Subir ★"],
  ["rank", "Subir de rango"],
  ["roll", "Tiradas"],
];

// Forja > Equipo: the same three ways a hero grows, for pieces. Material = same-rank pieces (any type or
// element, 1 unit each) and spare copies (1 unit each); a worn piece or one with +N only gives copies.
export function PieceGrowthPanel({
  profile,
  busy,
  onStarUp,
  onAscend,
  onSwap,
}: {
  profile: Profile;
  busy: boolean;
  onStarUp: (baseId: string, materials: Material[], gave: string[]) => void;
  onAscend: (baseId: string, materials: Material[], keep: "base" | "existing", gave: string[]) => void;
  onSwap: (id: string, index: number, gave: string[]) => void;
}) {
  const worn = new Set(Object.values(profile.equipped));
  const ranks = RARITY_IDS.filter((r) => profile.weapons.some((w) => w.rarity === r));
  const [picker, setRank] = useState<RarityId | null>(null);
  const rank = picker && ranks.includes(picker) ? picker : (ranks[0] ?? "f");
  const [mode, setMode] = useState<Mode>("star");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [keep, setKeep] = useState<"base" | "existing">("base");

  const pool = profile.weapons.filter((w) => w.rarity === rank).sort(compareGear);
  const base = pool.find((w) => w.id === baseId) ?? null;
  const rule = HERO_FUSION[rank];
  const next = RARITY_IDS[RARITY_IDS.indexOf(rank) + 1] as RarityId | undefined;
  const need = mode === "star" ? STAR_UNITS : (rule?.ratio ?? 1) - 1;
  const stays = (w: OwnedWeapon) => worn.has(w.id) || (w.plus ?? 0) > 0; // such a piece only gives copies
  const materials: Material[] = Object.entries(qty)
    .filter(([id, n]) => n > 0 && pool.some((w) => w.id === id))
    .map(([id, n]) => ({ id, n }));
  const picked = materials.reduce((s, m) => s + m.n, 0);
  const existing = base && next ? profile.weapons.find((w) => w.id === weaponKey(base.type, base.element, next)) : undefined;
  const ready = !!base && picked === need;
  const starDry = ready && mode === "star" ? starUpPiece(profile, { baseId: base.id, materials }) : null;
  // The rank-up preview rolls the new lines with a throwaway rng: the real ones are drawn by the server.
  const rankDry = ready && mode === "rank" ? ascendPiece(profile, { baseId: base.id, materials, keep }, createRng(1)) : null;
  const fusion = rankDry?.ok ? rankDry.fusion : undefined;
  const result = fusion?.piece ?? null;
  const lost = materials
    .map((m) => ({ m, w: pool.find((x) => x.id === m.id)! }))
    .filter(({ m, w }) => m.n === unitsOf(w) && w.stars > 0)
    .map(({ w }) => w.name);
  const gave = [
    ...materials.map(({ id, n }) => {
      const w = pool.find((x) => x.id === id)!;
      const spare = w.copies?.length ?? 0;
      return `${w.name} (${n === unitsOf(w) ? (spare ? `la pieza y ${spare} ${spare === 1 ? "copia" : "copias"}` : "la pieza") : `${n} ${n === 1 ? "copia" : "copias"}`})`;
    }),
    ...(mode === "rank" && rule ? [`${rule.coins} monedas`] : []),
  ];

  const reset = (r?: RarityId) => {
    if (r) setRank(r);
    setBaseId(null);
    setQty({});
  };
  // Copies first, then the weakest whole pieces; a worn piece or one with +N only offers its copies.
  const autoPick = () =>
    setQty(
      Object.fromEntries(
        cheapestUnits(pool, baseId ?? "", need, (w) => (stays(w) ? Infinity : w.stars * 100 + (w.plus ?? 0) * 10)).map((m) => [m.id, m.n]),
      ),
    );

  const status = !base
    ? "Elige la pieza."
    : mode === "star" && base.stars >= MAX_STARS
      ? "Esa pieza ya tiene el máximo de estrellas."
      : picked < need
        ? `Faltan ${need - picked} unidades de material.`
        : (starDry && !starDry.ok ? starDry.error : null) ?? (rankDry && !rankDry.ok ? rankDry.error : null);

  return (
    <Panel title="Equipo" className="space-y-3">
      <div className="space-y-1 border-2 border-yellow-300/50 bg-yellow-300/10 p-2 text-sm">
        <p>
          Igual que con los héroes. <b>Material</b> = piezas del <b>mismo rango</b> (cualquier tipo y elemento, 1 unidad cada una) y copias
          sobrantes (1 unidad cada una). Una tirada repetida queda como copia con su propia tirada de stats. Las piezas equipadas o con +N solo
          dan copias.
        </p>
        <p>
          <b className="text-yellow-300">Subir ★:</b> {STAR_UNITS} unidades = +1★. <b className="text-yellow-300">Subir de rango:</b> la pieza
          pasa al rango siguiente con la misma tirada (se sortean las líneas nuevas). <b className="text-yellow-300">Tiradas:</b> cambia la tirada
          principal por la de una copia.
        </p>
      </div>

      <div className="flex gap-1.5" role="tablist">
        {MODES.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            className={`btn min-w-0 flex-1 text-center text-sm ${mode === k ? "" : "btn-gray"}`}
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
        {ranks.length === 0 && <p className="text-sm opacity-80">Aún no tienes equipo. Consíguelo en el gacha o en los dungeons.</p>}
        <div className="flex flex-wrap gap-1.5">
          {ranks.map((r) => (
            <button key={r} type="button" aria-pressed={rank === r} className={`btn text-center text-sm ${rank === r ? "" : "btn-gray"}`} onClick={() => reset(r)}>
              {RARITIES[r].label} · {profile.weapons.filter((w) => w.rarity === r).length}
            </button>
          ))}
        </div>
        {mode === "rank" &&
          (rule && next ? (
            <p className="text-xs opacity-80">
              Rango {RARITIES[rank].label} → {RARITIES[next].label}: <b>{need} unidades</b> y <b>{rule.coins} monedas</b>.
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
        <h4 className="text-sm font-semibold text-yellow-300">2. Elige la pieza</h4>
        <div className="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] justify-items-center gap-x-2 gap-y-3 overflow-y-auto pr-1">
          {pool.map((w) => (
            <button key={w.id} type="button" aria-label={w.name} aria-pressed={w.id === baseId} onClick={() => (setBaseId(w.id), setQty({}))}>
              <ItemCard item={weaponView(w)} size={80} selected={w.id === baseId} />
            </button>
          ))}
        </div>
      </div>

      {mode === "roll" ? (
        <RollSwap piece={base} busy={busy} onSwap={onSwap} />
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
              <div className="max-h-96 overflow-y-auto pr-1">
                <MaterialGrid
                  items={pool}
                  baseId={baseId}
                  qty={qty}
                  keep={stays}
                  view={(w) => weaponView(w)}
                  onStep={(w, d, limit) => setQty((q) => stepQty(q, w.id, d, limit, need))}
                />
              </div>
            ) : (
              <p className="text-sm opacity-80">Primero elige la pieza.</p>
            )}
          </div>

          {mode === "rank" && base && existing && (
            <div className="space-y-1 border-2 border-cyan-300/50 bg-cyan-300/10 p-2 text-sm">
              <p>
                Ya tienes esta pieza en rango {RARITIES[existing.rarity].label}: <b>se fusionan</b> y quedas con las ★ más altas. ¿Qué tirada
                queda como principal? La otra pasa a ser una copia.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["base", `${pieceLine(base)} (la de esta pieza)`],
                    ["existing", `${pieceLine(existing)} (la que ya tenías)`],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={keep === k} className={`btn text-center text-xs ${keep === k ? "" : "btn-gray"}`} onClick={() => setKeep(k)}>
                    {label}
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
                  <span className="ml-1">{STAR_CARRY[rank]?.map((to, from) => `${from}★→${to}★`).join(" · ")}</span>
                </details>
              </p>
            )}
            {fusion && result ? (
              <div className="flex items-center gap-3 border-2 border-yellow-300/60 bg-yellow-300/10 p-2 text-sm">
                <ItemCard item={weaponView(result)} size={88} />
                <div className="space-y-1">
                  <div className="font-semibold text-yellow-300">{result.name}</div>
                  <div>
                    Rango {RARITIES[result.rarity].label}, {result.stars}★ · {WEAPON_TYPE_DATA[result.type].label}
                    {fusion.merged ? ` · ${result.copies?.length ?? 0} copias (+1 por esta fusión)` : ""}
                  </div>
                  <div className="opacity-80">Las líneas nuevas del rango se sortean al ascender.</div>
                  {fusion.split && (
                    <div className="opacity-80">
                      Sus {unitsOf(fusion.split)} copias sin gastar se quedan como una pieza de rango {RARITIES[fusion.split.rarity].label}.
                    </div>
                  )}
                  <div>
                    Gastas {need} unidades{rule ? ` y ${rule.coins} monedas` : ""}.
                  </div>
                </div>
              </div>
            ) : starDry?.ok && base ? (
              <p className="text-sm">
                {base.name} sube de {base.stars}★ a <b>{base.stars + 1}★</b>.
              </p>
            ) : (
              <p className="text-sm opacity-80">Aquí verás cómo queda la pieza.</p>
            )}
            {lost.length > 0 && <p className="text-sm text-amber-300">⚠ Se gasta por completo una pieza con estrellas ({lost.join(", ")}): pierdes sus ★.</p>}
            {status ? <p className="text-sm text-red-300">{status}</p> : <p className="text-sm text-green-300">Listo.</p>}
          </div>

          <button
            className="btn w-full"
            disabled={busy || !!status}
            onClick={() => base && (mode === "star" ? onStarUp(base.id, materials, gave) : onAscend(base.id, materials, existing ? keep : "base", gave))}
          >
            {mode === "star" ? "Subir ★" : "Subir de rango"}
          </button>
        </>
      )}
    </Panel>
  );
}

function RollSwap({ piece, busy, onSwap }: { piece: OwnedWeapon | null; busy: boolean; onSwap: (id: string, index: number, gave: string[]) => void }) {
  if (!piece) return <p className="text-sm opacity-80">Elige una pieza para ver sus tiradas.</p>;
  const copies = piece.copies ?? [];
  const row = (label: string, r: { roll?: number; lines?: OwnedWeapon["lines"] }, action: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 border-2 border-white/15 p-2 text-sm">
      <b>{pieceLine({ ...piece, roll: r.roll, lines: r.lines })}</b>
      <span className="flex items-center gap-2">
        <span className="text-xs opacity-70">{label}</span>
        {action}
      </span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-yellow-300">3. Tiradas de {piece.name}</h4>
      {row("principal", piece, <span className="text-xs text-green-300">En uso</span>)}
      {copies.length === 0 && <p className="text-sm opacity-80">Sin copias: cada repetida que saques guarda su propia tirada.</p>}
      {copies.map((c, i) =>
        row(
          `copia ${i + 1}`,
          c,
          <button type="button" className="btn !min-h-8 text-center text-xs" disabled={busy} onClick={() => onSwap(piece.id, i, ["La tirada anterior pasa a ser una copia"])}>
            Usar esta
          </button>,
        ),
      )}
      <p className="text-xs opacity-80">Al cambiar, la tirada que tenías pasa a ser una copia: puedes volver a ella cuando quieras.</p>
    </div>
  );
}
