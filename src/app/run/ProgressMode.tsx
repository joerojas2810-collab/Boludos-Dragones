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
import { FightLog, LogPanel } from "@/components/LogPanel";
import { Icon } from "@/components/Icon";
import { ItemCard } from "@/components/ItemCard";
import { MuteButton } from "@/components/MuteButton";
import { Notice } from "@/components/Notice";
import { PartTile } from "@/components/PartsList";
import { Panel } from "@/components/Panel";
import { RankIcon } from "@/components/RankIcon";
import { StarRow } from "@/components/StarRow";
import { Tooltip } from "@/components/Tooltip";
import { useTargeting } from "@/components/useTargeting";
import { iconFor } from "@/lib/art";
import { autoBlockReason } from "@/lib/game/auto";
import { type Action } from "@/lib/game/combat";
import { elementMultiplier, ELEMENT_LABEL } from "@/lib/game/elements";
import { MOD_LABEL, modTip } from "@/lib/game/explain";
import { levelCap, xpToNextLevel } from "@/lib/game/heroLevel";
import { recommendedPower, recommendedPowerRange } from "@/lib/game/recommended";
import {
  clearedLevels,
  isLevelUnlocked,
  isRankUnlocked,
  maxAscension,
} from "@/lib/game/dungeonProgress";
import {
  DUNGEON_THEMES,
  LEVELS_PER_RANK,
  levelElement,
  levelsOf,
  type LevelSpec,
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
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import {
  ASC_RULES,
  currentFight,
  levelFights,
  type FightRole,
} from "@/lib/game/stage";
import { sweepBlock } from "@/lib/game/sweep";
import {
  applyStageAction,
  ENGINE_VERSION,
  initialStageReplay,
  type StageAction,
  type StageReplayState,
} from "@/lib/game/stageReplay";
import {
  heroSkill,
  skillUnlocked,
  SKILLS,
  SKILLS_BY_CLASS,
  SKILL_UNLOCK_STARS,
  type SkillId,
} from "@/lib/game/skills";
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

interface Attempt {
  rank: RarityId;
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
}
type View =
  | { t: "ranks" }
  | { t: "levels"; rank: RarityId }
  | { t: "prep"; rank: RarityId; level: number }
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
  const [view, setView] = useState<View>({ t: "ranks" });
  const [asc0, setAsc] = useState(0);
  const asc = asc0;
  const [heroId, setHeroId] = useState<string | null>(null);
  const targeting = useTargeting(
    view.t === "fight" ? view.a.rs.battle : null,
  );
  if (!ready || !profile) return null;

  const hero = profile.characters.find((c) => c.id === heroId) ?? null;

  const enter = async (
    rank: RarityId,
    level: number,
    id: string,
    ascOverride?: number,
  ) => {
    const asc = ascOverride ?? asc0;
    if (ascOverride !== undefined) setAsc(ascOverride);
    const owned = profile.characters.find((c) => c.id === id);
    if (!owned || view.t === "starting") return; // ignore taps while the server opens the attempt
    const spec = levelsOf(rank)[level];
    setHeroId(id); // the next attempt keeps the same hero
    setView({ t: "starting" });
    try {
      const info = await repo.startLevel(owned.id, rank, level, asc);
      const rs = initialStageReplay(
        info.seed,
        info.hero,
        levelFights(spec, asc),
        asc,
      );
      setView({
        t: "fight",
        a: { rank, level, asc, heroId: owned.id, rs, actions: [], info },
      });
    } catch (e) {
      pushNotice(e instanceof Error ? e.message : "No se pudo empezar el nivel.");
      setView({ t: "prep", rank, level });
    }
  };

  // Instant resolution of an already-cleared level; shows the usual result screen.
  const sweep = async (rank: RarityId, level: number, id: string) => {
    const owned = profile.characters.find((c) => c.id === id);
    if (!owned || view.t === "saving") return;
    setHeroId(id);
    setView({ t: "saving" });
    try {
      const out = await repo.sweepLevel(owned.id, rank, level, asc);
      const info: LevelStartInfo = {
        attemptId: "sweep",
        seed: out.stage.seed,
        hero: out.stage.hero,
        engineVersion: ENGINE_VERSION,
      };
      setView({
        t: "result",
        o: {
          attempt: {
            rank,
            level,
            asc,
            heroId: owned.id,
            rs: { stage: out.stage, battle: null, rng: null, settled: null },
            actions: [],
            info,
          },
          bank: out.bank,
          loot: out.loot,
          before: { level: owned.level, xp: owned.xp },
        },
      });
    } catch (e) {
      pushNotice(e instanceof Error ? e.message : "No se pudo barrer el nivel.");
      setView({ t: "prep", rank, level });
    }
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
        rank: a.rank,
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
      setView({ t: "ranks" });
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
    const theme = DUNGEON_THEMES[a.rank];
    const spec = levelsOf(a.rank)[a.level];
    const settled = rs.settled;
    const role = fight.role;
    return (
      <main className="relative isolate flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
        <Notice />
        <div className="fixed inset-0 -z-10">
          <ArenaBackground
            world={theme.world}
            boss={role === "final"}
            rank={a.rank}
          />
        </div>
        <div className="mx-auto w-full max-w-[min(100rem,calc((100vh-15rem)*1.78+23rem))] md:min-w-[48rem]">
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
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[min(100rem,calc((100vh-15rem)*1.78+23rem))] flex-col gap-3 md:min-h-0 md:min-w-[48rem] md:flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0 md:flex-row">
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
                    finalRank={role === "final" && i === 0 ? a.rank : null}
                  />
                )}
                enemy={targeting.enemy}
                onTarget={targeting.select}
                inRun
                world={theme.world}
                rank={a.rank}
                finalRank={role === "final" ? a.rank : null}
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
            <div className="flex flex-col gap-2 max-md:contents md:min-h-0 md:w-[22rem]">
              <ActionPanel
                side
                float
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
                        : "Caíste."}
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
              <FightLog lines={b.log} />
            </div>
          </div>
          <LogPanel lines={b.log}>
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
      a.level + 1 < LEVELS_PER_RANK[a.rank] &&
      isLevelUnlocked(o.bank.profile.dungeons, a.rank, a.level + 1, a.asc);
    const pieces = o.loot.pieces;
    // Last level cleared: offer the next ascension of this dungeon and the next dungeon.
    const dungeonEnd = won && a.level + 1 >= LEVELS_PER_RANK[a.rank];
    const nextAsc =
      dungeonEnd &&
      a.asc + 1 <= maxAscension(o.bank.profile.dungeons, a.rank)
        ? a.asc + 1
        : null;
    const nextRank = dungeonEnd
      ? RARITY_IDS[RARITY_IDS.indexOf(a.rank) + 1]
      : undefined;
    const nextRankOpen =
      nextRank !== undefined && isRankUnlocked(o.bank.profile.dungeons, nextRank);
    return (
      <Shell>
        <Notice />
        {won && <Confetti />}
        <Panel
          title={won ? "¡Nivel superado!" : "Nivel perdido"}
          className="mx-auto w-full max-w-2xl space-y-2 text-center"
        >
          <div className="text-[#d9d2ca]">
            {DUNGEON_THEMES[a.rank].name} · Nivel {a.level + 1}
            {a.asc > 0 && ` · Ascensión +${a.asc}`}
            {won && o.bank.repeat && " · repetido"}
          </div>
          <div>
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
              <div className="text-yellow-300">
                <Icon name="system_coin" className="h-5" /> +{o.bank.coins}{" "}
                monedas
                {o.bank.chest > 0 && (
                  <b> · ¡Cofre de primera limpieza: +{o.bank.chest}!</b>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {pieces.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-2">
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
                        size={72}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-[#d9d2ca]">Sin piezas esta vez.</span>
                )}
                {Object.keys(o.loot.parts).length > 0 && (
                  <ul className="flex flex-wrap justify-center gap-2">
                    {Object.entries(o.loot.parts).map(([k, n]) => (
                      <PartTile key={k} k={k} n={n} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-[#d9d2ca]">
              Sin monedas ni botín. Prueba con otro héroe o con mejor equipo.
            </div>
          )}
          {hasNext && (
            <NextStage
              profile={o.bank.profile}
              rank={a.rank}
              level={a.level + 1}
              asc={a.asc}
              heroId={a.heroId}
            />
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {hasNext && (
              <button
                className="btn text-center"
                onClick={() => void enter(a.rank, a.level + 1, a.heroId)}
              >
                Siguiente nivel
              </button>
            )}
            {nextAsc !== null && (
              <button
                className="btn text-center"
                onClick={() => void enter(a.rank, 0, a.heroId, nextAsc)}
              >
                Siguiente ascensión (+{nextAsc})
              </button>
            )}
            {nextRankOpen && nextRank && (
              <button
                className={`btn text-center ${nextAsc !== null ? "btn-gray" : ""}`}
                onClick={() => void enter(nextRank, 0, a.heroId, 0)}
              >
                Siguiente dungeon: {DUNGEON_THEMES[nextRank].name}
              </button>
            )}
            <button
              className={`btn text-center ${hasNext || nextAsc !== null || nextRankOpen ? "btn-gray" : ""}`}
              onClick={() => void enter(a.rank, a.level, a.heroId)}
            >
              {won ? "Repetir" : "Reintentar"}
            </button>
            <button
              className="btn btn-gray text-center"
              onClick={() => {
                setHeroId(a.heroId);
                setView({
                  t: "prep",
                  rank: a.rank,
                  level: hasNext ? a.level + 1 : a.level,
                });
              }}
            >
              Cambiar héroe
            </button>
            <button
              className="btn btn-gray text-center"
              onClick={() => setView({ t: "levels", rank: a.rank })}
            >
              Volver
            </button>
          </div>
        </Panel>
      </Shell>
    );
  }

  // ---------------- prep ----------------
  if (view.t === "prep") {
    return (
      <Prep
        profile={profile}
        rank={view.rank}
        level={view.level}
        asc={asc}
        setHeroId={setHeroId}
        hero={hero}
        onEnter={(id) => void enter(view.rank, view.level, id)}
        onSweep={(id) => void sweep(view.rank, view.level, id)}
        onBack={() => setView({ t: "levels", rank: view.rank })}
      />
    );
  }

  // ---------------- levels ----------------
  if (view.t === "levels") {
    const rank = view.rank;
    const theme = DUNGEON_THEMES[rank];
    const top = maxAscension(profile.dungeons, rank);
    const a = Math.min(asc, top);
    const done = clearedLevels(profile.dungeons, rank, a);
    return (
      <Shell>
        <Notice />
        <Panel
          title={theme.name}
          className="mx-auto w-full max-w-4xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-[#d9d2ca]">Ascensión:</span>
            {Array.from({ length: top + 1 }, (_, n) => (
              <button
                key={n}
                aria-pressed={n === a}
                className={`btn text-center ${n === a ? "" : "btn-gray"}`}
                onClick={() => setAsc(n)}
              >
                <Icon name={`asc_${n}`} className="h-5" /> {n}
              </button>
            ))}
          </div>
          {a > 0 && (
            <p className="text-center text-xs text-[#d9d2ca]">
              {ASC_RULES.slice(0, a).join(" · ")}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {levelsOf(rank).map((spec) => (
              <LevelCard
                key={spec.index}
                spec={spec}
                asc={a}
                cleared={spec.index < done}
                unlocked={isLevelUnlocked(
                  profile.dungeons,
                  rank,
                  spec.index,
                  a,
                )}
                onPick={() => {
                  setAsc(a);
                  setView({ t: "prep", rank, level: spec.index });
                }}
              />
            ))}
          </div>
          <div className="text-center">
            <button
              className="btn btn-gray"
              onClick={() => setView({ t: "ranks" })}
            >
              ← Cambiar de dungeon
            </button>
          </div>
        </Panel>
      </Shell>
    );
  }

  // ---------------- ranks ----------------
  return (
    <Shell>
      <Notice />
      <Panel title="Elige un dungeon" className="mx-auto w-full max-w-5xl">
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          Cada dungeon es una lista de niveles cortos. Limpia el último para abrir
          el siguiente rango.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RARITY_IDS.map((rank) => {
            const theme = DUNGEON_THEMES[rank];
            const locked = !isRankUnlocked(profile.dungeons, rank);
            const prev = RARITY_IDS[RARITY_IDS.indexOf(rank) - 1];
            const done = clearedLevels(profile.dungeons, rank, 0);
            return (
              <button
                key={rank}
                disabled={locked}
                onClick={() => {
                  setAsc(0);
                  setView({ t: "levels", rank });
                }}
                className="pixel-frame flex items-center gap-4 p-3 text-left enabled:hover:brightness-125 disabled:opacity-50"
                style={{ borderColor: RARITIES[rank].color }}
              >
                <RankIcon
                  rank={rank}
                  letter
                  className="h-[min(101px,9vh)] w-[min(101px,9vh)]"
                />
                <span className="min-w-0 text-base">
                  <span className="name-title block text-yellow-300">
                    {theme.name}
                  </span>
                  {locked ? (
                    <span className="block text-red-300">
                      <Icon name="system_locked" className="h-4" /> Limpia{" "}
                      {DUNGEON_THEMES[prev].name}
                    </span>
                  ) : (
                    <span
                      className={`block ${done >= LEVELS_PER_RANK[rank] ? "text-green-300" : ""}`}
                    >
                      {done}/{LEVELS_PER_RANK[rank]} niveles
                      {maxAscension(profile.dungeons, rank) > 0 &&
                        ` · Asc. hasta +${maxAscension(profile.dungeons, rank)}`}
                    </span>
                  )}
                  {!locked && (
                    <span className="block text-sm text-[#d9d2ca]">
                      Poder recomendado {recommendedPowerRange(rank)[0]}–
                      {recommendedPowerRange(rank)[1]}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-center">
          <Link href="/" className="btn btn-gray inline-block text-center">
            ← Volver al menú
          </Link>
        </div>
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
  rank,
  level,
  asc,
  heroId,
}: {
  profile: Profile;
  rank: RarityId;
  level: number;
  asc: number;
  heroId: string;
}) {
  const spec = levelsOf(rank)[level];
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
        rec={recommendedPower(rank, level, asc)}
      />
    </div>
  );
}

function LevelCard({
  spec,
  asc,
  cleared,
  unlocked,
  onPick,
}: {
  spec: LevelSpec;
  asc: number;
  cleared: boolean;
  unlocked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      disabled={!unlocked}
      onClick={onPick}
      className="pixel-frame flex items-center gap-3 p-3 text-left enabled:hover:brightness-125 disabled:opacity-50"
    >
      <span className="name-title w-8 text-center text-2xl text-yellow-300">
        {spec.index + 1}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex items-center gap-1.5">
          <ElementIcon element={levelElement(spec, asc)} className="h-5" />
          {spec.length} peleas{spec.final && " · Jefe final"}
        </span>
        <span className="block text-[#d9d2ca]">
          Poder rec. {recommendedPower(spec.rank, spec.index, asc)}
        </span>
      </span>
      {!unlocked ? (
        <Icon name="system_locked" className="h-5" />
      ) : cleared ? (
        <span className="text-green-300">✔</span>
      ) : null}
    </button>
  );
}

function Prep({
  profile,
  rank,
  level,
  asc,
  setHeroId,
  hero,
  onEnter,
  onSweep,
  onBack,
}: {
  profile: Profile;
  rank: RarityId;
  level: number;
  asc: number;
  setHeroId: (id: string) => void;
  hero: OwnedCharacter | null;
  onEnter: (id: string) => void;
  onSweep: (id: string) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const spec = levelsOf(rank)[level];
  const dom = levelElement(spec, asc);
  const repeat = level < clearedLevels(profile.dungeons, rank, asc);
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
  const sweepWhy = sel ? sweepBlock(profile, sel.id, rank, level, asc) : "Elige un héroe.";

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

  const skillsOpen = sel ? skillUnlocked(sel.rarity, sel.stars) : false;
  const cur = sel
    ? heroSkill(sel.classId, sel.rarity, sel.stars, sel.skill)
    : undefined;
  return (
    <Shell>
      <Notice />
      <Panel
        title={`${DUNGEON_THEMES[rank].name} · Nivel ${level + 1}`}
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
                <span className="cursor-help">
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
                rec={recommendedPower(rank, level, asc)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#d9d2ca]">Ataque 3:</span>
              {skillsOpen ? (
                SKILLS_BY_CLASS[sel.classId].map((id: SkillId) => (
                  <Tooltip
                    key={id}
                    tip={{
                      title: SKILLS[id].name,
                      kind: "info",
                      lines: [SKILLS[id].description],
                      source: "Habilidad",
                    }}
                  >
                    <button
                      aria-pressed={cur === id}
                      className={`btn text-center ${cur === id ? "" : "btn-gray"}`}
                      onClick={() =>
                        void repo
                          .chooseSkill(sel.id, id)
                          .catch((e: Error) => pushNotice(e.message))
                      }
                    >
                      {SKILLS[id].name}
                    </button>
                  </Tooltip>
                ))
              ) : (
                <span className="text-[#d9d2ca]">
                  se abre con rango C o {SKILL_UNLOCK_STARS}★
                </span>
              )}
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
            <button
              className="btn text-center"
              disabled={sweepWhy !== null}
              title={sweepWhy ?? "Resuelve el nivel al instante (paga como repetición)."}
              onClick={() => onSweep(sel.id)}
            >
              Barrer
            </button>
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
            <button
              className="btn text-center"
              disabled={sweepWhy !== null}
              title={sweepWhy ?? "Resuelve el nivel al instante (paga como repetición)."}
              onClick={() => onSweep(sel.id)}
            >
              Barrer
            </button>
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
