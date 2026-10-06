"use client";

import Link from "next/link";
import { GameTitle } from "@/components/GameTitle";
import { TitleScene } from "@/components/TitleScene";
import { Panel } from "@/components/Panel";
import { logout, repo, useProfile } from "@/lib/useProfile";

export default function Home() {
  const { profile, session } = useProfile();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <TitleScene />
      <GameTitle />
      <Panel title="Menú" className="w-full max-w-sm text-center">
        <p className="mb-2 text-sm opacity-80">
          RPG por turnos para noches de juegos
        </p>
        <p className="mb-4 min-h-5 text-sm text-yellow-300">
          {profile &&
            `● ${profile.coins} monedas · Mejor piso: ${profile.bestFloor}`}
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/run" className="btn text-center">
            Run infinita
          </Link>
          <Link href="/gacha" className="btn text-center">
            Gacha
          </Link>
          <Link href="/coleccion" className="btn text-center">
            Colección
          </Link>
          <Link href="/prueba" className="btn btn-gray text-center">
            Banco de pruebas
          </Link>
          {repo.mode === "remote" && session.status === "user" && (
            <p className="text-sm opacity-80">
              Sesión: {session.name}{" "}
              {session.isAdmin && (
                <Link href="/admin" className="text-cyan-300 underline">
                  Admin
                </Link>
              )}{" "}
              ·{" "}
              <button className="underline" onClick={() => void logout()}>
                Cerrar sesión
              </button>
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}
