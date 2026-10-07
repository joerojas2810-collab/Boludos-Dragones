"use client";

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
const ICONS: Record<TabId, ReactNode> = {
  dungeons: <path d="M3 15V6l5-4 5 4v9h-3V8H6v7z" />,
  tower: <path d="M4 15V7H3V3h2v1h1V3h1v1h2V3h1v1h1V3h2v4h-1v8zm3-2h2v-3H7z" />,
  heroes: (
    <path d="M2 2h12v6c0 4-3 6-6 7-3-1-6-3-6-7zm3 2v3c0 2 1 3 3 4 2-1 3-2 3-4V4z" />
  ),
  summon: <path d="M8 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />,
  forge: <path d="M1 4h11v3H9v2h4v3H4V9h2V7H1zm11 0h3v2h-3z" />,
  missions: <path d="M3 2h10v12H3zm2 2v2h6V4zm0 4v1h6V8zm0 3v1h4v-1z" />,
  room: (
    <path d="M5 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm6 1a2 2 0 110 4 2 2 0 010-4zM1 14c0-3 2-5 4-5s4 2 4 5zm9 0c0-2 1-4 3-4s2 1 2 4z" />
  ),
};

function TabIcon({ id }: { id: TabId }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden
    >
      {ICONS[id]}
    </svg>
  );
}

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
      <header className="shell-top">
        <Link href="/" className="shell-brand" aria-label="Inicio">
          B&amp;D
        </Link>
        <span className="shell-coins" aria-label="Monedas">
          ● {profile ? profile.coins : "…"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-sm">
          {remote && <span className="hidden sm:inline">{session.name}</span>}
          {remote && session.isAdmin && (
            <Link href="/admin" className="text-cyan-300 underline">
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
      <nav className="shell-nav" aria-label="Secciones">
        {TABS.filter((t) => !t.remoteOnly || remote).map((t) => {
          const active = t.match.includes(path.replace(/\/$/, "") || "/");
          const badge =
            (t.id === "summon" && dailyReady) ||
            (t.id === "missions" && missionsPending);
          const inner = (
            <>
              <TabIcon id={t.id} />
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
