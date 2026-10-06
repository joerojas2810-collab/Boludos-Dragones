"use client";

import Link from "next/link";
import { logout, repo, useProfile } from "@/lib/useProfile";

const LINKS = [
  { href: "/gacha", label: "Gacha" },
  { href: "/coleccion", label: "Colección" },
] as const;

// Shared header of the meta screens: back to menu, sibling links, coins.
export function TopBar({ current }: { current: "/gacha" | "/coleccion" }) {
  const { profile, session } = useProfile();
  return (
    <header className="pixel-frame mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-3 py-2">
      <Link href="/" className="btn btn-gray !min-h-9 !px-2 !py-1 text-center">
        ← Menú
      </Link>
      {LINKS.filter((l) => l.href !== current).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="btn !min-h-9 !px-2 !py-1 text-center"
        >
          {l.label}
        </Link>
      ))}
      <span className="ml-auto font-semibold text-yellow-300">
        ● {profile ? profile.coins : "…"} monedas
      </span>
      {repo.mode === "remote" && session.status === "user" && (
        <span className="flex items-center gap-2 text-sm">
          {session.name}
          {session.isAdmin && (
            <Link href="/admin" className="text-cyan-300 underline">
              Admin
            </Link>
          )}
          <button
            className="btn btn-gray !min-h-9 !px-2 !py-1"
            onClick={() => void logout()}
          >
            Salir
          </button>
        </span>
      )}
    </header>
  );
}
