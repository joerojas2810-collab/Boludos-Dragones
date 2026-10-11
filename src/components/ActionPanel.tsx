import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { Tooltip } from "@/components/Tooltip";
import { iconFor } from "@/lib/art";
import { UNIVERSAL_SKILLS, universalCooldownLabel, type UniversalSkillId } from "@/lib/game/universalSkills";
import {
  actionsLeft,
  estimateDamage,
  hitChance,
  livingEnemies,
  strongPending,
  type EnemySlot,
  type Action,
  type Battle,
  attackOf,
} from "@/lib/game/combat";
import {
  announceTip,
  attackDisabledReason,
  attackTip,
  autoTip,
  defendTip,
  type Tip,
} from "@/lib/game/explain";

type Props = {
  b: Battle;
  target: number; // index among the LIVING enemies (what step() expects)
  onAct: (a: Action, target: number) => void;
  // Quick resolve (easy fights in runs): why it is blocked, or null if allowed.
  auto?: { reason: string | null; onAuto: () => void };
  side?: boolean; // vertical list in a side column (desktop)
  float?: boolean; // translucent panel over a full-screen scene (run fights)
  bar?: boolean; // desktop: a slim command bar under the scene (phones keep the panel)
  children?: ReactNode; // shown below the result once the fight is over
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const UNIVERSAL_ACTION_ORDER = ["golpe", "barrido", "quebrar", "interrumpir", "explotar"] as const;
const UNIVERSAL_ACTION_LABELS: Record<UniversalSkillId, string> = {
  golpe: "Golpe",
  barrido: "Barrido",
  quebrar: "Quebrar",
  interrumpir: "Interrumpir",
  explotar: "Explotar",
};

function RoundQueue({ b }: { b: Battle }) {
  const slots = b.queue.filter(
    (slot): slot is "player" | EnemySlot =>
      slot === "player" || b.enemies[slot.e].hp > 0,
  );
  const firstPlayer = slots.findIndex((slot) => slot === "player");
  const completedPlayerActions = b.playerActions - actionsLeft(b);

  return (
    <section
      aria-label="Cola de acciones de la ronda"
      className="rounded-md border border-[#b9855a]/30 bg-black/25 px-2 py-1.5"
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] leading-tight text-[#d9d2ca]">
        <span className="font-semibold uppercase tracking-wide text-[#f1d5a4]">
          Orden de la ronda
        </span>
        <span className="shrink-0">Tú eliges ahora</span>
      </div>
      {slots.length === 0 ? (
        <div className="text-xs text-[#aebccb]">Ronda resuelta</div>
      ) : (
        <ol
          aria-label="Acciones pendientes, en orden de resolución"
          className="flex min-w-0 gap-1.5 overflow-x-auto pb-1"
        >
          {slots.map((slot, i) => {
            const current = i === firstPlayer;
            if (slot === "player") {
              const playerNumber =
                completedPlayerActions +
                slots.slice(0, i + 1).filter((queued) => queued === "player").length;
              const label = `Tú, acción ${playerNumber} de ${b.playerActions}`;
              return (
                <li
                  key={`player-${playerNumber}`}
                  aria-current={current ? "step" : undefined}
                  aria-label={label}
                  className={`flex min-h-10 min-w-[5.5rem] shrink-0 flex-col justify-center rounded border px-2 py-1 text-center ${current ? "border-yellow-300 bg-yellow-300/15 text-yellow-100 shadow-[0_0_0_1px_#fcd34d66]" : "border-emerald-700/60 bg-emerald-950/50 text-emerald-100"}`}
                >
                  <span className="text-xs font-bold leading-tight">TÚ</span>
                  <span className="text-[10px] leading-tight">
                    {current ? "Tu acción" : "Acción extra"}
                  </span>
                </li>
              );
            }

            const enemy = b.enemies[slot.e];
            const intent =
              slot.intent === "defend"
                ? "Defender"
                : attackOf(enemy, slot.intent).name;
            const strong = slot.intent === "attack2";
            const label = `${enemy.char.name}: ${strong ? "golpe fuerte, " : ""}${intent}`;
            return (
              <li
                key={`enemy-${slot.e}-${slot.n}-${i}`}
                aria-label={label}
                className="flex min-h-10 min-w-[5.5rem] shrink-0 flex-col justify-center rounded border border-red-900/70 bg-red-950/55 px-2 py-1 text-center text-red-100"
              >
                <span className="text-xs font-bold leading-tight">R{slot.e + 1}</span>
                <span className="max-w-28 truncate text-[10px] leading-tight" title={label}>
                  {strong && <span aria-hidden="true">⚠ </span>}
                  {intent}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
  if (chip)
    return (
      <Tooltip tip={tip} className="block min-w-0">
        <button className="cmd-chip w-full" data-hot={hot ? "" : undefined} disabled={disabled} onClick={onClick}>
          {icon && <Icon name={icon} className="h-7 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight">{title}</span>
            <span className="block truncate text-[11px] leading-tight text-[#aebccb]">{sub}</span>
            {meta && <span className="block truncate text-[10px] leading-tight text-[#d9d2ca]">{meta}</span>}
            {disabledReason && <span className="block truncate text-[10px] leading-tight text-amber-200">{disabledReason}</span>}
          </span>
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
        className={`btn h-full w-full min-w-0 motion-safe:transition-transform motion-safe:active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none max-md:![border-width:6px_10px] max-md:![border-image-width:6px_10px] max-md:!px-1 max-md:!py-0.5 ${left ? "min-h-11 !px-2 !py-1" : "min-h-14 max-md:min-h-12 md:[@media(max-height:700px)]:min-h-12 md:[@media(max-height:620px)]:min-h-10 md:[@media(max-height:620px)]:!py-1"} ${hot ? "!border-yellow-300" : ""}`}
        disabled={disabled}
        onClick={onClick}
        aria-label={`${title}. ${sub}${meta ? `. ${meta}` : ""}${disabledReason ? `. ${disabledReason}` : ""}`}
      >
        <div
          className={`flex min-w-0 items-center gap-2 ${left ? "justify-start text-left" : "justify-center"}`}
        >
          {icon && (
            <Icon
              name={icon}
              className={`shrink-0 max-md:h-7 ${left ? "h-6" : "h-8"}`}
            />
          )}
          <div className="min-w-0">
            <div
              className={`font-semibold leading-tight max-md:text-sm ${left ? "text-sm" : "text-base"}`}
            >
              {title}
            </div>
            <div
              className={`leading-snug max-md:text-[11px] max-md:leading-tight ${left ? "text-[11px]" : "text-sm"}`}
            >
              {sub}
            </div>
            {meta && <div className="text-[10px] leading-tight text-[#d9d2ca]">{meta}</div>}
            {disabledReason && <div className="text-[10px] leading-tight text-amber-200">{disabledReason}</div>}
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
  const left = actionsLeft(b);
  const mine = b.playerActions;
  const alive = livingEnemies(b);
  const foe = b.enemies[alive[target] ?? alive[0] ?? 0];
  const perfect = strongPending(b);

  const basicAction = (chip = false) => (
    <ActionButton
      chip={chip}
      left={float}
      tip={attackTip(b.player, "attack1", foe)}
      disabled={!!attackDisabledReason(b.player, "attack1")}
      onClick={() => onAct("attack1", target)}
      icon={iconFor("skill", `${b.player.char.classId}.attack1`)}
      title="Básico"
      sub={`~${estimateDamage(b.player, foe, "attack1")} daño · seguro`}
      meta={chip ? `CD — · ${foe.char.name}` : `Sin enfriamiento · Objetivo: ${foe.char.name}`}
    />
  );

  const universalActions = (chip = false) => UNIVERSAL_ACTION_ORDER.map((id) => {
    const action = UNIVERSAL_SKILLS[id];
    const remaining = universalCooldownLabel(b.player.universalCooldowns?.[action.id] ?? 0);
    const targetLabel = action.target === "all"
      ? `Objetivo: ${alive.length} ${alive.length === 1 ? "rival" : "rivales"}`
      : `Objetivo: ${foe.char.name}`;
    const reason = attackDisabledReason(b.player, id, foe) ?? undefined;
    const damage = action.attack.power === 0
      ? action.attack.name === "Quebrar Aguante"
        ? "Reduce Aguante y rompe armadura"
        : action.attack.name === "Interrumpir"
          ? "Interrumpe una intención válida"
          : "Consume un estado para causar daño"
      : `~${estimateDamage(b.player, foe, action.id)} daño${action.target === "all" ? " c/u" : ""} · ${pct(hitChance(b.player, action.id))} acierto`;
    return (
      <ActionButton
        key={action.id}
        chip={chip}
        left={float}
        tip={{ title: action.name, kind: "info", lines: [reason ?? (remaining ? `Se activa de nuevo en ${remaining} acciones.` : targetLabel)] }}
        disabled={!!reason}
        onClick={() => onAct(action.id, target)}
        icon={iconFor("skill", action.id)}
        title={UNIVERSAL_ACTION_LABELS[action.id]}
        sub={damage}
        meta={`${chip ? "Restan" : "Activaciones"}: ${remaining} · ${targetLabel}${action.id === "quebrar" && foe.aguante !== undefined ? ` · Aguante ${foe.aguante}/${foe.aguanteMax}` : ""}`}
        disabledReason={reason}
      />
    );
  });

  const panel = (
    <Panel
      className={`${float ? "panel-float" : ""} shrink-0 !p-2 max-md:sticky max-md:bottom-0 max-md:z-30 max-md:max-h-[62dvh] max-md:overflow-y-auto ${side ? `md:w-[22rem] md:overflow-y-auto ${float ? "md:max-h-full" : "md:self-stretch"}` : ""}`}
    >
      {!over && (
        <div
          className={
            float
              ? "mb-1.5"
              : "mb-1.5 flex flex-wrap items-center justify-center gap-x-4 text-center"
          }
        >
          <div
            className={`flex flex-wrap items-center gap-x-3 text-base ${float ? "justify-between" : "justify-center"}`}
          >
            <span className="flex items-center gap-3">
              <span className="font-semibold text-green-300">Tu turno</span>
              <span className="font-[family-name:var(--font-title)] text-lg font-bold text-yellow-300">
                Ronda {b.turn}
              </span>
            </span>
            <Tooltip tip={announceTip(b)}>
              <span className={`${float ? "action-pill" : ""}`}>
                Acciones:{" "}
                <span className="tracking-wider text-yellow-300">
                  {Array.from({ length: mine }, (_, i) =>
                    i < mine - left ? "○" : "●",
                  ).join("")}
                </span>{" "}
                {left} de {mine}
              </span>
            </Tooltip>
          </div>
          {alive.length > 1 && (
            <div className="text-[13px] leading-5 text-yellow-300">
              Elige un rival (clic o 1-3) · objetivo: {foe.char.name}
            </div>
          )}
        </div>
      )}
      {!over && <RoundQueue b={b} />}
      {over && (
        <div className="mb-2 text-center text-base font-semibold text-yellow-300">
          Fin de la pelea
        </div>
      )}
      {!over && (
        <div
          className={`grid grid-cols-2 gap-2 ${side ? (float ? "md:grid-cols-2" : "md:grid-cols-1") : "md:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]"}`}
        >
          {basicAction()}
          {universalActions()}
          <ActionButton
            left={float}
            tip={defendTip(b)}
            onClick={() => onAct("defend", target)}
            icon={iconFor("skill", "defend")}
            title="Defender"
            sub={perfect ? "¡Guardia perfecta!" : "Recibes la mitad de daño"}
            meta="Sin enfriamiento · Objetivo: tú"
            hot={perfect}
          />
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
            {b.status === "won"
              ? "victoria"
              : "derrota"}
          </div>
          {children}
        </div>
      )}
    </Panel>
  );
  if (!bar) return panel;
  // Desktop: a slim command bar under the scene (own look, one row); phones keep the panel.
  return (
    <>
      <div className="md:hidden">{panel}</div>
      <div className="cmd-bar hidden items-center gap-3 px-4 py-2 md:flex">
        {over ? (
          <div className="flex flex-1 items-center gap-4">
            <b className="text-yellow-300">Fin de la pelea</b>
            <div className="flex flex-1 items-center gap-3 [&>*]:!mt-0 [&>*]:!w-auto">{children}</div>
          </div>
        ) : (
          <>
            <div className="shrink-0 leading-tight">
              <div className="text-sm font-semibold text-[#7ce0a3]">Tu turno</div>
              <Tooltip tip={announceTip(b)}>
                <div className="text-xs text-[#d9d2ca]">
                  Ronda {b.turn} · <span className="tracking-wider text-yellow-300">{Array.from({ length: mine }, (_, i) => (i < mine - left ? "○" : "●")).join("")}</span> {left}/{mine}
                </div>
              </Tooltip>
              {alive.length > 1 && <div className="text-[11px] text-yellow-300">Objetivo: {foe.char.name}</div>}
              <div className="mt-1 w-[min(22rem,28vw)]">
                <RoundQueue b={b} />
              </div>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-1.5">
              {basicAction(true)}
              {universalActions(true)}
              <ActionButton
                chip
                tip={defendTip(b)}
                onClick={() => onAct("defend", target)}
                icon={iconFor("skill", "defend")}
                title="Defender"
                sub={perfect ? "¡Guardia perfecta!" : "Recibes la mitad"}
                meta="CD — · Tú"
                hot={perfect}
              />
            </div>
            {auto && (
              <Tooltip tip={autoTip(auto.reason)}>
                <button className="cmd-ghost" disabled={!!auto.reason} onClick={auto.onAuto}>
                  Resolver rápido
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </>
  );
}
