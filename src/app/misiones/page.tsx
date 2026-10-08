"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { rewardText, type MissionTier } from "@/lib/game/missions";
import { replaceProfile, repo, useProfile } from "@/lib/useProfile";

interface ScopeState {
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

export default function MissionsPage() {
  const { ready } = useProfile();
  const [scopes, setScopes] = useState<ScopeState[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const remote = repo.mode === "remote";

  const fetchScopes = useCallback(async () => {
    const r = await fetch("/api/missions", { credentials: "same-origin" });
    if (!r.ok) throw new Error("missions");
    return ((await r.json()) as { scopes: ScopeState[] }).scopes;
  }, []);

  useEffect(() => {
    if (!ready || !remote) return;
    let alive = true;
    fetchScopes()
      .then((s) => alive && setScopes(s))
      .catch(() => alive && setMsg("No se pudieron cargar las misiones."));
    return () => {
      alive = false;
    };
  }, [ready, remote, fetchScopes]);

  async function act(path: string, body: object) {
    setMsg(null);
    const r = await fetch(`/api/missions/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as {
      coins?: number;
      cores?: number;
      parts?: number;
      pieces?: number;
      error?: { message: string };
    };
    if (!r.ok) setMsg(d.error?.message ?? "No se pudo completar.");
    else if (path === "claim")
      setMsg(
        `Cobraste ${rewardText({ coins: d.coins ?? 0, cores: d.cores ?? 0, parts: d.parts ?? 0, pieces: d.pieces ?? 0 }) || "tus premios"}.`,
      );
    const me = await repo.load();
    if (me) replaceProfile(me.profile);
    setScopes(await fetchScopes());
  }

  if (!ready) return null;
  if (!remote)
    return (
      <main className="mx-auto w-full max-w-3xl p-3">
        <Panel title="Misiones">
          <p className="text-center">Las misiones requieren conexión.</p>
        </Panel>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-3">
      {msg && (
        <p role="status" className="text-center text-sm text-yellow-300">
          {msg}
        </p>
      )}
      {scopes?.map((s) => {
        const reached = s.tiers.filter((t) => t.points <= s.points).length;
        const max = s.tiers[s.tiers.length - 1].points;
        return (
          <Panel key={s.scope} title={TITLE[s.scope]}>
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
                        void act("reroll", { scope: s.scope, slot: m.slot })
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
              <ol className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/art/ui/chest_tier${i < s.claimed ? Math.max(i + 1, 2) : 1}.webp`}
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
                onClick={() => void act("claim", { scope: s.scope })}
              >
                {reached > s.claimed ? "Reclamar premios" : "Nada por reclamar"}
              </button>
            </div>
          </Panel>
        );
      })}
    </main>
  );
}
