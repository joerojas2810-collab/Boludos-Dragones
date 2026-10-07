"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import {
  TOWER_BLURB,
  TOWER_LABEL,
  TOWER_MIN_FLOOR,
  TOWER_MODES,
  TOWER_PRIZES,
  type TowerMode,
} from "@/lib/game/tower";
import { repo, useProfile } from "@/lib/useProfile";

interface Row {
  place: number;
  name: string;
  floor: number;
}
interface TowerState {
  week: string;
  modes: Record<
    TowerMode,
    { top: Row[]; mine: { floor: number; place: number } | null }
  >;
  last: Record<TowerMode, Row[]>;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function TowerPage() {
  const { ready } = useProfile();
  const [st, setSt] = useState<TowerState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const remote = repo.mode === "remote";

  useEffect(() => {
    if (!ready || !remote) return;
    let alive = true;
    void fetch("/api/tower", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("tower"))))
      .then((d: TowerState) => alive && setSt(d))
      .catch(() => alive && setErr("No se pudo cargar el ranking."));
    return () => {
      alive = false;
    };
  }, [ready, remote]);

  if (!ready) return null;
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-3 pt-6">
      <Panel title="Torre semanal">
        <p className="text-center text-lg text-[#e8e0d8]">
          Sube lo más alto que puedas: misma torre para todos esta semana.
        </p>
        <div
          className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-1 pixel-frame px-3 py-2 text-sm"
          title={`Los 3 primeros de cada modo (mínimo ${TOWER_MIN_FLOOR} pisos) cobran el lunes. La torre no da monedas ni botín por sí sola.`}
        >
          <span className="opacity-80">Premios del lunes</span>
          {TOWER_PRIZES.map((p) => (
            <span key={p.place} className="whitespace-nowrap text-yellow-300">
              {MEDAL[p.place - 1]} {p.coins}{" "}
              <Icon name="system_coin" className="h-4" /> +{p.cores} núcleo
              {p.cores > 1 ? "s" : ""}
            </span>
          ))}
        </div>
        {!remote && (
          <p className="mt-2 text-center text-sm text-yellow-300">
            Modo local: puedes jugar la torre de esta semana, pero sin ranking.
          </p>
        )}
        {err && <p className="mt-2 text-center text-sm text-red-300">{err}</p>}
      </Panel>
      <div className="grid gap-8 md:grid-cols-2">
        {TOWER_MODES.map((m) => (
          <Panel key={m} title={TOWER_LABEL[m]}>
            <div className="flex flex-col items-center gap-2">
              <Icon
                name={m === "nivelado" ? "dungeon_rank_d" : "dungeon_rank_s"}
                className="h-32 w-32"
              />
              <p className="text-center text-sm text-[#d9d2ca]">
                {TOWER_BLURB[m]}
              </p>
              <Link
                href={`/run?torre=${m}`}
                className="btn mt-1 inline-block px-8 text-center"
              >
                Subir la torre
              </Link>
            </div>
            {st && (
              <>
                <div className="mt-3 text-center text-base text-yellow-300">
                  {st.modes[m].mine
                    ? `Tu mejor piso: ${st.modes[m].mine.floor} · puesto ${st.modes[m].mine.place}`
                    : "Aún no has subido esta semana"}
                </div>
                <ol className="mt-2 space-y-1 text-base">
                  {st.modes[m].top.length === 0 && (
                    <li className="text-center opacity-70">
                      Nadie ha subido todavía.
                    </li>
                  )}
                  {st.modes[m].top.map((r) => (
                    <li
                      key={r.place}
                      className="tile-art flex justify-between px-2 py-0.5"
                    >
                      <span>
                        {MEDAL[r.place - 1] ?? `${r.place}.`} {r.name}
                      </span>
                      <span className="tabular-nums">piso {r.floor}</span>
                    </li>
                  ))}
                </ol>
                {st.last[m].length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-2 text-xs opacity-80">
                    Semana pasada:{" "}
                    {st.last[m]
                      .map(
                        (r) => `${MEDAL[r.place - 1]} ${r.name} (${r.floor})`,
                      )
                      .join(" · ")}
                  </div>
                )}
              </>
            )}
          </Panel>
        ))}
      </div>
    </main>
  );
}
