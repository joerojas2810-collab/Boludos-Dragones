import { useEffect, useState } from "react";
import { elementMultiplier, type Element } from "@/lib/game/elements";
import type { Battle } from "@/lib/game/combat";
import { ELEMENT_COLORS } from "@/sprites/palettes";
import { reducedMotion } from "./motion";
import "./fx.css";

// Impact timing matches BattleArena's STAGGER_S (0.5 s per event).
const STAGGER_S = 0.5;
const IMPACT_S = 0.2;
const HITSTOP_MS = 80;
const MAX_PARTICLE_EVENTS = 3;

type Num = {
  text: string;
  tone: "dmg" | "foe" | "heal";
  crit: boolean;
  delay: number;
};
type Part = { element: Element; delay: number };
export type TargetFx = { num?: Num; parts: Part[] };
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

export function useBattleFx(b: Battle, boss: boolean | undefined) {
  const hpsOf = (x: Battle) => x.enemies.map((e) => e.hp);
  const [snap, setSnap] = useState({
    log: b.log.length,
    p: b.player.hp,
    e: hpsOf(b),
  });
  const [fx, setFx] = useState<StepFx | null>(null);
  const [stopKey, setStopKey] = useState(0);
  const [paused, setPaused] = useState(false);

  if (snap.log !== b.log.length) {
    const next = { log: b.log.length, p: b.player.hp, e: hpsOf(b) };
    setSnap(next);
    if (b.log.length < snap.log || b.events.length === 0) {
      setFx(null);
    } else {
      const calm = reducedMotion();
      const strong: number[] = [];
      const player: TargetFx = { parts: [] };
      const enemies: TargetFx[] = b.enemies.map(() => ({ parts: [] }));
      const firstAt: Record<string, number> = {};
      const crits: Record<string, boolean> = {};
      const foeOf: Record<string, number> = {};
      let particleEvents = 0;
      b.events.forEach((ev, i) => {
        if (ev.kind !== "hit" && ev.kind !== "crit") return;
        const t = i * STAGGER_S + IMPACT_S;
        const toEnemy = ev.actor === "player";
        const id = toEnemy ? `e${ev.enemy}` : "p";
        const tgt = toEnemy ? enemies[ev.enemy] : player;
        firstAt[id] ??= t;
        if (ev.kind === "crit") crits[id] = true;
        if (!toEnemy) foeOf[id] ??= ev.enemy;
        const attacker = toEnemy ? b.player : b.enemies[ev.enemy];
        if (!calm && tgt && particleEvents < MAX_PARTICLE_EVENTS) {
          particleEvents++;
          tgt.parts.push({ element: attacker.char.element, delay: t });
        }
        if (ev.kind === "crit" || ev.move !== "attack1") strong.push(t);
      });
      const mkNum = (
        id: string,
        tgt: TargetFx,
        lost: number,
        defElement: Element,
        atkElement: Element,
        tone: "dmg" | "foe",
      ) => {
        if (lost <= 0 || firstAt[id] === undefined) return;
        const m = elementMultiplier(atkElement, defElement);
        const mark = m > 1 ? "▲" : m < 1 ? "▼" : "";
        tgt.num = {
          text: `${lost}${mark}`,
          tone,
          crit: !!crits[id],
          delay: firstAt[id],
        };
      };
      b.enemies.forEach((en, i) =>
        mkNum(
          `e${i}`,
          enemies[i],
          (snap.e[i] ?? en.hp) - en.hp,
          en.char.element,
          b.player.char.element,
          "dmg",
        ),
      );
      mkNum(
        "p",
        player,
        snap.p - b.player.hp,
        b.player.char.element,
        b.enemies[foeOf.p ?? 0].char.element,
        "foe",
      );
      const gained = b.player.hp - snap.p;
      if (gained > 0 && !player.num)
        player.num = {
          text: `+${gained}`,
          tone: "heal",
          crit: false,
          delay: IMPACT_S,
        };
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
  if (!t || (!t.num && t.parts.length === 0)) return null;
  return (
    <div
      key={k}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5"
    >
      {t.num && (
        <span
          className={`fxn fxn-${t.num.tone} ${t.num.crit ? "fxn-crit" : ""}`}
          style={{ animationDelay: `${t.num.delay}s` }}
        >
          {t.num.crit ? `${t.num.text}!` : t.num.text}
        </span>
      )}
      {t.parts.map((p, pi) =>
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
        )),
      )}
    </div>
  );
}

export function BossIntro({ name }: { name: string }) {
  return (
    <div
      aria-hidden
      className="fx-bossintro pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/80"
    >
      <span className="fx-bossname px-2 text-center text-3xl font-black uppercase tracking-widest text-red-200 md:text-5xl">
        {name}
      </span>
    </div>
  );
}
