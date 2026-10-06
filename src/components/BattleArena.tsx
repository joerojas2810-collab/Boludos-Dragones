import type { ReactNode } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { Chip } from "@/components/Chip";
import { BossIntro, FxLayer, useBattleFx } from "@/components/fx/BattleFx";
import { HudCard } from "@/components/HudCard";
import { Sprite } from "@/components/Sprite";
import { Tooltip } from "@/components/Tooltip";
import { CLASSES } from "@/lib/game/characters";
import { enemyIntents, type Battle, type Combatant } from "@/lib/game/combat";
import { intentTip, targetTip, type Tip } from "@/lib/game/explain";

// Animation for who attacked / who got hit in the last step, staggered like the sfx.
const STAGGER_S = 0.5;

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

type Props = {
  b: Battle;
  playerExtra: string;
  playerExtraTip?: Tip;
  inRun?: boolean;
  world?: number; // 0-4 index into WORLDS; omit for the plain test-bench look
  boss?: boolean;
  enemyExtra: (i: number, c: Combatant) => string;
  enemyArt: (i: number, c: Combatant) => ReactNode; // already flipped by the caller
  enemyChips?: (i: number, c: Combatant) => ReactNode;
  enemy: number; // highlighted target (index in b.enemies)
  onTarget?: (i: number) => void;
};

const COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" } as const;

export function BattleArena({
  b,
  playerExtra,
  playerExtraTip,
  inRun,
  world,
  boss,
  enemyExtra,
  enemyArt,
  enemyChips,
  enemy,
  onTarget,
}: Props) {
  const n = b.enemies.length;
  const multi = n > 1;
  const first = b.enemies[Math.min(enemy, n - 1)];
  const sprite =
    "mt-auto flex min-h-20 md:[@media(max-height:620px)]:min-h-10 flex-1 items-end justify-center pt-1 w-full";
  const spriteSize =
    "relative h-full max-h-[9.5rem] aspect-square max-w-full [&>svg]:h-full [&>svg]:w-full";
  const big = bigMomentFx(b);
  const { fx, paused } = useBattleFx(b, boss);
  return (
    <div
      className={`relative flex min-h-[32rem] flex-col overflow-hidden border-4 border-[var(--edge)] p-2 md:min-h-0 md:flex-1 ${world === undefined ? "bg-gradient-to-b from-[#3a2f3d] to-[#6b4a3a]" : ""} ${big?.className ?? ""}`}
      style={big?.style}
      data-hitstop={paused}
    >
      {boss && b.actions === 0 && <BossIntro name={b.enemies[0].char.name} />}
      {boss && b.status === "won" && (
        <div
          className="fx-flash pointer-events-none absolute inset-0 z-20 bg-yellow-300/60"
          style={{
            animationDelay: `${b.events.length * STAGGER_S}s`,
            opacity: 0,
          }}
        />
      )}
      {world === undefined ? (
        <div className="absolute inset-x-0 bottom-0 h-[30%] border-t-4 border-[var(--edge)] bg-[#2b2420]" />
      ) : (
        <ArenaBackground world={world} boss={boss} />
      )}
      <div className="relative grid min-h-0 flex-1 gap-2 md:grid-cols-[minmax(0,34%)_minmax(0,1fr)]">
        <div className="relative flex min-h-0 flex-col">
          <FxLayer t={fx?.player} k={fx?.key ?? 0} />
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
          <div
            key={`p${b.log.length}`}
            className={sprite}
            style={fxStyle(b, "player")}
          >
            <div className={`${spriteSize} fx-breathe`}>
              <Sprite
                classId={b.player.char.classId}
                element={b.player.char.element}
                traits={b.player.char.traits}
              />
            </div>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Objetivo del ataque"
          className={`grid min-h-0 min-w-0 gap-2 ${COLS[n as 1 | 2 | 3] ?? COLS[3]}`}
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
                className={`relative flex min-h-0 min-w-0 flex-col rounded-sm outline-offset-2 ${multi && !dead ? "cursor-pointer" : ""} ${selected && multi ? "outline outline-[3px] outline-yellow-300" : ""} ${dead ? "opacity-50 grayscale" : ""}`}
              >
                <FxLayer t={fx?.enemies[i]} k={fx?.key ?? 0} />
                <HudCard
                  c={c}
                  foe={b.player}
                  turn={b.turn}
                  inRun={inRun}
                  label={multi ? `R${i + 1}` : "RIVAL"}
                  tone="enemy"
                  extra={dead ? "Derrotado" : enemyExtra(i, c)}
                  compact={multi}
                  className={multi && selected ? "!border-yellow-300" : ""}
                  footer={
                    <div className="mt-1 flex min-h-6 flex-wrap items-center gap-1 text-[13px]">
                      {multi && selected && (
                        <Tooltip tip={targetTip(b, i)}>
                          <span className="cursor-help font-semibold text-yellow-300">
                            ▶ Objetivo
                          </span>
                        </Tooltip>
                      )}
                      {intents.length > 0 && (
                        <span className="font-semibold text-red-300">
                          Anuncia:
                        </span>
                      )}
                      {intents.map((it, k) => (
                        <Chip key={k} tone="danger" tip={intentTip(it, b, i)}>
                          {it === "defend"
                            ? "Defender"
                            : `${CLASSES[c.char.classId][it].name}${it === "attack2" ? " ⚠" : ""}`}
                        </Chip>
                      ))}
                    </div>
                  }
                >
                  {enemyChips?.(i, c)}
                </HudCard>
                <div
                  key={`e${i}-${b.log.length}`}
                  className={sprite}
                  style={fxStyle(b, "enemy", i)}
                >
                  <div className={`${spriteSize} fx-breathe fx-breathe-b`}>
                    {enemyArt(i, c)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
