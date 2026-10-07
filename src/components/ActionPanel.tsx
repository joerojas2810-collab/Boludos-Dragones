import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { Tooltip } from "@/components/Tooltip";
import { iconFor } from "@/lib/art";
import { CLASSES } from "@/lib/game/characters";
import {
  actionsLeft,
  estimateDamage,
  fleeChance,
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
  fleeTip,
  skillTip,
  type Tip,
} from "@/lib/game/explain";
import { SKILL_LEVEL } from "@/lib/game/skills";

type Props = {
  b: Battle;
  target: number; // index among the LIVING enemies (what step() expects)
  onAct: (a: Action, target: number) => void;
  fleeCost?: number; // coins lost on a successful flee (runs)
  // Quick resolve (easy fights in runs): why it is blocked, or null if allowed.
  auto?: { reason: string | null; onAuto: () => void };
  side?: boolean; // vertical list in a side column (desktop)
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
}: {
  tip: Tip;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  hot?: boolean; // highlighted (perfect guard available)
  icon?: string; // painted skill icon name (iconFor)
}) {
  return (
    <Tooltip tip={tip} className="block" focusable={false}>
      <button
        className={`btn h-full min-h-14 max-md:min-h-12 w-full md:[@media(max-height:700px)]:min-h-12 md:[@media(max-height:620px)]:min-h-10 md:[@media(max-height:620px)]:!py-1 ${hot ? "!border-yellow-300" : ""}`}
        disabled={disabled}
        onClick={onClick}
      >
        <div className="flex items-center justify-center gap-2">
          {icon && <Icon name={icon} className="h-8 shrink-0 max-md:h-6" />}
          <div>
            <div className="text-base font-semibold leading-tight max-md:text-sm">{title}</div>
            <div className="text-sm leading-snug max-md:text-xs">{sub}</div>
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
  fleeCost,
  auto,
  side,
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
          tip={skillTip(b.player, foe)}
          disabled
          onClick={() => undefined}
          title="Ataque 3"
          sub={`Se desbloquea al nivel ${SKILL_LEVEL}`}
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
    <Panel className={`shrink-0 !p-2 max-md:sticky max-md:bottom-0 max-md:z-30 ${side ? "md:w-[22rem] md:self-stretch md:overflow-y-auto" : ""}`}>
      {!over && (
        <div className="mb-1.5 flex flex-wrap items-center justify-center gap-x-4 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-3 text-base">
            <span className="font-semibold text-green-300">Tu turno</span>
            <span className="text-yellow-300">Ronda {b.turn}</span>
            <Tooltip tip={announceTip(b)}>
              <span className="cursor-help">
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
          <div className="text-[13px] leading-5 text-[#d9d2ca]">
            Orden: {order}
            {alive.length > 1 && (
              <span className="ml-2 text-yellow-300">
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
        <div className={`grid grid-cols-2 gap-2 ${side ? "md:grid-cols-1" : "md:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]"}`}>
          {attack("attack1")}
          {attack("attack2")}
          {attack("attack3")}
          <ActionButton
            tip={defendTip(b)}
            onClick={() => onAct("defend", target)}
            icon={iconFor("skill", "defend")}
            title="Defender"
            sub={perfect ? "¡Guardia perfecta!" : "Recibes la mitad de daño"}
            hot={perfect}
          />
          <ActionButton
            tip={fleeTip(b, fleeCost)}
            onClick={() => onAct("flee", target)}
            icon={iconFor("skill", "flee")}
            title="Huir"
            sub={`${pct(fleeChance(b.player))} de éxito${
              fleeCost === undefined
                ? ""
                : fleeCost > 0
                  ? ` · cuesta ${fleeCost}`
                  : " · sin costo"
            }`}
          />
          {auto && (
            <ActionButton
              tip={autoTip(auto.reason)}
              disabled={!!auto.reason}
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
              : b.status === "lost"
                ? "derrota"
                : "huiste"}
          </div>
          {children}
        </div>
      )}
    </Panel>
  );
}
