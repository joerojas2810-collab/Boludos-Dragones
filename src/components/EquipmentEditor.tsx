"use client";
import type { Element as GameElement } from "@/lib/game/elements";

import { RankIcon } from "@/components/RankIcon";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ElementIcon } from "@/components/ElementIcon";
import { HeroSprite } from "@/components/HeroSprite";
import { StarRow } from "@/components/StarRow";
import { WeaponSprite } from "@/components/WeaponSprite";
import { CLASSES } from "@/lib/game/characters";
import {
  activeSets,
  BUILD_LABEL,
  buildLabel,
  resonanceLine,
  resonances,
  SKILL_STYLE_GROUP,
  SET_AFFINITY,
  SET_BONUS,
  SET_TIERS,
  setLine,
  setTierText,
} from "@/lib/game/gear";
import {
  autoEquipPlan,
  heroFromOwned,
  slotKey,
  type AutoMode,
  type OwnedCharacter,
  type Profile,
} from "@/lib/game/profile";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import {
  CLASS_WEAPONS,
  WEAPON_TYPE_DATA,
  canUseWeapon,
  slotOf,
  type Slot,
} from "@/lib/game/weapons";
import { repo } from "@/lib/useProfile";
import {
  extraLinesText,
  pieceDelta,
  pieceLine,
  weaponEffect,
  type PieceDiff,
} from "@/lib/viewModels";

type Piece = Profile["weapons"][number];

// One piece as a card framed in its rank colour: rank badge, stars, bonus chips and
// what the slot is for. `worn` marks the equipped one; the action sits on the right.
function GearCard({
  w,
  worn,
  diff,
  action,
}: {
  w: Piece;
  worn?: boolean;
  diff?: PieceDiff[]; // what swapping to this piece changes vs the worn one
  action: ReactNode;
}) {
  const color = RARITIES[w.rarity].color;
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-2 p-2"
      style={{
        borderColor: color,
        background: `${color}${worn ? "26" : "14"}`,
        boxShadow: worn ? `0 0 0 2px ${color}66` : undefined,
      }}
    >
      <div className="grid w-14 shrink-0 place-items-center">
        <WeaponSprite
          type={w.type}
          element={w.element}
          rarity={w.rarity}
          className={worn ? "w-12" : "w-10"}
        />
      </div>
      <div className="min-w-[10rem] flex-1 space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RankIcon rank={w.rarity} letter className="h-8 w-8" />
          <span className="font-semibold">{w.name}</span>
          <ElementIcon element={w.element} className="h-4" />
          {worn && (
            <span className="rounded bg-green-700 px-1.5 text-xs text-white">
              Equipado
            </span>
          )}
        </div>
        <StarRow stars={w.stars} className="h-2.5" />
        <div className="flex flex-wrap gap-1">
          {pieceLine(w)
            .split(" · ")
            .map((t) => (
              <span
                key={t}
                className="rounded border border-white/20 bg-black/30 px-1.5 text-xs tabular-nums text-green-300"
              >
                {t}
              </span>
            ))}
        </div>
        {diff && diff.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-[#d9d2ca]">Si la equipas:</span>
            {diff.map((d) => (
              <span
                key={d.text}
                className={`rounded border px-1.5 tabular-nums ${
                  d.good === true
                    ? "border-green-400/60 bg-green-900/40 text-green-300"
                    : d.good === false
                      ? "border-red-400/60 bg-red-900/40 text-red-300"
                      : "border-white/20 text-[#d9d2ca]"
                }`}
              >
                {d.good === true ? "▲ " : d.good === false ? "▼ " : ""}
                {d.text}
              </span>
            ))}
          </div>
        )}
        {extraLinesText(w).length > 0 && (
          <div className="text-xs text-cyan-200">
            Líneas extra: {extraLinesText(w).join(" · ")}
          </div>
        )}
        <div className="text-xs text-[#d9d2ca]">{weaponEffect(w)}</div>
      </div>
      {action}
    </div>
  );
}

const rankOrder = (w: Piece) => RARITY_IDS.indexOf(w.rarity);

const DOLL_LEFT: Slot[] = ["casco", "peto", "piernas"];
const DOLL_RIGHT: Slot[] = ["arma", "zapatos", "collar"];
const DOLL_SLOTS = [...DOLL_LEFT, ...DOLL_RIGHT];

