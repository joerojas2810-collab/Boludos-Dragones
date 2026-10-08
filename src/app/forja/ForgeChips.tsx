import type { ReactNode } from "react";
import { RankIcon } from "@/components/RankIcon";
import { ElementIcon } from "@/components/ElementIcon";
import { Tooltip } from "@/components/Tooltip";
import { WeaponSprite } from "@/components/WeaponSprite";
import { typeTip } from "@/lib/viewModels";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "@/lib/game/elements";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import {
  GEAR_TYPES,
  HAND_TYPES,
  isGearType,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type WeaponType,
} from "@/lib/game/weapons";

export type Category = "arma" | "equipo";
export const catOf = (t: WeaponType): Category =>
  isGearType(t) ? "equipo" : "arma";
export const typesOf = (c: Category): readonly WeaponType[] =>
  c === "equipo" ? GEAR_TYPES : HAND_TYPES;

// ready: true = green glow, false = dimmed, undefined = neutral (no availability meaning).
function Tile({
  selected,
  ready,
  onClick,
  children,
}: {
  selected: boolean;
  ready?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`tile-art flex flex-col items-center gap-0.5 px-1 py-1.5 text-center text-xs ${ready ? "tile-ready" : ""} ${ready === false && !selected ? "opacity-70" : ""}`}
    >
      {children}
    </button>
  );
}

const Sub = ({ ok, children }: { ok?: boolean; children: ReactNode }) => (
  <span
    className={
      ok === undefined ? "opacity-80" : ok ? "text-green-300" : "text-red-300"
    }
  >
    {children}
  </span>
);

export function TypePicker({
  value,
  onChange,
  element,
  rank,
  ready,
  sub,
  types = WEAPON_TYPES,
}: {
  value: WeaponType;
  onChange: (t: WeaponType) => void;
  element: Element;
  rank: RarityId;
  ready?: (t: WeaponType) => boolean;
  sub?: (t: WeaponType) => string;
  types?: readonly WeaponType[];
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {types.map((t) => {
        const r = ready?.(t);
        return (
          <Tooltip
            key={t}
            tip={typeTip(t, rank, element)}
            className="block [&>*]:h-full [&>*]:w-full"
          >
          <Tile
            selected={t === value}
            ready={r}
            onClick={() => onChange(t)}
          >
            <span className="flex h-24 w-24 items-center justify-center">
              <WeaponSprite
                type={t}
                element={element}
                rarity={rank}
                className="w-24"
              />
            </span>
            <span>{WEAPON_TYPE_DATA[t].label}</span>
            {sub && <Sub ok={r}>{sub(t)}</Sub>}
          </Tile>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function CategoryPicker({
  value,
  onChange,
  element,
  rank,
}: {
  value: Category;
  onChange: (c: Category) => void;
  element: Element;
  rank: RarityId;
}) {
  const opts: [Category, WeaponType, string][] = [
    ["arma", "espada", "Arma"],
    ["equipo", "casco", "Equipo"],
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {opts.map(([c, t, label]) => (
        <Tile key={c} selected={c === value} onClick={() => onChange(c)}>
          <span className="flex h-24 w-24 items-center justify-center">
            <WeaponSprite
              type={t}
              element={element}
              rarity={rank}
              className="w-24"
            />
          </span>
          <span>{label}</span>
        </Tile>
      ))}
    </div>
  );
}

export function ElementPicker({
  value,
  onChange,
  ready,
  sub,
}: {
  value: Element;
  onChange: (e: Element) => void;
  ready?: (e: Element) => boolean;
  sub?: (e: Element) => string;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ELEMENTS.map((el) => {
        const r = ready?.(el);
        return (
          <Tile
            key={el}
            selected={el === value}
            ready={r}
            onClick={() => onChange(el)}
          >
            <ElementIcon element={el} bare className="h-9" />
            <span>{ELEMENT_LABEL[el]}</span>
            {sub && <Sub ok={r}>{sub(el)}</Sub>}
          </Tile>
        );
      })}
    </div>
  );
}

export function RankPicker({
  value,
  onChange,
  max,
  ready,
  sub,
}: {
  value: RarityId;
  onChange: (r: RarityId) => void;
  max: RarityId;
  ready?: (r: RarityId) => boolean;
  sub?: (r: RarityId) => string;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
      {RARITY_IDS.slice(0, RARITY_IDS.indexOf(max) + 1).map((r) => {
        const rd = ready?.(r);
        return (
          <Tile
            key={r}
            selected={r === value}
            ready={rd}
            onClick={() => onChange(r)}
          >
            <RankIcon rank={r} className="h-10 w-10" />
            <b
              className="rank-label text-sm"
              style={{ color: RARITIES[r].color }}
            >
              {RARITIES[r].label}
            </b>
            {sub && <Sub ok={rd}>{sub(r)}</Sub>}
          </Tile>
        );
      })}
    </div>
  );
}

// With summary + onOpen the step folds into one line once it is not the open one
// (same look as the "Ir a lo que puedo forjar" button); click to reopen it.
export function Step({
  n,
  title,
  children,
  summary,
  open = true,
  onOpen,
}: {
  n: number;
  title: string;
  children: ReactNode;
  summary?: ReactNode;
  open?: boolean;
  onOpen?: () => void;
}) {
  if (!open && onOpen)
    return (
      <button
        type="button"
        className="btn btn-gray flex w-full items-center justify-between gap-2 !min-h-8 text-sm"
        onClick={onOpen}
      >
        <span>
          {n}. {title}
        </span>
        <span className="flex items-center gap-1 text-yellow-300">
          {summary} ▾
        </span>
      </button>
    );
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-yellow-300">
        {n}. {title}
      </h4>
      {children}
    </div>
  );
}

export function ResultCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-2 border-yellow-300/60 bg-yellow-300/10 p-2 text-sm">
      <span className="font-semibold text-yellow-300">Obtienes:</span>
      {children}
    </div>
  );
}
