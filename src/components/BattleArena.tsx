"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { blockMenuMusic } from "@/lib/menu-music";
import { BossIntro, FxLayer, useBattleFx } from "@/components/fx/BattleFx";
import { EnemyCueContext, type EnemyCue } from "@/components/EnemySprite";
import { StatusIcons } from "@/components/StatusIcons";
import { ElementalStatusOverlay } from "@/components/ElementalStatusOverlay";
import { HudCard } from "@/components/HudCard";
import { HeroSprite } from "@/components/HeroSprite";
import { Tooltip } from "@/components/Tooltip";
import { HERO_ACTIONS } from "@/lib/art/heroes";
import { isPixel } from "@/lib/art/pixel";
import { CLASS_ART, ELEMENT_ART, HERO_ART_V } from "@/lib/art";
import paintedHeroes from "@/lib/art/hero-integration.generated.json";
import type { HeroAction } from "@/lib/art/heroes";
import { Vfx } from "@/components/fx/Vfx";
import { STAGGER_S } from "@/components/fx/timing";
import { effectSrc } from "@/lib/art/effects";
import type { StatusAnchorFamily } from "@/lib/art/statusAnchors";
import { allStatusLayerIds, layerChangeDelayMs, statusLayerSrc } from "@/lib/art/statusLayers";
import { preloadImages } from "@/lib/preload";
import { enemyIntents, type Battle, type Combatant, type Intent } from "@/lib/game/combat";
import { intentInfo, intentTip, type Tip } from "@/lib/game/explain";
import { EVENT_VFX_IDS, heroActionFor, pickCallouts, SKILL_FX, skillTag, type Callout } from "@/lib/art/skillFx";
import { isSkillId, SKILLS } from "@/lib/game/skills";
import { STATUS_DATA, type StatusId } from "@/lib/game/statuses";

// Clicks and keys that come from a real control inside the target (help / Info buttons, links) must not pick or
// un-pick the target: only the card itself does.
const fromControl = (e: { target: EventTarget | null; currentTarget: EventTarget }) =>
  e.target !== e.currentTarget && !!(e.target as Element | null)?.closest?.("button, a, input, select, textarea, [role='button']");

