import type { BattleEvent, Status } from "@/lib/game/combat";
import { isTopRank, type RarityId } from "@/lib/game/rarity";

let ctx: AudioContext | null = null;
let muted = false;

export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
};
let noise: AudioBuffer | null = null;

function noiseBurst(
  c: AudioContext,
  t: number,
  f0: number,
  f1: number,
  q: number,
  dur: number,
  vol: number,
) {
  noise ??= (() => {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    b.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
    return b;
  })();
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = noise;
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + dur);
}

function ring(
  c: AudioContext,
  t: number,
  freq: number,
  dur: number,
  vol: number,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

// Spells: soft shimmering sine sweep (mage) or bell chime (cleric prayer).
function magic(c: AudioContext, t: number, k: number, e: BattleEvent) {
  if (e.classId === "clerigo") {
    [660, 880, 1320].forEach((f, i) => ring(c, t + i * 0.08, f * k, 0.5, 0.06));
    return;
  }
  if (e.kind === "miss") {
    noiseBurst(c, t, 1500 * k, 600 * k, 3, 0.2, 0.04);
    return;
  }
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(400 * k, t);
  o.frequency.exponentialRampToValueAtTime(1400 * k, t + 0.18);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.3);
  noiseBurst(c, t + 0.1, 3000 * k, 800 * k, 1.5, 0.15, 0.08);
  ring(c, t + 0.1, 100 * k, 0.12, 0.12);
  if (e.kind === "crit") {
    ring(c, t + 0.12, 2000 * k, 0.4, 0.04);
    boom(c, t + 0.1, 0.25);
  }
}

// Low boom for big moments (crit impact).
function boom(c: AudioContext, t: number, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.3);
}

// Rival sounds are pitched lower than the player's.
function play(e: BattleEvent, delay: number) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const k = e.actor === "player" ? 1 : 0.7;
  if (
    e.classId === "mago" ||
    (e.classId === "clerigo" && e.move === "attack2" && e.weapon === "libro")
  ) {
    magic(ctx, t, k, e);
    return;
  }
  if (e.kind === "miss") {
    // sword whoosh
    noiseBurst(ctx, t, 500 * k, 2200 * k, 1.2, 0.22, 0.08);
    return;
  }
  // blade strike: whoosh into a metallic scrape plus a low thud
  noiseBurst(ctx, t, 3500 * k, 1200 * k, 2, 0.12, 0.14);
  ring(ctx, t, 90 * k, 0.12, 0.18);
  if (e.kind === "crit") {
    ring(ctx, t, 2300 * k, 0.45, 0.05);
    ring(ctx, t, 3400 * k, 0.35, 0.03);
    boom(ctx, t, 0.3);
  }
}

function note(
  c: AudioContext,
  t: number,
  freq: number,
  dur: number,
  vol: number,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

// short jingles: rising major arpeggio / falling minor line
const JINGLES: Partial<Record<Status, number[]>> = {
  won: [523, 659, 784, 1047],
  lost: [392, 311, 262, 196],
};

function playJingle(status: Status, delay: number) {
  const notes = JINGLES[status];
  if (!ctx || !notes) return;
  const t = ctx.currentTime + delay;
  notes.forEach((f, i) =>
    note(ctx!, t + i * 0.13, f, status === "won" ? 0.35 : 0.5, 0.18),
  );
}

// Perfect guard: shield clang plus a rising two-note ring.
function playGuard(t: number) {
  if (!ctx) return;
  noiseBurst(ctx, t, 2500, 900, 4, 0.1, 0.12);
  ring(ctx, t, 1200, 0.35, 0.08);
  ring(ctx, t + 0.09, 1800, 0.5, 0.07);
  boom(ctx, t, 0.2);
}

// Boss down: longer fanfare after the usual victory jingle.
function playBossDown(t: number) {
  if (!ctx) return;
  [392, 523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
    note(ctx!, t + i * 0.11, f, 0.5, 0.16),
  );
  noiseBurst(ctx, t + 0.7, 1000, 6000, 1, 0.6, 0.07);
}

export interface BattleMoments {
  guard?: boolean; // perfect guard earned in this step
  boss?: boolean; // the fight is against a boss
}

// Call from a user gesture (browsers block audio otherwise).
export function playEvents(
  events: BattleEvent[],
  status: Status = "ongoing",
  moments: BattleMoments = {},
) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (moments.guard) playGuard(ctx.currentTime);
    events.forEach((e, i) => play(e, i * 0.3));
    playJingle(status, events.length * 0.3 + 0.1);
    if (moments.boss && status === "won")
      playBossDown(ctx.currentTime + events.length * 0.5 + 0.6);
  } catch {
    // audio unavailable: ignore
  }
}

// Gacha pull: soft chime scaling with rarity; legendary = rising arpeggio.
const PULL_NOTES: Record<RarityId, number[]> = {
  f: [523],
  e: [523, 659],
  d: [523, 659, 784],
  c: [523, 659, 784, 988],
  b: [523, 659, 784, 988, 1175],
  a: [523, 659, 784, 988, 1175, 1319],
  s: [523, 659, 784, 1047, 1319, 1568, 2093],
};

export function playPullSound(rarity: RarityId) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const legend = isTopRank(rarity);
    PULL_NOTES[rarity].forEach((f, i) =>
      note(ctx!, t + i * (legend ? 0.08 : 0.1), f, legend ? 0.6 : 0.3, 0.12),
    );
    if (legend) noiseBurst(ctx, t, 800, 5000, 1, 0.5, 0.06);
  } catch {
    // audio unavailable: ignore
  }
}

// Forge result: anvil clinks + rising chime on success, low thud on failure.
export function playForgeSound(ok: boolean) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    if (ok) {
      noiseBurst(ctx, t, 2500, 6000, 4, 0.08, 0.12);
      noiseBurst(ctx, t + 0.22, 2500, 6000, 4, 0.08, 0.12);
      [659, 988, 1319].forEach((f, i) => note(ctx!, t + 0.45 + i * 0.1, f, 0.4, 0.12));
    } else {
      note(ctx, t, 196, 0.4, 0.15);
      note(ctx, t + 0.18, 147, 0.5, 0.15);
    }
  } catch {
    // audio unavailable: ignore
  }
}
