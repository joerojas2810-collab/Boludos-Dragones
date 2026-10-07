"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { EnemySprite } from "@/components/EnemySprite";
import { Panel } from "@/components/Panel";
import { useTargeting } from "@/components/useTargeting";
import { autoBlockReason } from "@/lib/game/auto";
import type { Action } from "@/lib/game/combat";
import { bossRankOf, type FloorKind } from "@/lib/game/floorFights";
import { startRoomFloor } from "@/lib/game/interference";
import type { DoorKind } from "@/lib/game/room";
import { applyStageAction, type StageAction, type StageReplayState } from "@/lib/game/stageReplay";
import { FLOORS_PER_WORLD, WORLDS } from "@/lib/game/worlds";
import type { RoomClient } from "@/lib/roomui/types";
import { errorText } from "@/lib/roomui/viewModels";
import { useNow } from "@/lib/useRoom";
import { playEvents } from "@/lib/sfx";

interface Props {
  client: RoomClient;
  floor: number;
  door: DoorKind;
}

interface Local {
  rs: StageReplayState;
  hero: { name: string; level: number };
}

/**
 * Plays MY floor locally from the server's floor-start climb, records the log and
 * submits it (the server replays it and decides the outcome). One floor = one fight.
 */
export function FloorPlayer({ client, floor, door }: Props) {
  const [loc, setLoc] = useState<Local | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const log = useRef<StageAction[]>([]);
  const sending = useRef(false);

  const rs = loc?.rs ?? null;
  const battle = rs?.battle ?? null;
  const now = useNow(500);
  const [turnEnd, setTurnEnd] = useState(0);
  const turnSecs = client.getView()?.turnSeconds ?? 30;
  const live = !!battle && !rs?.settled;
  const actions = battle?.actions ?? 0;
  const targeting = useTargeting(battle);

  useEffect(() => {
    let alive = true;
    void client.getRun().then((r) => {
      if (!alive) return;
      if (!r.ok) return setMsg(errorText(String(r.error)));
      const f = r.floorRun;
      const kind: FloorKind = door === "hard" || door === "boss" ? door : "easy";
      setLoc({
        rs: startRoomFloor(f.run, kind, f.enemyBoost),
        hero: { name: f.run.hero.name, level: f.run.hero.level },
      });
    });
    return () => {
      alive = false;
    };
  }, [client, door]);

  const submit = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    const r = await client.submit(floor, log.current);
    if (r.ok) {
      const o = r.outcome;
      setSent(
        o === "won"
          ? "¡Ganaste este piso!"
          : o === "lost" || o === "timeout"
            ? "Perdiste este piso."
            : o === "fled"
              ? "Huiste."
              : "Piso resuelto.",
      );
    } else {
      sending.current = false;
      setMsg(errorText(String(r.error)));
    }
  }, [client, floor]);

  /** Applies + records an action; submits once the floor log is complete. */
  const apply = (a: StageAction) => {
    if (!loc) return;
    const n = applyStageAction(loc.rs, a);
    if (!n) return;
    log.current.push(a);
    if ((a.t === "act" || a.t === "auto") && n.battle) {
      const nb = n.battle;
      playEvents(nb.events, nb.status, {
        guard: nb.guardEarned,
        boss: door === "boss",
      });
      const last = nb.events[nb.events.length - 1];
      client.turn({
        n: nb.actions,
        actor: last?.actor === "enemy" ? "e" : "p",
        kind: last && last.kind !== "buff" ? last.kind : "hit",
        dmg: 0,
        pHp: Math.round(nb.player.hp),
        eHp: Math.round(nb.enemies.reduce((t, e) => t + e.hp, 0)),
      });
    }
    if (a.t === "fin") void submit();
    else setLoc({ ...loc, rs: n });
  };

  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  // Turn clock: restarts after every action; at 0 the server-side rule is "Defender".
  useEffect(() => {
    if (!live) return;
    const end = Date.now() + turnSecs * 1000;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurnEnd(end);
    const id = setTimeout(
      () => applyRef.current({ t: "act", a: "defend" }),
      turnSecs * 1000,
    );
    return () => clearTimeout(id);
  }, [live, actions, turnSecs]);

  if (sent)
    return (
      <Panel title="Tu piso" className="text-center">
        <div className="text-yellow-300">{sent}</div>
        <div className="text-sm opacity-80">Espera a los demás.</div>
      </Panel>
    );
  if (!loc || !battle || !rs)
    return (
      <Panel title="Tu piso" className="text-center">
        {msg ?? "Cargando tu piso…"}
      </Panel>
    );

  const spec = rs.stage.fights[0];
  const boss = door === "boss";
  const finalRank = spec.role === "final" ? bossRankOf(spec.enemies[0].bossId) : null;
  const act = (a: Action, t: number) => {
    apply({ t: "act", a, ...(t > 0 ? { target: t } : {}) });
  };
  const secsLeft = Math.max(0, Math.ceil((turnEnd - now) / 1000));
  return (
    <>
      {live && turnEnd > 0 && now > 0 && (
        <div
          role="timer"
          className={`text-center text-lg tabular-nums ${
            secsLeft <= 5 ? "text-red-400" : "text-yellow-300"
          }`}
        >
          Tu turno: {secsLeft} s · si se acaba, te defiendes
        </div>
      )}
      <BattleArena
        b={battle}
        enemyExtra={(i, c) =>
          `${boss && i === 0 ? "JEFE · " : ""}Nv ${c.char.level}`
        }
        playerExtra={`Nv ${loc.hero.level}`}
        enemyArt={(i, c) => (
          <EnemySprite
            family={c.char.family ?? "limo"}
            element={c.char.element}
            boss={boss && i === 0}
            elite={door === "hard"}
            finalRank={i === 0 ? finalRank : null}
          />
        )}
        enemy={targeting.enemy}
        onTarget={targeting.select}
        tall
        inRun
        world={Math.floor((floor - 1) / FLOORS_PER_WORLD) % WORLDS.length}
        finalRank={finalRank}
        boss={boss}
      />
      <ActionPanel
        b={battle}
        target={targeting.target}
        onAct={act}
        auto={
          door === "easy"
            ? {
                reason: autoBlockReason(battle),
                onAuto: () => {
                  apply({ t: "auto" });
                },
              }
            : undefined
        }
      >
        {rs.settled && (
          <button
            className="btn btn-gray w-full text-center"
            onClick={() => apply({ t: "fin" })}
          >
            Continuar
          </button>
        )}
      </ActionPanel>
    </>
  );
}
