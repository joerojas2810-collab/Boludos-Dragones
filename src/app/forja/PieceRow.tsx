"use client";

import { ElementIcon } from "@/components/ElementIcon";
import { Tooltip } from "@/components/Tooltip";
import { WeaponSprite } from "@/components/WeaponSprite";
import { RARITIES } from "@/lib/game/rarity";
import type { OwnedWeapon } from "@/lib/game/profile";
import { WEAPON_TYPE_DATA } from "@/lib/game/weapons";
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
