import type { ReactNode } from "react";
import { Chip } from "@/components/Chip";
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
  const ctx = { foe, you, inRun };
  const weapon = weaponTip(c);
  return (
    <div className={`pixel-frame min-w-0 p-2 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`px-1.5 text-[13px] font-semibold leading-5 text-black ${tone === "enemy" ? "bg-red-400" : "bg-green-400"}`}
        >
          {label}
        </span>
        <span className="truncate text-base font-semibold">{c.char.name}</span>
        <span className="ml-auto">
          <ElementIcon
            element={c.char.element}
            className="h-6"
            tip={elementTip(c.char.element, c, foe, you)}
          />
        </span>
      </div>
      <div
        className={`mb-1 flex items-center gap-2 text-[13px] leading-5 text-[#d9d2ca] ${compact ? "max-md:flex md:[@media(max-height:700px)]:hidden" : ""}`}
      >
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
      {footer}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Chip tip={passiveTip(c, foe, you)} tone="passive">
          {CLASSES[c.char.classId].passive.name}
        </Chip>
        {!compact &&
          c.char.traits.map((id) => (
            <Chip key={id} tip={traitTip(id, c.char)} tone="trait">
              {TRAITS[id].name}
            </Chip>
          ))}
        {weapon && (
          <Chip tip={weapon} tone="gold">
            Arma
          </Chip>
        )}
        {(c.shield ?? 0) > 0 && (
          <Chip tip={shieldTip(c, you)} tone="info">
            Escudo {Math.round(c.shield ?? 0)}
          </Chip>
        )}
        {you && c.char.skill && (
          <Chip tip={skillTip(c, foe)} tone="gold">
            {SKILLS[c.char.skill].name}
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
      <div
        className={`hud-stats mt-1.5 grid gap-x-2 ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 lg:grid-cols-3 lg:[@media(max-height:760px)]:grid-cols-4"}`}
      >
        {cells.map((cell) => (
          <Tooltip
            key={cell.stat}
            tip={statTip(cell.stat, c, ctx)}
            className="block"
          >
            <span className="stat-cell">
              <span className="stat-k">{cell.label}</span>
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
  );
}
