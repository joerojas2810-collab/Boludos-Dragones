"use client";

import { iconFor } from "@/lib/art";
import { useState, type ReactNode } from "react";
import { Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { ElementIcon } from "@/components/ElementIcon";
import { HealthBar } from "@/components/HealthBar";
import { Tooltip } from "@/components/Tooltip";
import { CLASSES } from "@/lib/game/characters";
import { ENRAGE_AFTER_TURN, type Combatant } from "@/lib/game/combat";
import {
  elementTip,
  enrageTip,
  freeHitsTip,
  passiveTip,
  reflectTip,
  riposteTip,
  shieldTip,
  skillTip,
  statTip,
  traitTip,
  weaponTip,
  type Tip,
} from "@/lib/game/explain";
import type { Stats } from "@/lib/game/characters";
import { SKILLS } from "@/lib/game/skills";
import { TRAITS } from "@/lib/game/traits";

type Props = {
  c: Combatant;
  foe: Combatant;
  turn: number;
  label: string;
  tone: "enemy" | "player";
  className: string;
  extra: string;
  extraTip?: Tip;
  inRun?: boolean;
  compact?: boolean; // group fights: fewer stats and no trait chips
  footer?: ReactNode; // row under the health bar (announced actions)
  children?: ReactNode; // extra chips (enemy modifiers, ...)
};

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
const n1 = (v: number) => `${+v.toFixed(1)}`;

type Cell = { stat: keyof Stats; label: string; value: string; hot?: boolean };

export function HudCard({
  c,
  foe,
  turn,
  label,
  tone,
  className,
  extra,
  extraTip,
  inRun,
  compact,
  footer,
  children,
}: Props) {
  const s = c.char.stats;
  const you = tone === "player";
  const cells: Cell[] = [
    { stat: "atk", label: "ATQ", value: n1(s.atk), hot: true },
    { stat: "def", label: "DEF", value: n1(s.def) },
    { stat: "speed", label: "VEL", value: n1(s.speed) },
    ...(compact
      ? []
      : [
          {
            stat: "crit" as const,
            label: "CRIT",
            value: pct(s.crit),
            hot: true,
          },
          { stat: "dodge" as const, label: "ESQ", value: pct(s.dodge) },
        ]),
  ];
  if (!compact && s.accuracy)
    cells.push({ stat: "accuracy", label: "PRE", value: pct(s.accuracy) });
  if (!compact && s.flee)
    cells.push({ stat: "flee", label: "HUI", value: pct(s.flee) });
  const [open, setOpen] = useState(false);
  const ctx = { foe, you, inRun };
  const weapon = weaponTip(c);
  const hasStatus =
    (c.shield ?? 0) > 0 ||
    c.riposte ||
    (c.reflect ?? 0) > 0 ||
    (c.freeHits ?? 0) > 0 ||
    (!you && turn > ENRAGE_AFTER_TURN) ||
    !!children;
  return (
    <div
      className={`relative min-w-0 rounded-sm border-2 border-[var(--edge)] bg-[#1b1410]/80 p-1.5 shadow-lg ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`px-1.5 text-[13px] font-semibold leading-5 text-black ${tone === "enemy" ? "bg-red-400" : "bg-green-400"}`}
        >
          {label}
        </span>
        <span className="truncate text-base font-semibold">{c.char.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="text-[13px] leading-5 text-[#d9d2ca] hover:text-white"
            aria-expanded={open}
            aria-label="Detalles"
            onClick={() => setOpen(!open)}
          >
            {open ? "Info ▴" : "Info ▾"}
          </button>
          <ElementIcon
            element={c.char.element}
            className="h-6"
            tip={elementTip(c.char.element, c, foe, you)}
          />
        </span>
      </div>
      <div className="mb-0.5 flex items-center gap-2 text-[13px] leading-5 text-[#d9d2ca]">
        <span className="truncate">{CLASSES[c.char.classId].name}</span>
        <Tooltip tip={extraTip} className="ml-auto">
          <span
            className={`whitespace-nowrap text-yellow-300 ${extraTip ? "cursor-help" : ""}`}
          >
            {extra}
          </span>
        </Tooltip>
      </div>
      <Tooltip tip={statTip("hp", c, ctx)} className="block">
        <HealthBar
          hp={c.hp}
          max={s.hp}
          color={tone === "enemy" ? "#c0392b" : "#3f9d44"}
        />
      </Tooltip>
      {hasStatus && (
        <div className="mt-1 flex flex-wrap gap-1">
          {(c.shield ?? 0) > 0 && (
            <Chip tip={shieldTip(c, you)} tone="info">
              Escudo {Math.round(c.shield ?? 0)}
            </Chip>
          )}
          {c.riposte && (
            <Chip tip={riposteTip()} tone="heal">
              Guardia perfecta
            </Chip>
          )}
          {(c.reflect ?? 0) > 0 && (
            <Chip tip={reflectTip(c)} tone="info">
              Contraataque
            </Chip>
          )}
          {(c.freeHits ?? 0) > 0 && (
            <Chip tip={freeHitsTip(c)} tone="passive">
              Esquiva ×{c.freeHits}
            </Chip>
          )}
          {!you && turn > ENRAGE_AFTER_TURN && (
            <Chip tip={enrageTip()} tone="danger">
              Enfurecido
            </Chip>
          )}
          {children}
        </div>
      )}
      {footer}
      {open && (
        <div className="pixel-frame absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] p-2">
          <div className="flex flex-wrap gap-1">
            <Chip
              tip={passiveTip(c, foe, you)}
              tone="passive"
              icon={iconFor("passive", CLASSES[c.char.classId].passive.id)}
            >
              {CLASSES[c.char.classId].passive.name}
            </Chip>
            {!compact &&
              c.char.traits.map((id) => (
                <Chip
                  key={id}
                  tip={traitTip(id, c.char)}
                  tone="trait"
                  icon={iconFor("trait", id)}
                >
                  {TRAITS[id].name}
                </Chip>
              ))}
            {weapon && (
              <Chip tip={weapon} tone="gold">
                Arma
              </Chip>
            )}
            {you && c.char.skill && (
              <Chip tip={skillTip(c, foe)} tone="gold">
                {SKILLS[c.char.skill].name}
              </Chip>
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2">
            {cells.map((cell) => (
              <Tooltip
                key={cell.stat}
                tip={statTip(cell.stat, c, ctx)}
                className="block"
              >
                <span className="stat-cell">
                  <span className="stat-k">
                    <Icon
                      name={iconFor("stat", cell.stat) ?? ""}
                      className="mr-0.5 h-3.5"
                    />
                    {cell.label}
                  </span>
                  <span
                    className={`stat-v ${cell.hot ? "text-orange-300" : "text-[var(--text)]"}`}
                  >
                    {cell.value}
                  </span>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
