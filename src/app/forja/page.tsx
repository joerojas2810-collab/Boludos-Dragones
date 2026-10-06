"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import {
  ElementPicker,
  RankPicker,
  ResultCard,
  Step,
  TypePicker,
} from "./ForgeChips";
import { GuidePanel } from "./GuidePanel";

function Need({
  label,
  have,
  need,
}: {
  label: string;
  have: number;
  need: number;
}) {
  const ok = have >= need;
  return (
    <li>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={ok ? "text-green-300" : "text-red-300"}>
          {ok ? "✓ " : ""}
          {have} / {need}
        </span>
      </div>
      <div className="h-1.5 bg-black/40">
        <div
          className={`h-full ${ok ? "bg-green-400" : "bg-red-400"}`}
          style={{ width: `${Math.min(100, (have / need) * 100)}%` }}
        />
      </div>
    </li>
  );
}

const selectCls =
  "border-2 border-[var(--edge)] bg-[var(--panel)] px-2 py-1.5 text-base";
type Tab = "shortcuts" | "craft" | "merge" | "refine" | "dismantle";
const TABS: [Tab, string][] = [
  ["craft", "Armar"],
  ["merge", "Fusionar"],
  ["refine", "Refinar"],
  ["dismantle", "Desmontar"],
  ["shortcuts", "Atajos"],
];

