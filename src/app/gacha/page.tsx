"use client";

import { pityTip } from "@/lib/game/explain";
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
  RARITIES,
  RARITY_IDS,
} from "@/lib/game/rarity";
import { claimedToday, dayKey } from "@/lib/game/streak";
import { WEAPON_TYPES } from "@/lib/game/weapons";
import { repo, useProfile } from "@/lib/useProfile";
import { resultView, summarizePull } from "@/lib/viewModels";

// Views of a pull, marking the pity-guaranteed ones by replaying the SSR counter
// (guaranteed at PITY_SSR_THRESHOLD, reset on a hit).
function pullViews(rs: PullResult[], pitySsr: number): ItemView[] {
  let ssr = pitySsr;
  return rs.flatMap((r) => {
    const v = resultView(r);
    const mark =
      r.rarity === "ssr" && ssr >= PITY_SSR_THRESHOLD ? "ssr" : undefined;
    if (r.rarity === "ssr") ssr = 0;
    else ssr++;
    return v ? [mark ? { ...v, pity: mark } : v] : [];
  });
}

const BANNERS: Record<Banner, { tab: string; title: string; text: string }> = {
  character: {
    tab: "Personajes",
    title: "Banner de personajes",
    text: "Cada tirada invoca un héroe con clase, elemento y rasgos propios. Un duplicado exacto (clase + elemento + rareza) suma una estrella (con 5★ te devuelve la mitad de una tirada). Con 3★ el héroe puede subir de rango en la Forja.",
  },
  weapon: {
    tab: "Equipo",
    title: "Banner de equipo",
    text: "Cada tirada forja una pieza: arma, casco, peto, piernas, zapatos o collar, con elemento y rango. Las armas suman ATQ (y su elemento pasa a ser el de tus ataques); el resto suma vida, defensa, velocidad, esquive, crítico o precisión. Cada pieza trae su propia tirada (±15%) y, desde rango C, líneas extra. Los duplicados suben estrellas.",
  },
};

// Equipment now comes from dungeons and the tower; the banner stays in code (server pull
// and pity are kept) but is hidden. Set to true to bring the tab back.
const SHOW_EQUIPMENT_BANNER = false;
const SHOWN_BANNERS = (Object.keys(BANNERS) as Banner[]).filter(
  (k) => SHOW_EQUIPMENT_BANNER || k !== "weapon",
);

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

  const run = async (job: () => Promise<{ results: PullResult[] | null }>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { results } = await job();
      if (results)
        setReveal({
          items: pullViews(results, profile.pitySsr[banner]),
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
    <main className="flex flex-col gap-3 p-3 pt-2">
      <div
        className={`mx-auto w-full max-w-4xl gap-2 ${SHOWN_BANNERS.length > 1 ? "flex" : "hidden"}`}
        role="tablist"
      >
        {SHOWN_BANNERS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={banner === k}
            className={`btn min-w-0 flex-1 text-center max-md:!text-sm max-md:![border-width:8px_10px] max-md:![border-image-width:8px_10px] ${banner === k ? "" : "btn-gray"}`}
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
        <div className="mb-2 flex flex-wrap justify-center gap-1">
          {banner === "character"
            ? CLASS_IDS.map((id, i) => (
                <HeroSprite
                  key={id}
                  classId={id}
                  element={ELEMENTS[(i + 1) % ELEMENTS.length]}
                  className="w-20 sm:w-[min(8rem,8vh)]"
                  crop
                />
              ))
            : WEAPON_TYPES.map((t, i) => (
                <WeaponSprite
                  key={t}
                  type={t}
                  element={ELEMENTS[i % ELEMENTS.length]}
                  rarity="a"
                  className="w-14 sm:w-[min(6rem,8vh)]"
                />
              ))}
        </div>
        <p className="mb-2 text-center text-base text-[#d9d2ca]">{b.text}</p>

        <ul className="mb-2 grid grid-cols-5 gap-1 text-center sm:grid-cols-9 text-xs sm:text-sm">
          {RARITY_IDS.map((id) => (
            <li
              key={id}
              className="border-2 border-[var(--edge)] px-0.5 py-1"
              style={{ color: RARITIES[id].color }}
            >
              <RankIcon rank={id} className="mx-auto h-12 w-12 sm:h-[min(3.5rem,4.5vh)] sm:w-[min(3.5rem,4.5vh)]" />
              <div className="rank-label break-words text-[10px] leading-tight sm:text-sm">
                {RARITIES[id].label}
              </div>
              <div>{+(RARITIES[id].probability * 100).toFixed(1)}%</div>
            </li>
          ))}
        </ul>

        <div className="mb-2 text-center">
          <Tooltip
            tip={pityTip()}
          >
            <span className="block space-y-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-10 text-right" style={{ color: RARITIES.ssr.color }}>
                  SSR
                </span>
                <span className="pity-bar">
                  <i
                    className="bar-fill"
                    data-fill="pity_ssr"
                    style={{
                      width: `${Math.min(100, (profile.pitySsr[banner] / PITY_SSR_THRESHOLD) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-16 text-left">
                  {profile.pitySsr[banner]}/{PITY_SSR_THRESHOLD}
                </span>
              </span>
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
                <span className="text-center text-sm text-red-300">
                  {missing > 0 && `Te faltan ${missing} monedas`}
                </span>
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-gray mx-auto mt-2 block text-center"
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
