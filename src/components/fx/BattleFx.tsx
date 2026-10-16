import { useEffect, useState } from "react";
import { elementMultiplier, type Element } from "@/lib/game/elements";
import type { Battle } from "@/lib/game/combat";
import { ELEMENT_COLORS } from "@/sprites/palettes";
import { ELEMENT_ART } from "@/lib/art";
import { isPixel } from "@/lib/art/pixel";
import { enemyAnim } from "@/lib/art/enemies";
import { eventVfx, SKILL_FX, stepNumbers } from "@/lib/art/skillFx";
import { isSkillId } from "@/lib/game/skills";
import { DUNGEON_THEMES } from "@/lib/game/levels";
import { AnimSheet } from "@/components/AnimSheet";
import { Vfx, VfxNumber } from "./Vfx";
import { PaintedSkillEffect } from "./PaintedSkillEffect";
import { PAINTED_SKILL_EFFECTS,paintedActionEffectFor,paintedOutcomeFor,type PaintedSkillEffectId } from "@/lib/art/painted-skill-effects";
import { reducedMotion } from "./motion";
import "./fx.css";

import { IMPACT_S, STAGGER_S } from "./timing";
const HITSTOP_MS = 80;
const MAX_PARTICLE_EVENTS = 3;
// false = the old CSS particle bursts instead of the painted slash sprites.
const PAINTED_HITS = true;

type Num = {
  text: string;
  tone: "dmg" | "foe" | "heal" | "self";
  crit: boolean;
  delay: number;
};
type Part = { element: Element; delay: number };
// Painted overlays on a target (element arrows, guard, shield, regeneration).
type Extra = { id: string; delay: number; wide?: boolean; cls?: string; paintedDefense?: PaintedSkillEffectId };
// `nums`: damage, healing and self-damage are separate numbers (never a net HP difference).
export type TargetFx = { nums: Num[]; parts: Part[]; dodge?: number; extras?: Extra[] };
type StepFx = {
  key: number;
  player: TargetFx;
  enemies: TargetFx[];
  stops: number[]; // impact times (s) that get a hit-stop
};

// Burst vectors [dx, dy] in px per element: fire rises, water drops, earth
// falls in chunks, lightning zigzags wide, wind streaks sideways.
const VECTORS: Record<Element, [number, number][]> = {
  fuego: [
    [-10, -26],
    [0, -34],
    [10, -26],
    [-5, -18],
    [6, -40],
    [14, -20],
  ],
  agua: [
    [-16, 10],
    [-8, 22],
    [0, 28],
    [8, 22],
    [16, 10],
    [4, 14],
  ],
  tierra: [
    [-20, 8],
    [-10, 18],
    [0, 22],
    [10, 18],
    [20, 8],
    [14, 24],
  ],
  rayo: [
    [-30, -12],
    [30, -14],
    [-18, 12],
    [20, 14],
    [-8, -30],
    [10, 26],
  ],
  viento: [
    [-34, -4],
    [34, -6],
    [-26, 6],
    [28, 4],
    [-18, -12],
    [20, -10],
  ],
};

const castsShield = (c: Battle["cev"][number]) =>
  c.type === "actionCommitted" && c.actor === 0 && isSkillId(c.skillId) && SKILL_FX[c.skillId].vfx === "shield";

