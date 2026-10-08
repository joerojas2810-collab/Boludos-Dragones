import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { Tooltip } from "@/components/Tooltip";
import { iconFor } from "@/lib/art";
import { CLASSES } from "@/lib/game/characters";
import {
  actionsLeft,
  estimateDamage,
  hitChance,
  livingEnemies,
  skillOf,
  strongPending,
  type Action,
  type Battle,
  type MoveKey,
} from "@/lib/game/combat";
import {
  announceTip,
  attackDisabledReason,
  attackTip,
  autoTip,
  defendTip,
  skillTip,
  type Tip,
} from "@/lib/game/explain";
import { SKILL_UNLOCK_STARS } from "@/lib/game/skills";

type Props = {
  b: Battle;
  target: number; // index among the LIVING enemies (what step() expects)
  onAct: (a: Action, target: number) => void;
  // Quick resolve (easy fights in runs): why it is blocked, or null if allowed.
  auto?: { reason: string | null; onAuto: () => void };
  side?: boolean; // vertical list in a side column (desktop)
  float?: boolean; // translucent panel over a full-screen scene (run fights)
  children?: ReactNode; // shown below the result once the fight is over
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

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
}) {
  return (
    <Tooltip
      tip={tip}
      className={wide ? "col-span-full block" : "block"}
      focusable={false}
      placement={left ? "side" : "auto"}
    >
      <button
        className={`btn h-full w-full max-md:![border-width:6px_10px] max-md:![border-image-width:6px_10px] max-md:!px-1 max-md:!py-0.5 ${left ? "min-h-11 !px-2 !py-1" : "min-h-14 max-md:min-h-12 md:[@media(max-height:700px)]:min-h-12 md:[@media(max-height:620px)]:min-h-10 md:[@media(max-height:620px)]:!py-1"} ${hot ? "!border-yellow-300" : ""}`}
        disabled={disabled}
        onClick={onClick}
      >
        <div
          className={`flex items-center gap-2 ${left ? "justify-start text-left" : "justify-center"}`}
        >
          {icon && (
            <Icon
              name={icon}
              className={`shrink-0 max-md:h-5 ${left ? "h-6" : "h-8"}`}
            />
          )}
          <div>
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
  children,
}: Props) {
  const over = b.status !== "ongoing";
  const left = actionsLeft(b);
  const mine = b.playerActions;
  const cls = CLASSES[b.player.char.classId];
  const alive = livingEnemies(b);
  const foe = b.enemies[alive[target] ?? alive[0] ?? 0];
  const skill = skillOf(b.player);
  const perfect = strongPending(b);
  const order = b.queue
    .map((s) => (s === "player" ? "Tú" : `R${s.e + 1}`))
    .join(" › ");

  const attack = (k: MoveKey) => {
    const a = k === "attack3" ? null : cls[k];
    const reason = attackDisabledReason(b.player, k);
    if (k === "attack3" && !skill)
      return (
        <ActionButton
          left={float}
          tip={skillTip(b.player, foe)}
          disabled
          onClick={() => undefined}
          title="Ataque 3"
          sub={`Rango C o ${SKILL_UNLOCK_STARS}★`}
        />
      );
    const name = a?.name ?? skill?.name ?? "Ataque 3";
    const hits = `~${estimateDamage(b.player, foe, k)} daño · ${pct(hitChance(b.player, foe, k))} acierto`;
    const stats =
      k === "attack3" && skill
        ? skill.power === 0
          ? skill.blurb
          : skill.area
            ? `A todos · ~${estimateDamage(b.player, foe, k)} c/u`
            : skill.hits && skill.hits > 1
              ? `${pct(hitChance(b.player, foe, k))} · ~${estimateDamage(b.player, foe, k)} ×${skill.hits}`
              : hits
        : hits;
    return (
      <ActionButton
        left={float}
        tip={attackTip(b.player, k, foe)}
        disabled={!!reason}
        onClick={() => onAct(k, target)}
        icon={iconFor(
          "skill",
          k === "attack3" ? (skill?.id ?? "") : `${b.player.char.classId}.${k}`,
        )}
        title={name}
        sub={reason ?? (a && a.heal > 0 ? `${stats} · cura` : stats)}
      />
    );
  };

  return (
    <Panel
      className={`${float ? "panel-float" : ""} shrink-0 !p-2 max-md:sticky max-md:bottom-0 max-md:z-30 ${side ? `md:w-[22rem] md:overflow-y-auto ${float ? "md:max-h-full" : "md:self-stretch"}` : ""}`}
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
              <span className={`cursor-help ${float ? "action-pill" : ""}`}>
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
          <div
            className={`text-[13px] leading-5 text-[#d9d2ca] ${float ? "action-inset mt-1 !py-0.5 !text-xs !leading-4" : ""}`}
          >
            Orden: {order}
            {alive.length > 1 && (
              <span
                className={
                  float ? "block text-yellow-300" : "ml-2 text-yellow-300"
                }
              >
                Elige un rival (clic o 1-3) · objetivo: {foe.char.name}
              </span>
            )}
          </div>
        </div>
      )}
      {over && (
        <div className="mb-2 text-center text-base font-semibold text-yellow-300">
          Fin de la pelea
        </div>
      )}
      {!over && (
        <div
          className={`grid grid-cols-2 gap-2 ${side ? (float ? "md:grid-cols-2" : "md:grid-cols-1") : "md:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]"}`}
        >
          {attack("attack1")}
          {attack("attack2")}
          {attack("attack3")}
          <ActionButton
            left={float}
            tip={defendTip(b)}
            onClick={() => onAct("defend", target)}
            icon={iconFor("skill", "defend")}
            title="Defender"
            sub={perfect ? "¡Guardia perfecta!" : "Recibes la mitad de daño"}
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
}
