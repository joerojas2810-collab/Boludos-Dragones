"use client";
import { askConfirm } from "@/lib/dialogs";

import { levelTip } from "@/lib/game/explain";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { ArenaBackground } from "@/components/ArenaBackground";
import { BattleArena } from "@/components/BattleArena";
import { Chip } from "@/components/Chip";
import { Confetti } from "@/components/Confetti";
import { ElementIcon } from "@/components/ElementIcon";
import { EnemySprite } from "@/components/EnemySprite";
import { EquipmentEditor } from "@/components/EquipmentEditor";
import { LogPanel } from "@/components/LogPanel";
import { Icon } from "@/components/Icon";
import { ItemCard } from "@/components/ItemCard";
import { MuteButton } from "@/components/MuteButton";
import { Notice } from "@/components/Notice";
import { Panel } from "@/components/Panel";
import {ResultPresentation} from "@/components/ResultPresentation";
import {combatScene} from "@/lib/art/backgrounds";
import {isPixel} from "@/lib/art/pixel";
import { StarRow } from "@/components/StarRow";
import { Tooltip } from "@/components/Tooltip";
import { useTargeting } from "@/components/useTargeting";
import { iconFor } from "@/lib/art";
import { autoBlockReason } from "@/lib/game/auto";
import { type Action } from "@/lib/game/combat";
import { bossAscensionNotice } from "@/lib/game/bossRules";
import { elementMultiplier, ELEMENT_LABEL } from "@/lib/game/elements";
import { lossLine, MOD_LABEL, modTip } from "@/lib/game/explain";
import { levelCap, xpToNextLevel } from "@/lib/game/heroLevel";
import { recommendedPower } from "@/lib/game/recommended";
import {
  clearedLevels,
  isLevelUnlocked,
  isStepUnlocked,
  isRouteDone,
  maxAscension,
} from "@/lib/game/dungeonProgress";
import {
  DUNGEON_THEMES,
  LEVELS_PER_ROUTE,
  ROUTE_IDS,
  type RouteId,
  levelElement,
  levelsOf,
} from "@/lib/game/levels";
import { levelXp, type LevelLoot } from "@/lib/game/levelLoot";
import {
  heroFromOwned,
  bestAutoMode,
  heroPower,
  type LevelBank,
  type OwnedCharacter,
  type Profile,
} from "@/lib/game/profile";
import { DIFFICULTIES, RARITIES, type Difficulty } from "@/lib/game/rarity";
import {
  currentFight,
  levelFights,
  type FightRole,
} from "@/lib/game/stage";
import { sweepBlock } from "@/lib/game/sweep";
import {
  applyStageAction,
  initialStageReplay,
  type StageAction,
  type StageReplayState,
} from "@/lib/game/stageReplay";
import { SLOTS, WEAPON_TYPE_DATA, type Slot } from "@/lib/game/weapons";
import type { LevelStartInfo } from "@/lib/repo";
import { pushNotice, repo, useProfile } from "@/lib/useProfile";
import { slotKey } from "@/lib/game/profile";
import { playEvents } from "@/lib/sfx";
import { characterView } from "@/lib/viewModels";

const SLOT_LABEL: Record<Slot, string> = {
  arma: "Arma",
  casco: "Casco",
  peto: "Peto",
  piernas: "Piernas",
  zapatos: "Zapatos",
  collar: "Collar",
};
const ROLE_LABEL: Record<FightRole, string> = {
  normal: "",
  elite: "Élite",
  final: "Jefe",
};
const ROUTE_STEP_STORAGE_KEY = "dungeon-route-steps-v1";
type SavedRouteStep = { difficulty: Difficulty; asc: 0 | 1 | 2 | 3 | 4 | 5 };
const ROUTE_COPY: Record<RouteId, { ambience: string; levels: readonly [string, string, string]; bossNode: string; mechanic: string }> = {
  lord_of_flies: { ambience: "La niebla cubre el camino y también nuestras decisiones dudosas.", levels: ["Muelle Hundido", "Charca Umbría", "Nido de la Plaga"], bossNode: "Guarida de las Moscas", mechanic: "Plaga: te quita vida al final de cada turno del jefe." },
  ash_king: { ambience: "La ceniza cae despacio; el calor, en cambio, no espera.", levels: ["Portal de Brasa", "Galería Tiznada", "Forja del Monarca"], bossNode: "Corte de Ceniza", mechanic: "Presión: su daño crece con cada turno suyo." },
  eternal_watcher: { ambience: "El cañón repite tus pasos; ojalá no también tus errores.", levels: ["Senda de Plumas", "Puente de los Ecos", "Observatorio Ciego"], bossNode: "Torre del Vigía", mechanic: "Aprende: se adapta si repites la misma acción." },
  hollow_colossus: { ambience: "La piedra se mueve sola. Seguro que fue el viento.", levels: ["Boca de la Cantera", "Galerías de Basalto", "Cámara Partida"], bossNode: "Sala del Coloso", mechanic: "Armadura: se rompe y vuelve a cubrirlo." },
  thunder_king: { ambience: "Cada trueno llega antes; ya no queda tiempo para discutir.", levels: ["Escalinata del Rayo", "Aguja Relampagueante", "Plataforma Celeste"], bossNode: "Cima del Trueno", mechanic: "Velocidad: acelera con sus turnos." },
  mother_hydra: { ambience: "El agua parece calma; mejor no contar las cabezas.", levels: ["Bajío de Burbujas", "Paso de las Cabezas", "Umbral Sumergido"], bossNode: "Foso de la Hidra", mechanic: "Cabezas: se cura y suma impactos al cruzar umbrales de vida." },
  withered_queen: { ambience: "Las brasas respiran despacio; el ritual no tiene apuro.", levels: ["Vereda de Escoria", "Arco de Raíces", "Capilla Marchita"], bossNode: "Santuario de la Reina", mechanic: "Marchitar: anuncia un ritual cada tres turnos suyos; solo Sello o Sabotaje lo interrumpen." },
  faceless_one: { ambience: "Nadie muestra el rostro; hasta las máscaras guardan secretos.", levels: ["Puerta Astillada", "Corredor de Máscaras", "Atrio Deshabitado"], bossNode: "Salón del Sin Rostro", mechanic: "Posturas: alterna entre ataque y defensa." },
  great_devourer: { ambience: "El viento empuja hacia la garganta; los restos llegaron primero.", levels: ["Camino de Restos", "Garganta Hambrienta", "Borde del Vacío"], bossNode: "Fauces del Devorador", mechanic: "Hambre: se cura al golpear y suma un impacto con poca vida." },
};

