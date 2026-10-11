import type { BattleEvent, Status } from "@/lib/game/combat";
import { isTopRank, type RarityId } from "@/lib/game/rarity";

let ctx: AudioContext | null = null;
const SETTINGS_KEY = "bd-audio-settings-v1";
export interface AudioSettings {
  muted: boolean;
  effects: number;
  music: number;
}
const DEFAULT_SETTINGS: AudioSettings = { muted: false, effects: 0.7, music: 0.35 };
let settings = { ...DEFAULT_SETTINGS };
let effectsBus: GainNode | null = null;
let clickBuffer: AudioBuffer | null = null;
let clickBufferLoad: Promise<void> | null = null;
const settingsListeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function subscribeAudioSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

function notifySettings() {
  settingsListeners.forEach((listener) => listener());
}

function applySettings() {
  if (!ctx) return;
  const enabled = settings.muted ? 0 : 1;
  if (effectsBus) effectsBus.gain.setTargetAtTime(settings.effects * enabled, ctx.currentTime, 0.04);
}

function preloadUiClickSound() {
  if (clickBuffer || clickBufferLoad || typeof window === "undefined") return;
  clickBufferLoad = fetch("/audio/ui-click-wood-token.wav")
    .then((response) => {
      if (!response.ok) throw new Error("UI click audio unavailable");
      return response.arrayBuffer();
    })
    .then((data) => ensureContext().decodeAudioData(data))
    .then((buffer) => { clickBuffer = buffer; })
    .catch(() => undefined)
    .finally(() => { clickBufferLoad = null; });
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session when storage is unavailable.
  }
}

export function loadAudioSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AudioSettings>;
      settings = {
        muted: parsed.muted === true,
        effects: typeof parsed.effects === "number" ? Math.max(0, Math.min(1, parsed.effects)) : DEFAULT_SETTINGS.effects,
        music: typeof parsed.music === "number" ? Math.max(0, Math.min(1, parsed.music)) : DEFAULT_SETTINGS.music,
      };
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  applySettings();
  preloadUiClickSound();
  notifySettings();
  return getAudioSettings();
}

export const isMuted = () => settings.muted;
export function setMuted(muted: boolean) {
  settings = { ...settings, muted };
  applySettings();
  saveSettings();
  notifySettings();
}
export function setAudioVolume(channel: "effects" | "music", value: number) {
  settings = { ...settings, [channel]: Math.max(0, Math.min(1, value)) };
  applySettings();
  saveSettings();
  notifySettings();
}

function ensureContext() {
  ctx ??= new AudioContext();
  if (!effectsBus) {
    effectsBus = ctx.createGain();
    effectsBus.connect(ctx.destination);
  }
  applySettings();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
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
  src.connect(f).connect(g).connect(effectsBus ?? c.destination);
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
  o.connect(g).connect(effectsBus ?? c.destination);
  o.start(t);
  o.stop(t + dur);
}

// Spells: soft shimmering sine sweep (mage) or bell chime (cleric prayer).
function magic(c: AudioContext, t: number, k: number, e: BattleEvent) {
  if (e.kind === "miss") {
    noiseBurst(c, t, 1500 * k, 600 * k, 3, 0.2, 0.04);
    return;
  }
  if (e.classId === "clerigo") {
    [660, 880, 1320].forEach((f, i) => ring(c, t + i * 0.08, f * k, 0.5, 0.06));
    return;
  }
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(400 * k, t);
  o.frequency.exponentialRampToValueAtTime(1400 * k, t + 0.18);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(effectsBus ?? c.destination);
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
  o.connect(g).connect(effectsBus ?? c.destination);
  o.start(t);
  o.stop(t + 0.3);
}

