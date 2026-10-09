"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import { MATERIAL_ICON } from "@/lib/art";
import { RARITIES } from "@/lib/game/rarity";
import type { Profile } from "@/lib/game/profile";
import { canUpgrade, DADO_BONUS, PLUS_BONUS_PER_LEVEL, STREAK_BONUS, UPGRADE_TABLE, upgradeChance } from "@/lib/game/upgrade";
import { byPieceOrder, PieceRow } from "./PieceRow";

// Material icon with a coin fallback until the final art loads.
export function MatIcon({ kind, className = "h-5" }: { kind: keyof typeof MATERIAL_ICON; className?: string }) {
  const [bad, setBad] = useState(false);
  return bad ? (
    <Icon name="system_coin" className={className} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/art/icons/icon_${MATERIAL_ICON[kind]}.webp`} alt="" onError={() => setBad(true)} className={`inline-block aspect-square align-middle ${className}`} />
  );
}

const reasonOf = (r: ReturnType<typeof canUpgrade>): string | null => (r.ok ? null : r.reason);

export function Upgrade({
  profile,
  busy,
  onUpgrade,
}: {
  profile: Profile;
  busy: boolean;
  onUpgrade: (pieceId: string, useDado: boolean) => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [dado, setDado] = useState(false);
  const pieces = profile.weapons.filter((w) => canUpgrade(w).ok).sort(byPieceOrder);
  const sel = pieces.find((w) => w.id === id) ?? null;
  const plus = sel?.plus ?? 0;
  const lvl = plus + 1;
  const row = sel ? UPGRADE_TABLE[lvl] : undefined;
  const useDado = dado && profile.dados > 0;
  const chance = sel && row ? upgradeChance(sel, useDado) : 0;
  const cost = row ? row.escamas : 0;
  const streak = sel?.plusStreak ?? 0;
  const pct = (n: number) => `${Math.round(n)}%`;
  const reason = sel ? reasonOf(canUpgrade(sel)) : null;
  const status = !sel ? "Elige una pieza." : reason ?? (profile.escamas < cost ? `Faltan ${cost - profile.escamas} Escamas.` : null);

  return (
    <Panel title="Mejorar equipo" className="space-y-3">
      <p className="text-sm opacity-80">
        Solo piezas de rango S o más con 5★. Cada nivel suma +{Math.round(PLUS_BONUS_PER_LEVEL * 100)}% a sus stats (hasta +{Math.round(PLUS_BONUS_PER_LEVEL * 1000)}%).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {pieces.length === 0 && <p className="text-sm">No tienes piezas mejorables (S o más, con 5★, menos de +10).</p>}
          {pieces.map((w) => {
            const why = reasonOf(canUpgrade(w));
            return <PieceRow key={w.id} w={w} on={w.id === id} disabled={!!why} note={why ?? undefined} onClick={() => setId(w.id === id ? null : w.id)} />;
          })}
        </div>
        <div className="space-y-2 text-sm">
          {sel && !reason && row ? (
            <>
              <p>
                <b style={{ color: RARITIES[sel.rarity].color }}>{sel.name}</b>: <b>+{plus}</b> → <b>+{lvl}</b> (ahora la pieza da +{Math.round(plus * PLUS_BONUS_PER_LEVEL * 100)}% a sus stats; con +{lvl} dará +{Math.round(lvl * PLUS_BONUS_PER_LEVEL * 100)}%)
              </p>
              <p>Éxito base: {pct(row.chance)}{lvl === 1 ? " (nunca falla)" : ""}</p>
              <p className="flex items-center gap-1">
                Costo: {cost} <MatIcon kind="escamas" /> Escamas
              </p>
              {streak > 0 && (
                <p className="text-green-300">
                  Racha de {streak} fallo(s): +{streak * Math.round(STREAK_BONUS * 100)} puntos.
                </p>
              )}
              <label className={`flex items-center gap-2 ${profile.dados > 0 ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={useDado && profile.dados > 0} disabled={profile.dados <= 0} onChange={(e) => setDado(e.target.checked)} />
                <MatIcon kind="dado" /> Dado cargado (+{Math.round(DADO_BONUS * 100)} puntos)
              </label>
              <p className="text-base">
                Probabilidad: <b className="text-yellow-300">{pct(Math.min(100, chance * 100))}</b>
              </p>
            </>
          ) : (
            <p className="opacity-70">{sel ? reason : "Elige una pieza para ver sus probabilidades."}</p>
          )}
          <p className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2">
            <span className="flex items-center gap-1"><MatIcon kind="escamas" /> Escamas <b>{profile.escamas}</b></span>
            <span className="flex items-center gap-1"><MatIcon kind="dado" /> Dados <b>{profile.dados}</b></span>
          </p>
        </div>
      </div>
      {status && <p className="text-sm text-red-300">{status}</p>}
      <button className="btn w-full" disabled={busy || !!status} onClick={() => sel && onUpgrade(sel.id, useDado)}>
        Mejorar
      </button>
    </Panel>
  );
}
