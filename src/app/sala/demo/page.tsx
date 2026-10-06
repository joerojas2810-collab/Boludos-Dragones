"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/Notice";
import { RoomScreen } from "@/components/room/RoomScreen";
import { demoHero } from "@/lib/roomui/hero";
import { FakeRoomClient } from "@/lib/roomui/fake";
import type { RoomClient } from "@/lib/roomui/types";
import { useProfile } from "@/lib/useProfile";

// Scripted room with bots (no server): ?players=2..7&speed=1..10
export default function DemoRoom() {
  const router = useRouter();
  const { profile, session } = useProfile();
  const prof = useRef(profile);
  const [client, setClient] = useState<RoomClient | null>(null);
  useEffect(() => {
    prof.current = profile;
  }, [profile]);
  const ready = profile !== null;
  const name = session.name || "Tú";
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    const num = (k: string, d: number) => Number(q.get(k)) || d;
    const c = new FakeRoomClient({
      meName: name,
      players: Math.min(7, Math.max(2, num("players", 4))),
      speed: Math.min(10, Math.max(1, num("speed", 1))),
      makeHero: (key, mode, seed) => demoHero(prof.current, key, mode, seed),
    });
    setClient(c);
    return () => c.dispose();
  }, [ready, name]);
  if (!client) return null;
  return (
    <>
      <Notice />
      <RoomScreen client={client} onExit={() => router.push("/sala")} />
    </>
  );
}
