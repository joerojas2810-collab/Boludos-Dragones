import type { AudioSettings } from "./sfx";

let battles = 0;
const listeners = new Set<() => void>();
export const menuMusicBlocked = () => battles > 0;
export const subscribeMenuMusic = (listener: () => void) => {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
};
export function blockMenuMusic() {
  battles++;
  listeners.forEach(fn => fn());
  return () => {battles--;listeners.forEach(fn => fn());};
}

export function createMenuMusicPlayer(audio: HTMLAudioElement) {
  audio.src = "/audio/menu-a-small-fire.wav";
  audio.loop = true;
  audio.preload = "none";
  let unlocked = false;
  let enabled = false;
  let disposed = false;
  const sync = () => {
    if (!enabled || !unlocked || disposed) {audio.pause();return;}
    if (audio.paused) void audio.play().then(() => {
      if (!enabled || disposed) audio.pause();
    }).catch(() => undefined);
  };
  return {
    update(active: boolean, settings: AudioSettings, visible: boolean) {
      audio.volume = settings.music;
      audio.muted = settings.muted;
      enabled = active && visible && !settings.muted && settings.music > 0;
      sync();
    },
    unlock() {unlocked = true;sync();},
    dispose() {disposed = true;audio.pause();audio.removeAttribute("src");audio.load();},
  };
}
