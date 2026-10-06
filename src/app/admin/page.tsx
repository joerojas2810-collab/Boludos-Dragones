"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/Panel";
import { repo, useProfile } from "@/lib/useProfile";

export default function AdminPage() {
  const { session, ready } = useProfile();
  const [name, setName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (repo.mode !== "remote" || !session.isAdmin)
    return (
      <main className="p-4 text-center">
        <p>Solo para el administrador.</p>
        <Link href="/" className="btn mt-3 inline-block">
          Menú
        </Link>
      </main>
    );

  const reset = async () => {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/auth/admin-reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      credentials: "same-origin",
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as {
      pin?: string;
      error?: { message?: string };
    } | null;
    setResult(
      j?.pin
        ? `PIN nuevo de ${name}: ${j.pin} (dícelo en persona; no se vuelve a mostrar)`
        : (j?.error?.message ?? "No se pudo reiniciar."),
    );
    setBusy(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Panel title="Reiniciar PIN" className="w-full max-w-sm">
        <input
          className="mb-3 w-full border-2 border-[var(--edge)] bg-black/40 p-2 text-base"
          placeholder="Nombre del amigo"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn w-full text-center"
          disabled={busy || name.trim().length < 3}
          onClick={() => void reset()}
        >
          Reiniciar PIN
        </button>
        {result && <p className="mt-3 text-center text-yellow-300">{result}</p>}
        <Link href="/" className="btn btn-gray mt-3 block text-center">
          ← Menú
        </Link>
      </Panel>
    </main>
  );
}
