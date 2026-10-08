"use client";
import { askConfirm } from "@/lib/dialogs";

// Weekly tower on the stage engine: ONE life, hp carried floor to floor with a small
// heal, one fight per floor, no doors, relics, upgrades or shops. Score = floors
// cleared (tiebreak: fewer battle rounds). The server repeats the logged actions.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { Chip } from "@/components/Chip";
import { EnemySprite } from "@/components/EnemySprite";
import { FightLog, LogPanel } from "@/components/LogPanel";
import { ItemCard } from "@/components/ItemCard";
import { MuteButton } from "@/components/MuteButton";
import { Notice } from "@/components/Notice";
import { Panel } from "@/components/Panel";
import { useTargeting } from "@/components/useTargeting";
import { iconFor } from "@/lib/art";
import { autoBlockReason } from "@/lib/game/auto";
import type { Action } from "@/lib/game/combat";
import { MOD_LABEL, modTip } from "@/lib/game/explain";
import { bossRankOf } from "@/lib/game/floorFights";
import { CLASSES, CLASS_IDS, type Character, type ClassId } from "@/lib/game/characters";
import { heroFromOwned, heroPower } from "@/lib/game/profile";
import { rewardText } from "@/lib/game/missions";
import type { StageAction } from "@/lib/game/stageReplay";
import {
  applyTowerAction,
  isTowerMode,
  startTower,
  TOWER_BLURB,
  TOWER_LABEL,
  type TowerMode as Mode,
  type TowerState,
} from "@/lib/game/tower";
import { FLOORS_PER_WORLD, WORLDS } from "@/lib/game/worlds";
import { playEvents } from "@/lib/sfx";
import { pushNotice, repo, useProfile } from "@/lib/useProfile";
import { characterView } from "@/lib/viewModels";

interface Attempt {
  id: string; // server run id
  st: TowerState;
  log: StageAction[];
}

