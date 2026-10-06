"use client";

import Link from "next/link";
import { useState } from "react";
import { Sprite } from "@/components/Sprite";
import { WeaponSprite } from "@/components/WeaponSprite";
import { CLASSES } from "@/lib/game/characters";
import { activeSets, setLine } from "@/lib/game/gear";
import { slotKey, type OwnedCharacter, type Profile } from "@/lib/game/profile";
import { RARITIES } from "@/lib/game/rarity";
import {
  CLASS_WEAPONS,
  WEAPON_TYPE_DATA,
  canUseWeapon,
  slotOf,
  type Slot,
} from "@/lib/game/weapons";
import { repo } from "@/lib/useProfile";
import { pieceLine, weaponEffect } from "@/lib/viewModels";

const DOLL_LEFT: Slot[] = ["casco", "peto", "piernas"];
const DOLL_RIGHT: Slot[] = ["arma", "zapatos", "collar"];

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
  const wornElements = (
    ["arma", "casco", "peto", "piernas", "zapatos", "collar"] as const
  ).flatMap((sl) => {
    const w = profile.weapons.find(
      (x) => x.id === profile.equipped[slotKey(c.id, sl)],
    );
    return w ? [w.element] : [];
  });
  const sets = activeSets(wornElements, c.element);
  return (
    <>
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
        <Sprite
          classId={c.classId}
          element={c.element}
          traits={c.traits}
          className="doll-hero"
        />
      </div>

      <div className="text-sm text-[#d9d2ca]">
        {sets.length === 0
          ? "Sets: 2 piezas del mismo elemento dan un bono, 4 uno mayor (×1.5 si es el elemento del héroe)."
          : sets.map((st) => (
              <div key={st.element} className="text-green-300">
                {setLine(st)}
              </div>
            ))}
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
        const title = slot === "arma" ? "Arma" : WEAPON_TYPE_DATA[slot].label;
        return (
          <div key={slot} className="border-t-2 border-[var(--edge)] pt-2">
            <div className="mb-1 font-semibold text-yellow-300">{title}</div>
            {worn ? (
              <div className="flex items-center gap-2">
                <WeaponSprite
                  type={worn.type}
                  element={worn.element}
                  rarity={worn.rarity}
                  className="w-12"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-semibold">{worn.name}</div>
                  <div>{pieceLine(worn)}</div>
                  <div className="text-[#d9d2ca]">{weaponEffect(worn)}</div>
                </div>
                <button
                  className="btn btn-gray text-center"
                  onClick={() => act(() => repo.equip(c.id, null, slot))}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#d9d2ca]">Vacío.</p>
            )}
            {free.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {free.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 text-sm">
                    <WeaponSprite
                      type={w.type}
                      element={w.element}
                      rarity={w.rarity}
                      className="w-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{w.name}</span>
                      <span className="block text-xs text-[#d9d2ca]">
                        {pieceLine(w)} · {weaponEffect(w)}
                      </span>
                    </span>
                    <button
                      className="btn text-center"
                      onClick={() => act(() => repo.equip(c.id, w.id))}
                    >
                      Equipar
                    </button>
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
          </div>
        );
      })}
    </>
  );
}
