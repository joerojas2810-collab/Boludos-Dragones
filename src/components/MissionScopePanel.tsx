"use client";

import {Icon} from "./Icon";
import {SecondaryPanel} from "./SecondaryPanel";
import {uiAsset} from "@/lib/art";
import {rewardText,type MissionTier} from "@/lib/game/missions";

export interface ScopeState {
  scope: "daily" | "weekly" | "event";
  points: number;
  claimed: number;
  canReroll: boolean;
  open: boolean;
  tiers: MissionTier[];
  missions: {
    slot: number;
    label: string;
    target: number;
    progress: number;
    done: boolean;
  }[];
}

const TITLE: Record<ScopeState["scope"], string> = {
  daily: "Misiones diarias",
  weekly: "Misiones semanales",
  event: "Evento: Viernes de sala",
};
const BLURB: Record<ScopeState["scope"], string> = {
  daily:
    "Se renuevan cada día (hora de Buenos Aires). Cada misión suma puntos de actividad y cada hito paga. Puedes cambiar una misión por día.",
  weekly:
    "Se renuevan el lunes. Son más largas; puedes cambiar una misión por semana.",
  event:
    "Viernes y sábado: misiones para jugar en sala con tus amigos. El premio final es grande.",
};

/** Presentation shared by the game and the isolated review gallery. */
export function MissionScopePanel({s,onAction}:{s:ScopeState;onAction:(path:"claim"|"reroll",body:object)=>void|Promise<void>}){
        const reached = s.tiers.filter((t) => t.points <= s.points).length;
        const max = s.tiers[s.tiers.length - 1].points;
        return (
          <SecondaryPanel title={TITLE[s.scope]} className="mission-scope-panel">
            <p className="mb-3 text-sm text-[#d9d2ca]">{BLURB[s.scope]}</p>
            <ul className="space-y-2">
              {s.missions.map((m) => (
                <li
                  key={m.slot}
                  className="tile-art flex flex-wrap items-center gap-2 text-base"
                >
                  <span className={m.done ? "text-green-300" : ""}>
                    {m.done ? "✔ " : ""}
                    {m.label}
                  </span>
                  <span className="ml-auto text-sm tabular-nums">
                    {m.progress}/{m.target}
                  </span>
                  {s.canReroll && !m.done && (
                    <button
                      className="btn btn-gray !min-h-8 !px-2 text-sm"
                      onClick={() =>
                        void onAction("reroll", { scope: s.scope, slot: m.slot })
                      }
                    >
                      Cambiar
                    </button>
                  )}
                  <progress
                    className="h-2 w-full"
                    value={m.progress}
                    max={m.target}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <progress className="h-3 w-full" value={s.points} max={max} />
              <ol className="mission-tier-list mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                {s.tiers.map((t, i) => (
                  <li
                    key={t.points}
                    className={`tile-art flex flex-col items-center gap-1 ${
                      i < s.claimed
                        ? "opacity-50"
                        : i < reached
                          ? "tile-ready text-green-300"
                          : ""
                    }`}
                  >
                    <span className="mission-tier-state text-xs font-semibold">
                      {t.points} puntos · {i < s.claimed ? "Reclamado" : i < reached ? "Disponible" : "Bloqueado"}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uiAsset(`chest_tier${i < s.claimed ? Math.max(i + 1, 2) : 1}`)}
                      alt=""
                      draggable={false}
                      className="h-20"
                    />
                    <span className="flex flex-wrap items-center justify-center gap-1">
                      {i < s.claimed ? "✔ " : ""}
                      {rewardText(t)}
                      {t.coins > 0 && (
                        <Icon name="system_coin" className="h-4" />
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <button
                className="btn mt-3 w-full"
                disabled={reached <= s.claimed}
                onClick={() => void onAction("claim", { scope: s.scope })}
              >
                {reached > s.claimed ? "Reclamar premios" : "Nada por reclamar"}
              </button>
            </div>
          </SecondaryPanel>
        );
}
