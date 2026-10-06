"use client";

import { useState } from "react";
import { isMuted, setMuted } from "@/lib/sfx";

export function MuteButton() {
  const [muted, setMutedState] = useState(false);
  return (
    <button
      className="btn btn-gray mt-2 w-full text-center"
      onClick={() => {
        setMuted(!isMuted());
        setMutedState(isMuted());
      }}
    >
      Sonido: {muted ? "apagado" : "encendido"}
    </button>
  );
}