export function TowerMode() {
  const { profile, ready } = useProfile();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [at, setAt] = useState<Attempt | null>(null);
  const [starting, setStarting] = useState(false);
  const banked = useRef<string | null>(null);
  const live = useRef<Attempt | null>(null);
  const targeting = useTargeting(at && !at.st.rs.settled ? at.st.rs.battle : null);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("torre");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isTowerMode(t)) setMode(t);
  }, []);

  // Sends the log once (the server repeats it and keeps the best floor of the week).
  const bank = useCallback(() => {
    const a = live.current;
    if (!a || banked.current === a.id) return;
    banked.current = a.id;
    repo
      .submitRun(
        a.id,
        a.log,
        { coins: 0, maxFloor: a.st.climb.floor - 1 },
        true,
      )
      .then((info) => {
        const tp = info.towerPrize;
        if (tp && (tp.coins > 0 || tp.dados > 0))
          pushNotice(
            `Premio de pisos nuevos: ${rewardText({ coins: tp.coins, dados: tp.dados, pieces: 0 })}.`,
          );
        if (info.verdict === "truncated" || info.verdict === "mismatch")
          pushNotice("El servidor no pudo repetir todas tus jugadas.");
      })
      .catch((e: unknown) =>
        pushNotice(
          `El servidor rechazó tu intento: ${e instanceof Error ? e.message : "error"}`,
        ),
      );
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", bank);
    return () => {
      window.removeEventListener("pagehide", bank);
      bank(); // leaving mid-attempt counts the floors cleared so far
    };
  }, [bank]);

  if (!ready || !profile || !mode) return null;

  const start = async (classId: ClassId, characterId: string | null) => {
    if (starting) return;
    setStarting(true);
    try {
      const info = await repo.startRun(classId, characterId, undefined, "f", 0, mode);
      const next: Attempt = {
        id: info.runId,
        st: startTower(info.seed, info.hero),
        log: [],
      };
      live.current = next;
      setAt(next);
    } catch (e) {
      pushNotice(
        `No se pudo iniciar el intento: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setStarting(false);
    }
  };

  const send = (a: Attempt, action: StageAction) => {
    const st = applyTowerAction(a.st, action);
    if (!st) return;
    const next = { ...a, st, log: [...a.log, action] };
    live.current = next;
    setAt(next);
    const b = st.rs.battle;
    if (action.t !== "fin" && action.t !== "quit" && b)
      playEvents(b.events, b.status, {
        guard: b.guardEarned,
        boss: st.rs.stage.fights[0].role !== "normal",
      });
    if (st.climb.status === "over") bank();
  };

  // ---------------- pick a hero ----------------
  if (!at) {
    const owned = [...profile.characters]
      .map((c) => ({ c, power: heroPower(profile, c.id) }))
      .sort((x, y) => y.power - x.power || x.c.name.localeCompare(y.c.name));
    return (
      <main className="flex flex-col justify-center gap-4 p-3 pt-8">
        <Notice />
        <Panel
          title={`Elige héroe · ${TOWER_LABEL[mode]}`}
          className="mx-auto w-full max-w-4xl"
        >
          <p className="mb-3 text-center text-base text-[#d9d2ca]">
            {TOWER_BLURB[mode]} Una sola vida: un piso por pelea, sin descanso
            salvo una curación pequeña entre peleas.
          </p>
          {owned.length > 0 ? (
            <div className="grid max-h-[calc(100vh-22rem)] min-h-40 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4 overflow-y-auto pr-1">
              {owned.map(({ c, power }) => {
                const hero = heroFromOwned(profile, c.id);
                return (
                  <button
                    key={c.id}
                    aria-label={c.name}
                    disabled={starting}
                    onClick={() => void start(c.classId, c.id)}
                  >
                    <ItemCard
                      item={characterView(c, {
                        stats: hero?.stats,
                        lines: [`Poder ${power}`],
                      })}
                      size={96}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {CLASS_IDS.map((id) => (
                <button
                  key={id}
                  className="btn text-center"
                  disabled={starting}
                  onClick={() => void start(id, null)}
                >
                  {CLASSES[id].name} al azar
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <button
              className="btn btn-gray text-center"
              onClick={() => router.push("/torre")}
            >
              Volver a la torre
            </button>
          </div>
        </Panel>
      </main>
    );
  }

  const { st } = at;
  const hero: Character = st.climb.hero;
  const floors = st.climb.floor - 1;

  // ---------------- over ----------------
  if (st.climb.status === "over" && (!st.folded || !st.rs.battle))
    return (
      <Over
        mode={mode}
        floors={floors}
        rounds={st.climb.rounds}
        name={hero.name}
        onAgain={() => {
          bank();
          setAt(null);
        }}
      />
    );

  // ---------------- fight ----------------
  const rs = st.rs;
  const b = rs.battle;
  const fight = rs.stage.fights[0];
  if (!b) return null;
  const floor = st.climb.floor;
  const world = Math.floor((floor - 1) / FLOORS_PER_WORLD) % WORLDS.length;
  const role = fight.role;
  const finalRank = role === "final" ? bossRankOf(fight.enemies[0].bossId) : null;
  return (
    <main className="relative isolate flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
      <Notice />
      <div className="mx-auto w-full max-w-[min(100rem,calc((100vh-15rem)*1.78+23rem))] md:min-w-[48rem]">
        <div className="hud-float flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 text-base">
          <b className="text-yellow-300">
            {TOWER_LABEL[mode]} · Piso {floor}
          </b>
          <span>Superados: {floors}</span>
          {role !== "normal" && (
            <span className="font-semibold text-red-300">
              {role === "final" ? "Sala del jefe" : "Jefe"}
            </span>
          )}
          <span className="ml-auto text-[#d9d2ca]">
            {hero.name} · Nv {hero.level} · Una vida
          </span>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[min(100rem,calc((100vh-15rem)*1.78+23rem))] flex-col gap-3 md:min-h-0 md:min-w-[48rem] md:flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0 md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
            <BattleArena
              bleed
              b={b}
              enemyExtra={(i, c) =>
                `${i === 0 && role !== "normal" ? "JEFE · " : ""}Nv ${c.char.level}`
              }
              playerExtra={`Nv ${hero.level}`}
              enemyArt={(i, c) => (
                <EnemySprite
                  family={c.char.family ?? "limo"}
                  element={c.char.element}
                  boss={role !== "normal" && i === 0}
                  finalRank={i === 0 ? finalRank : null}
                />
              )}
              enemy={targeting.enemy}
              onTarget={targeting.select}
              inRun
              world={world}
              finalRank={finalRank}
              boss={role !== "normal"}
              enemyChips={(_, c) =>
                fight.mods
                  .filter((m) => m !== "escudo")
                  .map((m) => (
                    <Chip
                      key={m}
                      tone="danger"
                      icon={iconFor("enemy_modifier", m)}
                      tip={modTip(m, c)}
                    >
                      {MOD_LABEL[m]}
                    </Chip>
                  ))
              }
            />
          </div>
          <div className="flex flex-col gap-2 max-md:contents md:min-h-0 md:w-[22rem]">
            <ActionPanel
              side
              float
              b={b}
              target={targeting.target}
              onAct={(act: Action, t) =>
                send(at, { t: "act", a: act, ...(t > 0 ? { target: t } : {}) })
              }
              auto={{
                reason: autoBlockReason(b),
                onAuto: () => send(at, { t: "auto" }),
              }}
            >
              {rs.settled && (
                <>
                  <div className="text-sm">
                    {b.status === "won" ? `Piso ${floor} superado.` : "Caíste."}
                  </div>
                  <button
                    className="btn btn-gray w-full text-center"
                    onClick={() => send(at, { t: "fin" })}
                  >
                    {b.status === "won" ? "Siguiente piso" : "Ver resultado"}
                  </button>
                </>
              )}
            </ActionPanel>
            <FightLog lines={b.log} />
          </div>
        </div>
        <LogPanel lines={b.log}>
          <button
            className="btn btn-gray text-center"
            onClick={() => {
              void askConfirm(
                "¿Abandonar? Cuenta lo que ya superaste, pero termina el intento.",
                "Abandonar",
              ).then((ok) => {
      if (ok) void send(at, { t: "quit" });
    });
            }}
          >
            Abandonar
          </button>
          <MuteButton />
        </LogPanel>
      </div>
    </main>
  );
}

function Over({
  mode,
  floors,
  rounds,
  name,
  onAgain,
}: {
  mode: Mode;
  floors: number;
  rounds: number;
  name: string;
  onAgain: () => void;
}) {
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-10">
      <Notice />
      <Panel title="Fin del intento" className="mx-auto w-full max-w-xl text-center">
        <div className="text-xl text-yellow-300">
          {TOWER_LABEL[mode]}: superaste {floors} {floors === 1 ? "piso" : "pisos"}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {name} · {rounds} rondas de combate (desempata quien use menos)
        </div>
        <div className="mt-2 text-sm text-green-300">
          Cuenta tu mejor piso de la semana. Intentos ilimitados.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button className="btn text-center" onClick={onAgain}>
            Otro intento
          </button>
          <Link href="/torre" className="btn text-center">
            Ver ranking
          </Link>
          <Link href="/" className="btn btn-gray text-center">
            Menú
          </Link>
        </div>
      </Panel>
    </main>
  );
}
