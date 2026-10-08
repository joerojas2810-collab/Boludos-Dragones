"use client";

import Link from "next/link";
import { useArt } from "@/components/ArtScope";
import { DailyStreak } from "@/components/DailyStreak";
import { GameTitle } from "@/components/GameTitle";
import { HeroSprite } from "@/components/HeroSprite";
import { StarRow } from "@/components/StarRow";
import { TitleScene } from "@/components/TitleScene";
import { CLASSES } from "@/lib/game/characters";
import { ELEMENT_LABEL } from "@/lib/game/elements";
import {
  heroPower,
  type OwnedCharacter,
  type Profile,
} from "@/lib/game/profile";
import { RARITIES } from "@/lib/game/rarity";
import { claimedToday, dayKey } from "@/lib/game/streak";
import { repo, useProfile } from "@/lib/useProfile";

// Showcase hero: the strongest one (rank, stars, weapon and gear, see heroPower).
const bestHero = (p: Profile): OwnedCharacter | null =>
  p.characters.reduce<{ c: OwnedCharacter; power: number } | null>((b, c) => {
    const power = heroPower(p, c.id);
    return !b || power > b.power ? { c, power } : b;
  }, null)?.c ?? null;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="hub-stat pixel-frame">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export default function Home() {
  const { profile, session } = useProfile();
  const art = useArt();
  const hero = profile ? bestHero(profile) : null;
  const dailyReady = !!profile && !claimedToday(profile.daily, dayKey());
  return (
    <main className="hub">
      <TitleScene />
      <div className="hub-title">
        <GameTitle />
      </div>
      <section className="hub-stage" aria-label="Tu héroe principal">
        {hero ? (
          <>
            <div
              className="hub-glow"
              style={{
                background: `radial-gradient(closest-side, ${RARITIES[hero.rarity].color}88, transparent)`,
              }}
            />
            <HeroSprite
              classId={hero.classId}
              element={hero.element}
              traits={hero.traits}
              className="hub-hero"
              big
            />
            <div className="hub-shadow" />
            <div className="hub-name pixel-frame">
              <span className="font-semibold">{hero.name}</span>
              <span style={{ color: RARITIES[hero.rarity].color }}>
                {" "}
                · Rango {RARITIES[hero.rarity].label}
              </span>
              <span className="block text-xs opacity-80">
                {CLASSES[hero.classId].name} · {ELEMENT_LABEL[hero.element]} ·
                Nv {hero.level}
              </span>
              <StarRow stars={hero.stars} className="h-[1.1rem]" />
            </div>
          </>
        ) : (
          <p className="hub-name pixel-frame">
            Aún no tienes héroes. Invoca el primero en la pestaña Invocar.
          </p>
        )}
      </section>
      {profile && (
        <section className="hub-stats" aria-label="Estado">
          <Stat label="Mejor piso" value={String(profile.bestFloor)} />
          <Stat
            label="Héroes"
            value={String(profile.characters.length)}
            hint={`${profile.weapons.length} piezas`}
          />
          <div className="hub-stat pixel-frame">
            <DailyStreak profile={profile} />
          </div>
        </section>
      )}
      <div className="hub-actions">
        <Link href="/run" className="btn hub-cta text-center">
          Entrar al dungeon
        </Link>
        <Link href="/gacha" className="btn btn-gray text-center">
          {dailyReady ? "Tirada gratis disponible" : "Invocar"}
        </Link>
        <button className="btn btn-gray text-center" onClick={() => art.set(!art.pixel)}>
          Arte: {art.pixel ? "Pixel" : "Pintado"}
        </button>
        {(repo.mode === "local" || session.isAdmin) && (
          <Link href="/prueba" className="btn btn-gray text-center">
            Banco de pruebas
          </Link>
        )}
      </div>
    </main>
  );
}
