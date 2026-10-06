"use client";

import { useEffect, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { LogPanel } from "@/components/LogPanel";
import { MuteButton } from "@/components/MuteButton";
import { Sprite } from "@/components/Sprite";
import { Tooltip } from "@/components/Tooltip";
import { upgradeTip } from "@/lib/game/explain";
import { generateCharacter, type Character } from "@/lib/game/characters";
import { SkillChoice } from "@/components/SkillChoice";
import { useTargeting } from "@/components/useTargeting";
import { startBattle, step, type Action, type Battle } from "@/lib/game/combat";
import { GROUP_HP_MULT, GROUP_STAT_MULT } from "@/lib/game/run";
import {
  needsSkill,
  SKILLS,
  SKILLS_BY_CLASS,
  type SkillId,
} from "@/lib/game/skills";
import {
  applyUpgrade,
  gainXp,
  rollUpgrades,
  scaleForLevel,
  UPGRADES,
  describeUpgrade,
  xpToNext,
  XP_PER_WIN,
  type UpgradeId,
} from "@/lib/game/progression";
import { createRng, type Rng } from "@/lib/game/rng";
import { playEvents } from "@/lib/sfx";

interface Game {
  rng: Rng;
  hero: Character;
  b: Battle;
  picks: UpgradeId[] | null; // upgrade choices being offered
  pending: number; // level-ups still to pick
  skillPending: boolean; // class skill pick owed (level 5)
}

// 1 to 3 rivals (bigger groups from level 2), each scaled down like in runs.
function nextEnemies(rng: Rng, level: number): Character[] {
  // ?n=1..3 forces the group size (testing).
  const forced = Number(new URLSearchParams(location.search).get("n"));
  const n = forced >= 1 && forced <= 3 ? forced : level < 2 ? 1 : rng.int(1, 3);
  return Array.from({ length: n }, () => {
    const e = scaleForLevel(generateCharacter(rng), level);
    const k = GROUP_STAT_MULT[n - 1];
    return {
      ...e,
      stats: {
        ...e.stats,
        hp: Math.round(e.stats.hp * GROUP_HP_MULT[n - 1]),
        atk: Math.round(e.stats.atk * k * 10) / 10,
        def: Math.round(e.stats.def * k * 10) / 10,
      },
    };
  });
}

function newGame(rng: Rng): Game {
  // ?lvl=N starts the hero one win away from level N+1 (testing the level-5 pick).
  const lvl = Number(new URLSearchParams(location.search).get("lvl"));
  const base = generateCharacter(rng);
  const hero =
    lvl >= 2 && lvl <= 30
      ? { ...base, level: lvl, xp: xpToNext(lvl) - 1 }
      : base;
  return {
    rng,
    hero,
    b: startBattle(hero, nextEnemies(rng, 1), rng),
    picks: null,
    pending: 0,
    skillPending: false,
  };
}

export default function Prueba() {
  const [game, setGame] = useState<Game | null>(null);
  const targeting = useTargeting(game?.b ?? null);
  useEffect(() => {
    // client-only seed avoids SSR hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(newGame(createRng(Date.now())));
  }, []);
  if (!game) return null;
  const { rng, hero, b, picks } = game;
  const withLog = (battle: Battle, ...lines: string[]): Battle => ({
    ...battle,
    log: [...battle.log, ...lines],
  });
  const act = (a: Action, target: number) => {
    let next = step(b, a, rng, target);
    playEvents(next.events, next.status);
    if (next.status === "won") {
      const r = gainXp(hero, XP_PER_WIN);
      next = withLog(
        next,
        `+${XP_PER_WIN} XP.`,
        ...(r.levelsGained > 0
          ? [`¡${hero.name} sube a nivel ${r.char.level}!`]
          : []),
      );
      setGame({
        ...game,
        b: next,
        hero: r.char,
        pending: r.levelsGained,
        skillPending: needsSkill(r.char),
        picks: r.levelsGained > 0 ? rollUpgrades(rng) : null,
      });
      return;
    }
    setGame({ ...game, b: next });
  };
  const pick = (id: UpgradeId) => {
    const pending = game.pending - 1;
    setGame({
      ...game,
      hero: applyUpgrade(hero, id),
      b: withLog(
        b,
        `${hero.name} elige ${UPGRADES[id].name} (${describeUpgrade(id)}).`,
      ),
      pending,
      picks: pending > 0 ? rollUpgrades(rng) : null,
    });
  };
  const learn = (id: SkillId) =>
    setGame({
      ...game,
      hero: { ...hero, skill: id },
      b: withLog(b, `${hero.name} aprende ${SKILLS[id].name}.`),
      skillPending: false,
    });
  const nextFight = () =>
    setGame({
      ...game,
      b: startBattle(hero, nextEnemies(rng, hero.level), rng),
    });
  const restart = () => setGame(newGame(rng));
  return (
    <main className="p-4 pt-8 text-base md:h-screen md:overflow-hidden">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 md:h-full md:flex-row-reverse">
        <LogPanel lines={b.log}>
          <button
            className="btn btn-gray mt-3 w-full text-center"
            onClick={restart}
          >
            Nuevo personaje
          </button>
          <MuteButton />
        </LogPanel>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <BattleArena
            b={b}
            enemyExtra={(_, c) => `Nv ${c.char.level}`}
            playerExtra={`Nv ${hero.level} · XP ${hero.xp}/${xpToNext(hero.level)}`}
            enemyArt={(_, c) => (
              <Sprite
                classId={c.char.classId}
                element={c.char.element}
                traits={c.char.traits}
                flip
              />
            )}
            enemy={targeting.enemy}
            onTarget={targeting.select}
          />
          <ActionPanel b={b} target={targeting.target} onAct={act}>
            {game.skillPending ? (
              <SkillChoice
                classId={hero.classId}
                ids={SKILLS_BY_CLASS[hero.classId]}
                onPick={learn}
              />
            ) : picks ? (
              <div className="grid grid-cols-3 gap-2">
                {picks.map((id) => (
                  <Tooltip
                    key={id}
                    tip={upgradeTip(id, hero)}
                    className="block"
                    focusable={false}
                  >
                    <button
                      className="btn h-full w-full text-sm"
                      onClick={() => pick(id)}
                    >
                      <div className="font-semibold">{UPGRADES[id].name}</div>
                      <div className="text-sm">{describeUpgrade(id)}</div>
                    </button>
                  </Tooltip>
                ))}
              </div>
            ) : b.status === "lost" ? (
              <button
                className="btn btn-gray w-full text-center"
                onClick={restart}
              >
                Nuevo personaje
              </button>
            ) : (
              <button
                className="btn btn-gray w-full text-center"
                onClick={nextFight}
              >
                Siguiente rival
              </button>
            )}
          </ActionPanel>
        </div>
      </div>
    </main>
  );
}
