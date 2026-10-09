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
  bossBadge,
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
import type { EnemyFamily } from "@/lib/game/worlds";

const FAMILY_LABEL: Record<EnemyFamily, string> = {
  limo: "Limo", diablillo: "Diablillo", arpia: "Arpía", golem: "Gólem", espectro: "Espectro",
};

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
        ]),
  ];
  if (!compact && s.resist)
    cells.push({ stat: "resist", label: "RES", value: pct(s.resist) });
  if (!compact && s.accuracy)
    cells.push({ stat: "accuracy", label: "PRE", value: pct(s.accuracy) });
  const [open, setOpen] = useState(false);
  const ctx = { foe, you, inRun };
  const weapon = weaponTip(c);
  const hasStatus =
    (c.shield ?? 0) > 0 ||
    c.riposte ||
    !!c.boss ||
    (c.healCut ?? 0) > 0 ||
    (c.reflect ?? 0) > 0 ||
    (c.freeHits ?? 0) > 0 ||
    (!you && turn > ENRAGE_AFTER_TURN) ||
    !!children;
  return (
    <div
      className={`combat-hud relative min-w-0 rounded-md border border-[#b9855a]/55 bg-[#141d28]/90 p-2 shadow-[0_4px_14px_rgb(0_0_0/0.45)] ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {tone === "enemy" && label !== "RIVAL" && (
          <span className="grid h-5 w-5 md:h-7 md:w-7 shrink-0 place-items-center rounded-full border border-[#b9855a] bg-[#b9855a]/30 text-xs md:text-sm font-bold text-[#f6ead6]">
            {label.slice(1)}
          </span>
        )}
        <span className={`truncate font-[family-name:var(--font-title)] ${compact ? "text-lg" : "text-xl"} font-bold leading-tight text-[#f6ead6]`}>{c.char.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="text-[13px] leading-5 text-[#9fb0c0] hover:text-white"
            aria-expanded={open}
            aria-label="Detalles"
            onClick={() => setOpen(!open)}
          >
            <span className="md:hidden">ⓘ</span>
            <span className="max-md:hidden">{open ? "Info ▴" : "Info ▾"}</span>
          </button>
          <ElementIcon
            element={c.char.element}
            className="h-6"
            tip={elementTip(c.char.element, c, foe, you)}
          />
        </span>
      </div>
      <div className="mb-1 flex items-center gap-2 text-[13px] leading-5 text-[#9fb0c0]">
        <span className="truncate">{!you && c.char.family ? FAMILY_LABEL[c.char.family] : CLASSES[c.char.classId].name}</span>
        <Tooltip tip={extraTip} className="ml-auto">
          <span
            className={`whitespace-nowrap text-[#e8d9b8] ${extraTip ? "" : ""}`}
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
            <Chip tip={riposteTip(c)} tone="heal">
              Guardia perfecta
            </Chip>
          )}
          {(() => {
            const bb = bossBadge(c);
            return bb ? (
              <Chip tip={bb.tip} tone="danger">
                {bb.label}
              </Chip>
            ) : null;
          })()}
          {(c.healCut ?? 0) > 0 && (
            <Chip
              tip={{ title: "Curas a la mitad", kind: "info", lines: ["El ritual marchito reduce todas tus curas durante unas rondas."] }}
              tone="danger"
            >
              Curas ½
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
                  tip={traitTip(id)}
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
