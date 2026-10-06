"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { EnemySprite } from "@/components/EnemySprite";
import { Panel } from "@/components/Panel";
import { SkillChoice } from "@/components/SkillChoice";
import { useTargeting } from "@/components/useTargeting";
import { autoBlockReason } from "@/lib/game/auto";
import type { Action } from "@/lib/game/combat";
import type { RunAction, ReplayState } from "@/lib/game/replay";
import {
  buyItem,
  eventCost,
  fleeCost,
  itemUseless,
  skillOffer,
  upgradeOffer,
} from "@/lib/game/run";
import { UPGRADES, upgradeLabel, xpToNext } from "@/lib/game/progression";
import { RELICS } from "@/lib/game/relics";
import { FLOORS_PER_WORLD, WORLDS, worldOf } from "@/lib/game/worlds";
import type { DoorKind, InterfereKind } from "@/lib/game/room";
import { applyLogged, startReplay } from "@/lib/roomui/play";
import { doorIndex } from "@/lib/roomui/remote";
import type { RoomClient } from "@/lib/roomui/types";
import { errorText } from "@/lib/roomui/viewModels";
import { playEvents } from "@/lib/sfx";

interface Props {
  client: RoomClient;
  floor: number;
  door: DoorKind;
}

interface Local {
  rs: ReplayState;
  boost: InterfereKind | null;
  seed: number;
}

/**
 * Plays MY floor locally from the server's floor-start Run, records the log and
 * submits it (the server replays it and decides the outcome).
 */
