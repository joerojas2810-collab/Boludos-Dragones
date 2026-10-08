"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { LogPanel } from "@/components/LogPanel";
import { MuteButton } from "@/components/MuteButton";
import { Sprite } from "@/components/Sprite";
import { HeroSprite } from "@/components/HeroSprite";
import { isPixel } from "@/lib/art/pixel";
import { generateCharacter, type Character } from "@/lib/game/characters";
import { useTargeting } from "@/components/useTargeting";
import { startBattle, step, type Action, type Battle } from "@/lib/game/combat";
import { GROUP_HP_MULT, GROUP_STAT_MULT } from "@/lib/game/stage";
import { createRng, type Rng } from "@/lib/game/rng";
import { playEvents } from "@/lib/sfx";

// Sandbox: a fixed hero against rivals that grow 12% per win (no levels, no picks).
interface Game {
  rng: Rng;
  hero: Character;
  b: Battle;
  wins: number;
}

// 1 to 3 rivals (bigger groups after the first win), each scaled down like in runs.
function nextEnemies(rng: Rng, wins: number): Character[] {
  // ?n=1..3 forces the group size (testing).
  const forced = Number(new URLSearchParams(location.search).get("n"));
  const n = forced >= 1 && forced <= 3 ? forced : wins < 1 ? 1 : rng.int(1, 3);
  const f = 1.12 ** wins; // bench only: not part of the replayed engine
  return Array.from({ length: n }, () => {
    const e = generateCharacter(rng);
    const k = GROUP_STAT_MULT[n - 1] * f;
    return {
      ...e,
      level: wins + 1,
      stats: {
        ...e.stats,
        hp: Math.round(e.stats.hp * GROUP_HP_MULT[n - 1] * f),
        atk: Math.round(e.stats.atk * k * 10) / 10,
        def: Math.round(e.stats.def * k * 10) / 10,
      },
    };
  });
}

function newGame(rng: Rng): Game {
  const hero = generateCharacter(rng);
  return { rng, hero, b: startBattle(hero, nextEnemies(rng, 0), rng), wins: 0 };
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
  const { rng, hero, b } = game;
  const act = (a: Action, target: number) => {
    const next = step(b, a, rng, target);
    playEvents(next.events, next.status, { guard: next.guardEarned });
    setGame({
      ...game,
      b: next,
      wins: next.status === "won" ? game.wins + 1 : game.wins,
    });
  };
  const nextFight = () =>
    setGame({ ...game, b: startBattle(hero, nextEnemies(rng, game.wins), rng) });
  const restart = () => setGame(newGame(rng));
  return (
    <main className="p-4 pt-8 text-base md:h-screen md:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 md:h-full">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <BattleArena
            b={b}
            world={isPixel() ? 0 : undefined}
            enemyExtra={(_, c) => `Nv ${c.char.level}`}
            playerExtra={`Victorias ${game.wins}`}
            enemyArt={(_, c) => isPixel() ? (
              <HeroSprite classId={c.char.classId} element={c.char.element} traits={c.char.traits} animated flip />
            ) : (
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
            {b.status === "lost" ? (
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
        <LogPanel lines={b.log}>
          <Link href="/" className="btn btn-gray mt-3 block w-full text-center">
            ← Menú
          </Link>
          <button
            className="btn btn-gray mt-3 w-full text-center"
            onClick={restart}
          >
            Nuevo personaje
          </button>
          <MuteButton />
        </LogPanel>
      </div>
    </main>
  );
}