// Animation for who attacked / who got hit in the last step, staggered like the sfx.

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
    else if (e.actor !== side && e.kind !== "miss") {
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
    if (e.actor === "enemy") {
      if (!dead && cue.action === "idle") cue = { action: "attack", delay: k * STAGGER_S * 1000 };
    } else if (e.actor === "player" && e.kind !== "miss") {
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
    return { action: "perfect_guard", delay: at(foeIdx(() => true)) };
  const ownIdx = b.events.findIndex((e) => e.actor === "player");
  if (ownIdx >= 0) return { action: heroActionFor(b.events[ownIdx].move), delay: at(ownIdx, 0) };
  // Skills without a damaging hit (shield, cleanse, ...) leave no hit event: use the committed action.
  const committed = b.cev.find((c) => c.type === "actionCommitted" && c.actor === 0 && isSkillId(c.skillId));
  if (committed && isSkillId(committed.skillId)) return { action: heroActionFor(committed.skillId), delay: 0 };
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

// `multi` (group fight): on phones the card shrinks to glyph + name; the full text is in the intent list of the action panel.
function IntentCard({ b, enemy, intent, multi }: { b: Battle; enemy: Combatant; intent: Intent; multi: boolean }) {
  const idx = b.enemies.indexOf(enemy);
  const info = intentInfo(intent, b, idx);
  const tip = intentTip(intent, b, idx);
  const tone = info.cancel === "interrumpir"
    ? "border-rose-400/70 bg-rose-950/70 text-rose-100"
    : info.cancel === "quiebre"
      ? "border-amber-400/60 bg-amber-950/65 text-amber-100"
      : info.strong
        ? "border-red-400/60 bg-red-950/60 text-[#f2e6d7]"
        : "border-red-900/60 bg-black/35 text-[#f2e6d7]";
  return (
    <div
      aria-label={`${info.name}. ${info.effect}. ${info.counter} ${info.cancelLabel}.`}
      className={`flex min-w-0 items-start gap-1.5 rounded border px-1.5 py-1 ${tone}`}
    >
      <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-center font-bold leading-4">{info.glyph}</span>
      <Tooltip tip={tip} className="block min-w-0 flex-1">
        <span className="block truncate text-[11px] font-bold leading-4">{info.name}</span>
        <span className={`line-clamp-2 break-words text-[10px] leading-3 text-[#e4d9ca] ${multi ? "max-md:hidden" : ""}`} title={`${info.effect}. ${info.counter}`}>{info.effect}</span>
        <span className={`block truncate text-[9px] font-semibold uppercase tracking-wide leading-3 text-amber-200 ${multi ? "max-md:hidden" : ""}`}>{info.cancelLabel}</span>
      </Tooltip>
    </div>
  );
}

// Visible text for the structured events of the last step (no audio needed). Shapes, not colour,
// tell the kinds apart; the list stays until the next step, so it also works with reduced motion.
function nameOf(b: Battle, id: number) {
  return id === 0 ? b.player.char.name : (b.enemies[id - 1]?.char.name ?? "Rival");
}

function stepCallouts(b: Battle): Callout[] {
  const out: Callout[] = [];
  // Several targets of one kind collapse into a single line ("Se consume Quemadura en R1 y R2").
  const grouped = new Map<string, { glyph: string; prio: number; head: string; names: string[]; at: number }>();
  const group = (key: string, glyph: string, prio: number, head: string, name: string) => {
    const g = grouped.get(key);
    if (g) g.names.push(name);
    else grouped.set(key, { glyph, prio, head, names: [name], at: out.length });
  };
  for (const ev of b.cev) {
    const who = nameOf(b, ev.target ?? ev.actor);
    if (ev.type === "actionCommitted" && ev.actor === 0 && isSkillId(ev.skillId)) {
      const fx = SKILL_FX[ev.skillId];
      out.push({ glyph: fx.glyph, text: `${SKILLS[ev.skillId].name}: ${skillTag(ev.skillId)}`, prio: 2 });
    } else if (ev.type === "staggerBroken") out.push({ glyph: "◆", text: `¡Quiebre! ${who} queda Expuesto (DEF −15 %)`, prio: 0 });
    else if (ev.type === "statusConsumed") {
      const label = ev.detail === "sobrecarga" ? "Sobrecarga" : (STATUS_DATA[ev.detail as StatusId]?.label ?? "estado");
      group(`c${label}`, "✹", 1, `Se consume ${label}`, `${who}${ev.value ? ` (${ev.value})` : ""}`);
    } else if (ev.type === "statusRemoved") {
      const label = STATUS_DATA[ev.detail as StatusId]?.label ?? "un estado negativo";
      out.push({ glyph: "✧", text: `Purificado: ${who} se libra de ${label}`, prio: 1 });
    } else if (ev.type === "selfDamaged") out.push({ glyph: "✚", text: `${who} se hiere: −${ev.value} PV`, prio: 2 });
    else if (ev.type === "guardTriggered") out.push({ glyph: "◧", text: `¡Guardia perfecta de ${nameOf(b, ev.actor)}!`, prio: 1 });
    else if (ev.type === "telegraphCancelled") out.push({ glyph: "✦", text: `${nameOf(b, ev.actor)}: amenaza cancelada`, prio: 0 });
    else if (ev.type === "telegraphStarted" && ev.detail) {
      const info = intentInfo(ev.detail as Intent, b, ev.actor - 1);
      out.push({ glyph: "⚠", text: `${nameOf(b, ev.actor)} prepara ${info.name} (${info.cancelLabel.toLowerCase()})`, prio: 3 });
    } else if (ev.type === "progressChanged" && ev.value)
      group(ev.value < 0 ? "pl" : "pa", ev.value < 0 ? "⏳" : "»", 3, ev.value < 0 ? "Pierden ritmo (su turno se retrasa)" : "Adelantan su próximo turno", nameOf(b, ev.actor));
    else if (ev.type === "bossPhaseChanged" && ev.detail)
      out.push({ glyph: "☗", text: `${nameOf(b, ev.actor)}: ${ev.detail === "roto" ? "armadura rota (Roto)" : ev.detail === "cabeza" ? "le crece una cabeza" : ev.detail === "armadura" ? "armadura recompuesta" : `fase ${ev.detail}`}`, prio: 0 });
  }
  [...grouped.values()].forEach((g, k) =>
    out.splice(g.at + k, 0, { glyph: g.glyph, text: `${g.head}: ${g.names.join(", ")}`, prio: g.prio }));
  return pickCallouts(out);
}

function StepCallouts({ b }: { b: Battle }) {
  const items = stepCallouts(b);
  if (!items.length) return null;
  return (
    <ul
      role="status"
      aria-live="polite"
      aria-label="Lo que pasó"
      className="pointer-events-none absolute bottom-2 left-1/2 z-40 flex w-[min(92%,24rem)] -translate-x-1/2 flex-col items-center gap-1"
    >
      {items.map((it, i) => (
        <li key={i} className="max-w-full rounded border border-[#e0b070]/60 bg-black/80 px-2 py-0.5 text-center text-[11px] font-semibold leading-4 text-[#fff1d0] md:text-xs">
          <span aria-hidden="true">{it.glyph} </span>{it.text}
        </li>
      ))}
    </ul>
  );
}

// Effects every fight can show (hits per element, damage numbers, guard, status marks): without a
// warm cache they download when first needed and arrive after the blow they belong to.
const FIGHT_EFFECTS = [
  "hit_fire", "hit_water", "hit_wind", "hit_earth", "hit_lightning",
  "critical_label", "damage_normal", "damage_critical", "heal_number", "dodge",
  "element_advantage", "element_disadvantage", "perfect_guard", "regeneration", "shield",
  "defeat", "victory", ...EVENT_VFX_IDS,
];

// Warm the browser cache (and decode) every sheet of this fight so an action never
// stalls on a first-time download (the hitch before attacks).
function usePreload(urls: string[]) {
  const key = urls.join("|");
  useEffect(() => {
    preloadImages([
      ...key.split("|"),
      ...FIGHT_EFFECTS.flatMap((id) => [effectSrc(id), effectSrc(id, true)]),
      ...allStatusLayerIds.map((id) => statusLayerSrc(id, isPixel())),
    ]);
  }, [key]);
}

type Props = {
  b: Battle;
  playerExtra: string;
  playerExtraTip?: Tip;
  inRun?: boolean;
  rank?: string | null; // dungeon rank, for its own scenery
  finalRank?: string | null; // route id of the dungeon's named final boss
  world?: number; // 0-4 index into WORLDS; omit for the plain test-bench look
  boss?: boolean;
  enemyExtra: (i: number, c: Combatant) => string;
  enemyArt: (i: number, c: Combatant) => ReactNode; // already flipped by the caller
  enemyChips?: (i: number, c: Combatant) => ReactNode;
  enemyStatusFamily?: (i: number, c: Combatant) => StatusAnchorFamily; // anchor exception for wide / flying sprites
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
  enemyStatusFamily,
  enemy,
  onTarget,
  bleed,
  tall,
}: Props) {
  useEffect(() => blockMenuMusic(), []);
  const n = b.enemies.length;
  const multi = n > 1;
  const first = b.enemies[Math.min(enemy, n - 1)];
  const big = bigMomentFx(b);
  const { fx, paused } = useBattleFx(b, boss);
  const hc = b.player.char;
  const cls = CLASS_ART[hc.classId];
  const [heroX, heroY, heroWidth, heroHeight] = paintedHeroes.idle_bounds[cls as keyof typeof paintedHeroes.idle_bounds];
  // Use one fixed visible envelope for every action, retaining the shared foot anchor.
  const heroEnvelope = {
    "--painted-x": heroX / paintedHeroes.frame_size,
    "--painted-y": heroY / paintedHeroes.frame_size,
    "--painted-width": heroWidth / paintedHeroes.frame_size,
    "--painted-height": heroHeight / paintedHeroes.frame_size,
  } as CSSProperties;
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
      style={{ ...(!isPixel() ? heroEnvelope : {}), ...big?.style }}
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
      <StepCallouts b={b} />
      {world === undefined ? (
        <div className="absolute inset-x-0 bottom-0 h-[30%] border-t-4 border-[var(--edge)] bg-[#2b2420]" />
      ) : bleed ? null : (
        <ArenaBackground world={world} boss={boss} rank={rank} />
      )}
      <div className="stage-hero absolute left-[2%]" style={isPixel() ? undefined : heroEnvelope}>
        <FxLayer t={fx?.player} k={fx?.key ?? 0} />
        <div
          key={`p${b.log.length}`}
          className="h-full w-full"
          style={fxStyle(b, "player")}
        >
          <div className="fx-breathe relative h-full w-full origin-bottom">
            <div className={isPixel() ? "h-full w-full" : "stage-model-frame"}>
              <CuedHero b={b} />
            </div>
          </div>
        </div>
        <ElementalStatusOverlay c={b.player} family="hero" ended={b.status !== "ongoing"} delayMs={layerChangeDelayMs(b.cev, 0)} />
        <StatusIcons c={b.player} />
      </div>
      <div className="stage-player-hud absolute left-2 top-2 z-10 w-[min(12.5rem,44%)]">
        <HudCard
          c={b.player}
          foe={first}
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
        aria-label="Objetivo de tu acción"
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
              onClick={(e) => !dead && !fromControl(e) && onTarget?.(i)}
              onKeyDown={(e) => {
                if (dead || !multi || fromControl(e)) return;
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
                      (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus(); // keep the roving focus with the pick
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
              <div className="stage-enemy-hud absolute inset-x-0 top-2 z-30 w-full">
                <HudCard
                  c={c}
                  foe={b.player}
                          inRun={inRun}
                  label={multi ? `R${i + 1}` : "RIVAL"}
                  tone="enemy"
                  extra={dead ? "Derrotado" : enemyExtra(i, c)}
                  compact={multi}
                  className=""
                  footer={
                    <div className="mt-1 space-y-1">
                      {intents.map((it, k) => (
                        <IntentCard key={`${it}-${k}`} b={b} enemy={c} intent={it} multi={multi} />
                      ))}
                    </div>
                  }
                >
                  {enemyChips?.(i, c)}
                </HudCard>
              </div>
              {/* Same slot as the art below, but not re-keyed per step: the envelope keeps its state across steps. */}
              <div className="stage-foe-art pointer-events-none absolute bottom-0 left-1/2 z-[5] -translate-x-1/2">
                <ElementalStatusOverlay
                  c={c}
                  family={enemyStatusFamily?.(i, c) ?? (boss ? "boss" : "foe")}
                  ended={b.status !== "ongoing"}
                  delayMs={layerChangeDelayMs(b.cev, i + 1)}
                />
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
