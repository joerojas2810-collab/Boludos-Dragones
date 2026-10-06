"use client";

import Link from "next/link";
import { useState } from "react";
import { GameTitle } from "@/components/GameTitle";
import { TitleScene } from "@/components/TitleScene";
import { Panel } from "@/components/Panel";
import { RepoError } from "@/lib/repo";

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) throw new RepoError("network", "Sin conexión con el servidor.");
  if (res.ok) return;
  const j = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  throw new RepoError(
    j?.error?.code ?? "server_error",
    j?.error?.message ?? "Algo salió mal. Intenta de nuevo.",
    res.status,
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [house, setHouse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Panel title="Modo local" className="max-w-sm text-center">
          <p>
            Esta copia juega sin cuenta: el progreso se guarda en este
            navegador.
          </p>
          <Link href="/" className="btn mt-4 block text-center">
            Ir al menú
          </Link>
        </Panel>
      </main>
    );

  const valid =
    name.trim().length >= 3 &&
    /^\d{4}$/.test(pin) &&
    (mode === "login" || house);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await post("/api/auth/login", { name, pin });
      else await post("/api/auth/register", { name, pin, houseCode: house });
      // full reload: starts the profile store clean for this account
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <TitleScene />
      <GameTitle />
      <Panel
        title={mode === "login" ? "Entrar" : "Crear cuenta"}
        className="w-full max-w-sm"
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm">
            Nombre
            <input
              className="mt-1 w-full border-2 border-[var(--edge)] bg-black/40 p-2 text-base"
              value={name}
              maxLength={16}
              autoComplete="username"
              autoCapitalize="none"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            PIN (4 dígitos)
            <input
              className="mt-1 w-full border-2 border-[var(--edge)] bg-black/40 p-2 text-center text-2xl tracking-[0.5em]"
              value={pin}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </label>
          {mode === "register" && (
            <label className="text-sm">
              Código de la casa
              <input
                className="mt-1 w-full border-2 border-[var(--edge)] bg-black/40 p-2 text-base"
                value={house}
                maxLength={64}
                autoCapitalize="none"
                onChange={(e) => setHouse(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-red-300">
              {error}
            </p>
          )}
          <button className="btn text-center" disabled={!valid || busy}>
            {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <button
            type="button"
            className="btn btn-gray text-center"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Soy nuevo: crear cuenta" : "Ya tengo cuenta"}
          </button>
        </form>
      </Panel>
    </main>
  );
}
