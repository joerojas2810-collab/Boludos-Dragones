"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getAudioSettings,
  setAudioVolume,
  setMuted,
  subscribeAudioSettings,
} from "@/lib/sfx";

export function SoundControls({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const audio = useSyncExternalStore(
    subscribeAudioSettings,
    getAudioSettings,
    getAudioSettings,
  );

  const toggleMute = () => {
    const muted = !audio.muted;
    setMuted(muted);
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const slider = (label: string, value: number, channel: "effects" | "music") => (
    <label className="block text-sm text-white/90" key={label}>
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
        onChange={(event) => setAudioVolume(channel, Number(event.currentTarget.value))}
      />
    </label>
  );

  return (
    <div ref={rootRef} className={`relative inline-flex ${compact ? "w-full" : ""}`}>
      <button
        className={compact ? "btn btn-gray !h-auto !min-h-0 !px-2 !py-0.5 text-center leading-none" : "shell-icon"}
        type="button"
        aria-expanded={open}
        aria-label="Ajustes de sonido"
        title="Ajustes de sonido"
        onClick={() => setOpen(!open)}
      >
        {audio.muted ? "🔇" : "🔊"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-slate-950/95 p-4 text-left shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-white">
            Sonido
            <button className="rounded px-2 py-1 text-white/70 hover:bg-white/10" onClick={toggleMute} type="button">
              {audio.muted ? "Activar" : "Silenciar"}
            </button>
          </div>
          <div className="grid gap-3">
            {slider("Efectos", audio.effects, "effects")}
            {slider("Música", audio.music, "music")}
          </div>
        </div>
      )}
    </div>
  );
}
