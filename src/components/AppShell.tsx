"use client";

import { TutorialGuide } from "@/components/TutorialGuide";
import { Icon } from "@/components/Icon";
import { uiAsset } from "@/lib/art";
import { ScreenBg } from "@/components/ScreenBg";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isMuted, setMuted } from "@/lib/sfx";
import { claimedToday, dayKey } from "@/lib/game/streak";
import { logout, repo, useProfile } from "@/lib/useProfile";
import "./shell.css";

type TabId =
  "dungeons" | "tower" | "heroes" | "summon" | "forge" | "missions" | "room";
interface Tab {
  id: TabId;
  label: string;
  href: string | null; // null = coming soon
  match: readonly string[];
  remoteOnly?: boolean;
}
const NAV_ICON: Record<TabId, string> = {
  dungeons: "door_boss",
  tower: "dungeon_rank_s",
  heroes: "class_knight",
  summon: "system_chest",
  forge: "upgrade_sharp_edge",
  missions: "event_whispering_book",
  room: "system_token",
};
const TABS: readonly Tab[] = [
  {
    id: "dungeons",
    label: "Dungeons",
    href: "/run",
    match: ["/run"],
  },
  { id: "tower", label: "Torre", href: "/torre", match: ["/torre"] },
  {
    id: "heroes",
    label: "Héroes",
    href: "/coleccion",
    match: ["/coleccion", "/mercado"],
  },
  { id: "summon", label: "Invocar", href: "/gacha", match: ["/gacha"] },
  { id: "forge", label: "Forja", href: "/forja", match: ["/forja"] },
  {
    id: "missions",
    label: "Misiones",
    href: "/misiones",
    match: ["/misiones"],
    remoteOnly: true,
  },
  {
    id: "room",
    label: "Sala",
    href: "/sala",
    match: ["/sala"],
    remoteOnly: true,
  },
];

// Routes that show the chrome. Battles, live rooms and admin tools stay immersive.
const SHELL_ROUTES = [
  "/",
  "/coleccion",
  "/mercado",
  "/gacha",
  "/forja",
  "/sala",
  "/torre",
  "/misiones",
];

// 16x16 pixel-style glyphs, drawn with the current text colour.
function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  return (
    <button
      className="shell-icon"
      aria-label={muted ? "Activar sonido" : "Silenciar"}
      title={muted ? "Sonido apagado" : "Sonido encendido"}
      onClick={() => {
        setMuted(!isMuted());
        setMutedState(isMuted());
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

// True when some mission scope has reached tiers that are not claimed yet.
function useMissionsPending(on: boolean, path: string) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void fetch("/api/missions", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            scopes: {
              points: number;
              claimed: number;
              tiers: { points: number }[];
            }[];
          } | null,
        ) =>
          alive &&
          setPending(
            !!d?.scopes.some(
              (s) =>
                s.tiers.filter((t) => t.points <= s.points).length > s.claimed,
            ),
          ),
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [on, path]);
  return pending;
}

// Painted backdrop per hub screen (scene ids of the backgrounds lot).
const SCREEN_SCENE: Record<string, string> = {
  "/gacha": "gacha",
  "/coleccion": "collection",
  "/mercado": "market",
  "/forja": "forge",
  "/sala": "lobby",
};

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { profile, session } = useProfile();
  const visible = SHELL_ROUTES.some((r) =>
    r === "/" ? path === "/" : path === r || path === `${r}/`,
  );
  const remote = repo.mode === "remote" && session.status === "user";
  const missionsPending = useMissionsPending(remote && visible, path);
  if (!visible) return <>{children}</>;
  const dailyReady = !!profile && !claimedToday(profile.daily, dayKey());
  return (
    <>
      {SCREEN_SCENE[path.replace(/\/$/, "")] && (
        <ScreenBg scene={SCREEN_SCENE[path.replace(/\/$/, "")]} dim={0.45} />
      )}
      <header className="shell-top">
        <Link href="/" className="shell-brand" aria-label="Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uiAsset("logo_emblem")} alt="B&D" draggable={false} />
        </Link>
        <span className="shell-coins" aria-label="Monedas">
          <Icon name="system_coin" className="h-5" />{" "}
          {profile ? profile.coins : "…"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {remote && (
            <span className="shell-user hidden sm:inline">{session.name}</span>
          )}
          {remote && session.isAdmin && (
            <Link href="/admin" className="shell-role">
              Admin
            </Link>
          )}
          <SoundToggle />
          {remote && (
            <button className="shell-icon" onClick={() => void logout()}>
              Salir
            </button>
          )}
        </span>
      </header>
      <div className="shell-body">{children}</div>
      <TutorialGuide />
      <nav className="shell-nav" aria-label="Secciones">
        {TABS.filter((t) => !t.remoteOnly || remote).map((t) => {
          const active = t.match.includes(path.replace(/\/$/, "") || "/");
          const badge =
            (t.id === "summon" && dailyReady) ||
            (t.id === "missions" && missionsPending);
          const inner = (
            <>
              <Icon
                name={NAV_ICON[t.id]}
                className={
                  t.id === "forge" ? "-my-1 h-16 w-16" : "h-[55px] w-[55px]"
                }
              />
              <span>{t.label}</span>
              {badge && (
                <i
                  className="shell-badge"
                  aria-label={
                    t.id === "missions"
                      ? "Premios de misiones por reclamar"
                      : "Tirada diaria disponible"
                  }
                />
              )}
              {!t.href && <small>Pronto</small>}
            </>
          );
          return t.href ? (
            <Link
              key={t.id}
              href={t.href}
              className="shell-tab"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              {inner}
            </Link>
          ) : (
            <span key={t.id} className="shell-tab" data-disabled aria-disabled>
              {inner}
            </span>
          );
        })}
      </nav>
    </>
  );
}
