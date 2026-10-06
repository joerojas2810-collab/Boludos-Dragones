"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/Notice";
import { Panel } from "@/components/Panel";
import { createRoom } from "@/lib/roomui/remote";
import type { RoomMode } from "@/lib/game/room";
import { errorText } from "@/lib/roomui/viewModels";
import { repo, useProfile } from "@/lib/useProfile";

export default function SalaHome() {
  const router = useRouter();
  const { ready } = useProfile();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<RoomMode>("nivelado");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remote = repo.mode === "remote";
  if (!ready) return null;

  const create = async () => {
    setBusy(true);
    const r = await createRoom(mode, 30);
    setBusy(false);
    if (r.ok) router.push(`/sala/${r.code}`);
    else setErr(errorText(String(r.error)));
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Notice />
      <Panel title="Sala de la noche" className="w-full max-w-sm text-center">
        {remote ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center gap-2">
              {(["nivelado", "completo"] as RoomMode[]).map((m) => (
                <button
                  key={m}
                  className={`btn ${mode === m ? "" : "btn-gray"}`}
                  onClick={() => setMode(m)}
                >
                  {m === "nivelado" ? "Nivelado" : "Poder completo"}
                </button>
              ))}
            </div>
            <button className="btn" disabled={busy} onClick={() => void create()}>
              Crear sala
            </button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^[A-Za-z]{4}$/.test(code)) router.push(`/sala/${code.toUpperCase()}`);
                else setErr("El código tiene 4 letras.");
              }}
            >
              <input
                aria-label="Código de sala"
                className="min-w-0 flex-1 bg-black/40 p-2 text-center uppercase tracking-widest"
                maxLength={4}
                placeholder="CÓDIGO"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn">Unirse</button>
            </form>
            {err && <p className="text-sm text-red-400">{err}</p>}
          </div>
        ) : (
          <p className="mb-3 text-sm">Las salas necesitan sesión en la nube.</p>
        )}
        <Link href="/sala/demo" className="btn btn-gray mt-3 block text-center">
          Demo con bots
        </Link>
        <Link href="/" className="btn btn-gray mt-2 block text-center">
          Menú
        </Link>
      </Panel>
    </main>
  );
}