function elementAccent(c: AudioContext, t: number, k: number, e: BattleEvent) {
  const force = e.overload ? 1.8 : 1;
  switch (e.element) {
    case "agua":
      noiseBurst(c, t + 0.06, 2200 * k, 650 * k, 4, 0.2, 0.045 * force);
      ring(c, t + 0.1, 1500 * k, 0.24, 0.025 * force);
      break;
    case "fuego":
      noiseBurst(c, t + 0.04, 4200 * k, 900 * k, 1.2, 0.22, 0.055 * force);
      break;
    case "viento":
      noiseBurst(c, t - 0.04, 800 * k, 3600 * k, 0.8, 0.22, 0.055 * force);
      break;
    case "tierra":
      ring(c, t + 0.04, 68 * k, 0.2, 0.12 * force);
      noiseBurst(c, t + 0.02, 700 * k, 180 * k, 1.8, 0.16, 0.06 * force);
      break;
    case "rayo":
      ring(c, t + 0.03, (e.overload ? 1900 : 1300) * k, 0.18, 0.05 * force);
      noiseBurst(c, t, 5000 * k, 1400 * k, 2.2, 0.11, 0.045 * force);
      break;
  }
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
    if (e.kind !== "miss") elementAccent(ctx, t + (e.kind === "crit" ? 0.08 : 0), k, e);
    return;
  }
  if (e.kind === "miss") {
    const start = e.weapon === "arco" ? 900 : e.weapon === "daga" ? 1100 : 500;
    noiseBurst(ctx, t, start * k, 2200 * k, 1.2, 0.22, 0.08);
    return;
  }
  const heavy = ["hacha", "maza", "mandoble", "martillo"].includes(e.weapon ?? "") || e.classId === "berserker";
  const start = e.weapon === "arco" ? 4400 : e.weapon === "daga" ? 4200 : 3500;
  noiseBurst(ctx, t, start * k, heavy ? 700 * k : 1200 * k, 2, heavy ? 0.17 : 0.12, heavy ? 0.18 : 0.14);
  ring(ctx, t, heavy ? 64 * k : 90 * k, 0.12, heavy ? 0.22 : 0.18);
  if (e.kind === "crit") {
    ring(ctx, t, 2300 * k, 0.45, 0.05);
    ring(ctx, t, 3400 * k, 0.35, 0.03);
    boom(ctx, t, 0.3);
  }
  elementAccent(ctx, t + (e.kind === "crit" ? 0.08 : 0), k, e);
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
  o.connect(g).connect(effectsBus ?? c.destination);
  o.start(t);
  o.stop(t + dur);
}

export function playUiClickSound() {
  if (settings.muted || settings.effects === 0) return;
  try {
    const c = ensureContext();
    if (!clickBuffer) {
      preloadUiClickSound();
      return;
    }
    const source = c.createBufferSource();
    source.buffer = clickBuffer;
    source.connect(effectsBus ?? c.destination);
    source.start(c.currentTime);
  } catch {
    // Audio may be unavailable or blocked by the browser.
  }
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
  if (settings.muted) return;
  try {
    const c = ensureContext();
    if (moments.guard) playGuard(c.currentTime);
    events.forEach((e, i) => play(e, i * 0.3));
    playJingle(status, events.length * 0.3 + 0.1);
    if (moments.boss && status === "won")
      playBossDown(c.currentTime + events.length * 0.5 + 0.6);
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
  if (settings.muted) return;
  try {
    const c = ensureContext();
    const t = c.currentTime;
    const legend = isTopRank(rarity);
    PULL_NOTES[rarity].forEach((f, i) =>
      note(c, t + i * (legend ? 0.08 : 0.1), f, legend ? 0.6 : 0.3, 0.12),
    );
    if (legend) noiseBurst(c, t, 800, 5000, 1, 0.5, 0.06);
  } catch {
    // audio unavailable: ignore
  }
}

// Forge result: anvil clinks + rising chime on success, low thud on failure.
export function playForgeSound(ok: boolean) {
  if (settings.muted) return;
  try {
    const c = ensureContext();
    const t = c.currentTime;
    if (ok) {
      noiseBurst(c, t, 2500, 6000, 4, 0.08, 0.12);
      noiseBurst(c, t + 0.22, 2500, 6000, 4, 0.08, 0.12);
      [659, 988, 1319].forEach((f, i) => note(c, t + 0.45 + i * 0.1, f, 0.4, 0.12));
    } else {
      note(c, t, 196, 0.4, 0.15);
      note(c, t + 0.18, 147, 0.5, 0.15);
    }
  } catch {
    // audio unavailable: ignore
  }
}
