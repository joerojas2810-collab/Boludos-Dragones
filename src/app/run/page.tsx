"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { isTowerMode, type TowerMode as Mode } from "@/lib/game/tower";
import { TowerMode } from "./TowerMode";
import { ProgressMode } from "./ProgressMode";

// /run = Modo Progreso (dungeon levels); `?torre=nivelado|coleccion` opens the weekly tower.
// Any other `torre` value shows a way back instead of an empty screen.
type Which = { kind: "progress" } | { kind: "tower"; mode: Mode } | { kind: "invalid"; value: string };

export default function RunPage() {
  const [which, setWhich] = useState<Which | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const t = q.get("torre");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhich(t === null ? { kind: "progress" } : isTowerMode(t) ? { kind: "tower", mode: t } : { kind: "invalid", value: t });
  }, []);
  if (!which) return null;
  if (which.kind === "tower") return <TowerMode mode={which.mode} />;
  if (which.kind === "invalid")
    return (
      <main className="flex min-h-screen items-center justify-center p-3">
        <Panel title="Torre no encontrada" className="w-full max-w-md space-y-3 text-center">
          <p className="text-sm">
            No existe la torre «{which.value.slice(0, 40)}». Los modos válidos son nivelado y colección.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/torre" className="btn text-center">
              Ir a la torre
            </Link>
            <Link href="/" className="btn btn-gray text-center">
              Menú
            </Link>
          </div>
        </Panel>
      </main>
    );
  return <ProgressMode />;
}
