"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { EnemySprite } from "@/components/EnemySprite";
import { HealthBar } from "@/components/HealthBar";
import { Panel } from "@/components/Panel";
import { useTargeting } from "@/components/useTargeting";
import { step, type Action, type Battle } from "@/lib/game/combat";
import { COOP_K, damageDealt, startCoop } from "@/lib/game/coop";
import { ELEMENT_LABEL } from "@/lib/game/elements";
import type { RunAction } from "@/lib/game/replay";
import type { Rng } from "@/lib/game/rng";
import { worldOf } from "@/lib/game/worlds";
import type { RoomClient, RoomView } from "@/lib/roomui/types";
import { errorText } from "@/lib/roomui/viewModels";
import { playEvents } from "@/lib/sfx";
import { useNow } from "@/lib/useRoom";

/** Shared boss bar + what each player has dealt (server-replayed numbers). */
export function CoopBar({ view }: { view: RoomView }) {
  const c = view.coop;
  if (!c) return null;
  const name = (id: string) =>
    view.players.find((p) => p.id === id)?.name ?? "?";
  const rows = [...c.players].sort((a, b) => b.damage - a.damage);
  return (
    <Panel title={c.bossName}>
      <HealthBar hp={c.pool - c.total} max={c.pool} color="#c0392b" />
      <div className="mt-1 text-center text-sm tabular-nums">
        {c.total.toLocaleString("es")} / {c.pool.toLocaleString("es")} de daño
        {c.won && <b className="ml-2 text-green-300">¡Jefe caído!</b>}
      </div>
      <CoopPrize view={view} />
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span className="w-24 truncate">
              {r.id === c.mvp ? "★ " : ""}
              {name(r.id)}
            </span>
            <span className="h-2 flex-1 bg-black/40">
              <span
                className="block h-full bg-yellow-400"
                style={{
                  width: `${Math.min(100, (100 * r.damage) / c.pool)}%`,
                }}
              />
            </span>
            <span className="w-16 text-right tabular-nums">
              {r.damage.toLocaleString("es")}
              {r.finished ? " ✔" : ""}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** My prize (what I earn if it ends like this, or what I got once the boss phase is over). */
function CoopPrize({ view }: { view: RoomView }) {
  const c = view.coop;
  const mine = c?.prizes.find((p) => p.id === view.me);
  if (!c || !mine) return null;
  const over = view.phase !== "coop_boss";
  const mvp = view.players.find((p) => p.id === c.mvp);
  return (
    <div className="mt-2 border border-yellow-300/40 p-2 text-center text-sm">
      <div className="text-yellow-300">
        {over ? "Tu premio" : "Si termina así, tu premio"}
        {c.won ? " (¡ganaron!)" : " (consuelo)"}
      </div>
      <div>
        {mine.coins} monedas
        {mine.cores.length > 0 &&
          ` · ${mine.cores.length} núcleo${mine.cores.length > 1 ? "s" : ""} (${mine.cores
            .map((e) => ELEMENT_LABEL[e as keyof typeof ELEMENT_LABEL] ?? e)
            .join(", ")})`}
        {` · +${mine.chips} fichas`}
      </div>
      {c.won && mvp && (
        <div className="text-xs opacity-80">★ Matajefes: {mvp.name}</div>
      )}
    </div>
  );
}

interface Fight {
  battle: Battle;
  rng: Rng;
}

/**
 * Plays MY fight against the coop boss locally and sends the log after every
 * action; the server replays it and adds the damage to the shared bar.
 */
export function CoopFight({ client }: { client: RoomClient }) {
  const [fight, setFight] = useState<Fight | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const log = useRef<RunAction[]>([]);
  const sentN = useRef(0);
  const sending = useRef(false);
  const [heroLevel, setHeroLevel] = useState(1);
  const now = useNow(500);
  const [turnEnd, setTurnEnd] = useState(0);
  const turnSecs = client.getView()?.turnSeconds ?? 30;
  const targeting = useTargeting(fight ? fight.battle : null);
  const live = !!fight && fight.battle.status === "ongoing";
  const actions = fight?.battle.actions ?? 0;

  useEffect(() => {
    let alive = true;
    void client.getCoop().then((r) => {
      if (!alive) return;
      if (!r.ok) return setMsg(errorText(String(r.error)));
      const f = startCoop(r.run, r.node);
      if (!f) return setMsg("No se pudo abrir el combate.");
      setHeroLevel(r.run.hero.level);
      setFight(f);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  // One request at a time; if actions arrived meanwhile, send the longer log.
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (sentN.current < log.current.length) {
        const n = log.current.length;
        const r = await client.coopSubmit([...log.current]);
        if (!r.ok) {
          setMsg(errorText(String(r.error)));
          break;
        }
        sentN.current = n;
      }
    } finally {
      sending.current = false;
    }
  }, [client]);

  const act = (a: Action, target: number) => {
    if (!fight || fight.battle.status !== "ongoing") return;
    const n = step(fight.battle, a, fight.rng, target > 0 ? target : undefined);
    if (n === fight.battle) return;
    log.current.push({ t: "act", a, ...(target > 0 ? { target } : {}) });
    playEvents(n.events, n.status, { guard: n.guardEarned, boss: true });
    setFight({ ...fight, battle: n });
    void flush();
  };
  const actRef = useRef(act);
  useEffect(() => {
    actRef.current = act;
  });

  // Turn clock: at 0 you defend (same rule as every floor).
  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurnEnd(Date.now() + turnSecs * 1000);
    const id = setTimeout(() => actRef.current("defend", 0), turnSecs * 1000);
    return () => clearTimeout(id);
  }, [live, actions, turnSecs]);

  if (!fight)
    return (
      <Panel title="Tu combate" className="text-center">
        {msg ?? "Cargando el jefe…"}
      </Panel>
    );
  const b = fight.battle;
  if (!live)
    return (
      <Panel title="Tu combate" className="text-center">
        <div className="text-yellow-300">
          {b.status === "won" ? "¡Derrotaste al jefe tú solo!" : "Caíste."} Tu
          daño: {Math.round(damageDealt(b)).toLocaleString("es")}
        </div>
        <div className="text-sm opacity-80">Mira cómo avanza el resto.</div>
        {msg && <div className="mt-1 text-sm text-red-300">{msg}</div>}
      </Panel>
    );
  const secsLeft = Math.max(0, Math.ceil((turnEnd - now) / 1000));
  return (
    <>
      {turnEnd > 0 && now > 0 && (
        <div
          role="timer"
          className={`text-center text-lg tabular-nums ${secsLeft <= 5 ? "text-red-400" : "text-yellow-300"}`}
        >
          Tu turno: {secsLeft} s · si se acaba, te defiendes
        </div>
      )}
      <BattleArena
        b={b}
        enemyExtra={() => `JEFE · daño ${Math.round(damageDealt(b))}`}
        playerExtra={`Nv ${heroLevel}`}
        enemyArt={(_i, c) => (
          <EnemySprite
            family={worldOf(COOP_K.bossFloor).family}
            element={c.char.element}
            boss
            flip
          />
        )}
        enemy={targeting.enemy}
        onTarget={targeting.select}
        inRun
        world={0}
        boss
      />
      <ActionPanel b={b} target={targeting.target} onAct={act} />
    </>
  );
}
