"use client";

import { iconFor } from "@/lib/art";
import { useState, type ReactNode } from "react";
import { Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { ElementIcon } from "@/components/ElementIcon";
import { Tooltip } from "@/components/Tooltip";
import { CLASSES } from "@/lib/game/characters";
import type { Combatant } from "@/lib/game/combat";
import { ENRAGE_AFTER_OWN_TURN } from "@/lib/game/bossRules";
import {
  elementTip,
  enrageTip,
  exposedTip,
  healCutTip,
  mitigationTip,
  passiveTip,
  penetrationTip,
  guardTip,
  bossBadge,
  resistQuiebreTip,
  shieldTip,
  statTip,
  traitTip,
  weaponTip,
  type Tip,
} from "@/lib/game/explain";
import {
  healCutText,
  mitigationText,
  preparedPenetration,
  statBreakdown,
  statusChanges,
  statusRows,
  statValue,
  type StatusRow,
} from "@/lib/game/statusView";
import type { Stats } from "@/lib/game/characters";
import { TRAITS } from "@/lib/game/traits";
import type { EnemyFamily } from "@/lib/game/worlds";

const FAMILY_LABEL: Record<EnemyFamily, string> = {
  limo: "Slime", diablillo: "Diablillo", arpia: "Arpía", golem: "Gólem", espectro: "Espectro",
};

type Props = {
  c: Combatant;
  foe: Combatant;
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

type Cell = { stat: keyof Stats; label: string; value: string; hot?: boolean };

export function HudCard({
  c,
  foe,
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
    { stat: "atk", label: "ATQ", value: statValue(statBreakdown(c, "atk")), hot: true },
    { stat: "def", label: "DEF", value: statValue(statBreakdown(c, "def")) },
    { stat: "speed", label: "VEL", value: statValue(statBreakdown(c, "speed")) },
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
  const rows = statusRows(c, { you, burnBonus: you ? 0 : (foe.relic?.burnDmg ?? 0) });
  const pen = preparedPenetration(c);
  const bb = bossBadge(c, you ? undefined : foe);
  const cut = healCutText(c);
  const mitig = mitigationText(c);
  // Screen reader: only what changed since the last render (new/changed/gone states, Sobrecarga ready,
  // penetration prepared/spent). Silent on mount and when the combatant is replaced.
  const sig = `${c.char.name}|${rows.map((r) => `${r.key}:${r.stacks}:${r.ready ? 1 : 0}`).join(",")}|${pen?.pct ?? 0}`;
  const [seen, setSeen] = useState<{ sig: string; name: string; rows: StatusRow[]; pen: number; msg: string }>({
    sig, name: c.char.name, rows, pen: pen?.pct ?? 0, msg: "",
  });
  if (seen.sig !== sig)
    setSeen({
      sig, name: c.char.name, rows, pen: pen?.pct ?? 0,
      msg: seen.name === c.char.name ? statusChanges(seen.rows, rows, c.char.name, seen.pen, pen?.pct ?? 0).join(" ") : "",
    });
  const weapon = weaponTip(c);
  const guarded = !!c.guard && c.defending;
  const enraged = !you && c.ownTurns > ENRAGE_AFTER_OWN_TURN;
  const hasStatus =
    (c.shield ?? 0) > 0 ||
    guarded ||
    !!c.exposed ||
    (c.quiebreResist ?? 0) > 0 ||
    !!c.boss ||
    !!cut ||
    !!mitig ||
    rows.length > 0 ||
    !!pen ||
    enraged ||
    !!children;
  return (
    <div
      className={`combat-hud relative min-w-0 rounded-lg border border-[#b9855a]/30 bg-[#0e1620]/80 px-2 py-1.5 shadow-[0_2px_10px_rgb(0_0_0/0.4)] backdrop-blur-[2px] ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {tone === "enemy" && label !== "RIVAL" && (
          <span className="grid h-5 w-5 md:h-7 md:w-7 shrink-0 place-items-center rounded-full border border-[#b9855a] bg-[#b9855a]/30 text-xs md:text-sm font-bold text-[#f6ead6]">
            {label.slice(1)}
          </span>
        )}
        <span className={`truncate font-[family-name:var(--font-title)] ${compact ? "text-[15px]" : "text-[17px]"} font-bold leading-tight text-[#f6ead6]`}>{c.char.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="text-[13px] leading-5 text-[#9fb0c0] hover:text-white"
            aria-expanded={open}
            aria-label="Detalles"
            onClick={(e) => {
              e.stopPropagation(); // the card lives inside a clickable target slot: Info must not select it
              setOpen(!open);
            }}
            onKeyDown={(e) => e.stopPropagation()} // Enter/Space would otherwise reach the target radio's handler
          >
            <span className="md:hidden">ⓘ</span>
            <span className="max-md:hidden">{open ? "Info ▴" : "Info ▾"}</span>
          </button>
          <ElementIcon
            element={c.char.element}
            className="h-5"
            tip={elementTip(c.char.element, c, foe, you)}
          />
        </span>
      </div>
      <div className="mb-1 flex items-center gap-2 text-[11px] leading-4 text-[#9fb0c0]">
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
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              c.hp / s.hp <= 0.3
                ? "bg-gradient-to-r from-[#b53a2c] to-[#e8715f]"
                : tone === "enemy"
                  ? "bg-gradient-to-r from-[#a8322a] to-[#d9604f]"
                  : "bg-gradient-to-r from-[#2f8f46] to-[#6fd18a]"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (c.hp / s.hp) * 100))}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[11px] leading-3 tabular-nums text-[#aebccb]">
          <span>PV</span>
          <span>
            {Math.round(c.hp)} / {Math.round(s.hp)}
          </span>
        </div>
      </Tooltip>
      {!you && c.aguante !== undefined && c.aguanteMax !== undefined && (
        <div
          className="mt-1"
          role="group"
          aria-label={`Aguante: ${Math.max(0, Math.round(c.aguante))} de ${Math.round(c.aguanteMax)}`}
        >
          {(() => {
            const current = Math.max(0, c.aguante);
            const max = Math.max(1, c.aguanteMax);
            const nearBreak = current > 0 && current / max <= 0.25;
            return (
              <>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] leading-3 text-[#e4c98d]">
                  <span className="font-semibold"><span aria-hidden="true">◆ </span>Aguante</span>
                  <span className="tabular-nums">{Math.round(current)} / {Math.round(max)}</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-black/65 ring-1 ring-white/10"
                  role="progressbar"
                  aria-label={`Aguante de ${c.char.name}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(max)}
                  aria-valuenow={Math.round(current)}
                >
                  <div
                    className={`h-full rounded-full motion-reduce:transition-none ${nearBreak ? "bg-gradient-to-r from-red-700 to-amber-300" : "bg-gradient-to-r from-[#855329] to-[#e8b65a]"}`}
                    style={{ width: `${Math.max(0, Math.min(100, (current / max) * 100))}%` }}
                  />
                </div>
                {nearBreak && (
                  <div className="mt-0.5 text-right text-[10px] font-semibold leading-3 text-amber-200" role="status">
                    ¡Quiebre cerca!
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
      {hasStatus && (
        <div className="mt-1 flex flex-wrap gap-1">
          {(c.shield ?? 0) > 0 && (
            <Chip tip={shieldTip(c, you)} tone="info">
              <span aria-hidden="true">▣ </span>Escudo {Math.round(c.shield ?? 0)}
            </Chip>
          )}
          {guarded && (
            <Chip tip={guardTip(c)} tone="heal">
              <span aria-hidden="true">◧ </span>Guardia perfecta
            </Chip>
          )}
          {rows.map((r) => (
            <span
              key={r.key}
              role="img"
              aria-label={r.aria}
              className={`chip ${r.negative ? "text-red-300" : "text-green-300"} ${r.ready ? "ring-1 ring-yellow-300" : ""}`}
            >
              <span aria-hidden="true">{r.negative ? "▼" : "▲"} </span>
              {compact ? `${r.short} ${r.stacks}/${r.max}${r.ready ? " ✓" : ""}` : r.text}
            </span>
          ))}
          {pen && (
            <Chip tip={penetrationTip(c)} tone="gold">
              <span aria-hidden="true">◆ </span>{compact ? `Penetr. ${Math.round(pen.pct * 100)}%` : pen.text}
            </Chip>
          )}
          {c.exposed && (
            <Chip tip={exposedTip()} tone="danger">
              <span aria-hidden="true">◇ </span>Expuesto
            </Chip>
          )}
          {(c.quiebreResist ?? 0) > 0 && (
            <Chip tip={resistQuiebreTip(c.quiebreResist ?? 0)} tone="info">
              <span aria-hidden="true">⛨ </span>Resiste Quiebre {c.quiebreResist}
            </Chip>
          )}
          {bb && (
            <Chip tip={bb.tip} tone="danger" className={bb.urgent ? "ring-1 ring-amber-300" : ""}>
              {bb.urgent && <span aria-hidden="true">⚠ </span>}
              {bb.label}
            </Chip>
          )}
          {cut && (
            <Chip tip={healCutTip()} tone="danger">
              {compact ? `Curas ½ · ${c.healCut}t` : cut}
            </Chip>
          )}
          {mitig && (
            <Chip tip={mitigationTip(c)} tone="info">
              <span aria-hidden="true">↷ </span>{compact ? `Mitig. −${Math.round((c.nextHitReduction ?? 0) * 100)}%` : mitig}
            </Chip>
          )}
          {enraged && (
            <Chip tip={enrageTip()} tone="danger">
              Enfurecido
            </Chip>
          )}
          {children}
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">{seen.msg}</div>
      {footer}
      {open && (
        <div
          className="pixel-frame absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-64 max-w-[80vw] overflow-y-auto p-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation(); // keys inside the detail never reach the target radio (Enter/Space/arrows)
            if (e.key === "Escape") setOpen(false);
          }}
        >
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
          </div>
          {(rows.length > 0 || pen || c.exposed || bb) && (
            <details className="mt-1.5 rounded border border-white/15 px-1.5 py-1 text-[12px] leading-4 text-[#d9d2ca]">
              <summary className="cursor-pointer select-none font-semibold text-[#f1d5a4]">
                Estados ({rows.length + (pen ? 1 : 0) + (c.exposed ? 1 : 0) + (bb ? 1 : 0)})
              </summary>
              <ul className="mt-1 space-y-1">
                {rows.map((r) => (
                  <li key={r.key}>
                    <b className={r.negative ? "text-red-300" : "text-green-300"}>{r.text}</b>
                    <span className="block">{r.negative ? "Perjuicio" : "Beneficio"}: {r.effect}.</span>
                  </li>
                ))}
                {pen && (
                  <li>
                    <b className="text-yellow-300">{pen.text}</b>
                    <span className="block">{pen.condition}</span>
                  </li>
                )}
                {c.exposed && (
                  <li>
                    <b className="text-red-300">Expuesto</b>
                    <span className="block">{exposedTip().lines[0]}</span>
                  </li>
                )}
                {bb && (
                  <li>
                    <b className={bb.urgent ? "text-amber-300" : "text-red-300"}>{bb.label}</b>
                    {bb.tip.lines.map((l, i) => (
                      <span key={i} className="block">{l}</span>
                    ))}
                  </li>
                )}
              </ul>
            </details>
          )}
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
