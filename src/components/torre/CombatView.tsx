"use client";

// The fight screen: the existing arena and the four-button action panel, untouched; only the HUD,
// role/modifier labels and what happens after the last blow are new. 1-3 pick enemies only here.
import { useMemo, type ReactNode } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { ArenaBackground } from "@/components/ArenaBackground";
import { BattleArena } from "@/components/BattleArena";
import { Chip } from "@/components/Chip";
import { EnemySprite } from "@/components/EnemySprite";
import { LogPanel } from "@/components/LogPanel";
import { Notice } from "@/components/Notice";
import { useTargeting } from "@/components/useTargeting";
import { iconFor } from "@/lib/art";
import { autoBlockReason } from "@/lib/game/auto";
import type { Action, Battle } from "@/lib/game/combat";
import { expeditionFight, sectorBossRoute, type ExpState, type FightInfo } from "@/lib/game/expedition";
import { lossLine, MOD_LABEL, modTip } from "@/lib/game/explain";
import { DUNGEON_THEMES } from "@/lib/game/levels";
import { WORLDS } from "@/lib/game/worlds";

export interface CombatCtx {
  sector: number;
  node: number;
  fight: FightInfo;
}

const KIND_TAG = { combat: "", elite: "ÉLITE · ", boss: "JEFE · " } as const;

export function CombatView({
  s,
  ctx,
  battle,
  over,
  hud,
  footer,
  onAct,
  onAuto,
}: {
  s: Pick<ExpState, "seed" | "hero">;
  ctx: CombatCtx;
  battle: Battle;
  over: boolean; // the fight is finished and only the result is shown
  hud: (log: ReactNode) => ReactNode; // the HUD bar; receives the desktop log button
  footer: ReactNode; // result text and the continue button once over
  onAct: (a: Action, target: number) => void;
  onAuto: () => void;
}) {
  const targeting = useTargeting(battle, !over);
  const { sector, node, fight } = ctx;
  const mods = useMemo(() => expeditionFight(s.seed, sector, node, fight.option).mods, [s.seed, sector, node, fight.option]);
  const boss = fight.kind === "boss";
  const route = boss ? sectorBossRoute(s.seed, sector) : null;
  const world = route ? DUNGEON_THEMES[route].world : (sector - 1) % WORLDS.length;
  const special = fight.kind !== "combat";
  return (
    <main className="relative isolate flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
      <Notice />
      <div className="fixed inset-0 -z-10 max-md:hidden">
        <ArenaBackground world={world} boss={boss} />
      </div>
      <div className="mx-auto w-full max-w-[120rem] md:min-w-[48rem]">
        {hud(
          <span className="max-md:hidden">
            <LogPanel compact lines={battle.log} />
          </span>,
        )}
      </div>
      <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-3 md:min-h-0 md:min-w-[48rem] md:flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0">
          <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
            <BattleArena
              bleed
              b={battle}
              enemyExtra={(i, c) => `${i === 0 ? KIND_TAG[fight.kind] : ""}Nv ${c.char.level}`}
              playerExtra={`Nv ${s.hero.level}`}
              enemyArt={(i, c) => (
                <EnemySprite
                  family={c.char.family ?? "limo"}
                  element={c.char.element}
                  boss={special && i === 0}
                  finalRank={boss && i === 0 ? route : null}
                />
              )}
              enemy={targeting.enemy}
              onTarget={over ? undefined : targeting.select}
              inRun
              world={world}
              finalRank={route}
              boss={special}
              enemyChips={(_, c) =>
                mods
                  .filter((m) => m !== "escudo")
                  .map((m) => (
                    <Chip key={m} tone="danger" icon={iconFor("enemy_modifier", m)} tip={modTip(m, c)}>
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
              b={battle}
              target={targeting.target}
              onAct={onAct}
              auto={{ reason: autoBlockReason(battle), onAuto }}
            >
              {over && (
                <>
                  <div className="text-sm">{battle.status === "won" ? "¡Combate ganado!" : lossLine(battle)}</div>
                  {footer}
                </>
              )}
            </ActionPanel>
          </div>
        </div>
        <LogPanel lines={battle.log} className="md:hidden" />
      </div>
    </main>
  );
}
