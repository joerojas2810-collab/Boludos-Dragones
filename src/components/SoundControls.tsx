"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getAudioSettings,
  setAudioVolume,
  setMuted,
  subscribeAudioSettings,
} from "@/lib/sfx";

export function SoundControls({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const audio = useSyncExternalStore(
    subscribeAudioSettings,
    getAudioSettings,
    getAudioSettings,
  );

  const toggleMute = () => {
    const muted = !audio.muted;
    setMuted(muted);
  };

  const slider = (label: string, channel: "music" | "effects", value: number) => (
    <label className="block text-sm text-white/90" key={channel}>
      <span className="mb-1 flex justify-between">
        <span>{label}</span><span>{Math.round(value * 100)}%</span>
      </span>
      <input
        aria-label={label}
        className="w-full accent-amber-300"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          setAudioVolume(channel, next);
        }}
      />
    </label>
  );

  return (
    <div className={`relative inline-flex ${compact ? "w-full" : ""}`}>
      <button
        className={compact ? "btn btn-gray mt-2 w-full text-center" : "shell-icon"}
        type="button"
        aria-expanded={open}
        aria-label="Ajustes de sonido"
        onClick={() => setOpen(!open)}
      >
        {compact ? "Ajustes de sonido" : audio.muted ? "🔇" : "🔊"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/15 bg-slate-950/95 p-4 text-left shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-white">
            Sonido
            <button className="rounded px-2 py-1 text-white/70 hover:bg-white/10" onClick={toggleMute} type="button">
              {audio.muted ? "Activar" : "Silenciar"}
            </button>
          </div>
          <div className="grid gap-3">
            {slider("Música", "music", audio.music)}
            {slider("Efectos", "effects", audio.effects)}
          </div>
        </div>
      )}
    </div>
  );
}
