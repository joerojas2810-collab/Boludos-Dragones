"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { Chip } from "@/components/Chip";
import { BossIntro, FxLayer, useBattleFx } from "@/components/fx/BattleFx";
import { EnemyCueContext, type EnemyCue } from "@/components/EnemySprite";
import { StatusIcons } from "@/components/StatusIcons";
import { HudCard } from "@/components/HudCard";
import { HeroSprite } from "@/components/HeroSprite";
import { HERO_ACTIONS } from "@/lib/art/heroes";
import { isPixel } from "@/lib/art/pixel";
import { CLASS_ART, ELEMENT_ART, HERO_ART_V } from "@/lib/art";
import type { HeroAction } from "@/lib/art/heroes";
import { Vfx } from "@/components/fx/Vfx";
import { attackOf, enemyIntents, type Battle, type Combatant } from "@/lib/game/combat";
import { intentTip, type Tip } from "@/lib/game/explain";

// Animation for who attacked / who got hit in the last step, staggered like the sfx.
const STAGGER_S = 0.3;

// One inline animation per event, in order: lunge for the actor's own hits,
// hurt when the other side connects. Each event starts STAGGER_S after the last.
// `enemy` limits the enemy side to that enemy's own events.
function fxStyle(b: Battle, side: "player" | "enemy", enemy?: number) {
  const lunge = side === "player" ? "lunge-right" : "lunge-left";
  const anims: string[] = [];
  b.events.forEach((e, i) => {
    const t = i * STAGGER_S;
    const mine = side === "player" || e.enemy === enemy;
    if (e.actor === side && mine) anims.push(`${lunge} 0.35s ease-out ${t}s`);
    else if (e.actor !== side && e.kind !== "miss" && e.kind !== "buff") {
      // hurt: the hero feels every enemy hit; an enemy only its own
      if (side === "player" || e.enemy === enemy)
        anims.push(`hurt 0.35s linear ${t + 0.1}s`);
    }
  });
  return anims.length ? { animation: anims.join(", ") } : undefined;
}

// Painted-enemy action for this step: attack when it acted, hit when the hero
// connected, defeat once its hp is 0. Delays follow the same stagger as fxStyle.
function enemyCue(b: Battle, i: number, boss?: boolean): EnemyCue {
  if (boss && i === 0 && b.actions === 0) return { action: "entrance", delay: 0 };
  const dead = b.enemies[i].hp <= 0;
  let cue: EnemyCue = { action: dead ? "defeat" : "idle", delay: 0, held: dead };
  b.events.forEach((e, k) => {
    if (e.enemy !== i) return;
    if (e.actor === "enemy" && e.kind !== "buff") {
      if (!dead && cue.action === "idle") cue = { action: "attack", delay: k * STAGGER_S * 1000 };
    } else if (e.actor === "player" && e.kind !== "miss" && e.kind !== "buff") {
      cue = { action: dead ? "defeat" : "hit", delay: (k * STAGGER_S + 0.1) * 1000 };
    }
  });
  return cue;
}

// Painted hero action for the last step: one pose per step, most telling first.
// `delay` (ms) holds idle until the event that causes the pose, like fxStyle.
function heroCue(b: Battle): { action: HeroAction; delay: number } {
  const at = (i: number, extra = 0.1) => Math.max(0, i) * STAGGER_S * 1000 + extra * 1000;
  const lastAt = at(b.events.length - 1, 0.3);
  if (b.status === "won") return { action: "victory", delay: lastAt };
  if (b.status === "lost") return { action: "defeat", delay: lastAt };
  const foeIdx = (f: (e: Battle["events"][number]) => boolean) =>
    b.events.findIndex((e) => e.actor === "enemy" && f(e));
  if (b.guardEarned)
    return { action: "perfect_guard", delay: at(foeIdx((e) => e.kind !== "buff")) };
  const ownIdx = b.events.findIndex((e) => e.actor === "player" && e.kind !== "buff");
  if (ownIdx >= 0) {
    const m = b.events[ownIdx].move;
    return {
      action: m === "attack1" ? "attack_1" : m === "attack2" ? "attack_2" : "attack_3",
      delay: at(ownIdx, 0),
    };
  }
  const anyFoe = foeIdx(() => true);
  if (b.player.defending && anyFoe >= 0) return { action: "defend", delay: 0 };
  const hitIdx = foeIdx((e) => e.kind === "hit" || e.kind === "crit");
  if (hitIdx >= 0) return { action: "hit", delay: at(hitIdx) };
  const missIdx = foeIdx((e) => e.kind === "miss");
  if (missIdx >= 0) return { action: "dodge", delay: at(missIdx) };
  return { action: b.player.defending ? "defend" : "idle", delay: 0 };
}

