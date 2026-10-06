"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceJitterMs, EMOTE_MIN_GAP_MS } from "./rooms/messages";
import type { EmoteId, RoomClient, RoomView, TurnInfo } from "./roomui/types";
import { phaseComplete, settlementToast } from "./roomui/viewModels";

export interface LiveFight {
  pHp: number;
  pMax: number;
  eHp: number;
  eMax: number;
  n: number;
}
export interface FeedItem {
  n: number;
  actor: "p" | "e";
  kind: TurnInfo["kind"];
  dmg: number;
  at: number;
}
const FEED_MAX = 14;
const EMOTE_SHOW_MS = 3500;
const TOAST_MS = 5000;

/** Ticking clock for countdowns (250 ms; 0 until mounted). */
export function useNow(every = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, every);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [every]);
  return now;
}

/**
 * Subscribes to a RoomClient: view, live fight events (spectating), emotes,
 * settlement toast, and the "advance when due / when everybody is done" caller.
 */
export function useRoom(client: RoomClient | null) {
  const [view, setView] = useState<RoomView | null>(null);
  const [live, setLive] = useState<Record<string, LiveFight>>({});
  const [feeds, setFeeds] = useState<Record<string, FeedItem[]>>({});
  const [emotes, setEmotes] = useState<
    Record<string, { id: EmoteId; at: number }>
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const [gone, setGone] = useState<"closed" | "kicked" | null>(null);
  const floorKey = useRef("");
  const lastEmote = useRef<number | null>(null);
  const prevPhase = useRef<string>("");

  useEffect(() => {
    if (!client) return;
    const offV = client.subscribe(setView);
    const offE = client.onEvent((e) => {
      if (e.type === "closed" || e.type === "kicked") setGone(e.type);
      else if (e.type === "emote")
        setEmotes((m) => ({ ...m, [e.from]: { id: e.id, at: Date.now() } }));
      else {
        const t = e.msg;
        setLive((m) => {
          const cur = m[t.fighter];
          return {
            ...m,
            [t.fighter]: {
              pHp: t.pHp,
              eHp: t.eHp,
              pMax: Math.max(cur?.pMax ?? 0, t.pHp),
              eMax: Math.max(cur?.eMax ?? 0, t.eHp),
              n: t.n,
            },
          };
        });
        if (t.n > 0)
          setFeeds((m) => ({
            ...m,
            [t.fighter]: [
              ...(m[t.fighter] ?? []),
              { n: t.n, actor: t.actor, kind: t.kind, dmg: t.dmg, at: Date.now() },
            ].slice(-FEED_MAX),
          }));
      }
    });
    return () => {
      offV();
      offE();
    };
  }, [client]);

  // New floor: forget last floor's live bars and feeds.
  const key = view ? `${view.round}:${view.floor}` : "";
  useEffect(() => {
    if (key === floorKey.current) return;
    floorKey.current = key;
    setLive({});
    setFeeds({});
  }, [key]);

  // Toast with what the bets paid when the floor settles.
  useEffect(() => {
    if (!view) return;
    const was = prevPhase.current;
    prevPhase.current = view.phase;
    if (view.phase === "reveal" && was !== "reveal") {
      const t = settlementToast(view);
      if (t) {
        setToast(t);
        const id = setTimeout(() => setToast(null), TOAST_MS);
        return () => clearTimeout(id);
      }
    }
  }, [view]);

  // Prune old emotes so the icons disappear.
  useEffect(() => {
    if (Object.keys(emotes).length === 0) return;
    const id = setTimeout(() => {
      const t = Date.now();
      setEmotes((m) =>
        Object.fromEntries(
          Object.entries(m).filter(([, v]) => t - v.at < EMOTE_SHOW_MS),
        ),
      );
    }, EMOTE_SHOW_MS);
    return () => clearTimeout(id);
  }, [emotes]);

  // Anyone may call advance: at the deadline (+jitter) or once everybody is done.
  const seq = view?.phaseSeq ?? -1;
  const deadline = view?.deadline ?? 0;
  const me = view?.me ?? "";
  const complete = view ? phaseComplete(view) : false;
  useEffect(() => {
    if (!client || seq < 0) return;
    const jitter = advanceJitterMs(me);
    const wait = complete
      ? Math.round(jitter / 5)
      : deadline > 0
        ? Math.max(0, deadline - Date.now()) + jitter
        : null;
    if (wait === null) return;
    const id = setTimeout(() => void client.advance(seq), wait);
    return () => clearTimeout(id);
  }, [client, seq, deadline, complete, me]);

  const emote = useCallback(
    (id: EmoteId) => {
      const t = Date.now();
      if (!client || (lastEmote.current !== null && t - lastEmote.current < EMOTE_MIN_GAP_MS))
        return false;
      lastEmote.current = t;
      client.emote(id);
      return true;
    },
    [client],
  );

  return { view, live, feeds, emotes, toast, gone, emote };
}