export function useBattleFx(b: Battle, boss: boolean | undefined) {
  const hpsOf = (x: Battle) => x.enemies.map((e) => e.hp);
  const [snap, setSnap] = useState({
    log: b.log.length,
    p: b.player.hp,
    sh: b.player.shield ?? 0,
    e: hpsOf(b),
  });
  const [fx, setFx] = useState<StepFx | null>(null);
  const [stopKey, setStopKey] = useState(0);
  const [paused, setPaused] = useState(false);

  if (snap.log !== b.log.length) {
    const next = {
      log: b.log.length,
      p: b.player.hp,
      sh: b.player.shield ?? 0,
      e: hpsOf(b),
    };
    setSnap(next);
    if (b.log.length < snap.log || (b.events.length === 0 && !b.cev.some(eventVfx) && !stepNumbers(b.cev).length && !b.cev.some(castsShield))) {
      setFx(null);
    } else {
      const calm = reducedMotion();
      const strong: number[] = [];
      const player: TargetFx = { nums: [], parts: [] };
      const enemies: TargetFx[] = b.enemies.map(() => ({ nums: [], parts: [] }));
      const fxOf = (id: number) => (id === 0 ? player : enemies[id - 1]);
      const firstAt: Record<number, number> = {};
      const crits: Record<number, boolean> = {};
      let particleEvents = 0;
      b.events.forEach((ev, i) => {
        if (ev.kind === "miss") {
          const t = ev.actor === "player" ? enemies[ev.enemy] : player;
          if (t) t.dodge ??= i * STAGGER_S + IMPACT_S;
          return;
        }
        if (ev.kind !== "hit" && ev.kind !== "crit") return;
        const t = i * STAGGER_S + IMPACT_S;
        const toEnemy = ev.actor === "player";
        const id = toEnemy ? ev.enemy + 1 : 0;
        const tgt = toEnemy ? enemies[ev.enemy] : player;
        firstAt[id] ??= t;
        if (ev.kind === "crit") crits[id] = true;
        const attacker = toEnemy ? b.player : b.enemies[ev.enemy];
        // Reduced motion keeps the still impact variant (it carries where and what element hit).
        if (tgt && particleEvents < MAX_PARTICLE_EVENTS) {
          particleEvents++;
          tgt.parts.push({ element: attacker.char.element, delay: t });
        }
        if (ev.kind === "crit" || ev.move !== "attack1") strong.push(t);
        const m = elementMultiplier(
          attacker.char.element,
          (toEnemy ? b.enemies[ev.enemy] : b.player).char.element,
        );
        if (m !== 1 && tgt && !tgt.extras?.some((x) => x.id.startsWith("element_")))
          (tgt.extras ??= []).push({
            id: m > 1 ? "element_advantage" : "element_disadvantage",
            delay: t,
          });
      });
      // Numbers come from event amounts and causes: hits, heals and Embestida's cost each get their own.
      const afterHits = Math.min(IMPACT_S + 0.4, ...Object.values(firstAt)) + 0.15;
      const regen = new Set<number>();
      for (const n of stepNumbers<number>(b.cev)) {
        const t = fxOf(n.target);
        if (!t) continue;
        if (n.kind === "dmg") {
          const atk = n.actor === null ? undefined : n.actor === 0 ? b.player : b.enemies[n.actor - 1];
          const defn = n.target === 0 ? b.player : b.enemies[n.target - 1];
          const m = atk ? elementMultiplier(atk.char.element, defn.char.element) : 1;
          t.nums.push({
            text: `${n.value}${m > 1 ? "▲" : m < 1 ? "▼" : ""}`,
            tone: n.target === 0 ? "foe" : "dmg",
            crit: !!crits[n.target],
            delay: firstAt[n.target] ?? IMPACT_S,
          });
        } else if (n.kind === "heal") {
          regen.add(n.target);
          t.nums.push({ text: `+${n.value}`, tone: "heal", crit: false, delay: afterHits });
        } else t.nums.push({ text: `-${n.value}`, tone: "self", crit: false, delay: afterHits });
      }
      // Passive recovery / life steal / regeneration emit no event: a rise in HP that no event explains
      // (and no damage took away) still shows as its own heal number.
      const felt = new Set(stepNumbers<number>(b.cev).filter((n) => n.kind !== "heal").map((n) => n.target));
      const gain = (id: number, before: number | undefined, now: number) => {
        if (before === undefined || now <= before || regen.has(id) || felt.has(id)) return;
        regen.add(id);
        fxOf(id).nums.push({ text: `+${now - before}`, tone: "heal", crit: false, delay: afterHits });
      };
      gain(0, snap.p, b.player.hp);
      b.enemies.forEach((en, i) => gain(i + 1, snap.e[i], en.hp));
      const cast = b.cev.find((c) => c.type === "actionCommitted" && c.actor === 0 && isSkillId(c.skillId));
      const paintedOutcomes=b.cev.flatMap(ev=>{const effect=paintedOutcomeFor(cast?.skillId,ev,isPixel());return effect?[effect]:[];});
      for (const id of regen) if(!paintedOutcomes.some(e=>e.id==="restore"&&e.at===id)) (fxOf(id).extras ??= []).push({ id: "regeneration", delay: afterHits });
      // Shield skills: their own geometry/material (SKILL_FX.look); a plain gain keeps the default overlay.
      const castFx = cast && isSkillId(cast.skillId) ? SKILL_FX[cast.skillId] : undefined;
      const defense = paintedActionEffectFor(cast?.skillId, isPixel());
      if (castFx?.vfx === "shield" || (b.player.shield ?? 0) > snap.sh)
        (player.extras ??= []).push({ id: "shield", delay: IMPACT_S, cls: defense ? PAINTED_SKILL_EFFECTS[defense].className : castFx?.vfx === "shield" ? castFx.look : undefined, paintedDefense: defense ?? undefined });
      if (b.guardEarned)
        (player.extras ??= []).push({ id: "perfect_guard", delay: IMPACT_S });
      // Structured events (consume / Quiebre / ritual cancelled / armor rebuilt / status cleansed) play their own sheet.
      for (const ev of b.cev) {
        const effect=paintedOutcomeFor(cast?.skillId,ev,isPixel());
        if(effect){
          (fxOf(effect.at).extras??=[]).push({id:effect.id,paintedDefense:effect.id,cls:PAINTED_SKILL_EFFECTS[effect.id].className,delay:effect.id==="restore"?afterHits:IMPACT_S});
          continue;
        }
        const v = eventVfx(ev);
        const t = v && fxOf(v.at);
        if (v && t) (t.extras ??= []).push({ id: v.id, delay: IMPACT_S, wide: true });
      }
      if (boss && b.status === "won" && !calm)
        strong.push((b.events.length - 1) * STAGGER_S + IMPACT_S);
      setFx({ key: b.log.length, player, enemies, stops: strong.slice(0, 3) });
      setStopKey(b.log.length);
    }
  }

  // Hit-stop: briefly pause every CSS animation in the arena at each strong impact.
  useEffect(() => {
    if (!fx || reducedMotion()) return;
    const ids: number[] = [];
    for (const d of fx.stops) {
      ids.push(window.setTimeout(() => setPaused(true), d * 1000));
      ids.push(
        window.setTimeout(() => setPaused(false), d * 1000 + HITSTOP_MS),
      );
    }
    return () => {
      ids.forEach(clearTimeout);
      setPaused(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey]);

  return { fx, paused };
}

export function FxLayer({ t, k }: { t?: TargetFx; k: number }) {
  if (
    !t ||
    (!t.nums.length && t.parts.length === 0 && t.dodge === undefined && !t.extras?.length)
  )
    return null;
  return (
    <div
      key={k}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5"
    >
      {t.nums.map((n, i) => (
        <span
          key={`n${i}`}
          className={`fxn fxn-${n.tone} ${n.crit ? "fxn-crit" : ""}`}
          style={{ animationDelay: `${n.delay}s`, marginTop: `${i * 2.6}rem` }}
        >
          <VfxNumber
            text={n.text}
            kind={
              n.tone === "heal"
                ? "heal_number"
                : n.crit
                  ? "damage_critical"
                  : "damage_normal"
            }
            delay={n.delay}
            size={n.crit ? 52 : n.tone === "dmg" || n.tone === "foe" ? 40 : 32}
          />
          {n.text.match(/[▲▼]/)?.[0]}
        </span>
      ))}
      {t.nums.some((n) => n.crit) && (
        <Vfx
          id="critical_label"
          delay={t.nums.find((n) => n.crit)!.delay}
          className="absolute left-1/2 top-0 w-24 -translate-x-1/2 -translate-y-1/2"
        />
      )}
      {t.dodge !== undefined && (
        <span className="fxn fxn-miss" style={{ animationDelay: `${t.dodge}s` }}>
          ¡Falla!
        </span>
      )}
      {t.extras?.map((x, i) => x.paintedDefense ? (
        <PaintedSkillEffect key={`x${i}`} id={x.paintedDefense} delay={x.delay} className={`absolute left-1/2 -translate-x-1/2 ${x.cls}`} />
      ) : (
        <Vfx
          key={`x${i}`}
          id={x.id}
          delay={x.delay}
          className={`absolute left-1/2 -translate-x-1/2 ${x.cls ?? (x.wide ? "top-[-30%] w-44" : "top-[-10%] w-32")}`}
        />
      ))}
      {t.parts.map((p, pi) =>
        PAINTED_HITS ? (
          <Vfx
            key={pi}
            id={`hit_${ELEMENT_ART[p.element]}`}
            delay={p.delay}
            className="absolute left-1/2 top-[30%] w-24 -translate-x-1/2 -translate-y-1/2"
          />
        ) : (
          VECTORS[p.element].map(([dx, dy], i) => (
            <i
              key={`${pi}-${i}`}
              className={`fxp fxp-${p.element}`}
              style={{
                background: ELEMENT_COLORS[p.element][i % 2 ? 2 : 0],
                animationDelay: `${p.delay}s`,
                ["--dx" as string]: `${dx}px`,
                ["--dy" as string]: `${dy}px`,
              }}
            />
          ))
        ),
      )}
    </div>
  );
}

export function BossIntro({
  name,
  finalRank,
  artStyle,
}: {
  name: string;
  finalRank?: string | null;
  artStyle?: "painted" | "pixel";
}) {
  const pixel = artStyle ? artStyle === "pixel" : isPixel();
  const theme = finalRank ? DUNGEON_THEMES[finalRank as keyof typeof DUNGEON_THEMES] : undefined;
  // Reuse the approved combat design instead of the old baked-in boss portrait.
  const paintedEntrance = !pixel && theme
    ? enemyAnim("diablillo", "boss", theme.bossElement, "entrance", finalRank, "painted")
    : null;
  return (
    <div
      aria-hidden
      className="fx-bossintro pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/80"
    >
      {paintedEntrance ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
          <AnimSheet anim={paintedEntrance} className="aspect-square w-[min(65%,24rem,55cqh)] shrink-0" />
          <span className="fx-bossname text-center text-xl font-black uppercase tracking-widest text-red-200 sm:text-3xl md:text-4xl">{name}</span>
        </div>
      ) : (
        <Vfx
          id="boss_entrance"
          className={finalRank ? "w-[min(90%,32rem)]" : "absolute w-[min(70%,20rem)] opacity-80"}
        />
      )}
      {!paintedEntrance && <span className={`fx-bossname relative px-2 text-center text-3xl font-black uppercase tracking-widest text-red-200 md:text-5xl ${finalRank ? "sr-only" : ""}`}>
        {name}
      </span>}
    </div>
  );
}