export default function ForgePage() {
  const { profile, ready } = useProfile();
  const [tab, setTab] = useState<Tab>("craft");
  const [maxRank, setMaxRank] = useState<RarityId>("c");
  const [refineFirst, setRefineFirst] = useState(true);
  const [maxStars, setMaxStars] = useState(0);
  const [dismRank, setDismRank] = useState<RarityId>("f"); // safe default for a destructive shortcut
  const [type, setType] = useState<WeaponType>("espada");
  const [element, setElement] = useState<Element>("fuego");
  const [rank, setRank] = useState<RarityId>("f");
  const [picked, setPicked] = useState<string[]>([]); // pieces to merge
  const [spend, setSpend] = useState<Parts>({}); // parts to refine
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Keyboard: 1-5 switch tabs (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) {
        setTab(TABS[i][0]);
        setMsg(null);
        setPicked([]);
        setSpend({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // How many recipes can be forged right now, per tab (badge on the tab).
  const counts = useMemo(() => {
    if (!profile) return null;
    const ok = (op: ForgeOp) => applyForge(profile, op).ok;
    const c = { craft: 0, merge: 0, refine: 0, dismantle: 0 };
    for (const t of WEAPON_TYPES)
      for (const r of RARITY_IDS) {
        for (const el of ELEMENTS)
          if (ok({ op: "craft", type: t, element: el, rank: r })) c.craft++;
        if (
          ELEMENTS.some((el) =>
            ok({ op: "combineParts", type: t, rank: r, core: el }),
          )
        )
          c.merge++;
      }
    for (const r of RARITY_IDS) {
      const n = Object.entries(profile.parts).reduce((s, [k, v]) => {
        const i = parsePartKey(k);
        return i?.kind === "part" && i.rank === r ? s + v : s;
      }, 0);
      if (n >= REFINE_RATIO && profile.coins >= refineCoins(r)) c.refine++;
    }
    const eq = new Set(Object.values(profile.equipped));
    c.dismantle = profile.weapons.filter((w) => !eq.has(w.id)).length;
    return c;
  }, [profile]);
  if (!ready || !profile || !counts) return null;

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

  const ok = (op: ForgeOp) => !check(op);
  const craftOp = (t = type, el = element, r = rank): ForgeOp => ({
    op: "craft",
    type: t,
    element: el,
    rank: r,
  });
  const mergeOp = (t = type, el = element, r = rank): ForgeOp => ({
    op: "combineParts",
    type: t,
    rank: r,
    core: el,
  });
  const nextRank = RARITY_IDS[RARITY_IDS.indexOf(rank) + 1] as
    RarityId | undefined;
  const ownedPieces = (t: WeaponType, r: RarityId) =>
    profile.weapons.filter((w) => w.type === t && w.rarity === r).length;
  const partsAt = (r: RarityId) =>
    Object.entries(profile.parts).reduce((n, [k, v]) => {
      const i = parsePartKey(k);
      return i?.kind === "part" && i.rank === r ? n + v : n;
    }, 0);
  const refineReady = (r: RarityId) =>
    partsAt(r) >= REFINE_RATIO && profile.coins >= refineCoins(r);
  const pickRank = (r: RarityId) => {
    setRank(r);
    setPicked([]);
    setSpend({});
  };
  // Jump to the best recipe that can be forged right now (highest rank first).
  const jump = () => {
    const ranks = [...RARITY_IDS].reverse();
    for (const r of ranks)
      for (const t of WEAPON_TYPES) {
        if (tab === "refine") {
          if (refineReady(r)) return pickRank(r);
          break;
        }
        for (const el of ELEMENTS) {
          if (ok(tab === "craft" ? craftOp(t, el, r) : mergeOp(t, el, r))) {
            setType(t);
            setElement(el);
            return pickRank(r);
          }
        }
      }
  };
  const jumpBtn = (
    <button
      className="btn btn-gray w-full !min-h-8 text-sm"
      disabled={!counts[tab as "craft" | "merge" | "refine"]}
      onClick={jump}
    >
      ✨ Ir a lo que puedo forjar
    </button>
  );
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
  const status = (err: string | null) =>
    err ? (
      <p className="text-sm text-red-300">{err}</p>
    ) : (
      <p className="text-sm text-green-300">Listo para forjar.</p>
    );

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 p-3 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-4">
        {msg && (
          <p
            role="status"
            className={`text-center ${msg.ok ? "text-green-300" : "text-red-300"}`}
          >
            {msg.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`btn min-w-[30%] flex-1 text-center ${tab === k ? "" : "btn-gray"} ${k !== "shortcuts" && !counts[k] && tab !== k ? "opacity-70" : ""}`}
              onClick={() => {
                setTab(k);
                setMsg(null);
                setPicked([]);
                setSpend({});
              }}
            >
              {label}
              {k !== "shortcuts" && (
                <span
                  className={`ml-1 rounded-full px-1.5 text-xs ${counts[k] ? "bg-green-500 text-black" : "opacity-50"}`}
                >
                  {counts[k]}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "shortcuts" && (
          <Panel title="Atajos de forja" className="space-y-4">
            <p className="text-sm opacity-80">
              Acciones en bloque: ves qué pasaría antes de ejecutar. Atajo de
              teclado: las teclas 1 a 5 cambian de pestaña.
            </p>
            {(() => {
              const block = (
                title: string,
                desc: string,
                op: ForgeOp,
                label: string,
                controls: React.ReactNode,
                confirm?: string,
              ) => {
                const r = applyForge(profile, op);
                return (
                  <section className="space-y-1 border-t-2 border-[var(--edge)] pt-3 first:border-0 first:pt-0">
                    <h3 className="font-semibold text-yellow-300">{title}</h3>
                    <p className="text-sm opacity-80">{desc}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {controls}
                    </div>
                    <p
                      className={`text-sm ${r.ok ? "text-green-300" : "text-[#d9d2ca]"}`}
                    >
                      {r.ok ? r.text : r.error}
                    </p>
                    <button
                      className="btn"
                      disabled={busy || !r.ok}
                      onClick={() => {
                        if (confirm && !window.confirm(confirm)) return;
                        void run(op);
                      }}
                    >
                      {label}
                    </button>
                  </section>
                );
              };
              const rankPick = (
                value: RarityId,
                set: (r: RarityId) => void,
                max: RarityId,
                label: string,
              ) => (
                <select
                  className={selectCls}
                  value={value}
                  onChange={(e) => set(e.target.value as RarityId)}
                  aria-label={label}
                >
                  {RARITY_IDS.slice(0, RARITY_IDS.indexOf(max) + 1).map((r) => (
                    <option key={r} value={r}>
                      Rango {RARITIES[r].label}
                    </option>
                  ))}
                </select>
              );
              return (
                <>
                  {block(
                    "Fusionar todo",
                    "Fusiona todas las partes de un rango que puedas pagar (usa el núcleo que más tengas).",
                    { op: "mergeAll", rank },
                    "Fusionar todo",
                    rankPick(rank, setRank, "ss", "Rango a fusionar"),
                  )}
                  {block(
                    "Subir en cadena",
                    "Fusiona rango por rango hasta el rango elegido; lo intermedio se reutiliza.",
                    { op: "chain", maxRank, refine: refineFirst },
                    "Subir en cadena",
                    <>
                      {rankPick(maxRank, setMaxRank, "ssr", "Rango final")}
                      <label className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={refineFirst}
                          onChange={(e) => setRefineFirst(e.target.checked)}
                        />
                        Refinar sobrantes primero
                      </label>
                    </>,
                  )}
                  {block(
                    "Refinar sobrantes",
                    "Convierte las partes sueltas de otros tipos para completar el grupo del tipo que más tienes.",
                    { op: "refineAll", rank },
                    "Refinar sobrantes",
                    rankPick(rank, setRank, "ssr", "Rango a refinar"),
                  )}
                  {block(
                    "Desmontar lo que no usas",
                    "Desmonta las piezas sin equipar de ese rango o menor y con pocas estrellas (hasta 60 a la vez).",
                    { op: "dismantleLow", maxRank: dismRank, maxStars },
                    "Desmontar",
                    <>
                      {rankPick(dismRank, setDismRank, "ssr", "Rango máximo")}
                      <select
                        className={selectCls}
                        value={maxStars}
                        onChange={(e) => setMaxStars(Number(e.target.value))}
                        aria-label="Estrellas máximas"
                      >
                        {[0, 1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            hasta {n}★
                          </option>
                        ))}
                      </select>
                    </>,
                    "¿Desmontar esas piezas? No se puede deshacer.",
                  )}
                  {block(
                    "Armar al máximo",
                    "Forja la misma pieza hasta que se acaben los materiales o llegue a 5 estrellas.",
                    { op: "craftMax", type, element, rank },
                    "Armar al máximo",
                    <>
                      {typeSelect}
                      {elementSelect("Elemento")}
                      {rankPick(rank, setRank, "ssr", "Rango")}
                    </>,
                  )}
                </>
              );
            })()}
          </Panel>
        )}

        {tab === "craft" && (
          <Panel title="Armar una pieza" className="space-y-3">
            <p className="text-sm opacity-80">
              {CRAFT_PARTS} partes del tipo y rango + 1 núcleo del elemento +
              monedas. Si ya tienes la pieza, sube una estrella.
            </p>
            {jumpBtn}
            <Step n={1} title="Tipo de pieza">
              <TypePicker
                value={type}
                onChange={setType}
                element={element}
                rank={rank}
                ready={(t) => ok(craftOp(t))}
                sub={(t) => `${have(partKey(t, rank))}/${CRAFT_PARTS} partes`}
              />
            </Step>
            <Step n={2} title="Elemento">
              <ElementPicker
                value={element}
                onChange={setElement}
                ready={(el) => ok(craftOp(type, el))}
                sub={(el) => `${have(coreKey(el))} núcleo`}
              />
            </Step>
            <Step n={3} title="Rango">
              <RankPicker
                value={rank}
                onChange={pickRank}
                max="ssr"
                ready={(r) => ok(craftOp(type, element, r))}
                sub={(r) => `${have(partKey(type, r))}/${CRAFT_PARTS}`}
              />
            </Step>
            <ul className="space-y-1.5 text-sm">
              <Need
                label={partLabel(partKey(type, rank))}
                have={have(partKey(type, rank))}
                need={CRAFT_PARTS}
              />
              <Need
                label={partLabel(coreKey(element))}
                have={have(coreKey(element))}
                need={1}
              />
              <Need
                label="Monedas"
                have={profile.coins}
                need={craftCoins(rank)}
              />
            </ul>
            <ResultCard>
              <WeaponSprite
                type={type}
                element={element}
                rarity={rank}
                className="w-12"
              />
              <span>
                {WEAPON_TYPE_DATA[type].label} {RARITIES[rank].label} de{" "}
                {ELEMENT_LABEL[element]}
              </span>
            </ResultCard>
            {status(check(craftOp()))}
            <button
              className="btn w-full"
              disabled={busy || !ok(craftOp())}
              onClick={() => void run(craftOp())}
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
              {jumpBtn}
              <Step n={1} title="Tipo de parte">
                <TypePicker
                  value={type}
                  onChange={setType}
                  element={element}
                  rank={rank}
                  ready={(t) => ok(mergeOp(t))}
                  sub={(t) => `${have(partKey(t, rank))}/${rule?.ratio ?? "-"}`}
                />
              </Step>
              <Step n={2} title="Rango">
                <RankPicker
                  value={rank}
                  onChange={pickRank}
                  max="ss"
                  ready={(r) => ok(mergeOp(type, element, r))}
                  sub={(r) =>
                    `${have(partKey(type, r))}/${COMBINE[r]?.ratio ?? "-"}`
                  }
                />
              </Step>
              <Step n={3} title="Núcleo a gastar">
                <ElementPicker
                  value={element}
                  onChange={setElement}
                  ready={(el) => ok(mergeOp(type, el))}
                  sub={(el) => `${have(coreKey(el))} núcleo`}
                />
              </Step>
              {rule && (
                <ul className="space-y-1.5 text-sm">
                  <Need
                    label={partLabel(partKey(type, rank))}
                    have={have(partKey(type, rank))}
                    need={rule.ratio}
                  />
                  <Need
                    label={partLabel(coreKey(element))}
                    have={have(coreKey(element))}
                    need={1}
                  />
                  <Need
                    label="Monedas"
                    have={profile.coins}
                    need={rule.coins}
                  />
                </ul>
              )}
              {nextRank && (
                <ResultCard>
                  <WeaponSprite
                    type={type}
                    element={element}
                    rarity={nextRank}
                    className="w-10"
                  />
                  <span>1 {partLabel(partKey(type, nextRank))}</span>
                </ResultCard>
              )}
              {status(check(mergeOp()))}
              <button
                className="btn w-full"
                disabled={busy || !ok(mergeOp())}
                onClick={() => void run(mergeOp())}
              >
                Fusionar partes
              </button>
            </Panel>
            <Panel title="Fusionar piezas" className="space-y-3">
              <p className="text-sm opacity-80">
                {rule?.ratio ?? "Varias"} piezas del mismo tipo y rango, de
                distinto elemento, dan 1 pieza del rango siguiente con uno de
                sus elementos (+ 1 núcleo de ese elemento y monedas). Pierdes
                sus estrellas.
              </p>
              <Step n={1} title="Tipo y rango de las piezas">
                <TypePicker
                  value={type}
                  onChange={setType}
                  element={element}
                  rank={rank}
                  ready={(t) =>
                    rule ? ownedPieces(t, rank) >= rule.ratio : false
                  }
                  sub={(t) => `${ownedPieces(t, rank)} piezas`}
                />
                <RankPicker
                  value={rank}
                  onChange={pickRank}
                  max="ss"
                  ready={(r) =>
                    ownedPieces(type, r) >= (COMBINE[r]?.ratio ?? Infinity)
                  }
                  sub={(r) =>
                    `${ownedPieces(type, r)}/${COMBINE[r]?.ratio ?? "-"}`
                  }
                />
              </Step>
              <Step n={2} title="Elemento resultante">
                <ElementPicker value={element} onChange={setElement} />
              </Step>
              <Step
                n={3}
                title={`Elige piezas (${picked.length} de ${rule?.ratio ?? "?"})`}
              >
                {pieces.length === 0 && (
                  <p className="text-sm">
                    No tienes piezas de ese tipo y rango. Arma o consigue más en
                    dungeons.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {pieces.map((w) => {
                    const eq = equipped.has(w.id);
                    const on = picked.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        disabled={eq}
                        aria-pressed={on}
                        onClick={() =>
                          setPicked(
                            on
                              ? picked.filter((x) => x !== w.id)
                              : [...picked, w.id],
                          )
                        }
                        className={`flex items-center gap-2 border-2 p-1.5 text-left text-xs ${on ? "border-yellow-300 bg-yellow-300/15" : "border-[var(--edge)]"} ${eq ? "opacity-50" : ""}`}
                      >
                        <WeaponSprite
                          type={w.type}
                          element={w.element}
                          rarity={w.rarity}
                          className="w-9"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{w.name}</span>
                          <span className="opacity-80">
                            {eq ? "🔒 equipada" : `${w.stars}★`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Step>
              {nextRank && (
                <ResultCard>
                  <WeaponSprite
                    type={type}
                    element={element}
                    rarity={nextRank}
                    className="w-12"
                  />
                  <span>
                    {WEAPON_TYPE_DATA[type].label} {RARITIES[nextRank].label} de{" "}
                    {ELEMENT_LABEL[element]}
                  </span>
                </ResultCard>
              )}
              {status(check({ op: "combinePieces", ids: picked, element }))}
              <button
                className="btn w-full"
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
            {jumpBtn}
            <Step n={1} title="Rango">
              <RankPicker
                value={rank}
                onChange={pickRank}
                max="ssr"
                ready={refineReady}
                sub={(r) => `${partsAt(r)} partes`}
              />
            </Step>
            <Step
              n={2}
              title={`Partes a gastar (${refineTotal} de ${REFINE_RATIO})`}
            >
              <div className="h-1.5 bg-black/40">
                <div
                  className="h-full bg-green-400"
                  style={{
                    width: `${Math.min(100, (refineTotal / REFINE_RATIO) * 100)}%`,
                  }}
                />
              </div>
              {refineParts.length === 0 && (
                <p className="text-sm">
                  No tienes partes de este rango. Consíguelas en dungeons.
                </p>
              )}
              <ul className="space-y-1">
                {refineParts.map(([k, n]) => (
                  <li
                    key={k}
                    className="flex items-center gap-2 border-2 border-[var(--edge)] p-1 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {partLabel(k)}{" "}
                      <span className="opacity-70">(tienes {n})</span>
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
                      disabled={
                        (spend[k] ?? 0) >= n || refineTotal >= REFINE_RATIO
                      }
                      onClick={() =>
                        setSpend({ ...spend, [k]: (spend[k] ?? 0) + 1 })
                      }
                    >
                      +
                    </button>
                  </li>
                ))}
              </ul>
            </Step>
            <Step n={3} title="Tipo que quiero">
              <TypePicker
                value={type}
                onChange={setType}
                element={element}
                rank={rank}
              />
            </Step>
            <ResultCard>
              <WeaponSprite
                type={type}
                element={element}
                rarity={rank}
                className="w-10"
              />
              <span>1 {partLabel(partKey(type, rank))}</span>
            </ResultCard>
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
                    className="btn w-full"
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
              <p className="text-sm">
                No tienes piezas. Arma una en la pestaña Armar.
              </p>
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
      </div>
      <GuidePanel tab={tab} />
    </main>
  );
}
