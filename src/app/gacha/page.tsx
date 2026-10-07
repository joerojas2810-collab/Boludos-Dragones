"use client";

import { ELEMENTS } from "@/lib/game/elements";
import { RankIcon } from "@/components/RankIcon";
import { useState } from "react";
import { Panel } from "@/components/Panel";
import { DailyStreak } from "@/components/DailyStreak";
import { PullReveal } from "@/components/PullReveal";
import { HeroSprite } from "@/components/HeroSprite";
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
import {
  PITY_SSR_THRESHOLD,
  PITY_THRESHOLD,
  RARITIES,
  RARITY_IDS,
} from "@/lib/game/rarity";
import { claimedToday, dayKey } from "@/lib/game/streak";
import { WEAPON_TYPES } from "@/lib/game/weapons";
import { repo, useProfile } from "@/lib/useProfile";
import { resultView, summarizePull } from "@/lib/viewModels";

// Views of a pull, marking the pity-guaranteed ones by replaying the counters
// (SS pity at PITY_THRESHOLD, SSR pity at PITY_SSR_THRESHOLD; both reset on a hit).
function pullViews(
  rs: PullResult[],
  pity: number,
  pitySsr: number,
): ItemView[] {
  let ss = pity;
  let ssr = pitySsr;
  return rs.flatMap((r) => {
    const v = resultView(r);
    const mark =
      r.rarity === "ssr" && ssr >= PITY_SSR_THRESHOLD
        ? "ssr"
        : r.rarity === "ss" && ss >= PITY_THRESHOLD
          ? "ss"
          : undefined;
    if (RARITY_IDS.indexOf(r.rarity) >= RARITY_IDS.indexOf("ss")) ss = 0;
    else ss++;
    if (r.rarity === "ssr") ssr = 0;
    else ssr++;
    return v ? [mark ? { ...v, pity: mark } : v] : [];
  });
}

const BANNERS: Record<Banner, { tab: string; title: string; text: string }> = {
  character: {
    tab: "Personajes",
    title: "Banner de personajes",
    text: "Cada tirada invoca un héroe con clase, elemento y rasgos propios. Un duplicado exacto (clase + elemento + rareza) suma una estrella; si solo repites clase y rareza, ganas un fragmento (3 = una estrella).",
  },
  weapon: {
    tab: "Equipo",
    title: "Banner de equipo",
    text: "Cada tirada forja una pieza: arma, casco, peto, piernas, zapatos o collar, con elemento y rango. Las armas suman ATQ (y su elemento pasa a ser el de tus ataques); el resto suma vida, defensa, velocidad, esquive, crítico o precisión. Los duplicados suben estrellas.",
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
          items: pullViews(results, pity, profile.pitySsr[banner]),
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
            ? CLASS_IDS.map((id, i) => (
                <HeroSprite
                  key={id}
                  classId={id}
                  element={ELEMENTS[(i + 1) % ELEMENTS.length]}
                  className="w-20 sm:w-32"
                  crop
                />
              ))
            : WEAPON_TYPES.map((t, i) => (
                <WeaponSprite
                  key={t}
                  type={t}
                  element={ELEMENTS[i % ELEMENTS.length]}
                  rarity="a"
                  className="w-14 sm:w-24"
                />
              ))}
        </div>
        <p className="mb-3 text-center text-base text-[#d9d2ca]">{b.text}</p>

        <ul className="mb-3 grid grid-cols-5 gap-1 text-center sm:grid-cols-9 text-xs sm:text-sm">
          {RARITY_IDS.map((id) => (
            <li
              key={id}
              className="border-2 border-[var(--edge)] px-0.5 py-1"
              style={{ color: RARITIES[id].color }}
            >
              <RankIcon rank={id} className="mx-auto h-12 w-12 sm:h-14 sm:w-14" />
              <div className="rank-label break-words text-[10px] leading-tight sm:text-sm">
                {RARITIES[id].label}
              </div>
              <div>{+(RARITIES[id].probability * 100).toFixed(1)}%</div>
            </li>
          ))}
        </ul>

        <div className="mb-3 text-center">
          <Tooltip
            tip={{
              title: "Garantía (pity)",
              kind: "info",
              lines: [
                `Cuenta las tiradas de este banner desde tu último SS o mejor.`,
                `Al llegar a ${PITY_THRESHOLD}, la siguiente tirada es SS o mejor. A las ${PITY_SSR_THRESHOLD} sin SSR, la siguiente es SSR seguro.`,
                `Cada banner lleva su propio contador.`,
              ],
            }}
          >
            <span className="cursor-help block space-y-1 text-sm">
              {(
                [
                  ["SS", pity, PITY_THRESHOLD, RARITIES.ss.color],
                  [
                    "SSR",
                    profile.pitySsr[banner],
                    PITY_SSR_THRESHOLD,
                    RARITIES.ssr.color,
                  ],
                ] as const
              ).map(([label, n, max, color]) => (
                <span key={label} className="flex items-center gap-2">
                  <span className="w-10 text-right" style={{ color }}>
                    {label}
                  </span>
                  <span className="pity-bar">
                    <i
                      className="bar-fill"
                      data-fill={label === "SS" ? "pity_ss" : "pity_ssr"}
                      style={{ width: `${Math.min(100, (n / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-16 text-left">
                    {n}/{max}
                  </span>
                </span>
              ))}
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