// Idle until `delay` ms, then the requested pose (remounted per step by the caller's key).
function CuedHero({ b }: { b: Battle }) {
  const { action, delay } = heroCue(b);
  const [on, setOn] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const id = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return (
    <HeroSprite
      classId={b.player.char.classId}
      element={b.player.char.element}
      traits={b.player.char.traits}
      action={on ? action : "idle"}
      animated
    />
  );
}

// Screen shake on a crit (timed with its event) or a perfect guard. Two
// identical keyframes alternate so the animation restarts on every step.
function bigMomentFx(b: Battle) {
  const crit = b.events.findIndex((e) => e.kind === "crit");
  if (crit < 0 && !b.guardEarned) return undefined;
  return {
    className: b.log.length % 2 ? "fx-bigshake-a" : "fx-bigshake-b",
    style: { animationDelay: `${b.guardEarned ? 0 : crit * STAGGER_S}s` },
  };
}

// Warm the browser cache with every sheet of this fight so an action never
// stalls on a first-time download (the hitch before attacks).
function usePreload(urls: string[]) {
  const key = urls.join("|");
  useEffect(() => {
    for (const u of key.split("|")) {
      const im = new Image();
      im.src = u;
    }
  }, [key]);
}

type Props = {
  b: Battle;
  playerExtra: string;
  playerExtraTip?: Tip;
  inRun?: boolean;
  rank?: string | null; // dungeon rank, for its own scenery
  finalRank?: string | null; // set on the dungeon's final boss fight (named entrance)
  world?: number; // 0-4 index into WORLDS; omit for the plain test-bench look
  boss?: boolean;
  enemyExtra: (i: number, c: Combatant) => string;
  enemyArt: (i: number, c: Combatant) => ReactNode; // already flipped by the caller
  enemyChips?: (i: number, c: Combatant) => ReactNode;
  enemy: number; // highlighted target (index in b.enemies)
  onTarget?: (i: number) => void;
  bleed?: boolean; // the scenery is drawn full-screen by the page: no border, no own background
  tall?: boolean; // no definite parent height (room page): give the stage its own height
};

