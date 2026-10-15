import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { Tooltip } from "@/components/Tooltip";
import { basicIcon, SKILL_FX } from "@/lib/art/skillFx";
import {
  equippedSkills,
  livingEnemies,
  projectTurns,
  skillBlockReason,
  strongPending,
  TURN_CAP,
  TURN_WARN,
  type Action,
  type Battle,
} from "@/lib/game/combat";
import { RESOURCE_MAX, RESOURCE_NAME, SKILLS, type SkillDef, type SkillId } from "@/lib/game/skills";
import {
  attackTip,
  autoTip,
  consumeHint,
  defendTip,
  intentInfo,
  intentTip,
  queueTip,
  skillEffects,
  skillMeta,
  type Tip,
} from "@/lib/game/explain";
import { preparedPenetration, previewDamage } from "@/lib/game/statusView";

type Props = {
  b: Battle;
  target: number; // index among the LIVING enemies (what step() expects)
  onAct: (a: Action, target: number) => void;
  // Quick resolve (easy fights in runs): why it is blocked, or null if allowed.
  auto?: { reason: string | null; onAuto: () => void };
  side?: boolean; // vertical list in a side column (desktop)
  float?: boolean; // translucent panel over a full-screen scene (run fights)
  bar?: boolean; // wide screens use the full command rail; smaller screens keep the compact panel
  children?: ReactNode; // shown below the result once the fight is over
};

// Class resource: three marks, filled = available. Shape differs (◆/◇) so it never relies on colour.
function ResourceMeter({ b }: { b: Battle }) {
  const c = b.player;
  const name = RESOURCE_NAME[c.char.classId];
  const res = Math.min(RESOURCE_MAX, c.res ?? 0);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      role="img"
      aria-label={`${name}: ${res} de ${RESOURCE_MAX}`}
    >
      <span className="text-xs text-[#d9d2ca]">{name}</span>
      <span aria-hidden="true" className="tracking-wider text-yellow-300">
        {Array.from({ length: RESOURCE_MAX }, (_, i) => (i < res ? "◆" : "◇")).join("")}
      </span>
      <span className="text-xs tabular-nums text-yellow-200">{res}/{RESOURCE_MAX}</span>
    </span>
  );
}

// Ruptura consumed: the next attack ignores part of the DEF. Persistent, with its exact expiry in the tooltip.
function PenetrationNote({ b }: { b: Battle }) {
  const pen = preparedPenetration(b.player);
  if (!pen) return null;
  return (
    <span className="block text-[11px] font-semibold leading-tight text-yellow-200" title={pen.condition}>
      <span aria-hidden="true">◆ </span>{pen.text}
    </span>
  );
}

