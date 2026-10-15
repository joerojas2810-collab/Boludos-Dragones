"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ElementIcon } from "@/components/ElementIcon";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { CodexView, HistoryView } from "@/components/torre/CodexViews";
import { RelicIcon, ScopeTag } from "@/components/torre/parts";
import type { ExpCodex as Codex, TowerStateInfo } from "@/lib/repo";
import { queueKey } from "@/lib/expeditionSync";
import { hudLine } from "@/lib/expeditionView";
import { CLASSES } from "@/lib/game/characters";
import {
  COMBATS_PER_SECTOR,
  maxHpOf,
  MAX_NODES,
  NODES_PER_SECTOR,
  TOWER_PAID_SECTORS,
  TOWER_PAY,
  type ExpState,
} from "@/lib/game/expedition";
import { RELICS } from "@/lib/game/relics";
import { SKILLS } from "@/lib/game/skills";
import {
  TOWER_BLURB,
  TOWER_DAILY_PRIZE,
  TOWER_LABEL,
  TOWER_MODES,
  TOWER_PRIZES,
  towerBadges,
  type TowerMode,
} from "@/lib/game/tower";
import { repo, useProfile } from "@/lib/useProfile";

const MEDAL = ["🥇", "🥈", "🥉"];
const nodeOf = (r: { nodes: number }) => r.nodes;
const PER_SECTOR_PAY = TOWER_PAY.normal * 5 + TOWER_PAY.elite + TOWER_PAY.boss;

