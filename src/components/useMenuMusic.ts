"use client";
import { useEffect, useRef } from "react";
import { createMenuMusicPlayer, menuMusicBlocked, subscribeMenuMusic } from "@/lib/menu-music";
import { getAudioSettings, subscribeAudioSettings } from "@/lib/sfx";

export function useMenuMusic(active: boolean) {
  const player = useRef<ReturnType<typeof createMenuMusicPlayer> | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    const instance = createMenuMusicPlayer(new Audio());
    player.current = instance;
    const sync = () => instance.update(activeRef.current && !menuMusicBlocked(), getAudioSettings(), document.visibilityState !== "hidden");
    const unlock = () => {sync();instance.unlock();};
    const unsubscribeAudio = subscribeAudioSettings(sync);
    const unsubscribeBattle = subscribeMenuMusic(sync);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      unsubscribeAudio();unsubscribeBattle();
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("visibilitychange", sync);
      instance.dispose();player.current = null;
    };
  }, []);
  useEffect(() => {
    activeRef.current = active;
    player.current?.update(active && !menuMusicBlocked(), getAudioSettings(), document.visibilityState !== "hidden");
  }, [active]);
}
