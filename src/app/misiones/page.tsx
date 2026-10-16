"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import {MissionScopePanel,type ScopeState} from "@/components/MissionScopePanel";
import { rewardText } from "@/lib/game/missions";
import { replaceProfile, repo, useProfile } from "@/lib/useProfile";

export default function MissionsPage() {
  const { ready } = useProfile();
  const [scopes, setScopes] = useState<ScopeState[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const remote = repo.mode === "remote";

  const fetchScopes = useCallback(async () => {
    const r = await fetch("/api/missions", { credentials: "same-origin" });
    if (!r.ok) throw new Error("missions");
    return ((await r.json()) as { scopes: ScopeState[] }).scopes;
  }, []);

  useEffect(() => {
    if (!ready || !remote) return;
    let alive = true;
    fetchScopes()
      .then((s) => alive && setScopes(s))
      .catch(() => alive && setMsg("No se pudieron cargar las misiones."));
    return () => {
      alive = false;
    };
  }, [ready, remote, fetchScopes]);

  async function act(path: string, body: object) {
    setMsg(null);
    const r = await fetch(`/api/missions/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as {
      coins?: number;
      dados?: number;
      pieces?: number;
      error?: { message: string };
    };
    if (!r.ok) setMsg(d.error?.message ?? "No se pudo completar.");
    else if (path === "claim")
      setMsg(
        `Cobraste ${rewardText({ coins: d.coins ?? 0, dados: d.dados ?? 0, pieces: d.pieces ?? 0 }) || "tus premios"}.`,
      );
    const me = await repo.load();
    if (me) replaceProfile(me.profile);
    setScopes(await fetchScopes());
  }

  if (!ready) return null;
  if (!remote)
    return (
      <main className="mx-auto w-full max-w-3xl p-3">
        <Panel title="Misiones">
          <p className="text-center">Las misiones requieren conexión.</p>
        </Panel>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-3">
      {msg && (
        <p role="status" className="text-center text-sm text-yellow-300">
          {msg}
        </p>
      )}
      {scopes?.map(s=><MissionScopePanel key={s.scope} s={s} onAction={act}/>)}
    </main>
  );
}
