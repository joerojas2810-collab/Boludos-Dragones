"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/Panel";
import { PartsList } from "@/components/PartsList";
import { WeaponSprite } from "@/components/WeaponSprite";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "@/lib/game/elements";
import {
  applyForge,
  COMBINE,
  CRAFT_PARTS,
  craftCoins,
  DISMANTLE_PARTS,
  REFINE_RATIO,
  refineCoins,
  type ForgeOp,
} from "@/lib/game/forge";
import {
  coreKey,
  parsePartKey,
  partKey,
  partLabel,
  type Parts,
} from "@/lib/game/parts";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import {
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type WeaponType,
} from "@/lib/game/weapons";
import { repo, useProfile } from "@/lib/useProfile";

const selectCls =
  "border-2 border-[var(--edge)] bg-[var(--panel)] px-2 py-1.5 text-base";
type Tab = "craft" | "merge" | "refine" | "dismantle";
const TABS: [Tab, string][] = [
  ["craft", "Armar"],
  ["merge", "Fusionar"],
  ["refine", "Refinar"],
  ["dismantle", "Desmontar"],
];

export default function ForgePage() {
  const { profile, ready } = useProfile();
  const [tab, setTab] = useState<Tab>("craft");
  const [type, setType] = useState<WeaponType>("espada");
  const [element, setElement] = useState<Element>("fuego");
  const [rank, setRank] = useState<RarityId>("f");
  const [picked, setPicked] = useState<string[]>([]); // pieces to merge
  const [spend, setSpend] = useState<Parts>({}); // parts to refine
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ready || !profile) return null;

  const run = async (op: ForgeOp) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await repo.forge(op);
      setMsg({ ok: true, text: r.text });
      setPicked([]);
      setSpend({});
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    }
    setBusy(false);
  };
  const check = (op: ForgeOp) => {
    const r = applyForge(profile, op);
    return r.ok ? null : r.error;
  };
  const have = (k: string) => profile.parts[k] ?? 0;
  const rule = COMBINE[rank];
  const equipped = new Set(Object.values(profile.equipped));
  const pieces = profile.weapons.filter(
    (w) => w.type === type && w.rarity === rank,
  );
  const refineTotal = Object.values(spend).reduce((s, n) => s + n, 0);
  const refineParts = Object.entries(profile.parts).filter(([k]) => {
    const i = parsePartKey(k);
    return i?.kind === "part" && i.rank === rank;
  });

  const typeSelect = (
    <select
      className={selectCls}
      value={type}
      onChange={(e) => setType(e.target.value as WeaponType)}
      aria-label="Tipo"
    >
      {WEAPON_TYPES.map((t) => (
        <option key={t} value={t}>
          {WEAPON_TYPE_DATA[t].label}
        </option>
      ))}
    </select>
  );
  const elementSelect = (label: string) => (
    <select
      className={selectCls}
      value={element}
      onChange={(e) => setElement(e.target.value as Element)}
      aria-label={label}
    >
      {ELEMENTS.map((el) => (
        <option key={el} value={el}>
          {ELEMENT_LABEL[el]}
        </option>
      ))}
    </select>
  );
  const rankSelect = (max: RarityId) => (
    <select
      className={selectCls}
      value={rank}
      onChange={(e) => {
        setRank(e.target.value as RarityId);
        setPicked([]);
        setSpend({});
      }}
      aria-label="Rango"
    >
      {RARITY_IDS.slice(0, RARITY_IDS.indexOf(max) + 1).map((r) => (
        <option key={r} value={r}>
          Rango {RARITIES[r].label}
        </option>
      ))}
    </select>
  );
  const status = (err: string | null) =>
    err ? (
      <p className="text-sm text-red-300">{err}</p>
    ) : (
      <p className="text-sm text-green-300">Listo para forjar.</p>
    );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-3">
      {msg && (
        <p
          role="status"
          className={`text-center ${msg.ok ? "text-green-300" : "text-red-300"}`}
        >
          {msg.text}
        </p>
      )}
      <div className="flex gap-2" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`btn flex-1 text-center ${tab === k ? "" : "btn-gray"}`}
            onClick={() => {
              setTab(k);
              setMsg(null);
              setPicked([]);
              setSpend({});
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "craft" && (
        <Panel title="Armar una pieza" className="space-y-3">
          <p className="text-sm opacity-80">
            {CRAFT_PARTS} partes del tipo y rango + 1 núcleo del elemento +
            monedas. Si ya tienes la pieza, sube una estrella.
          </p>
          <div className="flex flex-wrap gap-2">
            {typeSelect}
            {elementSelect("Elemento")}
            {rankSelect("ssr")}
          </div>
          <ul className="text-sm">
            <li>
              {partLabel(partKey(type, rank))}: {have(partKey(type, rank))} /{" "}
              {CRAFT_PARTS}
            </li>
            <li>
              {partLabel(coreKey(element))}: {have(coreKey(element))} / 1
            </li>
            <li>
              Monedas: {profile.coins} / {craftCoins(rank)}
            </li>
          </ul>
          {status(check({ op: "craft", type, element, rank }))}
          <button
            className="btn"
            disabled={busy || !!check({ op: "craft", type, element, rank })}
            onClick={() => void run({ op: "craft", type, element, rank })}
          >
            Forjar
          </button>
        </Panel>
      )}

      {tab === "merge" && (
        <>
          <Panel title="Fusionar partes" className="space-y-3">
            <p className="text-sm opacity-80">
              Varias partes del mismo tipo y rango + 1 núcleo + monedas dan 1
              parte del rango siguiente.
            </p>
            <div className="flex flex-wrap gap-2">
              {typeSelect}
              {rankSelect("ss")}
              {elementSelect("Núcleo")}
            </div>
            {rule && (
              <ul className="text-sm">
                <li>
                  {partLabel(partKey(type, rank))}: {have(partKey(type, rank))}{" "}
                  / {rule.ratio}
                </li>
                <li>
                  {partLabel(coreKey(element))}: {have(coreKey(element))} / 1
                </li>
                <li>
                  Monedas: {profile.coins} / {rule.coins}
                </li>
              </ul>
            )}
            {status(check({ op: "combineParts", type, rank, core: element }))}
            <button
              className="btn"
              disabled={
                busy ||
                !!check({ op: "combineParts", type, rank, core: element })
              }
              onClick={() =>
                void run({ op: "combineParts", type, rank, core: element })
              }
            >
              Fusionar partes
            </button>
          </Panel>
          <Panel title="Fusionar piezas" className="space-y-3">
            <p className="text-sm opacity-80">
              {rule?.ratio ?? "Varias"} piezas del mismo tipo y rango, de
              distinto elemento, dan 1 pieza del rango siguiente con uno de sus
              elementos (+ 1 núcleo de ese elemento y monedas). Pierdes sus
              estrellas.
            </p>
            <div className="flex flex-wrap gap-2">
              {typeSelect}
              {rankSelect("ss")}
              {elementSelect("Elemento resultante")}
            </div>
            <ul className="space-y-1">
              {pieces.length === 0 && (
                <li className="text-sm">
                  No tienes piezas de ese tipo y rango.
                </li>
              )}
              {pieces.map((w) => {
                const eq = equipped.has(w.id);
                return (
                  <li key={w.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={eq}
                        checked={picked.includes(w.id)}
                        onChange={(e) =>
                          setPicked(
                            e.target.checked
                              ? [...picked, w.id]
                              : picked.filter((x) => x !== w.id),
                          )
                        }
                      />
                      <WeaponSprite
                        type={w.type}
                        element={w.element}
                        rarity={w.rarity}
                        className="w-8"
                      />
                      {w.name} ({w.stars}★){eq && " · equipada"}
                    </label>
                  </li>
                );
              })}
            </ul>
            {status(check({ op: "combinePieces", ids: picked, element }))}
            <button
              className="btn"
              disabled={
                busy || !!check({ op: "combinePieces", ids: picked, element })
              }
              onClick={() =>
                void run({ op: "combinePieces", ids: picked, element })
              }
            >
              Fusionar piezas
            </button>
          </Panel>
        </>
      )}

      {tab === "refine" && (
        <Panel title="Refinar partes" className="space-y-3">
          <p className="text-sm opacity-80">
            {REFINE_RATIO} partes de cualquier tipo (del mismo rango) se
            convierten en 1 parte del tipo que elijas. Cuesta{" "}
            {refineCoins(rank)} monedas.
          </p>
          <div className="flex flex-wrap gap-2">
            {rankSelect("ssr")}
            <select
              className={selectCls}
              value={type}
              onChange={(e) => setType(e.target.value as WeaponType)}
              aria-label="Tipo que quiero"
            >
              {WEAPON_TYPES.map((t) => (
                <option key={t} value={t}>
                  Quiero: {WEAPON_TYPE_DATA[t].label}
                </option>
              ))}
            </select>
          </div>
          <ul className="space-y-1">
            {refineParts.length === 0 && (
              <li className="text-sm">No tienes partes de ese rango.</li>
            )}
            {refineParts.map(([k, n]) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {partLabel(k)} (tienes {n})
                </span>
                <button
                  className="btn btn-gray !min-h-8 !px-2"
                  disabled={(spend[k] ?? 0) === 0}
                  onClick={() =>
                    setSpend({ ...spend, [k]: (spend[k] ?? 0) - 1 })
                  }
                >
                  −
                </button>
                <span className="w-6 text-center">{spend[k] ?? 0}</span>
                <button
                  className="btn btn-gray !min-h-8 !px-2"
                  disabled={(spend[k] ?? 0) >= n || refineTotal >= REFINE_RATIO}
                  onClick={() =>
                    setSpend({ ...spend, [k]: (spend[k] ?? 0) + 1 })
                  }
                >
                  +
                </button>
              </li>
            ))}
          </ul>
          {(() => {
            const clean = Object.fromEntries(
              Object.entries(spend).filter(([, n]) => n > 0),
            );
            const op: ForgeOp = {
              op: "refine",
              spend: clean,
              toType: type,
              rank,
            };
            return (
              <>
                {status(check(op))}
                <button
                  className="btn"
                  disabled={busy || !!check(op)}
                  onClick={() => void run(op)}
                >
                  Refinar
                </button>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === "dismantle" && (
        <Panel title="Desmontar" className="space-y-2">
          <p className="text-sm opacity-80">
            Una pieza sin equipar se convierte en {DISMANTLE_PARTS} partes (+1
            por estrella) de su tipo y rango.
          </p>
          {profile.weapons.length === 0 && (
            <p className="text-sm">No tienes piezas.</p>
          )}
          {profile.weapons.map((w) => {
            const eq = equipped.has(w.id);
            return (
              <div key={w.id} className="flex items-center gap-2 text-sm">
                <WeaponSprite
                  type={w.type}
                  element={w.element}
                  rarity={w.rarity}
                  className="w-8"
                />
                <span
                  className="min-w-0 flex-1"
                  style={{ color: RARITIES[w.rarity].color }}
                >
                  {w.name} · {RARITIES[w.rarity].label} · {w.stars}★
                  {eq && " · equipada"}
                </span>
                <button
                  className="btn btn-gray !min-h-8 !px-2"
                  disabled={busy || eq}
                  onClick={() => {
                    if (window.confirm(`¿Desmontar ${w.name}?`))
                      void run({ op: "dismantle", id: w.id });
                  }}
                >
                  Desmontar
                </button>
              </div>
            );
          })}
        </Panel>
      )}

      <Panel title="Tus partes" className="space-y-2">
        <p className="text-sm">Monedas: {profile.coins}</p>
        <PartsList parts={profile.parts} />
        <p className="text-sm opacity-80">
          Las partes salen de los dungeons.{" "}
          <Link href="/run" className="text-cyan-300 underline">
            Ir a un dungeon
          </Link>
        </p>
      </Panel>
    </main>
  );
}
