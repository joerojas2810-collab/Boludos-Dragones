import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { ElementIcon } from "@/components/ElementIcon";
import { WeaponSprite } from "@/components/WeaponSprite";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "@/lib/game/elements";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import {
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  type WeaponType,
} from "@/lib/game/weapons";

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
      className={`tile-art flex flex-col items-center gap-0.5 px-1 py-1.5 text-center text-xs ${ready ? "tile-ready" : ""} ${ready === false && !selected ? "opacity-50" : ""}`}
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
}: {
  value: WeaponType;
  onChange: (t: WeaponType) => void;
  element: Element;
  rank: RarityId;
  ready?: (t: WeaponType) => boolean;
  sub?: (t: WeaponType) => string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {WEAPON_TYPES.map((t) => {
        const r = ready?.(t);
        return (
          <Tile
            key={t}
            selected={t === value}
            ready={r}
            onClick={() => onChange(t)}
          >
            <WeaponSprite
              type={t}
              element={element}
              rarity={rank}
              className="w-14"
            />
            <span>{WEAPON_TYPE_DATA[t].label}</span>
            {sub && <Sub ok={r}>{sub(t)}</Sub>}
          </Tile>
        );
      })}
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
            <Icon name={`rank_${r}`} className="h-9" />
            <b className="rank-label text-sm" style={{ color: RARITIES[r].color }}>
              {RARITIES[r].label}
            </b>
            {sub && <Sub ok={rd}>{sub(r)}</Sub>}
          </Tile>
        );
      })}
    </div>
  );
}

export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
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