// A hero's six equipment slots as a paper doll, with the free pieces of the
// selected slot underneath. Used in the collection and before entering a dungeon.
export function EquipmentEditor({
  c,
  profile,
  act,
}: {
  c: OwnedCharacter;
  profile: Profile;
  act: (job: () => Promise<void>) => void;
}) {
  const [sel, setSel] = useState<Slot>("arma");
  const [mode, setMode] = useState<AutoMode>("poder");
  const [steal, setSteal] = useState(false);
  const [preview, setPreview] = useState(false);
  const wornElements = (
    ["arma", "casco", "peto", "piernas", "zapatos", "collar"] as const
  ).flatMap((sl) => {
    const w = profile.weapons.find(
      (x) => x.id === profile.equipped[slotKey(c.id, sl)],
    );
    return w ? [w.element] : [];
  });
  const sets = activeSets(wornElements, c.element);
  const plan = autoEquipPlan(profile, c.id, mode, { takeFromOthers: steal });
  const wornPieces = DOLL_SLOTS.flatMap((sl) => {
    const w = profile.weapons.find(
      (x) => x.id === profile.equipped[slotKey(c.id, sl)],
    );
    return w ? [w] : [];
  });
  const skill = heroFromOwned(profile, c.id)?.skill;
  const styleGroup = skill ? SKILL_STYLE_GROUP[skill] : undefined;
  const build = buildLabel(wornPieces);
  const res = resonances(wornPieces, styleGroup);
  const wornSlots = DOLL_SLOTS.filter(
    (sl) => profile.equipped[slotKey(c.id, sl)],
  );
  const usable = CLASS_WEAPONS[c.classId]
    .map((t) => WEAPON_TYPE_DATA[t].label)
    .join(" · ");
  return (
    <>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-[#d9d2ca]">Autoequipar:</span>
          {(
            [
              ["poder", "Poder", "Mayor poder total (cuenta sets)"],
              ["set", "Set", "Prefiere piezas de tu elemento para completar sets"],
              [
                "estilo",
                "Estilo",
                styleGroup
                  ? `Prefiere piezas de tu estilo (${BUILD_LABEL[styleGroup]})`
                  : "Necesita una tercera habilidad elegida",
              ],
            ] as const
          ).map(([m, label, tip]) => (
            <button
              key={m}
              title={tip}
              aria-pressed={mode === m}
              className={`btn text-center ${mode === m ? "" : "btn-gray"}`}
              onClick={() => {
                setMode(m);
                setPreview(false);
              }}
            >
              {label}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={steal}
              onChange={(e) => {
                setSteal(e.target.checked);
                setPreview(false);
              }}
            />
            Tomar de otros héroes
          </label>
        </div>
        {preview && plan.length > 0 && (
          <ul className="space-y-0.5 text-xs" aria-label="Cambios propuestos">
            {plan.map((x) => {
              const w = profile.weapons.find((y) => y.id === x.weaponId);
              const from = profile.characters.find((h) => h.id === x.fromHeroId);
              return (
                <li key={x.slot}>
                  <span className="capitalize">{x.slot}</span>: {w?.name}{" "}
                  {w && RARITIES[w.rarity].label}
                  {from && (
                    <span className="text-orange-300"> (se la quitas a {from.name})</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button
          className="btn w-full text-center"
          disabled={plan.length === 0}
          title="Equipa la mejor pieza en cada casilla según el modo elegido"
          onClick={() => {
            if (!preview) return setPreview(true);
            setPreview(false);
            act(async () => {
              for (const { slot, weaponId } of plan)
                await repo.equip(c.id, weaponId, slot);
            });
          }}
        >
          {plan.length === 0
            ? "Equipo ya óptimo"
            : preview
              ? `Confirmar (${plan.length} ${plan.length === 1 ? "cambio" : "cambios"})`
              : `Ver cambios (${plan.length})`}
        </button>
      </div>
      <button
        className="btn btn-gray w-full text-center"
        disabled={wornSlots.length === 0}
        title="Deja libres todas las piezas del héroe (útil para desmontar)"
        onClick={() =>
          act(async () => {
            for (const sl of wornSlots) await repo.equip(c.id, null, sl);
          })
        }
      >
        Quitar todo el equipo
      </button>
      <div className="text-sm text-[#d9d2ca]">
        Armas de {CLASSES[c.classId].name}:{" "}
        <span className="text-yellow-300">{usable}</span>. La armadura la usa
        cualquier clase.
      </div>
      <div className="doll" aria-label="Equipo del héroe">
        {[DOLL_LEFT, DOLL_RIGHT].map((col, i) => (
          <div key={i} className="doll-col">
            {col.map((sl) => {
              const w = profile.weapons.find(
                (x) => x.id === profile.equipped[slotKey(c.id, sl)],
              );
              return (
                <button
                  key={sl}
                  className="doll-slot"
                  aria-pressed={sel === sl}
                  title={w ? `${w.name}: ${pieceLine(w)}` : "Vacío"}
                  style={
                    w ? { borderColor: RARITIES[w.rarity].color } : undefined
                  }
                  onClick={() => setSel(sl)}
                >
                  {w ? (
                    <WeaponSprite
                      type={w.type}
                      element={w.element}
                      rarity={w.rarity}
                      className="w-9"
                    />
                  ) : (
                    <span className="doll-empty">
                      {sl === "arma" ? "Arma" : WEAPON_TYPE_DATA[sl].label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <HeroSprite
          classId={c.classId}
          element={c.element}
          traits={c.traits}
          className="doll-hero"
          animated
        />
      </div>

      <div className="text-sm text-[#d9d2ca]">
        {build && (
          <div>
            Build: <span className="text-yellow-300">{BUILD_LABEL[build]}</span>
            {styleGroup && (
              <span className="text-xs"> · tu estilo: {BUILD_LABEL[styleGroup]}</span>
            )}
          </div>
        )}
        {res.map((r) => (
          <div key={r.group} className="text-cyan-300">
            {resonanceLine(r)}
          </div>
        ))}
        {sets.length === 0 ? (
          <div>Sets: piezas del mismo elemento dan bonos a 2, 4 y 6.</div>
        ) : (
          sets.map((st) => (
            <div key={st.element} className="text-green-300">
              {setLine(st)}
            </div>
          ))
        )}
        <details className="mt-1">
          <summary className="cursor-pointer">Ver todos los sets</summary>
          <div className="mt-1 space-y-0.5 text-xs">
            {(Object.keys(SET_BONUS) as GameElement[]).map((el) => (
              <div key={el}>
                <span className="font-semibold capitalize">{el}</span>
                {SET_TIERS.map((n, i) => (
                  <span
                    key={n}
                    className={
                      sets.find((x) => x.element === el && x.tier >= n)
                        ? "ml-2 text-green-300"
                        : "ml-2"
                    }
                  >
                    {n}: {setTierText(el, i)}
                  </span>
                ))}
              </div>
            ))}
            <div>
              ×{SET_AFFINITY} si el set es del elemento de tu héroe. Los bonos
              de varios sets se suman.
            </div>
          </div>
        </details>
      </div>
      {[sel].map((slot) => {
        const worn = profile.weapons.find(
          (w) => w.id === profile.equipped[slotKey(c.id, slot)],
        );
        const free = profile.weapons.filter(
          (w) =>
            slotOf(w.type) === slot &&
            canUseWeapon(c.classId, w.type) &&
            !Object.values(profile.equipped).includes(w.id),
        );
        const blocked =
          slot === "arma"
            ? profile.weapons.filter(
                (w) =>
                  slotOf(w.type) === "arma" &&
                  !canUseWeapon(c.classId, w.type) &&
                  !Object.values(profile.equipped).includes(w.id),
              )
            : [];
        const title = slot === "arma" ? "Arma" : WEAPON_TYPE_DATA[slot].label;
        return (
          <div key={slot} className="border-t-2 border-[var(--edge)] pt-2">
            <div className="mb-1 font-semibold text-yellow-300">{title}</div>
            {worn ? (
              <GearCard
                w={worn}
                worn
                action={
                  <button
                    className="btn btn-gray text-center"
                    onClick={() => act(() => repo.equip(c.id, null, slot))}
                  >
                    Quitar
                  </button>
                }
              />
            ) : (
              <p className="text-sm text-[#d9d2ca]">Vacío.</p>
            )}
            {free.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {[...free]
                  .sort(
                    (x, y) => rankOrder(y) - rankOrder(x) || y.stars - x.stars,
                  )
                  .map((w) => (
                    <li key={w.id}>
                      <GearCard
                        w={w}
                        diff={pieceDelta(w, worn)}
                        action={
                          <button
                            className="btn text-center"
                            onClick={() => act(() => repo.equip(c.id, w.id))}
                          >
                            Equipar
                          </button>
                        }
                      />
                    </li>
                  ))}
              </ul>
            ) : (
              !worn && (
                <p className="mt-1 text-sm">
                  {slot === "arma"
                    ? `No tienes armas libres para ${CLASSES[c.classId].name} (usa: ${CLASS_WEAPONS[
                        c.classId
                      ]
                        .map((t) => WEAPON_TYPE_DATA[t].label)
                        .join(", ")}). `
                    : "No tienes piezas libres. "}
                  <Link href="/gacha" className="text-cyan-300 underline">
                    Ir al gacha
                  </Link>
                </p>
              )
            )}
            {blocked.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-[#d9d2ca]">
                  Armas que {CLASSES[c.classId].name} no usa ({blocked.length})
                </summary>
                <ul className="mt-2 space-y-2 opacity-40">
                  {blocked.map((w) => (
                    <li key={w.id}>
                      <GearCard
                        w={w}
                        action={
                          <span className="text-xs">
                            No la usa {CLASSES[c.classId].name}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </>
  );
}