// Next 6 turns. Only the first is certain; the rest are estimates (dashed, with "≈").
function TurnQueue({ b, desktop = false }: { b: Battle; desktop?: boolean }) {
  const turns = projectTurns(b, 6);
  const seen = new Set<number>();
  // Turn order moved by an effect of the last step (consume, delay, advance): that slot pulses and carries a mark.
  const shifted = new Map<number, number>();
  for (const ev of b.cev) if (ev.type === "progressChanged" && ev.value) shifted.set(ev.actor, ev.value);
  return (
    <section
      aria-label="Orden de turnos"
      className={desktop ? "min-w-0" : "rounded-md border border-[#b9855a]/30 bg-black/25 px-2 py-1.5"}
    >
      {!desktop && (
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] leading-tight text-[#d9d2ca]">
          <Tooltip tip={queueTip(b)}>
            <span className="font-semibold uppercase tracking-wide text-[#f1d5a4]">Orden de turnos</span>
          </Tooltip>
          <span className="shrink-0">Seguro · ≈ estimado</span>
        </div>
      )}
      <ol
        aria-label="Próximos 6 turnos"
        className={desktop ? "cmd-order-list" : "flex min-w-0 gap-1.5 overflow-x-auto pb-1"}
      >
        {turns.map((t, i) => {
          const first = !seen.has(t.id);
          seen.add(t.id);
          const base = `${desktop ? "cmd-order-slot" : "flex min-h-10 min-w-[4.5rem] shrink-0 flex-col justify-center rounded border px-1.5 py-1"} text-center`;
          const certain = t.certain ? "border-solid" : "border-dashed";
          const moved = first ? shifted.get(t.id) : undefined;
          const pulse = moved ? " ring-2 ring-amber-300 motion-safe:animate-[pulse_0.6s_ease-in-out_3]" : "";
          const mark = moved ? (moved < 0 ? "⏳ " : "» ") : "";
          if (t.id === 0)
            return (
              <li
                key={`q${i}`}
                aria-label={`${t.certain ? "Ahora" : "Estimado"}: tu turno`}
                className={`${base} ${certain} ${t.certain ? "border-yellow-300 bg-yellow-300/15 text-yellow-100" : "border-emerald-700/70 bg-emerald-950/50 text-emerald-100"}${pulse}`}
              >
                <span className="text-xs font-bold leading-tight">{mark}TÚ</span>
                <span className="text-[10px] leading-tight">{t.certain ? "Ahora" : "≈"}</span>
              </li>
            );
          const idx = t.id - 1;
          const e = b.enemies[idx];
          const known = first && !!e.intent;
          const info = known ? intentInfo(e.intent!, b, idx) : null;
          const label = `${t.certain ? "Seguro" : "Estimado"}: ${e.char.name}${info ? `, ${info.name}, ${info.cancelLabel}` : ""}`;
          return (
            <li
              key={`q${i}`}
              aria-label={label}
              className={`${base} ${certain} ${info?.strong ? "border-rose-400/80 bg-rose-950/70 text-rose-100" : "border-red-900/70 bg-red-950/55 text-red-100"}${pulse}`}
            >
              <span className="block min-w-0">
                <span className="block text-xs font-bold leading-tight">{mark}R{idx + 1}{t.certain ? "" : " ≈"}</span>
                <span className="block max-w-24 truncate text-[10px] leading-tight" title={label}>
                  {info ? <><span aria-hidden="true">{info.glyph} </span>{info.name}</> : "…"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Every living enemy's committed intent with effect, counterplay and whether it can be interrupted.
function IntentStrip({ b }: { b: Battle }) {
  const alive = livingEnemies(b).filter((i) => b.enemies[i].intent);
  if (!alive.length) return null;
  return (
    <ul aria-label="Intenciones de los rivales" className="grid min-w-0 gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {alive.map((i) => {
        const e = b.enemies[i];
        const info = intentInfo(e.intent!, b, i);
        return (
          <li
            key={i}
            className={`min-w-0 rounded border px-1.5 py-1 text-[11px] leading-snug ${info.strong ? "border-rose-400/70 bg-rose-950/60 text-rose-50" : "border-red-900/60 bg-black/35 text-[#f2e6d7]"}`}
          >
            <Tooltip tip={intentTip(e.intent!, b, i)} className="block min-w-0">
              <span className="flex min-w-0 items-baseline gap-1">
                <span aria-hidden="true" className="font-bold">{info.glyph}</span>
                <span className="min-w-0 truncate font-bold">
                  {b.enemies.length > 1 ? `R${i + 1} ` : ""}{info.name}
                </span>
                <span className={`ml-auto shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide ${info.cancel ? "bg-amber-300/20 text-amber-200" : "bg-white/10 text-[#d9d2ca]"}`}>
                  {info.cancelLabel}
                </span>
              </span>
              <span className="block break-words [overflow-wrap:anywhere]">{info.effect}</span>
              <span className="block break-words text-[#f1d5a4] [overflow-wrap:anywhere]">{info.counter}</span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton({
  tip,
  disabled,
  onClick,
  title,
  sub,
  hot,
  icon,
  left,
  wide,
  chip,
  meta,
  disabledReason,
}: {
  tip: Tip;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  hot?: boolean; // highlighted (perfect guard available)
  icon?: string; // painted skill icon name (iconFor)
  left?: boolean; // left-aligned content (side column)
  wide?: boolean; // spans the whole row of the actions grid
  chip?: boolean; // slim command-bar chip (desktop bar)
  meta?: string;
  disabledReason?: string;
}) {
  const compactReason = disabledReason?.startsWith("En enfriamiento")
    ? disabledReason.replace("En enfriamiento", "En espera")
    : disabledReason;
  if (chip)
    return (
      <Tooltip tip={tip} className="block min-w-0">
        <button className="cmd-chip !h-auto min-h-[5.25rem] w-full flex-col gap-0.5 px-1.5 py-1 text-center disabled:!opacity-80" data-hot={hot ? "" : undefined} disabled={disabled} onClick={onClick}>
          <span className="flex min-w-0 items-center justify-center gap-1">
            {icon && <Icon name={icon} className="h-6 shrink-0" />}
            <span className="min-w-0 break-words text-[13px] font-bold leading-tight">{title}</span>
          </span>
          <span className={`block max-w-full break-words text-xs leading-tight ${disabled ? "text-[#fff1d0]" : "text-[#d9d2ca]"}`} title={sub}>{sub}</span>
          {meta && <span className="block max-w-full border-t border-white/15 pt-0.5 text-[11px] leading-tight text-[#d9d2ca]" title={meta}>{meta}</span>}
          {compactReason && <span className="block max-w-full break-words text-[10px] leading-tight text-amber-200" title={disabledReason}>{compactReason}</span>}
        </button>
      </Tooltip>
    );
  return (
    <Tooltip
      tip={tip}
      className={wide ? "col-span-full block min-w-0" : "block min-w-0"}
      placement={left ? "side" : "auto"}
    >
      <button
        className={`btn h-full w-full min-w-0 motion-safe:transition-transform motion-safe:active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none max-md:![border-width:6px_10px] max-md:![border-image-width:6px_10px] max-md:!px-1 max-md:!py-1 ${left ? "min-h-11 !px-2 !py-1" : "min-h-14 max-md:min-h-[5.25rem] md:[@media(max-height:700px)]:min-h-12 md:[@media(max-height:620px)]:min-h-10 md:[@media(max-height:620px)]:!py-1"} ${hot ? "!border-yellow-300" : ""}`}
        disabled={disabled}
        onClick={onClick}
        aria-label={`${title}. ${sub}${meta ? `. ${meta}` : ""}${disabledReason ? `. ${disabledReason}` : ""}`}
      >
        <div
          className={`flex min-w-0 items-center gap-2 max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:text-center ${left ? "justify-start text-left" : "justify-center"}`}
        >
          {icon && (
            <Icon
              name={icon}
              className={`shrink-0 max-md:h-6 ${left ? "h-6" : "h-8"}`}
            />
          )}
          <div className="min-w-0">
            <div
              className={`break-words font-semibold leading-tight [overflow-wrap:anywhere] max-md:text-[13px] ${left ? "text-sm" : "text-base"} ${disabled ? "max-md:!text-[#fff3d6]" : ""}`}
            >
              {title}
            </div>
            <div
              className={`whitespace-normal break-words leading-snug [overflow-wrap:anywhere] max-md:text-[11px] max-md:leading-tight ${disabled ? "!text-[#fff3d6]" : "!text-[#24382f]"} ${left ? "text-xs" : "text-sm"}`}
            >
              {sub}
            </div>
            {meta && <div className={`whitespace-normal break-words !text-[11px] leading-tight [overflow-wrap:anywhere] ${disabled ? "!text-[#fff3d6]" : "!text-[#24382f]"}`}>{meta}</div>}
            {disabledReason && <div className="whitespace-normal break-words text-[11px] leading-tight text-amber-100 [overflow-wrap:anywhere]" title={disabledReason}>{disabledReason}</div>}
          </div>
        </div>
      </button>
    </Tooltip>
  );
}

export function ActionPanel({
  b,
  target,
  onAct,
  auto,
  side,
  float,
  bar,
  children,
}: Props) {
  const over = b.status !== "ongoing";
  const alive = livingEnemies(b);
  const foe = b.enemies[alive[target] ?? alive[0] ?? 0];
  const perfect = strongPending(b);
  const p = b.player;
  const resName = RESOURCE_NAME[p.char.classId];

  const basicAction = (chip = false) => (
    <ActionButton
      chip={chip}
      left={float}
      tip={attackTip(p, "attack1", foe)}
      onClick={() => onAct("attack1", target)}
      icon={basicIcon(p.char.classId, p.char.weapon?.type)}
      title="Básico"
      sub={`~${previewDamage(p, foe, "attack1")} daño`}
      meta={`Sin costo · +1 ${resName}${alive.length > 1 && !chip ? ` · Objetivo: ${foe.char.name}` : ""}`}
    />
  );

  const preview = (def: SkillDef): string => {
    if (def.power <= 0) return skillEffects(def).slice(0, 2).join(" · ") || "Efecto propio";
    let dmg = previewDamage(p, foe, def.id);
    if (def.exposedPower && foe.exposed) dmg = Math.round((dmg * def.exposedPower) / def.power);
    // Aguante: the share of the life damage that goes to the secondary bar decides a Quiebre.
    const breaks = foe.aguante !== undefined && foe.aguante > 0 && Math.min(dmg, foe.hp) * def.aguante >= foe.aguante;
    return def.target === "all"
      ? `~${dmg} a cada rival${breaks ? " · ¡Quiebre!" : ""}`
      : `~${dmg} daño${breaks ? " · ¡Quiebre!" : ""}`;
  };

  const skillAction = (id: SkillId, chip = false) => {
    const def = SKILLS[id];
    const reason = skillBlockReason(p, id) ?? undefined;
    const cd = p.cds?.[id] ?? 0;
    const hint = consumeHint(p, foe, def);
    const effects = def.power > 0 ? skillEffects(def).filter((e) => !e.startsWith("Consume")) : [];
    const extra = chip ? "" : [hint, effects.join(" · ")].filter(Boolean).join(" · ");
    return (
      <ActionButton
        key={id}
        chip={chip}
        left={float}
        tip={attackTip(p, id, foe)}
        disabled={!!reason}
        onClick={() => onAct(id, target)}
        icon={SKILL_FX[id].icon}
        title={def.name}
        sub={preview(def)}
        meta={`${skillMeta(def)}${cd ? ` · Quedan ${cd}` : ""}${extra ? ` · ${extra}` : ""}`}
        disabledReason={reason}
      />
    );
  };

  const [slotA, slotB] = equippedSkills(p);
  const defendAction = (chip = false) => (
    <ActionButton
      chip={chip}
      left={float}
      tip={defendTip(b)}
      onClick={() => onAct("defend", target)}
      icon={SKILL_FX.defend.icon}
      title="Defender"
      sub={perfect ? "¡Guardia perfecta!" : "Mitad de daño hasta tu turno"}
      meta={perfect ? `−75 % al golpe fuerte · +1 ${resName}` : "Sin costo"}
      hot={perfect}
    />
  );

  const turnWarning =
    b.turn >= TURN_WARN
      ? `Quedan ${Math.max(0, TURN_CAP - b.turn)} turnos antes del empate.`
      : null;

  const panel = (
    <Panel
      className={`${float ? "panel-float" : ""} shrink-0 !p-2 max-md:sticky max-md:bottom-0 max-md:z-30 max-md:max-h-[62dvh] max-md:overflow-y-auto ${side ? `md:w-[22rem] md:overflow-y-auto ${float ? "md:max-h-full" : "md:self-stretch"}` : ""}`}
    >
      {!over && (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-3">
            <span className="font-semibold text-green-300">Tu turno</span>
            <Tooltip tip={queueTip(b)}>
              <span className="font-[family-name:var(--font-title)] text-base font-bold text-yellow-300">Turno {b.turn + 1}</span>
            </Tooltip>
          </span>
          <ResourceMeter b={b} />
        </div>
      )}
      {!over && <PenetrationNote b={b} />}
      {!over && alive.length > 1 && (
        <div className="mb-1 text-[13px] leading-5 text-yellow-300">
          Elige un rival (clic o 1-3) · objetivo: {foe.char.name}
        </div>
      )}
      {!over && turnWarning && <div role="status" className="mb-1 text-xs font-semibold text-amber-200">⚠ {turnWarning}</div>}
      {!over && <TurnQueue b={b} />}
      {!over && <div className="mt-1.5"><IntentStrip b={b} /></div>}
      {over && (
        <div className="mb-2 text-center text-base font-semibold text-yellow-300">
          Fin de la pelea
        </div>
      )}
      {!over && (
        <div
          className={`mt-1.5 grid grid-cols-2 gap-1.5 sm:gap-2 ${side ? (float ? "md:grid-cols-2" : "md:grid-cols-1") : "md:grid-cols-4"}`}
        >
          {basicAction()}
          {skillAction(slotA)}
          {skillAction(slotB)}
          {defendAction()}
          {auto && (
            <ActionButton
              left={float}
              tip={autoTip(auto.reason)}
              disabled={!!auto.reason}
              wide
              onClick={auto.onAuto}
              title="Resolver rápido"
              sub={auto.reason ?? "Juega la pelea por ti"}
            />
          )}
        </div>
      )}
      {over && (
        <div className="mt-3 space-y-2">
          <div className="text-base text-yellow-300">
            Resultado:{" "}
            {b.status === "won" ? "victoria" : b.status === "draw" ? "empate (sin ganador)" : "derrota"}
          </div>
          {children}
        </div>
      )}
    </Panel>
  );
  if (!bar) return panel;
  // Desktop: a slim command bar under the scene (own look); phones keep the panel.
  return (
    <>
      <div className="sm:hidden">{panel}</div>
      <div className="cmd-bar hidden flex-col gap-1 px-3 py-1.5 sm:flex">
        {over ? (
          <div className="flex flex-1 items-center gap-4">
            <b className="text-yellow-300">
              {b.status === "draw" ? "Empate: sin ganador" : "Fin de la pelea"}
            </b>
            <div className="flex flex-1 items-center gap-3 [&>*]:!mt-0 [&>*]:!w-auto">{children}</div>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:flex-nowrap">
              <div className="w-44 shrink-0 leading-tight">
                <div className="text-sm font-semibold text-[#7ce0a3]">Tu turno</div>
                <Tooltip tip={queueTip(b)}>
                  <div className="text-xs text-[#d9d2ca]">Turno {b.turn + 1}</div>
                </Tooltip>
                <ResourceMeter b={b} />
                <PenetrationNote b={b} />
                {alive.length > 1 && <div className="text-[11px] text-yellow-300">Objetivo: {foe.char.name}</div>}
              </div>
              <div className="order-last min-w-0 basis-full lg:order-none lg:basis-0 lg:flex-1">
                <TurnQueue b={b} desktop />
              </div>
              {auto && (
                <Tooltip tip={autoTip(auto.reason)} className="ml-auto lg:ml-0">
                  <button className="cmd-ghost shrink-0" disabled={!!auto.reason} onClick={auto.onAuto}>Resolver rápido</button>
                </Tooltip>
              )}
            </div>
            {turnWarning && <div role="status" className="text-xs font-semibold text-amber-200">⚠ {turnWarning}</div>}
            <IntentStrip b={b} />
            <div className="grid min-w-0 grid-cols-4 gap-1.5">
              {basicAction(true)}
              {skillAction(slotA, true)}
              {skillAction(slotB, true)}
              {defendAction(true)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
