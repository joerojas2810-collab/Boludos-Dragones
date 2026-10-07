"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    <main className="mx-auto w-full max-w-5xl space-y-4 p-3">
      <Panel title="Torre semanal">
        <p className="text-center text-base text-[#d9d2ca]">
          Una run sin fin con la misma semilla para todos durante la semana.
          Intentos ilimitados: cuenta tu mejor piso. Cada modo tiene su propio
          ranking. El lunes, los 3 primeros de cada modo (con al menos{" "}
          {TOWER_MIN_FLOOR} pisos) cobran:{" "}
          {TOWER_PRIZES.map(
            (p) =>
              `${p.place}º ${p.coins} monedas y ${p.cores} núcleo${p.cores > 1 ? "s" : ""}`,
          ).join(" · ")}
          . La torre no da monedas ni botín por sí sola.
        </p>
        {!remote && (
          <p className="mt-2 text-center text-sm text-yellow-300">
            Modo local: puedes jugar la torre de esta semana, pero sin ranking.
          </p>
        )}
        {err && <p className="mt-2 text-center text-sm text-red-300">{err}</p>}
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {TOWER_MODES.map((m) => (
          <Panel key={m} title={TOWER_LABEL[m]}>
            <p className="mb-2 text-center text-sm text-[#d9d2ca]">
              {TOWER_BLURB[m]}
            </p>
            <div className="text-center">
              <Link
                href={`/run?torre=${m}`}
                className="btn inline-block text-center"
              >
                Subir la torre
              </Link>
            </div>
            {st && (
              <>
                <div className="mt-3 text-center text-sm text-yellow-300">
                  {st.modes[m].mine
                    ? `Tu mejor piso: ${st.modes[m].mine.floor} · puesto ${st.modes[m].mine.place}`
                    : "Aún no has subido esta semana"}
                </div>
                <ol className="mt-2 space-y-0.5 text-sm">
                  {st.modes[m].top.length === 0 && (
                    <li className="text-center opacity-70">
                      Nadie ha subido todavía.
                    </li>
                  )}
                  {st.modes[m].top.map((r) => (
                    <li key={r.place} className="flex justify-between">
                      <span>
                        {MEDAL[r.place - 1] ?? `${r.place}.`} {r.name}
                      </span>
                      <span className="tabular-nums">piso {r.floor}</span>
                    </li>
                  ))}
                </ol>
                {st.last[m].length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-2 text-xs opacity-80">
                    Podio de la semana pasada:{" "}
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