function readRouteStep(route: RouteId): SavedRouteStep {
  try {
    const raw = window.localStorage.getItem(ROUTE_STEP_STORAGE_KEY);
    if (!raw) return { difficulty: "f", asc: 0 };
    const stored = JSON.parse(raw) as Record<string, { difficulty?: unknown; asc?: unknown }>;
    const candidate = stored[route];
    if (
      candidate && DIFFICULTIES.includes(candidate.difficulty as Difficulty) &&
      Number.isInteger(candidate.asc) && Number(candidate.asc) >= 0 && Number(candidate.asc) <= 5
    ) return { difficulty: candidate.difficulty as Difficulty, asc: Number(candidate.asc) as SavedRouteStep["asc"] };
  } catch {
    // Storage can be disabled; this preference is optional.
  }
  return { difficulty: "f", asc: 0 };
}

function rememberRouteStep(route: RouteId, difficulty: Difficulty, asc: number): void {
  try {
    const raw = window.localStorage.getItem(ROUTE_STEP_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    stored[route] = { difficulty, asc };
    window.localStorage.setItem(ROUTE_STEP_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be disabled; the current selection still works in memory.
  }
}

function highestRouteClear(progress: Profile["dungeons"], route: RouteId): string | null {
  let highest: string | null = null;
  for (const difficulty of DIFFICULTIES) {
    for (let asc = 0; asc <= 5; asc++) {
      if (isRouteDone(progress, route, difficulty, asc)) highest = `${difficulty.toUpperCase()}+${asc}`;
    }
  }
  return highest;
}

function routeProgressSummary(progress: Profile["dungeons"], route: RouteId): string {
  const highest = highestRouteClear(progress, route);
  if (highest) return `Mayor escalón superado: ${highest}`;
  let partial: { step: string; levels: number } | null = null;
  for (const difficulty of DIFFICULTIES) {
    for (let asc = 0; asc <= 5; asc++) {
      const levels = clearedLevels(progress, route, difficulty, asc);
      if (levels > (partial?.levels ?? 0)) partial = { step: `${difficulty.toUpperCase()}+${asc}`, levels };
    }
  }
  return partial ? `En curso: ${partial.step} · ${partial.levels}/4 niveles` : "Aún sin completar";
}

function hasAnyRouteClear(progress: Profile["dungeons"], route: RouteId): boolean {
  return DIFFICULTIES.some((difficulty) =>
    Array.from({ length: 6 }, (_, asc) => isRouteDone(progress, route, difficulty, asc)).some(Boolean),
  );
}

interface Attempt {
  route: RouteId;
  difficulty: Difficulty;
  level: number;
  asc: number;
  heroId: string;
  rs: StageReplayState;
  actions: StageAction[]; // what a replay needs (seed + hero + fights + these)
  info: LevelStartInfo; // attempt id + seed + hero snapshot (the server's in remote mode)
}
interface Outcome {
  attempt: Attempt;
  bank: LevelBank;
  loot: LevelLoot;
  before: { level: number; xp: number };
  sweeps?: number; // total of a multi-sweep (×N)
}
type View =
  | { t: "routes" }
  | { t: "levels"; route: RouteId; difficulty: Difficulty }
  | { t: "prep"; route: RouteId; difficulty: Difficulty; level: number }
  | { t: "fight"; a: Attempt }
  | { t: "starting" } // waiting for the server to open the attempt
  | { t: "saving" } // waiting for the server to verify and pay the attempt
  | { t: "result"; o: Outcome };

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="flex flex-col justify-center gap-4 p-3 pt-10">
    {children}
  </main>
);

export function ProgressMode() {
  const { profile, ready } = useProfile();
  const [view, setView] = useState<View>({ t: "routes" });
  const [asc0, setAsc] = useState(0);
  const asc = asc0;
  const [heroId, setHeroId] = useState<string | null>(null);
  const targeting = useTargeting(
    view.t === "fight" ? view.a.rs.battle : null,
  );
  if (!ready || !profile) return null;

  const hero = profile.characters.find((c) => c.id === heroId) ?? null;

  const enter = async (
    route: RouteId,
    difficulty: Difficulty,
    level: number,
    id: string,
    ascOverride?: number,
  ) => {
    const asc = ascOverride ?? asc0;
    if (ascOverride !== undefined) setAsc(ascOverride);
    const owned = profile.characters.find((c) => c.id === id);
    if (!owned || view.t === "starting") return; // ignore taps while the server opens the attempt
    const spec = levelsOf(route, difficulty)[level];
    setHeroId(id); // the next attempt keeps the same hero
    setView({ t: "starting" });
    try {
      const info = await repo.startLevel(owned.id, route, difficulty, level, asc);
      const rs = initialStageReplay(
        info.seed,
        info.hero,
        levelFights(spec, asc),
        asc,
      );
      setView({
        t: "fight",
        a: { route, difficulty, level, asc, heroId: owned.id, rs, actions: [], info },
      });
    } catch (e) {
      pushNotice(e instanceof Error ? e.message : "No se pudo empezar el nivel.");
      setView({ t: "prep", route, difficulty, level });
    }
  };

  // Instant resolution of an already-cleared level; shows the usual result screen.
  const sweep = async (route: RouteId, difficulty: Difficulty, level: number, id: string, times = 1) => {
    const owned = profile.characters.find((c) => c.id === id);
    if (!owned || view.t === "saving") return;
    setHeroId(id);
    setView({ t: "saving" });
    let out: Awaited<ReturnType<typeof repo.sweepLevel>> | null = null;
    let bank: LevelBank | null = null;
    let loot: LevelLoot = { escamas: 0, dados: 0, pieces: [] };
    let done = 0;
    try {
      for (; done < times; done++) {
        const o = await repo.sweepLevel(owned.id, route, difficulty, level, asc);
        out = o;
        bank = bank
          ? { ...o.bank, coins: bank.coins + o.bank.coins, chest: bank.chest + o.bank.chest, xp: bank.xp + o.bank.xp, levelsGained: bank.levelsGained + o.bank.levelsGained }
          : o.bank;
        loot = { escamas: loot.escamas + o.loot.escamas, dados: loot.dados + o.loot.dados, pieces: [...loot.pieces, ...o.loot.pieces] };
      }
    } catch (e) {
      pushNotice(
        done > 0
          ? `Barrido detenido tras ${done} de ${times}: ${e instanceof Error ? e.message : "error"}`
          : e instanceof Error ? e.message : "No se pudo barrer el nivel.",
      );
    }
    if (!out || !bank) return setView({ t: "prep", route, difficulty, level });
    const info: LevelStartInfo = {
      attemptId: "sweep",
      seed: out.stage.seed,
      hero: out.stage.hero,
    };
    setView({
      t: "result",
      o: {
        attempt: {
          route,
          difficulty,
          level,
          asc,
          heroId: owned.id,
          rs: { stage: out.stage, battle: null, rng: null, settled: null },
          actions: [],
          info,
        },
        bank,
        loot,
        before: { level: owned.level, xp: owned.xp },
        sweeps: done,
      },
    });
  };

  // Banks once, the moment the attempt ends (win, loss or abandon). In remote mode the
  // server replays the action log and decides coins, EXP and loot.
  const finish = async (a: Attempt, rs: StageReplayState) => {
    const owned = profile.characters.find((c) => c.id === a.heroId);
    if (!owned) return;
    setView({ t: "saving" });
    try {
      const out = await repo.finishLevel({
        info: a.info,
        heroId: a.heroId,
        route: a.route,
        difficulty: a.difficulty,
        level: a.level,
        asc: a.asc,
        stage: rs.stage,
        actions: a.actions,
      });
      setView({
        t: "result",
        o: {
          attempt: { ...a, rs },
          bank: out.bank,
          loot: out.loot,
          before: { level: owned.level, xp: owned.xp },
        },
      });
    } catch (e) {
      pushNotice(
        e instanceof Error ? e.message : "No se pudo guardar el resultado.",
      );
      setView({ t: "routes" });
    }
  };

  const send = (a: Attempt, action: StageAction) => {
    const next = applyStageAction(a.rs, action);
    if (!next) return;
    const na = { ...a, rs: next, actions: [...a.actions, action] };
    if (action.t !== "fin" && action.t !== "quit" && next.battle)
      playEvents(next.battle.events, next.battle.status, {
        guard: next.battle.guardEarned,
        boss: currentFight(next.stage)?.role === "final",
      });
    if (next.stage.status !== "playing") void finish(na, next);
    else setView({ t: "fight", a: na });
  };

  // ---------------- fight ----------------
  if (view.t === "fight") {
    const a = view.a;
    const { rs } = a;
    const b = rs.battle;
    const fight = currentFight(rs.stage);
    if (!b || !fight) return null;
    const theme = DUNGEON_THEMES[a.route];
    const spec = levelsOf(a.route, a.difficulty)[a.level];
    const settled = rs.settled;
    const role = fight.role;
    const tools = (
      <>
            <button
              className="btn btn-gray text-center"
              onClick={() => {
                void askConfirm(
                  "¿Abandonar el nivel? Cuenta como perdido, pero conservas la EXP ganada.",
                  "Abandonar",
                ).then((ok) => {
      if (ok) void send(a, { t: "quit" });
    });
              }}
            >
              Abandonar
            </button>
            <MuteButton />
      </>
    );
    return (
      <main className="relative isolate flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
        <Notice />
        <div className="fixed inset-0 -z-10 max-md:hidden">
          <ArenaBackground
            world={theme.world}
            boss={role === "final"}
            rank={a.difficulty}
          />
        </div>
        <div className="mx-auto w-full max-w-[120rem] md:min-w-[48rem]">
          <div className="hud-float flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 text-base">
            <b className="text-yellow-300">
              {theme.name} · Nivel {a.level + 1}
            </b>
            <span>
              Pelea {rs.stage.index + 1}/{rs.stage.fights.length}
            </span>
            {role !== "normal" && (
              <span className="font-semibold text-red-300">
                {ROLE_LABEL[role]}
              </span>
            )}
            <ElementIcon
              element={levelElement(spec, a.asc)}
              className="h-5"
            />
            {a.asc > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name={`asc_${a.asc}`} className="h-5" /> Ascensión +
                {a.asc}
              </span>
            )}
            <span className="ml-auto text-[#d9d2ca]">
              {rs.stage.hero.name} · Nv {rs.stage.hero.level} · +
              {rs.stage.xp} EXP
            </span>
            <span className="max-md:hidden">
              <LogPanel compact lines={b.log}>
                {tools}
              </LogPanel>
            </span>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-3 md:min-h-0 md:min-w-[48rem] md:flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0">
            <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
              <BattleArena
                bleed
                b={b}
                enemyExtra={(i, c) =>
                  `${i === 0 && role !== "normal" ? `${ROLE_LABEL[role].toUpperCase()} · ` : ""}Nv ${c.char.level}`
                }
                playerExtra={`Nv ${rs.stage.hero.level}`}
                enemyArt={(i, c) => (
                  <EnemySprite
                    family={c.char.family ?? "limo"}
                    element={c.char.element}
                    boss={role === "final" && i === 0}
                    elite={role === "elite" && i === 0}
                    finalRank={role === "final" && i === 0 ? a.route : null}
                  />
                )}
                enemy={targeting.enemy}
                onTarget={targeting.select}
                inRun
                world={theme.world}
                finalRank={role === "final" ? a.route : null}
                boss={role === "final"}
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
            <div className="flex flex-col gap-2 max-md:contents">
              <ActionPanel
                float
              bar
                b={b}
                target={targeting.target}
                onAct={(act: Action, t) =>
                  send(a, { t: "act", a: act, ...(t > 0 ? { target: t } : {}) })
                }
                auto={{
                  reason: autoBlockReason(b),
                  onAuto: () => send(a, { t: "auto" }),
                }}
              >
                {settled && (
                  <>
                    <div className="text-sm">
                      {b.status === "won"
                        ? settled.status === "cleared"
                          ? "¡Última pelea ganada!"
                          : "Pelea ganada."
                        : lossLine(b)}
                    </div>
                    <button
                      className="btn btn-gray w-full text-center"
                      onClick={() => send(a, { t: "fin" })}
                    >
                      {settled.status === "playing"
                        ? "Continuar"
                        : "Ver resultado"}
                    </button>
                  </>
                )}
              </ActionPanel>
            </div>
          </div>
          <LogPanel lines={b.log} className="md:hidden">
            {tools}
          </LogPanel>
        </div>
      </main>
    );
  }

  if (view.t === "starting")
    return (
      <Shell>
        <Notice />
        <Panel title="Entrando…" className="mx-auto w-full max-w-md text-center">
          Preparando el nivel.
        </Panel>
      </Shell>
    );

  if (view.t === "saving")
    return (
      <Shell>
        <Notice />
        <Panel title="Guardando…" className="mx-auto w-full max-w-md text-center">
          Verificando tu resultado.
        </Panel>
      </Shell>
    );

  // ---------------- result ----------------
  if (view.t === "result") {
    const { o } = view;
    const a = o.attempt;
    const st = a.rs.stage;
    const won = st.status === "cleared" && o.bank.cleared;
    const hasNext =
      won &&
      a.level + 1 < LEVELS_PER_ROUTE &&
      isLevelUnlocked(o.bank.profile.dungeons, a.route, a.difficulty, a.level + 1, a.asc);
    const pieces = o.loot.pieces;
    // Last level cleared: offer the next ascension of this dungeon and the next dungeon.
    const dungeonEnd = won && a.level + 1 >= LEVELS_PER_ROUTE;
    const nextAsc =
      dungeonEnd &&
      a.asc + 1 <= maxAscension(o.bank.profile.dungeons, a.difficulty)
        ? a.asc + 1
        : null;
    const nextDifficulty = dungeonEnd
      ? DIFFICULTIES[DIFFICULTIES.indexOf(a.difficulty) + 1]
      : undefined;
    const nextDifficultyOpen = nextDifficulty !== undefined && isStepUnlocked(o.bank.profile.dungeons, { difficulty: nextDifficulty, asc: 0 });
    return (
      <Shell>
        <Notice />
        {won && <Confetti />}
        <ResultPresentation
          title={won ? "¡Nivel superado!" : "Nivel perdido"}
          hero={{...st.hero,level:o.bank.newLevel || st.hero.level}} tone={won?"victory":"defeat"} scene={combatScene(DUNGEON_THEMES[a.route].world,true,a.difficulty)}
          className="mx-auto w-full max-w-2xl space-y-2 text-center"
        >
          {won && dungeonEnd && (
            <div className="dungeon-sign mx-auto mb-3 max-w-lg px-4 py-5 sm:px-8" aria-label={`${DUNGEON_THEMES[a.route].name}: completado`}>
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#d9d2ca]">Ruta · {a.difficulty.toUpperCase()}+{a.asc}</span>
              <h2 className="name-title mt-1 text-2xl text-yellow-200 sm:text-3xl">{DUNGEON_THEMES[a.route].name}</h2>
              <span className="dungeon-stamp mt-3" role="img" aria-label="Completado">COMPLETADO</span>
            </div>
          )}
          <div className="text-[#d9d2ca]">
            {DUNGEON_THEMES[a.route].name} · Nivel {a.level + 1}
            {a.asc > 0 && ` · Ascensión +${a.asc}`}
            {won && o.bank.repeat && " · repetido"}
            {o.sweeps && o.sweeps > 1 && ` · barrido ×${o.sweeps}`}
          </div>
          <div className="result-xp">
            <b className="text-green-300">+{o.bank.xp} EXP</b> ({st.hero.name})
            {o.bank.xp > st.xp && st.xp > 0 && (
              <span className="text-yellow-300">
                {" "}
                · bono de alcance ×{Math.round(o.bank.xp / Math.max(1, st.xp))}
              </span>
            )}
            {o.bank.levelsGained > 0 && (
              <div className="font-semibold text-yellow-300">
                ¡Sube de nivel! Nv {o.before.level} → Nv {o.bank.newLevel}
              </div>
            )}
            {o.bank.newLevel === o.before.level && o.bank.xp > 0 && (
              <div className="text-xs text-[#d9d2ca]">
                {levelCapNote(o.bank.profile, a.heroId)}
              </div>
            )}
          </div>
          {won ? (
            <>
              <div className="result-coins text-yellow-300">
                <Icon name="system_coin" className="h-5" /> +{o.bank.coins}{" "}
                monedas
                {o.bank.chest > 0 && (
                  <b> · ¡Cofre de primera limpieza: +{o.bank.chest}!</b>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {pieces.length > 0 ? (
                  <div className="result-loot flex flex-wrap justify-center gap-2">
                    {pieces.map((p, i) => (
                      <ItemCard
                        key={i}
                        item={{
                          kind: "weapon",
                          type: p.type,
                          name: p.name,
                          rarity: p.rarity,
                          element: p.element,
                          stars: 0,
                        }}
                        size={isPixel()?72:104}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-[#d9d2ca]">Sin piezas esta vez.</span>
                )}
                {(o.loot.escamas > 0 || o.loot.dados > 0) && (
                  <div className="flex flex-wrap justify-center gap-4">
                    {o.loot.escamas > 0 && (
                      <span className="flex items-center gap-1">
                        <Icon name="material_scales" className="h-6" /> +{o.loot.escamas} Escamas
                      </span>
                    )}
                    {o.loot.dados > 0 && (
                      <span className="flex items-center gap-1">
                        <Icon name="material_loaded_die" className="h-6" /> +{o.loot.dados} Dado cargado
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="result-loss text-sm text-[#d9d2ca]">
              Sin monedas ni botín. Prueba con otro héroe o con mejor equipo.
            </div>
          )}
          {hasNext && (
            <NextStage
              profile={o.bank.profile}
              route={a.route}
              difficulty={a.difficulty}
              level={a.level + 1}
              asc={a.asc}
              heroId={a.heroId}
            />
          )}
          <div className="result-actions flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {hasNext && (
              <button
                className="btn text-center"
                onClick={() => void enter(a.route, a.difficulty, a.level + 1, a.heroId)}
              >
                Siguiente nivel
              </button>
            )}
            {nextAsc !== null && (
              <button
                className="btn text-center"
                onClick={() => void enter(a.route, a.difficulty, 0, a.heroId, nextAsc)}
              >
                Siguiente ascensión (+{nextAsc})
              </button>
            )}
            {nextDifficultyOpen && nextDifficulty && (
              <button
                className={`btn text-center ${nextAsc !== null ? "btn-gray" : ""}`}
                onClick={() => void enter(a.route, nextDifficulty, 0, a.heroId, 0)}
              >
                Siguiente dificultad: {nextDifficulty.toUpperCase()}
              </button>
            )}
            <button
              className={`btn text-center ${hasNext || nextAsc !== null || nextDifficultyOpen ? "btn-gray" : ""}`}
              onClick={() => void enter(a.route, a.difficulty, a.level, a.heroId)}
            >
              {won ? "Repetir" : "Reintentar"}
            </button>
            <button
              className="btn btn-gray text-center"
              onClick={() => {
                setHeroId(a.heroId);
                setView({
                  t: "prep",
                  route: a.route,
                  difficulty: a.difficulty,
                  level: hasNext ? a.level + 1 : a.level,
                });
              }}
            >
              Cambiar héroe
            </button>
            <button
              className="btn btn-gray text-center"
              onClick={() => setView({ t: "routes" })}
            >
              Volver
            </button>
          </div>
        </ResultPresentation>
      </Shell>
    );
  }

  // ---------------- prep ----------------
  if (view.t === "prep") {
    return (
      <Prep
        profile={profile}
        route={view.route}
        difficulty={view.difficulty}
        level={view.level}
        asc={asc}
        setHeroId={setHeroId}
        hero={hero}
        onEnter={(id) => void enter(view.route, view.difficulty, view.level, id)}
        onSweep={(id, n) => void sweep(view.route, view.difficulty, view.level, id, n)}
        onBack={() => setView({ t: "routes" })}
      />
    );
  }

  // ---------------- route difficulty and levels ----------------
  if (view.t === "levels") {
    const { route, difficulty } = view;
    const theme = DUNGEON_THEMES[route];
    const a = asc;
    const done = clearedLevels(profile.dungeons, route, difficulty, a);
    const routeDone = isRouteDone(profile.dungeons, route, difficulty, a);
    const lockReason = (step: SavedRouteStep) => step.asc > 0
      ? `Completa ${step.difficulty.toUpperCase()}+${step.asc - 1} en cualquier ruta`
      : `Completa ${DIFFICULTIES[DIFFICULTIES.indexOf(step.difficulty) - 1]?.toUpperCase()}+0 en cualquier ruta`;
    const selectStep = (step: SavedRouteStep) => {
      if (!isStepUnlocked(profile.dungeons, step)) return;
      setAsc(step.asc);
      rememberRouteStep(route, step.difficulty, step.asc);
      setView({ t: "levels", route, difficulty: step.difficulty });
    };
    const families: Record<string, string> = { limo: "Slimes", diablillo: "Diablillos", arpia: "Arpías", golem: "Gólems", espectro: "Espectros" };
    const routeFamilies = [...theme.families, ...(theme.guest ? [theme.guest] : [])].map((family) => families[family]).join(" · ");
    const routeCopy = ROUTE_COPY[theme.bossId];
    const currentStep = { difficulty, asc: a as SavedRouteStep["asc"] };
    const nextLockedStep = DIFFICULTIES.flatMap((stepDifficulty) =>
      Array.from({ length: 6 }, (_, stepAsc) => ({ difficulty: stepDifficulty, asc: stepAsc as SavedRouteStep["asc"] })),
    ).find((step) => !isStepUnlocked(profile.dungeons, step));
    return (
      <Shell>
        <Notice />
        <Panel title={theme.name} className="mx-auto w-full max-w-3xl space-y-3">
          <p className="-mt-2 text-center text-sm italic text-[#d9d2ca]">{routeCopy.ambience}</p>
          <div className="pixel-frame space-y-2 p-2 sm:p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-[#d9d2ca]">Dificultad</span>
              <span className="text-xs text-yellow-100">{theme.name} · {difficulty.toUpperCase()}+{a}</span>
            </div>
            <div className="grid grid-cols-7 gap-1" aria-label="Dificultad F a S">
              {DIFFICULTIES.map((rank) => {
                const step = { difficulty: rank, asc: 0 as const };
                const unlocked = isStepUnlocked(profile.dungeons, step);
                const selected = rank === difficulty;
                const reason = lockReason(step);
                return (
                  <button key={rank} type="button" disabled={!unlocked} aria-pressed={selected}
                    title={unlocked ? rank.toUpperCase() : `Bloqueado: ${reason}`}
                    aria-label={unlocked ? rank.toUpperCase() : `${rank.toUpperCase()} bloqueado. ${reason}`}
                    onClick={() => {
                      const next = { difficulty: rank, asc: Math.min(a, maxAscension(profile.dungeons, rank)) as SavedRouteStep["asc"] };
                      selectStep(next);
                    }}
                    className={`pixel-frame flex min-h-10 items-center justify-center gap-0.5 px-0.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm ${selected ? "text-yellow-200 ring-2 ring-yellow-400" : "text-[#d9d2ca]"}`}>
                    {!unlocked && <Icon name="system_locked" className="h-3.5 w-3.5" />}{rank.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#d9d2ca]">Ascensión</span>
              <span className="text-xs text-[#d9d2ca]">Desbloqueo compartido entre rutas</span>
            </div>
            <div className="grid grid-cols-6 gap-1" aria-label={`Ascensiones de ${difficulty.toUpperCase()}`}>
              {Array.from({ length: 6 }, (_, ascension) => {
                const step = { difficulty, asc: ascension as SavedRouteStep["asc"] };
                const unlocked = isStepUnlocked(profile.dungeons, step);
                const selected = ascension === a;
                const reason = lockReason(step);
                return (
                  <button key={ascension} type="button" disabled={!unlocked} aria-pressed={selected}
                    title={unlocked ? `+${ascension}` : `+${ascension} bloqueada: ${reason}`}
                    aria-label={unlocked ? `Ascensión +${ascension}` : `Ascensión +${ascension} bloqueada. ${reason}`}
                    onClick={() => selectStep(step)}
                    className={`pixel-frame min-h-10 px-1 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm ${selected ? "text-yellow-200 ring-2 ring-yellow-400" : "text-[#d9d2ca]"}`}>
                    +{ascension}{!unlocked && <Icon name="system_locked" className="ml-0.5 inline h-3 w-3" />}
                  </button>
                );
              })}
            </div>
            {nextLockedStep && <p className="text-center text-xs leading-snug text-[#d9d2ca]">Siguiente desbloqueo: {nextLockedStep.difficulty.toUpperCase()}+{nextLockedStep.asc} · {lockReason(nextLockedStep)}.</p>}
          </div>
          <div className="text-center text-sm text-[#d9d2ca]">
            <span className="block">Jefe: {theme.bossName} · Familias: {routeFamilies}</span>
            <span className="mt-1 block text-xs text-yellow-100">{bossAscensionNotice(route, a)}{a > 0 ? ` (Ascensión +${a})` : ""}</span>
          </div>
          {routeDone && (
            <div className="dungeon-sign mx-auto max-w-lg px-4 py-3 text-center" aria-label={`${theme.name}: completado`}>
              <span className="name-title block text-xl text-yellow-200">{theme.name}</span>
              <span className="dungeon-stamp mt-2" role="img" aria-label="Completado">COMPLETADO</span>
            </div>
          )}
          <div className="relative space-y-2 pl-1 sm:space-y-3 sm:pl-2" aria-label="Camino de la ruta">
            <span aria-hidden="true" className="absolute bottom-8 left-[1.55rem] top-8 w-0.5 bg-gradient-to-b from-yellow-600/70 via-yellow-800/50 to-red-700/70 sm:left-[1.8rem]" />
            {levelsOf(route, difficulty).map((spec) => {
              const cleared = spec.index < done;
              const unlocked = isLevelUnlocked(profile.dungeons, route, difficulty, spec.index, a);
              const current = unlocked && !cleared;
              const name = spec.final ? routeCopy.bossNode : routeCopy.levels[spec.index] ?? `Nivel ${spec.index + 1}`;
              return (
                <button key={spec.index} type="button" disabled={!unlocked} onClick={() => {
                  setAsc(a);
                  rememberRouteStep(route, difficulty, a);
                  setView({ t: "prep", route, difficulty, level: spec.index });
                }} aria-label={`${unlocked ? "Entrar a" : "Bloqueado:"} ${name}`} className={`relative flex w-full min-w-0 items-stretch gap-2 rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300 disabled:cursor-not-allowed sm:gap-3 sm:p-3 ${current ? "border-yellow-400 bg-yellow-950/35 shadow-[0_0_16px_rgba(231,178,66,0.14)]" : cleared ? "border-green-800/70 bg-green-950/15" : "border-[#655b50]/70 bg-black/25 opacity-75"}`}>
                  <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-[#17191d] font-bold ${current ? "border-yellow-300 text-yellow-200" : cleared ? "border-green-500 text-green-200" : "border-[#665f57] text-[#aaa39b]"}`}>{spec.index + 1}</span>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className={`min-w-0 break-words font-bold ${spec.final ? "text-red-200" : "text-yellow-100"}`}>{name}</h3>
                      {spec.final && <span className="rounded border border-red-800/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">Jefe final</span>}
                      {current && <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-300">Siguiente</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#d9d2ca]">
                      <span className="inline-flex items-center gap-1"><ElementIcon element={levelElement(spec, a)} className="h-4" bare />{spec.length} peleas</span>
                      <span>Poder recomendado {recommendedPower(spec.difficulty, spec.index, a)}</span>
                    </div>
                    {spec.final && <p className="mt-1 text-xs leading-snug text-red-100">{routeCopy.mechanic}</p>}
                    {!unlocked && <p className="mt-1 text-xs text-[#c6beb5]">{!isStepUnlocked(profile.dungeons, currentStep) ? `${lockReason(currentStep)}.` : "Completa el nivel anterior."}</p>}
                  </div>
                  {cleared ? <span className="dungeon-stamp dungeon-stamp--small relative z-10 self-center" role="img" aria-label={`Nivel ${spec.index + 1}: completado`}>COMPLETADO</span> : unlocked ? (
                    <span className="relative z-10 self-center text-xl text-yellow-300" aria-hidden="true">›</span>
                  ) : <Icon name="system_locked" className="relative z-10 h-5 w-5 shrink-0 self-center" />}
                </button>
              );
            })}
          </div>
          <div className="text-center">
            <button className="btn btn-gray" onClick={() => setView({ t: "routes" })}>← Volver a rutas</button>
          </div>
        </Panel>
      </Shell>
    );
  }

  // ---------------- route selector ----------------
  const familyNames: Record<string, string> = { limo: "Slimes", diablillo: "Diablillos", arpia: "Arpías", golem: "Gólems", espectro: "Espectros" };
  return (
    <Shell>
      <Notice />
      <Panel title="Elige una ruta" className="mx-auto w-full max-w-5xl">
        <p className="mb-3 text-center text-sm text-[#d9d2ca]">Cada ruta conserva su jefe, sus familias y su propio avance.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROUTE_IDS.map((route) => {
            const theme = DUNGEON_THEMES[route];
            const completed = hasAnyRouteClear(profile.dungeons, route);
            const routeFamilies = [...theme.families, ...(theme.guest ? [theme.guest] : [])].map((family) => familyNames[family]).join(" · ");
            return (
              <button key={route} onClick={() => {
                const saved = readRouteStep(route);
                const selected = isStepUnlocked(profile.dungeons, saved) ? saved : { difficulty: "f" as const, asc: 0 as const };
                setAsc(selected.asc);
                setView({ t: "levels", route, difficulty: selected.difficulty });
              }} className="pixel-frame flex min-w-0 items-center gap-3 p-3 text-left enabled:hover:brightness-125">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-yellow-700/70 bg-[#26323f]">
                  <ElementIcon element={theme.bossElement} className="h-7" bare />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="name-title block break-words text-base text-yellow-300">{theme.name}</span>
                  <span className="block text-xs text-[#d9d2ca]">Jefe: {theme.bossName}</span>
                  <span className="block text-xs text-[#c6beb5]">{routeFamilies}</span>
                  <span className="mt-1 block text-xs text-[#d9d2ca]">{routeProgressSummary(profile.dungeons, route)}</span>
                  {completed && <span className="dungeon-stamp mt-1 inline-flex">COMPLETADO</span>}
                </span>
                <span className="shrink-0 text-xs text-[#d9d2ca]" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-center"><Link href="/" className="btn btn-gray inline-block text-center">← Volver al menú</Link></div>
      </Panel>
    </Shell>
  );
}

function levelCapNote(p: Profile, heroId: string): string {
  const c = p.characters.find((x) => x.id === heroId);
  if (!c) return "";
  return c.level >= levelCap(c.stars)
    ? `Nivel máximo para ${c.stars}★. Las estrellas abren más niveles.`
    : `EXP ${c.xp}/${xpToNextLevel(c.level)} para el nivel ${c.level + 1}`;
}

// "Poder 420 / recomendado 440", green when the hero reaches the recommendation.
function PowerVsRec({ power, rec }: { power: number; rec: number }) {
  return (
    <span>
      Poder{" "}
      <b className={power >= rec ? "text-green-300" : "text-red-300"}>{power}</b>
      {" · "}recomendado {rec}
    </span>
  );
}

// Small banner on the result screen: what the next level is and how ready the hero is.
function NextStage({
  profile,
  route,
  difficulty,
  level,
  asc,
  heroId,
}: {
  profile: Profile;
  route: RouteId;
  difficulty: Difficulty;
  level: number;
  asc: number;
  heroId: string;
}) {
  const spec = levelsOf(route, difficulty)[level];
  if (!spec) return null;
  const dom = levelElement(spec, asc);
  return (
    <div className="action-inset flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
      <b className="text-yellow-300">Siguiente: Nivel {level + 1}</b>
      <span className="flex items-center gap-1.5">
        <ElementIcon element={dom} className="h-5" />
        {spec.length} peleas{spec.final && " · Jefe final"}
      </span>
      <PowerVsRec
        power={heroPower(profile, heroId)}
        rec={recommendedPower(difficulty, level, asc)}
      />
    </div>
  );
}

// "Barrer" opens its own row of repeat counts (×1, ×5, ×10).
const SWEEP_TIMES = [1, 5, 10];
function SweepMenu({ why, onSweep }: { why: string | null; onSweep: (times: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        className="btn text-center"
        disabled={why !== null}
        title={why ?? "Resuelve el nivel al instante (paga como repetición)."}
        onClick={() => setOpen(true)}
      >
        Barrer ▾
      </button>
    );
  return (
    <div className="flex gap-1">
      {SWEEP_TIMES.map((n) => (
        <button
          key={n}
          className="btn text-center"
          onClick={() => {
            setOpen(false);
            onSweep(n);
          }}
        >
          ×{n}
        </button>
      ))}
      <button className="btn btn-gray text-center" aria-label="Cerrar" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}

function Prep({
  profile,
  route,
  difficulty,
  level,
  asc,
  setHeroId,
  hero,
  onEnter,
  onSweep,
  onBack,
}: {
  profile: Profile;
  route: RouteId;
  difficulty: Difficulty;
  level: number;
  asc: number;
  setHeroId: (id: string) => void;
  hero: OwnedCharacter | null;
  onEnter: (id: string) => void;
  onSweep: (id: string, times: number) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const spec = levelsOf(route, difficulty)[level];
  const dom = levelElement(spec, asc);
  const repeat = level < clearedLevels(profile.dungeons, route, difficulty, asc);
  // Total power first; the element advantage is only shown on the card.
  const owned = profile.characters
    .map((c) => ({
      c,
      power: heroPower(profile, c.id),
      mult: elementMultiplier(c.element, dom),
    }))
    .sort(
      (a, b) => b.power - a.power || a.c.name.localeCompare(b.c.name),
    );
  const sel = hero ?? owned[0]?.c ?? null;
  const act = (job: () => Promise<void>) => void job();
  const auto = sel ? bestAutoMode(profile, sel.id) : null;
  const sweepWhy = sel ? sweepBlock(profile, sel.id, route, difficulty, level, asc) : "Elige un héroe.";

  if (editing && sel)
    return (
      <Shell>
        <Notice />
        <Panel
          title={`Equipo · ${sel.name}`}
          className="mx-auto w-full max-w-2xl space-y-3"
        >
          <EquipmentEditor c={sel} profile={profile} act={act} />
          {/* Stays in view while the long piece list scrolls. */}
          <div className="sticky bottom-0 z-10 -mx-1 bg-gradient-to-t from-[#26323f] via-[#26323f]/90 to-transparent pb-1 pt-4 text-center">
            <button className="btn" onClick={() => setEditing(false)}>
              Listo
            </button>
          </div>
        </Panel>
      </Shell>
    );

  return (
    <Shell>
      <Notice />
      <Panel
        title={`${DUNGEON_THEMES[route].name} · Nivel ${level + 1}`}
        className="mx-auto w-full max-w-4xl space-y-3"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base">
          <span className="flex items-center gap-1.5">
            <ElementIcon element={dom} className="h-6" /> Dominante:{" "}
            {ELEMENT_LABEL[dom]}
          </span>
          <span>{spec.length} peleas{spec.final && " · Jefe final"}</span>
          <span className="text-green-300">hasta {levelXp(spec)} EXP</span>
          {repeat && <span className="text-yellow-300">Repetición (paga 60%)</span>}
          {asc > 0 && (
            <span>
              <Icon name={`asc_${asc}`} className="h-5" /> Ascensión +{asc}
            </span>
          )}
        </div>
        {owned.length === 0 ? (
          <p className="text-center text-[#d9d2ca]">
            Todavía no tienes héroes. Haz tiradas en el gacha.
          </p>
        ) : (
          <div className="grid max-h-[40vh] min-h-40 grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4 overflow-y-auto pr-1">
            {owned.map(({ c, power, mult }) => {
              const h = heroFromOwned(profile, c.id);
              return (
                <button
                  key={c.id}
                  aria-label={c.name}
                  aria-pressed={sel?.id === c.id}
                  onClick={() => setHeroId(c.id)}
                >
                  <ItemCard
                    item={characterView(c, {
                      stats: h?.stats,
                      lines: [
                        `Nv ${c.level} · Poder ${power}`,
                        mult > 1
                          ? "Ventaja elemental"
                          : mult < 1
                            ? "Desventaja"
                            : "Neutral",
                      ],
                    })}
                    size={96}
                    selected={sel?.id === c.id}
                  />
                </button>
              );
            })}
          </div>
        )}
        {sel && (
          <div className="action-inset space-y-2 rounded p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <b style={{ color: RARITIES[sel.rarity].color }}>{sel.name}</b>
              <StarRow stars={sel.stars} className="h-3" />
              <Tooltip tip={levelTip(sel.level, sel.xp, sel.stars)}>
                <span className="">
                  Nv {sel.level}/{levelCap(sel.stars)}
                </span>
              </Tooltip>
              <span className="text-green-300">
                {sel.level >= levelCap(sel.stars)
                  ? "Nivel máximo (sube estrellas)"
                  : `EXP ${sel.xp}/${xpToNextLevel(sel.level)}`}
              </span>
              <PowerVsRec
                power={heroPower(profile, sel.id)}
                rec={recommendedPower(difficulty, level, asc)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SLOTS.map((slot) => {
                const w = profile.weapons.find(
                  (x) => x.id === profile.equipped[slotKey(sel.id, slot)],
                );
                return (
                  <Chip key={slot} tone="passive" tip={null}>
                    {SLOT_LABEL[slot]}:{" "}
                    {w ? (
                      <span style={{ color: RARITIES[w.rarity].color }}>
                        {WEAPON_TYPE_DATA[w.type].label} {RARITIES[w.rarity].label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}
        {/* Phone: the main actions stay in view while the page scrolls. */}
        <div className="sticky bottom-0 z-10 flex justify-center gap-2 bg-gradient-to-t from-[#26323f] via-[#26323f]/90 to-transparent pb-1 pt-3 sm:hidden">
          <button
            className="btn text-center"
            disabled={!sel}
            onClick={() => {
              if (sel) {
                setHeroId(sel.id);
                onEnter(sel.id);
              }
            }}
          >
            Entrar al nivel
          </button>
          {repeat && sel && (
            <SweepMenu why={sweepWhy} onSweep={(n) => onSweep(sel.id, n)} />
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <div className="contents max-sm:hidden">
          <button
            className="btn text-center"
            disabled={!sel}
            onClick={() => {
              if (sel) {
                setHeroId(sel.id);
                onEnter(sel.id);
              }
            }}
          >
            Entrar al nivel
          </button>
          {repeat && sel && (
            <SweepMenu why={sweepWhy} onSweep={(n) => onSweep(sel.id, n)} />
          )}
          </div>
          <button
            className="btn btn-gray text-center"
            disabled={!auto || auto.plan.length === 0}
            title={
              auto
                ? `Modo ${auto.mode}: ${auto.plan.length} cambio(s). Detalle en Equipamiento.`
                : undefined
            }
            onClick={() => {
              if (sel && auto) {
                setHeroId(sel.id);
                act(async () => {
                  for (const { slot, weaponId } of auto.plan)
                    await repo.equip(sel.id, weaponId, slot);
                });
              }
            }}
          >
            Autoequipar
          </button>
          <button
            className="btn btn-gray text-center"
            disabled={!sel}
            onClick={() => {
              if (sel) setHeroId(sel.id);
              setEditing(true);
            }}
          >
            Equipamiento
          </button>
          <button className="btn btn-gray text-center" onClick={onBack}>
            Volver
          </button>
        </div>
      </Panel>
    </Shell>
  );
}
