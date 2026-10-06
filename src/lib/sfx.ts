import type { BattleEvent, Status } from "@/lib/game/combat";
import type { RarityId } from "@/lib/game/rarity";

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
  if (e.kind === "crit") ring(c, t + 0.12, 2000 * k, 0.4, 0.04);
}

// Rival sounds are pitched lower than the player's.
function play(e: BattleEvent, delay: number) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const k = e.actor === "player" ? 1 : 0.7;
  if (
    e.classId === "mago" ||
    (e.classId === "clerigo" && e.move === "attack2")
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

// Call from a user gesture (browsers block audio otherwise).
export function playEvents(events: BattleEvent[], status: Status = "ongoing") {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    events.forEach((e, i) => play(e, i * 0.5));
    playJingle(status, events.length * 0.5 + 0.1);
  } catch {
    // audio unavailable: ignore
  }
}

// Gacha pull: soft chime scaling with rarity; legendary = rising arpeggio.
const PULL_NOTES: Record<RarityId, number[]> = {
  comun: [523],
  pococomun: [523, 659],
  raro: [523, 659, 784],
  epico: [523, 659, 784, 988],
  legendario: [523, 659, 784, 1047, 1319, 1568, 2093],
};

export function playPullSound(rarity: RarityId) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const legend = rarity === "legendario";
    PULL_NOTES[rarity].forEach((f, i) =>
      note(ctx!, t + i * (legend ? 0.08 : 0.1), f, legend ? 0.6 : 0.3, 0.12),
    );
    if (legend) noiseBurst(ctx, t, 800, 5000, 1, 0.5, 0.06);
  } catch {
    // audio unavailable: ignore
  }
}
