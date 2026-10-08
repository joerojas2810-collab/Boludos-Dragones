"use client";

import { useState } from "react";
import { ElementIcon } from "@/components/ElementIcon";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { Tooltip } from "@/components/Tooltip";
import { WeaponSprite } from "@/components/WeaponSprite";
import { ASCEND } from "@/lib/game/ascend";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import type { OwnedWeapon, Profile } from "@/lib/game/profile";
import { WEAPON_TYPE_DATA, slotOf } from "@/lib/game/weapons";
import { compareGear } from "@/lib/gearSort";
import { pieceTip } from "@/lib/viewModels";

export const byPieceOrder = compareGear;

export function PieceRow({
  w,
  on,
  disabled,
  note,
  onClick,
}: {
  w: OwnedWeapon;
  on: boolean;
  disabled?: boolean;
  note?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={`tile-art flex w-full items-center gap-2 p-1.5 text-left text-sm ${on ? "brightness-125" : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <Tooltip tip={pieceTip(w)}>
        <WeaponSprite type={w.type} element={w.element} rarity={w.rarity} className="w-9 shrink-0" />
      </Tooltip>
      <span className="min-w-0 flex-1" style={{ color: RARITIES[w.rarity].color }}>
        <ElementIcon element={w.element} bare className="mr-1 inline h-4" />
        {WEAPON_TYPE_DATA[w.type].label} · {w.stars}★{w.plus ? ` · +${w.plus}` : ""}
        {note && <span className="block text-xs opacity-70">{note}</span>}
      </span>
      <span className="w-5 text-center text-green-300">{on ? "✓" : ""}</span>
    </button>
  );
}

const SLOT_LABEL: Record<string, string> = { arma: "Arma", casco: "Casco", peto: "Peto", piernas: "Piernas", zapatos: "Zapatos", collar: "Collar" };

// Pieces grouped under collapsible "<Slot> · <Rank>" headers (input must be sorted by compareGear).
function Grouped({ pieces, isOn, onPick, block }: { pieces: OwnedWeapon[]; isOn: (w: OwnedWeapon) => boolean; onPick: (w: OwnedWeapon) => void; block?: (w: OwnedWeapon) => string | undefined }) {
  const groups: { key: string; slot: string; rank: RarityId; items: OwnedWeapon[] }[] = [];
  for (const w of pieces) {
    const slot = slotOf(w.type);
    const key = `${slot}-${w.rarity}`;
    const g = groups[groups.length - 1];
    if (g?.key === key) g.items.push(w);
    else groups.push({ key, slot, rank: w.rarity, items: [w] });
  }
  return (
    <>
      {groups.map((g) => (
        <details key={g.key} open={groups.length <= 3 || g.items.some(isOn)}>
          <summary className="cursor-pointer py-1 text-sm font-semibold" style={{ color: RARITIES[g.rank].color }}>
            {SLOT_LABEL[g.slot]} · {RARITIES[g.rank].label} ({g.items.length})
          </summary>
          <div className="space-y-1">
            {g.items.map((w) => (
              <PieceRow key={w.id} w={w} on={isOn(w)} disabled={!!block?.(w)} note={block?.(w)} onClick={() => onPick(w)} />
            ))}
          </div>
        </details>
      ))}
    </>
  );
}

export function AscendPieces({
  profile,
  busy,
  onAscend,
}: {
  profile: Profile;
  busy: boolean;
  onAscend: (baseId: string, materialIds: string[]) => void;
}) {
  const [baseId, setBaseId] = useState<string | null>(null);
  const [mats, setMats] = useState<string[]>([]);
  const [slotF, setSlotF] = useState("all");
  const [rankF, setRankF] = useState<RarityId | "all">("all");
  const equipped = new Set(Object.values(profile.equipped));
  const base = profile.weapons.find((w) => w.id === baseId) ?? null;
  const rule = base ? ASCEND[base.rarity] : null;
  const next = base ? RARITY_IDS[RARITY_IDS.indexOf(base.rarity) + 1] : undefined;
  const need = rule ? rule.total - 1 : 0;
  const picked = mats.filter((id) => id !== baseId);
  const pool = base
    ? profile.weapons.filter((w) => w.id !== base.id && w.rarity === base.rarity && !equipped.has(w.id)).sort(byPieceOrder)
    : [];
  const allBases = profile.weapons.filter((w) => ASCEND[w.rarity] && !equipped.has(w.id));
  const ranksHere = RARITY_IDS.filter((r) => allBases.some((w) => w.rarity === r));
  const bases = allBases
    .filter((w) => (slotF === "all" || slotOf(w.type) === slotF) && (rankF === "all" || w.rarity === rankF))
    .sort(byPieceOrder);
  const chip = (on: boolean) => `btn !min-h-7 !px-2 text-xs ${on ? "" : "btn-gray"}`;
  const toggle = (id: string) =>
    setMats(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < need ? [...picked, id] : picked);
  const status = !base
    ? "Elige la pieza base."
    : !next || !rule
      ? "Esta pieza ya está en el rango máximo."
      : picked.length < need
        ? `Faltan ${need - picked.length} piezas de material.`
        : profile.coins < rule.coins
          ? `Faltan ${rule.coins - profile.coins} monedas.`
          : null;

  return (
    <Panel title="Ascender equipo" className="space-y-3">
      <p className="text-sm opacity-80">
        Sube de rango una pieza gastando otras del mismo rango (cualquier tipo o elemento).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <h4 className="text-sm font-semibold text-yellow-300">1. Pieza base</h4>
          <div className="flex flex-wrap gap-1">
            {["all", ...Object.keys(SLOT_LABEL)].map((k) => (
              <button key={k} type="button" className={chip(slotF === k)} onClick={() => setSlotF(k)}>
                {k === "all" ? "Todas" : SLOT_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", ...ranksHere] as const).map((r) => (
              <button key={r} type="button" className={chip(rankF === r)} onClick={() => setRankF(r)}>
                {r === "all" ? "Todos los rangos" : RARITIES[r].label}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto pr-1">
            {bases.length === 0 && <p className="text-sm">No hay piezas con ese filtro.</p>}
            <Grouped
              pieces={bases}
              isOn={(w) => w.id === baseId}
              onPick={(w) => {
                setBaseId(w.id === baseId ? null : w.id);
                setMats([]);
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <h4 className="flex justify-between text-sm font-semibold text-yellow-300">
            <span>2. Material (mismo rango)</span>
            {base && rule && (
              <span className={picked.length === need ? "text-green-300" : ""}>
                {picked.length} de {need}
              </span>
            )}
          </h4>
          <div className="max-h-80 overflow-y-auto pr-1">
            {!base && <p className="text-sm opacity-70">Primero elige la base.</p>}
            {base && pool.length === 0 && <p className="text-sm">No tienes más piezas libres de ese rango.</p>}
            <Grouped pieces={pool} isOn={(w) => picked.includes(w.id)} onPick={(w) => toggle(w.id)} block={(w) => ((w.plus ?? 0) > 0 ? "Tiene +N: no sirve de material." : undefined)} />
          </div>
        </div>
      </div>
      {base && next && rule && (
        <div className="space-y-1 border-2 border-yellow-300/50 bg-yellow-300/10 p-2 text-sm">
          <div className="flex items-center gap-2">
            <WeaponSprite type={base.type} element={base.element} rarity={next} className="w-12 shrink-0" />
            <span>
              Resultado: <b>{base.name}</b> de rango <b style={{ color: RARITIES[next].color }}>{RARITIES[next].label}</b>, 0★ y +0.
            </span>
          </div>
          <p className="flex items-center gap-1">
            Costo: {rule.coins} <Icon name="system_coin" className="h-4" /> · total {rule.total} piezas
          </p>
          <p className="text-red-300">⚠ La base pierde sus estrellas y su +N. Las de material desaparecen.</p>
        </div>
      )}
      {status && <p className="text-sm text-red-300">{status}</p>}
      <button
        className="btn w-full"
        disabled={busy || !!status}
        onClick={() => {
          if (base) onAscend(base.id, picked);
          setBaseId(null);
          setMats([]);
        }}
      >
        Ascender
      </button>
    </Panel>
  );
}
