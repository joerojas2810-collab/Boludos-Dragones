"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { DailyStreak } from "@/components/DailyStreak";
import { PullReveal } from "@/components/PullReveal";
import { Sprite } from "@/components/Sprite";
import { TopBar } from "@/components/TopBar";
import { Tooltip } from "@/components/Tooltip";
import { WeaponSprite } from "@/components/WeaponSprite";
import type { ItemView } from "@/components/ItemCard";
import { CLASS_IDS } from "@/lib/game/characters";
import {
  MULTI_PULL,
  MULTI_PULL_DISCOUNT,
  pullCost,
  type Banner,
  type PullResult,
} from "@/lib/game/profile";
import { PITY_THRESHOLD, RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import { claimedToday, dayKey } from "@/lib/game/streak";
import { WEAPON_TYPES } from "@/lib/game/weapons";
import { repo, useProfile } from "@/lib/useProfile";
import { resultViews, summarizePull } from "@/lib/viewModels";

const BANNERS: Record<Banner, { tab: string; title: string; text: string }> = {
  character: {
    tab: "Personajes",
    title: "Banner de personajes",
    text: "Cada tirada invoca un héroe con clase, elemento y rasgos propios. Un duplicado exacto (clase + elemento + rareza) suma una estrella; si solo repites clase y rareza, ganas un fragmento (3 = una estrella).",
  },
  weapon: {
    tab: "Armas",
    title: "Banner de armas",
    text: "Cada tirada forja un arma: tipo, elemento y rareza. Suma ATQ al héroe que la lleve y su elemento pasa a ser el de sus ataques. Los duplicados suben estrellas.",
  },
};

export default function GachaPage() {
  const { profile, ready } = useProfile();
  const [banner, setBanner] = useState<Banner>("character");
  const [reveal, setReveal] = useState<{
    items: ItemView[];
    summary: string;
  } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready || !profile) return null;
  const b = BANNERS[banner];
  const pity = profile.pity[banner];

  const run = async (job: () => Promise<{ results: PullResult[] | null }>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { results } = await job();
      if (results)
        setReveal({
          items: resultViews(results),
          summary: summarizePull(results),
        });
      else setSummary("Esa tirada ya estaba registrada.");
    } catch (e) {
      setError(
        repo.mode === "remote"
          ? `El servidor rechazó la tirada: ${e instanceof Error ? e.message : "error"}`
          : e instanceof Error
            ? e.message
            : "Error",
      );
    } finally {
      setBusy(false);
    }
  };
  const doPull = (count: 1 | 10) => run(() => repo.pull(banner, count));

  return (
    <main className="flex flex-col gap-4 p-3 pt-4">
      <TopBar current="/gacha" />
      <div className="mx-auto flex w-full max-w-4xl gap-2" role="tablist">
        {(Object.keys(BANNERS) as Banner[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={banner === k}
            className={`btn flex-1 text-center ${banner === k ? "" : "btn-gray"}`}
            onClick={() => {
              setBanner(k);
              setError(null);
            }}
          >
            {BANNERS[k].tab}
          </button>
        ))}
      </div>

      <Panel title={b.title} className="mx-auto w-full max-w-4xl">
        <div className="mb-3 flex flex-wrap justify-center gap-1">
          {banner === "character"
            ? CLASS_IDS.map((id) => (
                <Sprite
                  key={id}
                  classId={id}
                  element="rayo"
                  className="w-14 sm:w-20"
                />
              ))
            : WEAPON_TYPES.map((t) => (
                <WeaponSprite
                  key={t}
                  type={t}
                  element="fuego"
                  rarity="epico"
                  className="w-12 sm:w-16"
                />
              ))}
        </div>
        <p className="mb-3 text-center text-base text-[#d9d2ca]">{b.text}</p>

        <ul className="mb-3 grid grid-cols-5 gap-1 text-center text-xs sm:text-sm">
          {RARITY_IDS.map((id) => (
            <li
              key={id}
              className="border-2 border-[var(--edge)] px-0.5 py-1"
              style={{ color: RARITIES[id].color }}
            >
              <div className="break-words text-[10px] font-semibold leading-tight sm:text-sm">
                {RARITIES[id].label}
              </div>
              <div>{Math.round(RARITIES[id].probability * 100)}%</div>
            </li>
          ))}
        </ul>

        <div className="mb-3 text-center">
          <Tooltip
            tip={{
              title: "Garantía (pity)",
              kind: "info",
              lines: [
                `Cuenta las tiradas de este banner desde tu último Legendario.`,
                `Al llegar a ${PITY_THRESHOLD}, la siguiente tirada es Legendario seguro.`,
                `Cada banner lleva su propio contador.`,
              ],
            }}
          >
            <span className="cursor-help text-cyan-300">
              {pity} / {PITY_THRESHOLD} para Legendario garantizado
            </span>
          </Tooltip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {([1, MULTI_PULL] as const).map((n) => {
            const cost = pullCost(banner, n);
            const missing = cost - profile.coins;
            return (
              <div key={n} className="flex flex-col gap-1">
                <button
                  className="btn w-full text-center"
                  disabled={missing > 0 || busy}
                  onClick={() => doPull(n)}
                >
                  Tirada x{n} · ● {cost}
                  {n === MULTI_PULL &&
                    ` (-${Math.round(MULTI_PULL_DISCOUNT * 100)}%)`}
                </button>
                <span className="min-h-5 text-center text-sm text-red-300">
                  {missing > 0 && `Te faltan ${missing} monedas`}
                </span>
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-gray mx-auto mt-3 block text-center"
          disabled={busy || claimedToday(profile.daily, dayKey())}
          onClick={() => run(() => repo.dailyPull(banner))}
        >
          Tirada gratis de hoy
        </button>
        <p className="mt-1 text-center text-sm text-yellow-300">
          <DailyStreak profile={profile} />
        </p>
        {error && <p className="text-center text-sm text-red-300">{error}</p>}
        {summary && (
          <p className="mt-2 text-center text-sm text-yellow-300">
            Última tirada: {summary}
          </p>
        )}
        {profile.coins < pullCost(banner, 1) && (
          <p className="mt-2 text-center text-sm text-[#d9d2ca]">
            Gana monedas en una run para seguir tirando.
          </p>
        )}
      </Panel>

      {reveal && (
        <PullReveal
          items={reveal.items}
          onDone={() => {
            setSummary(reveal.summary);
            setReveal(null);
          }}
        />
      )}
    </main>
  );
}
