"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Vfx } from "@/components/fx/Vfx";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { TipHover } from "@/components/Tooltip";
import { RARITIES } from "@/lib/game/rarity";
import { TRAITS } from "@/lib/game/traits";
import { playForgeSound } from "@/lib/sfx";
import { characterView } from "@/lib/viewModels";
import { repo, useProfile } from "@/lib/useProfile";
import { AscendPieces } from "./AscendPieces";
import { GuidePanel } from "./GuidePanel";
import { HeroFusionPanel } from "./HeroFusion";
import { MatIcon, Upgrade } from "./Upgrade";

type Tab = "ascend" | "heroes" | "upgrade";
const TABS: [Tab, string][] = [
  ["ascend", "Ascender equipo"],
  ["heroes", "Héroes"],
  ["upgrade", "Mejorar"],
];

export default function ForgePage() {
  const { profile, ready } = useProfile();
  const [tab, setTab] = useState<Tab>("ascend");
  const [msg, setMsg] = useState<{
    ok: boolean;
    title: string;
    text: string;
    heroId?: string; // the hero that came out, shown as a card
    gave?: string[]; // what the player handed over
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Painted effect of the last action (re-keyed by n so it replays).
  const [fx, setFx] = useState<{ n: number; ids: string[] } | null>(null);

  // Keyboard: 1-3 switch tabs (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) setTab(TABS[i][0]);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMsg(null);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);
  if (!ready || !profile) return null;
  const hero = msg?.heroId ? profile.characters.find((c) => c.id === msg.heroId) : undefined;

  const show = (ok: boolean, title: string, text: string, ids: string[], extra: { heroId?: string; gave?: string[] } = {}) => {
    setMsg({ ok, title, text, ...extra });
    playForgeSound(ok);
    setFx((f) => ({ n: (f?.n ?? 0) + 1, ids }));
  };
  // One wrapper for every forge call: busy lock, result overlay, sound and effect.
  const act = async (
    title: string,
    call: () => Promise<{ text?: string; success?: boolean; id?: string }>,
    fxOk: string[],
    gave?: string[],
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await call();
      const ok = r.success !== false;
      show(ok, title, r.text ?? "", ok ? fxOk : ["forge_failure"], { heroId: r.id, gave });
    } catch (e) {
      show(false, "No se pudo", e instanceof Error ? e.message : "Error", ["forge_failure"]);
    }
    setBusy(false);
  };

  return (
    <TipHover value>
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-3 lg:grid-cols-[1fr_18rem]">
        {typeof document !== "undefined" &&
          createPortal(
            <>
              {fx && (
                <div key={fx.n} aria-hidden className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
                  {fx.ids.map((id, i) => (
                    <Vfx key={id} id={id} delay={i * 0.5} className="absolute w-[min(80vw,22rem)]" />
                  ))}
                </div>
              )}
              {msg && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4"
                  onClick={() => setMsg(null)}
                >
                  <div className="relative w-full max-w-xl space-y-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      aria-label="Cerrar"
                      className="btn btn-gray absolute -right-1 -top-1 z-10 !min-h-9 !px-3 text-center"
                      onClick={() => setMsg(null)}
                    >
                      ✕
                    </button>
                    <Panel title={msg.title} className="space-y-3">
                      <p role="status" className={`text-center ${msg.ok ? "text-yellow-300" : "text-red-300"}`}>
                        {msg.text}
                      </p>
                      {msg.ok && hero && (
                        <div className="flex items-center justify-center gap-3 text-sm">
                          <ItemCard item={characterView(hero)} size={96} />
                          <div className="space-y-1">
                            <div className="font-semibold text-yellow-300">{hero.name}</div>
                            <div>
                              Rango {RARITIES[hero.rarity].label} · {hero.stars}★ · Nv {hero.level}
                            </div>
                            <div>Rasgo: {hero.traits[0] ? TRAITS[hero.traits[0]].name : "—"}</div>
                            {hero.copies?.length ? (
                              <div>
                                {hero.copies.length} {hero.copies.length === 1 ? "copia guardada" : "copias guardadas"}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {msg.ok && msg.gave && msg.gave.length > 0 && (
                        <div className="text-center text-sm opacity-90">
                          <b>Entregaste:</b> {msg.gave.join(" · ")}
                        </div>
                      )}
                    </Panel>
                    <div className="text-center">
                      <button className="btn btn-gray text-center" autoFocus onClick={() => setMsg(null)}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>,
            document.body,
          )}
        <div className="min-w-0 space-y-4">
          <div className="flex gap-2" role="tablist">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`btn min-w-0 flex-1 !px-2 text-center text-sm sm:text-base ${tab === k ? "" : "btn-gray"}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "ascend" && (
            <AscendPieces
              profile={profile}
              busy={busy}
              onAscend={(b, m) =>
                void act(
                  "Ascender equipo",
                  async () => ({
                    text: (await repo.ascendPiece(b, m)).message,
                  }),
                  ["forge_merge", "forge_success"],
                )
              }
            />
          )}
          {tab === "heroes" && (
            <HeroFusionPanel
              profile={profile}
              busy={busy}
              onStarUp={(b, m, gave) => void act("Subir ★", () => repo.starUpHero(b, m), ["forge_merge", "forge_success"], gave)}
              onFuse={(b, m, keep, gave) => void act("Subir de rango", () => repo.fuseHeroes(b, m, keep), ["forge_merge", "forge_success"], gave)}
              onSwap={(id, i, gave) => void act("Cambiar de rasgo", () => repo.swapTrait(id, i), ["forge_craft", "forge_success"], gave)}
            />
          )}
          {tab === "upgrade" && (
            <Upgrade
              profile={profile}
              busy={busy}
              onUpgrade={(id, dado) =>
                void act(
                  "Mejorar equipo",
                  async () => {
                    const r = await repo.upgradePiece(id, dado);
                    return {
                      success: r.success,
                      text: r.success
                        ? `¡Éxito! ${r.piece.name} ahora es +${r.piece.plus ?? 0}.`
                        : "Fallaste: pierdes las Escamas, la pieza queda como estaba.",
                    };
                  },
                  ["forge_craft", "forge_success"],
                )
              }
            />
          )}

          <Panel title="Tu inventario" className="space-y-2">
            <p className="flex flex-wrap items-center gap-4 text-sm">
              <span>Monedas: {profile.coins}</span>
              <span className="flex items-center gap-1">
                <MatIcon kind="escamas" /> Escamas <b>{profile.escamas}</b>
              </span>
              <span className="flex items-center gap-1">
                <MatIcon kind="dado" /> Dados cargados <b>{profile.dados}</b>
              </span>
            </p>
            <p className="text-sm opacity-80">
              Las Escamas y los Dados salen de los dungeons altos.{" "}
              <Link href="/run" className="text-cyan-300 underline">
                Ir a un dungeon
              </Link>
            </p>
          </Panel>
        </div>
        <GuidePanel tab={tab} />
      </main>
    </TipHover>
  );
}