export function BattleArena({
  b,
  playerExtra,
  playerExtraTip,
  inRun,
  world,
  rank,
  finalRank,
  boss,
  enemyExtra,
  enemyArt,
  enemyChips,
  enemy,
  onTarget,
  bleed,
  tall,
}: Props) {
  const n = b.enemies.length;
  const multi = n > 1;
  const first = b.enemies[Math.min(enemy, n - 1)];
  const big = bigMomentFx(b);
  const { fx, paused } = useBattleFx(b, boss);
  const hc = b.player.char;
  const cls = CLASS_ART[hc.classId];
  usePreload(
    Object.keys(HERO_ACTIONS).flatMap((a) =>
      isPixel()
        ? [`/art/heroes-px/hero_${cls}_${ELEMENT_ART[hc.element]}_${a}.png?v=${HERO_ART_V}`]
        : [
            `/art/heroes/hero_${cls}_${ELEMENT_ART[hc.element]}_${a}.webp?v=${HERO_ART_V}`,
          ],
    ),
  );
  return (
    <div
      className={`stage relative ${tall ? "h-[clamp(20rem,50vh,34rem)] flex-none" : "min-h-[clamp(17rem,36vh,30rem)] flex-1 max-md:flex-none"} max-md:h-[22.5rem] overflow-hidden ${bleed ? "" : "border-4 border-[var(--edge)]"} ${world === undefined ? "bg-gradient-to-b from-[#3a2f3d] to-[#6b4a3a]" : ""} ${big?.className ?? ""}`}
      style={big?.style}
      data-hitstop={paused}
    >
      {boss && b.actions === 0 && <BossIntro name={b.enemies[0].char.name} finalRank={finalRank} />}
      {boss && b.status === "won" && (
        <div
          className="fx-flash pointer-events-none absolute inset-0 z-20 bg-yellow-300/60"
          style={{
            animationDelay: `${b.events.length * STAGGER_S}s`,
            opacity: 0,
          }}
        />
      )}
      {(b.status === "won" || b.status === "lost") && (
        <Vfx
          key={b.status}
          id={b.status === "won" ? "victory" : "defeat"}
          delay={b.events.length * STAGGER_S}
          className="pointer-events-none absolute left-1/2 top-2 z-40 w-[min(60%,24rem)] -translate-x-1/2"
        />
      )}
      {world === undefined ? (
        <div className="absolute inset-x-0 bottom-0 h-[30%] border-t-4 border-[var(--edge)] bg-[#2b2420]" />
      ) : bleed ? null : (
        <ArenaBackground world={world} boss={boss} rank={rank} />
      )}
      <div className="stage-hero absolute left-[2%]">
        <FxLayer t={fx?.player} k={fx?.key ?? 0} />
        <div
          key={`p${b.log.length}`}
          className="h-full w-full"
          style={fxStyle(b, "player")}
        >
          <div className={`fx-breathe h-full w-full origin-bottom ${isPixel() ? "" : "scale-[1.15]"}`}>
            <CuedHero b={b} />
          </div>
        </div>
        <StatusIcons c={b.player} />
      </div>
      <div className="absolute left-2 top-2 z-10 w-[min(12.5rem,44%)]">
        <HudCard
          c={b.player}
          foe={first}
          turn={b.turn}
          inRun={inRun}
          extraTip={playerExtraTip}
          label="TÚ"
          tone="player"
          extra={playerExtra}
          className=""
        />
      </div>
      <div
        role="radiogroup"
        aria-label="Objetivo del ataque"
        data-n={Math.min(n, 3)}
        data-boss={boss ? "" : undefined}
        className="stage-foes absolute bottom-0 right-[1.5%] top-0 flex items-end justify-end gap-[1%]"
      >
        {b.enemies.map((c, i) => {
          const dead = c.hp <= 0;
          const selected = i === enemy && !dead;
          const intents = dead ? [] : enemyIntents(b, i);
          return (
            <div
              key={i}
              role="radio"
              aria-checked={selected}
              aria-disabled={dead}
              aria-label={`${c.char.name}${dead ? " (derrotado)" : ""}`}
              tabIndex={dead || !multi ? -1 : selected ? 0 : -1}
              onClick={() => !dead && onTarget?.(i)}
              onKeyDown={(e) => {
                if (dead || !multi) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTarget?.(i);
                } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const step = e.key === "ArrowRight" ? 1 : -1;
                  for (let k = 1; k <= n; k++) {
                    const j = (i + step * k + n * 3) % n;
                    if (b.enemies[j].hp > 0) {
                      onTarget?.(j);
                      break;
                    }
                  }
                }
              }}
              className={`stage-foe relative flex min-w-0 flex-col items-center justify-end rounded-sm outline-offset-2 ${multi && !dead ? "cursor-pointer" : ""} ${dead ? "opacity-50 grayscale" : ""}`}
            >
              <FxLayer t={fx?.enemies[i]} k={fx?.key ?? 0} />
              {multi && selected && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[34%] z-20 -translate-x-1/2 animate-bounce text-3xl leading-none text-yellow-300 [text-shadow:0_2px_0_#000,0_0_8px_#000]"
                >
                  ▼
                </span>
              )}
              <div className="relative z-30 w-full md:absolute md:inset-x-0 md:top-0">
                <HudCard
                  c={c}
                  foe={b.player}
                  turn={b.turn}
                  inRun={inRun}
                  label={multi ? `R${i + 1}` : "RIVAL"}
                  tone="enemy"
                  extra={dead ? "Derrotado" : enemyExtra(i, c)}
                  compact={multi}
                  className=""
                  footer={
                    <div className="mt-1 flex min-h-6 flex-wrap items-center gap-1 text-[13px]">
                      {intents.length > 0 && (
                        <span className={`font-semibold text-red-300 ${multi ? "max-md:hidden" : ""}`}>
                          Anuncia:
                        </span>
                      )}
                      {intents.map((it, k) => (
                        <Chip key={k} tone="danger" tip={intentTip(it, b, i)}>
                          {it === "defend"
                            ? "Defender"
                            : `${attackOf(c, it).name}${it === "attack2" ? " ⚠" : ""}`}
                        </Chip>
                      ))}
                    </div>
                  }
                >
                  {enemyChips?.(i, c)}
                </HudCard>
              </div>
              <div
                key={`e${i}-${b.log.length}`}
                className="stage-foe-art relative"
                style={fxStyle(b, "enemy", i)}
              >
                <StatusIcons c={c} />
                <div className="fx-breathe fx-breathe-b h-full w-full">
                  <EnemyCueContext.Provider value={enemyCue(b, i, boss)}>
                    {enemyArt(i, c)}
                  </EnemyCueContext.Provider>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
