"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/Notice";
import { RoomScreen } from "@/components/room/RoomScreen";
import { ownedSummary } from "@/lib/roomui/hero";
import { joinRoom, RemoteRoomClient } from "@/lib/roomui/remote";
import type { RoomClient } from "@/lib/roomui/types";
import { errorText } from "@/lib/roomui/viewModels";
import { useProfile } from "@/lib/useProfile";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const prof = useRef(profile);
  const [client, setClient] = useState<RoomClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    prof.current = profile;
  }, [profile]);
  const ready = profile !== null;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let c: RemoteRoomClient | null = null;
    void joinRoom(code.toUpperCase()).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(errorText(String(r.error)));
      c = new RemoteRoomClient({
        roomId: r.roomId,
        heroOf: (k) => ownedSummary(prof.current, k),
      });
      setClient(c);
    });
    return () => {
      live = false;
      c?.dispose();
    };
  }, [ready, code]);
  if (error)
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p>{error}</p>
        <button className="btn" onClick={() => router.push("/sala")}>
          Volver
        </button>
      </main>
    );
  if (!client) return null;
  return (
    <>
      <Notice />
      <RoomScreen client={client} onExit={() => router.push("/sala")} />
    </>
  );
}