function Active({ s }: { s: ExpState }) {
  return (
    <div className="tile-art space-y-1 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <b>Expedición activa{s.phase === "suspended" ? " (suspendida)" : ""}</b>
        <ScopeTag scope="expedicion" />
      </div>
      <p className="flex flex-wrap items-center gap-x-2">
        {s.hero.name} · {CLASSES[s.hero.classId].name} <ElementIcon element={s.hero.element} className="h-5" /> · {hudLine(s)}
      </p>
      <p>
        PV {s.hp}/{maxHpOf(s)} · {s.fragments} fragmentos · habilidades: {s.loadout.map((id) => SKILLS[id].name).join(" + ")}
      </p>
      {s.relics.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Reliquias">
          {s.relics.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1 rounded bg-black/30 px-1 text-xs">
              <RelicIcon id={r.id} className="h-5 w-5" /> {RELICS[r.id].name} {r.tier === 2 ? "II" : "I"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TowerPage() {
  const { ready } = useProfile();
  const [st, setSt] = useState<TowerStateInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Partial<Record<TowerMode, ExpState | null>>>({});
  const [local, setLocal] = useState<Partial<Record<TowerMode, boolean>>>({});
  const [vista, setVista] = useState<"codice" | "historial" | null>(null);
  const [vistaMode, setVistaMode] = useState<TowerMode>("nivelado");
  const [codex, setCodex] = useState<Codex | null>(null);
  const [codexErr, setCodexErr] = useState<string | null>(null);
  const remote = repo.mode === "remote";

  useEffect(() => {
    const v = new URLSearchParams(location.search).get("vista");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v === "codice" || v === "historial") setVista(v);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void repo
      .towerState()
      .then((d) => {
        if (!alive) return;
        setSt(d);
        for (const m of TOWER_MODES) {
          const run = d.activeByMode[m];
          let unsent = false;
          try {
            unsent = !!localStorage.getItem(queueKey(m));
          } catch {
            /* blocked storage */
          }
          setLocal((l) => ({ ...l, [m]: unsent }));
          // A stale run is closed (as "season") by the next load: leave that to the run screen so its result is seen.
          if (!run || run.stale) {
            setActive((a) => ({ ...a, [m]: null }));
            continue;
          }
          void repo
            .expeditionCurrent(m)
            .then((s) => alive && setActive((a) => ({ ...a, [m]: s && s.phase !== "ended" ? s : null })))
            .catch(() => undefined);
        }
      })
      .catch(() => alive && setErr("No se pudo cargar el ranking."));
    return () => {
      alive = false;
    };
  }, [ready]);

  useEffect(() => {
    if (!vista) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCodex(null);
    setCodexErr(null);
    void repo.expeditionCodex(vistaMode)
      .then((c) => alive && setCodex(c))
      .catch(() => alive && setCodexErr("No se pudo cargar el códice."));
    return () => {
      alive = false;
    };
  }, [vista, vistaMode]);

  if (!ready) return null;
  const bestNode = st ? Math.max(0, ...TOWER_MODES.map((m) => st.modes[m].mine?.nodes ?? 0)) : 0;
  const badges = towerBadges(bestNode);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-7 px-3 pb-2 pt-7">
      <Panel title="Torre semanal · Expedición">
        <p className="text-center text-base text-[#e8e0d8]">
          Una expedición sin fin: sectores de {NODES_PER_SECTOR} nodos ({COMBATS_PER_SECTOR} combates, 2 servicios y un santuario) con caminos que eliges, reliquias que
          construyen tu build, tiendas, descansos y eventos. Misma semilla para todos esta semana; hasta {MAX_NODES} nodos por temporada.
        </p>
        <div className="mx-auto mt-3 grid max-w-3xl gap-2 text-sm sm:grid-cols-2">
          <div className="tile-art space-y-1 p-2">
            <ScopeTag scope="expedicion" />
            <p>Se pierde al terminar: reliquias y sus niveles, fragmentos, pactos y rutas elegidas. Perder no borra héroes ni equipo.</p>
          </div>
          <div className="tile-art space-y-1 p-2">
            <ScopeTag scope="cuenta" />
            <p>Se conserva: tus héroes y equipo, el códice, tu récord, tu build en el historial y los premios ya confirmados.</p>
          </div>
        </div>
        <div
          className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-0 pixel-frame px-2 py-0 text-sm"
          title={`Premios de cuenta: solo los combates ganados de los primeros ${TOWER_PAID_SECTORS} sectores (primera vez por semana y modo) y el top 3 del lunes. Los fragmentos son temporales y no son monedas.`}
        >
          <span className="opacity-80">Premios del lunes (top 3)</span>
          {TOWER_PRIZES.map((p) => (
            <span key={p.place} className="whitespace-nowrap text-yellow-300">
              {MEDAL[p.place - 1]} {p.coins} <Icon name="system_coin" className="h-4" /> +{p.dados} Dado cargado
            </span>
          ))}
        </div>
        <p className="mt-2 text-center text-sm text-[#d9d2ca]">
          Premios de cuenta por combate ganado (primera vez cada semana, por modo, sectores 1 a {TOWER_PAID_SECTORS}): combate normal {TOWER_PAY.normal} monedas, élite (nodo 5){" "}
          {TOWER_PAY.elite}, jefe (nodo 10) {TOWER_PAY.boss}; los servicios no pagan. Máximo {PER_SECTOR_PAY} por sector y {PER_SECTOR_PAY * TOWER_PAID_SECTORS} por modo. Los fragmentos de torre son temporales
          y no se cambian por monedas. Para el top 3 hay que superar el jefe del nodo 10. Cada día a las 21:00 (hora de Buenos Aires) el #1 de cada torre gana {TOWER_DAILY_PRIZE.coins} monedas y el título «
          {TOWER_DAILY_PRIZE.title}».
        </p>
        {badges.length > 0 && <p className="mt-1 text-center text-sm text-yellow-300">Tus insignias: {badges.join(" · ")}</p>}
        {!remote && <p className="mt-2 text-center text-sm text-yellow-300">Modo local: puedes jugar la expedición de esta semana, pero sin ranking.</p>}
        {err && <p className="mt-2 text-center text-sm text-red-300">{err}</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button className="btn text-center" aria-pressed={vista === "codice"} onClick={() => setVista(vista === "codice" ? null : "codice")}>
            Códice (18 reliquias y 6 eventos)
          </button>
          <button className="btn text-center" aria-pressed={vista === "historial"} onClick={() => setVista(vista === "historial" ? null : "historial")}>
            Historial y récord personal
          </button>
        </div>
      </Panel>

      {vista && (
        <Panel title={vista === "codice" ? "Códice de la torre" : "Historial y récord"} className="space-y-3">
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Modo">
            {TOWER_MODES.map((m) => (
              <button key={m} className={`btn text-center ${vistaMode === m ? "" : "btn-gray"}`} aria-pressed={vistaMode === m} onClick={() => setVistaMode(m)}>
                {TOWER_LABEL[m]}
              </button>
            ))}
            <button className="btn btn-gray text-center" onClick={() => setVista(null)}>
              Cerrar
            </button>
          </div>
          {codexErr && <p className="text-center text-sm text-red-300">{codexErr}</p>}
          {!codex && !codexErr && <p className="text-center text-sm opacity-80">Cargando…</p>}
          {codex && (vista === "codice" ? <CodexView codex={codex} /> : <HistoryView codex={codex} />)}
        </Panel>
      )}

      <div className="grid gap-7 md:grid-cols-2">
        {TOWER_MODES.map((m) => {
          const a = active[m];
          const mine = st?.modes[m].mine ?? null;
          return (
            <Panel key={m} title={TOWER_LABEL[m]}>
              <div className="flex items-center gap-3">
                <Icon name={m === "nivelado" ? "passive_wall" : "relic_titan_crown"} className="h-24 w-24 shrink-0" />
                <div className="flex min-w-0 flex-col items-center gap-1">
                  <p className="text-center text-sm text-[#d9d2ca]">{TOWER_BLURB[m]}</p>
                  {a ? (
                    <Link href={`/run?torre=${m}`} className="btn inline-block px-8 text-center">
                      Reanudar
                    </Link>
                  ) : (
                    <Link href={`/run?torre=${m}`} className="btn inline-block px-8 text-center">
                      Nueva expedición
                    </Link>
                  )}
                </div>
              </div>
              {a && (
                <div className="mt-2 space-y-1">
                  <Active s={a} />
                  <p className="text-center text-xs text-[#d9d2ca]">Solo hay una expedición activa por modo: reanúdala, o retírate dentro de ella para empezar otra.</p>
                </div>
              )}
              {local[m] && <p className="mt-1 text-center text-xs text-amber-200">Hay jugadas sin confirmar en este dispositivo: se enviarán al reanudar.</p>}
              {st && (
                <>
                  <div className="mt-2 text-center text-sm text-yellow-300">
                    {mine
                      ? `Tu récord de la semana: nodo ${nodeOf(mine)} validado· ${mine.turns} turnos · puesto ${mine.place}${mine.pending ? " · pendiente de validación" : ""}`
                      : "Aún no has subido esta semana"}
                  </div>
                  {st.king?.[m] && (
                    <div className="text-center text-sm text-yellow-300">
                      👑 {TOWER_DAILY_PRIZE.title}: {st.king[m].name} (nodo {st.king[m].floor}){st.king[m].me ? " · ¡eres tú!" : ""}
                    </div>
                  )}
                  <ol className="mt-1 space-y-0.5 text-sm">
                    {st.modes[m].top.length === 0 && <li className="text-center opacity-70">Nadie ha subido todavía.</li>}
                    {st.modes[m].top.map((r) => (
                      <li key={r.place} className="tile-art flex min-w-0 items-center justify-between gap-2 px-2">
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="shrink-0">{MEDAL[r.place - 1] ?? `${r.place}.`}</span>
                          <span className="truncate">{r.name}</span>
                          {r.class && <span className="shrink-0">· {CLASSES[r.class].name}</span>}
                          {r.element && <ElementIcon element={r.element} className="h-5 shrink-0" />}
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          nodo {nodeOf(r)} validado · {r.turns} t{r.eligible ? "" : " · aún sin jefe 10"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-1 text-center text-[11px] text-[#d9d2ca]">Desempate: menos turnos en los combates ganados, luego la hora del servidor al llegar al nodo.</p>
                  {st.last[m].length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-2 text-xs opacity-80">
                      Semana pasada: {st.last[m].map((r) => `${MEDAL[r.place - 1]} ${r.name} (${r.floor})`).join(" · ")}
                    </div>
                  )}
                </>
              )}
              <div className="mt-2 flex flex-wrap justify-center gap-2 text-sm">
                <button
                  className="underline"
                  onClick={() => {
                    setVistaMode(m);
                    setVista("codice");
                  }}
                >
                  Códice
                </button>
                <button
                  className="underline"
                  onClick={() => {
                    setVistaMode(m);
                    setVista("historial");
                  }}
                >
                  Historial
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