export function FloorPlayer({ client, floor, door }: Props) {
  const [loc, setLoc] = useState<Local | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const log = useRef<RunAction[]>([]);
  const sending = useRef(false);

  const rs0 = loc?.rs;
  const fight = rs0?.fight ?? null;
  const targeting = useTargeting(fight ? fight.battle : null);

  const begin = useCallback(
    (l: Local): Local => {
      // Door first (index of my door kind in the floor's door list), once no relic is owed.
      if (l.rs.run.pendingRelic || l.rs.run.node || l.rs.fight) return l;
      const i = doorIndex(l.seed, floor, door);
      const n = i < 0 ? null : applyLogged(l.rs, { t: "door", i }, l.boost);
      if (!n) return l;
      log.current.push({ t: "door", i });
      return { ...l, rs: n };
    },
    [floor, door],
  );

  useEffect(() => {
    let live = true;
    void client.getRun().then((r) => {
      if (!live) return;
      if (!r.ok) return setMsg(errorText(String(r.error)));
      const f = r.floorRun;
      setLoc(
        begin({
          rs: startReplay(f.run),
          boost: f.enemyBoost,
          seed: f.seed,
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [client, begin]);

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
  const apply = (a: RunAction) => {
    if (!loc) return;
    const n = applyLogged(loc.rs, a, loc.boost);
    if (!n) return;
    log.current.push(a);
    if ((a.t === "act" || a.t === "auto") && n.fight)
      playEvents(n.fight.battle.events, n.fight.battle.status);
    const ends = a.t === "fin" || a.t === "leave" || a.t === "pick" || a.t === "skill";
    const next = a.t === "relic" ? begin({ ...loc, rs: n }) : { ...loc, rs: n };
    setLoc(next);
    if (ends && !n.picks && !n.fight) void submit();
  };

  if (sent)
    return (
      <Panel title="Tu piso" className="text-center">
        <div className="text-yellow-300">{sent}</div>
        <div className="text-sm opacity-80">Espera a los demás.</div>
      </Panel>
    );
  if (!loc)
    return (
      <Panel title="Tu piso" className="text-center">
        {msg ?? "Cargando tu piso…"}
      </Panel>
    );

  const { rs } = loc;
  const run = rs.run;

  if (run.pendingRelic && !rs.fight)
    return (
      <Panel title="Reliquia">
        <div className="mb-3 text-center text-yellow-300">Elige una reliquia</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {run.pendingRelic.map((id) => (
            <button key={id} className="btn" onClick={() => apply({ t: "relic", id })}>
              <div className="font-semibold">{RELICS[id].name}</div>
              <div className="text-sm">{RELICS[id].description}</div>
            </button>
          ))}
        </div>
      </Panel>
    );

  if (fight) {
    const b = fight.battle;
    const node = fight.node;
    const act = (a: Action, t: number) => {
      apply({ t: "act", a, ...(t > 0 ? { target: t } : {}) });
    };
    return (
      <>
        <BattleArena
          b={fight.battle}
          enemyExtra={(i, c) =>
            `${node.kind === "boss" && i === 0 ? "JEFE · " : ""}Nv ${c.char.level}`
          }
          playerExtra={`Nv ${run.hero.level} · XP ${run.hero.xp}/${xpToNext(run.hero.level)}`}
          enemyArt={(i, c) => (
            <EnemySprite
              family={worldOf(run.floor).family}
              element={c.char.element}
              boss={node.kind === "boss" && i === 0}
              flip
            />
          )}
          enemy={targeting.enemy}
          onTarget={targeting.select}
          inRun
          world={Math.floor((run.floor - 1) / FLOORS_PER_WORLD) % WORLDS.length}
          boss={node.kind === "boss"}
        />
        <ActionPanel
          b={b}
          target={targeting.target}
          onAct={act}
          fleeCost={fleeCost(run)}
          auto={
            node.kind === "easy"
              ? {
                  reason: autoBlockReason(b, node.kind),
                  onAuto: () => {
                    apply({ t: "auto" });
                  },
                }
              : undefined
          }
        >
          {fight.result && (
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

  if (rs.picks)
    return (
      <Panel title="¡Subes de nivel!">
        {run.pendingSkill ? (
          <SkillChoice
            classId={run.hero.classId}
            ids={skillOffer(run)}
            onPick={(id) => apply({ t: "skill", id })}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {upgradeOffer(run).map((id) => (
              <button key={id} className="btn" onClick={() => apply({ t: "pick", id })}>
                <div className="font-semibold">{UPGRADES[id].name}</div>
                <div className="text-sm">{upgradeLabel(id, run.ups[id] ?? 0)}</div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    );

  const node = run.node;
  const leave = (
    <button
      className="btn btn-gray mt-3 w-full text-center"
      onClick={() => apply({ t: "leave" })}
    >
      Continuar
    </button>
  );
  if (node?.type === "chest")
    return (
      <Panel title="Cofre" className="text-center">
        <div className="text-yellow-300">Encuentras {node.coins} monedas.</div>
        {leave}
      </Panel>
    );
  if (node?.type === "rest")
    return (
      <Panel title="Descanso" className="text-center">
        <div className="text-yellow-300">
          {node.healed > 0 ? `Recuperas ${node.healed} de vida.` : "Ya estás en plena forma."}
        </div>
        {leave}
      </Panel>
    );
  if (node?.type === "shop")
    return (
      <Panel title="Mercader">
        <div className="mb-2 text-center text-yellow-300">Tienes {run.coins} monedas</div>
        <div className="space-y-2">
          {node.items.map((it) => {
            const bought = run.bought.includes(it.id);
            const desc =
              it.kind === "stat"
                ? `${UPGRADES[it.stat].name}: ${upgradeLabel(it.stat, run.ups[it.stat] ?? 0)}`
                : it.label;
            return (
              <div key={it.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">{desc}</span>
                <button
                  className="btn w-28 shrink-0 text-center"
                  disabled={bought || run.coins < it.price || itemUseless(run, it)}
                  onClick={() => {
                    if (buyItem(run, it.id)) apply({ t: "buy", id: it.id });
                  }}
                >
                  {bought ? "Comprado" : `● ${it.price}`}
                </button>
              </div>
            );
          })}
        </div>
        {leave}
      </Panel>
    );
  if (node?.type === "event") {
    const ev = node.event;
    return (
      <Panel title={ev.title}>
        <div className="mb-3 text-center">{ev.text}</div>
        <div className="grid gap-2">
          {ev.choices.map((c, i) => (
            <button
              key={i}
              className="btn"
              disabled={!eventCost(run, c).affordable}
              onClick={() => apply({ t: "event", i })}
            >
              {c.label}
            </button>
          ))}
        </div>
        {leave}
      </Panel>
    );
  }
  if (!node && run.floorCleared)
    return (
      <Panel title="Evento" className="text-center">
        <div className="text-yellow-300">Hecho.</div>
        {leave}
      </Panel>
    );
  return (
    <Panel title="Tu piso" className="text-center">
      {msg ?? "Esperando…"}
    </Panel>
  );
}
