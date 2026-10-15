"use client";

// Client side of an expedition: holds the ExpState, applies actions LOCALLY with the shared reducer for
// instant feedback and syncs them to the server in batches (see expeditionSync.ts for the rules).
// Leaving the page never settles or banks anything: suspension is an action, not an unmount.
import { useCallback, useEffect, useRef, useState } from "react";
import { autoResolve } from "./game/auto";
import { step, type Battle } from "./game/combat";
import { applyExpeditionAction, type ExpState } from "./game/expedition";
import { createRng } from "./game/rng";
import type { TowerMode } from "./game/tower";
import type { ExpStartOpts } from "./repo";
import { repo } from "./useProfile";
import {
  flushDelay,
  flushDue,
  isOfflineError,
  parseQueue,
  queueKey,
  reconcile,
  retryDelay,
  serializeQueue,
  stamp,
  takeBatch,
  type ExpActionInput,
  type SaveStatus,
} from "./expeditionSync";
import type { ExpAction } from "./game/expedition";

export interface FightResult {
  battle: Battle; // the finished fight (the state already moved on)
  won: boolean;
  fragments: number; // fragments gained by the win
  at: number; // nodes resolved when it ended (identifies the fight)
  before: ExpState; // the state the last blow was dealt in (the live state has already moved on)
}
export interface DispatchResult {
  error?: string;
  battle?: Battle | null; // battle after the action (ongoing or finished), for sound and effects
  fightEnded?: boolean;
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const store = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* blocked storage: the queue just lives in memory */
    }
  },
};

export function useExpedition(mode: TowerMode | null) {
  const [state, setState] = useState<ExpState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveStatus>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [lastFight, setLastFight] = useState<FightResult | null>(null);
  const [pendingN, setPendingN] = useState(0);

  const stateRef = useRef<ExpState | null>(null);
  const confirmed = useRef<ExpState | null>(null);
  const queue = useRef<ExpAction[]>([]);
  const firstAt = useRef<number | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => undefined);

  const commit = useCallback((s: ExpState | null) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const persist = useCallback(() => {
    if (!mode) return;
    const s = stateRef.current;
    setPendingN(queue.current.length);
    store.set(queueKey(mode), s && queue.current.length ? serializeQueue(s, queue.current) : null);
  }, [mode]);

  // Replaces local state/queue by the server's canonical one (replaying what still fits).
  const adopt = useCallback(
    (canonical: ExpState, reason?: string, dropAll = false) => {
      const r = reconcile(canonical, dropAll ? [] : queue.current);
      confirmed.current = canonical;
      queue.current = r.queue;
      if (dropAll) r.dropped = 1;
      if (!r.queue.length) firstAt.current = null;
      commit(r.state);
      persist();
      if (reason && (r.dropped > 0 || r.diverged)) setNotice(reason);
    },
    [commit, persist],
  );

  const flush = useCallback(async (keepalive = false): Promise<void> => {
    if (!mode) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    clearTimer();
    const base = confirmed.current;
    if (!queue.current.length || !base) {
      setSave("saved");
      return;
    }
    inflight.current = true;
    setSave("saving");
    const batch = takeBatch(queue.current);
    try {
      const res = await repo.expeditionAct(mode, base, batch, keepalive);
      attempt.current = 0;
      if (!res.error && res.rejectedAt === null && res.applied === batch.length) {
        confirmed.current = res.state;
        queue.current = queue.current.slice(batch.length);
        if (!queue.current.length) {
          firstAt.current = null;
          if (stateRef.current && stateRef.current.revision !== res.state.revision) commit(res.state);
        }
        persist();
      } else {
        adopt(
          res.state,
          res.error && res.error !== "revision"
            ? `El servidor no aceptó una jugada (${res.error}). Se restauró tu última posición guardada.`
            : "Tu expedición se actualizó desde otro lugar. Se restauró la última posición guardada.",
          res.rejectedAt !== null || !!res.error,
        );
      }
      setSave("saved");
    } catch (e) {
      if (isOfflineError(e)) {
        setSave("offline");
        if (alive.current) timer.current = setTimeout(() => void flushRef.current(), retryDelay(attempt.current++));
      } else {
        setSave("error");
        setNotice(e instanceof Error ? e.message : "No se pudo guardar la expedición.");
      }
      return;
    } finally {
      inflight.current = false;
    }
    again.current = false;
    if (queue.current.length) void flushRef.current();
  }, [mode, adopt, commit, persist]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Loads the active expedition and replays whatever was left unconfirmed on this device.
  const load = useCallback(async () => {
    if (!mode) return;
    setLoaded(false);
    setLoadError(null);
    try {
      const s = await repo.expeditionCurrent(mode);
      if (!alive.current) return;
      queue.current = [];
      firstAt.current = null;
      if (!s) {
        confirmed.current = null;
        commit(null);
        store.set(queueKey(mode), null);
      } else {
        queue.current = parseQueue(store.get(queueKey(mode)), s);
        adopt(s);
        if (queue.current.length) {
          firstAt.current = Date.now();
          void flush();
        }
      }
      setSave("saved");
    } catch (e) {
      if (alive.current) setLoadError(e instanceof Error ? e.message : "No se pudo cargar la expedición.");
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [mode, adopt, commit, flush]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      alive.current = false;
      clearTimer();
      // Best effort only: the unconfirmed queue is also kept locally and resent with the same ids.
      if (queue.current.length) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const out = () => void flush();
    const vis = () => document.visibilityState === "hidden" && out();
    const hide = () => void flush(true); // best effort: the queue is also kept locally
    window.addEventListener("pagehide", hide);
    window.addEventListener("online", out);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("online", out);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [flush]);

  const dispatch = useCallback(
    (input: ExpActionInput): DispatchResult => {
      const s = stateRef.current;
      if (!s) return { error: "No hay expedición activa." };
      const a = stamp(input, s, newId());
      const r = applyExpeditionAction(s, a);
      if (r.error) {
        if (r.error === "engine_outdated") commit(r.state); // the run is closed with an explicit reason
        return { error: r.error === "revision" ? "La expedición cambió: vuelve a intentarlo." : r.error };
      }
      if (r.duplicate) return {};
      const next = r.state;
      const now = Date.now();
      let fightBattle: Battle | null = next.battle;
      let fightEnded = false;
      if (s.phase === "combat" && s.battle && s.fight && next.phase !== "combat") {
        fightEnded = true;
        if (!fightBattle) {
          const rng = createRng(s.rng);
          fightBattle = a.type === "combat_auto" ? autoResolve(s.battle, rng) : a.type === "combat_action" ? step(s.battle, a.a, rng, a.target) : s.battle;
        }
        setLastFight({
          battle: fightBattle,
          won: fightBattle.status === "won",
          fragments: Math.max(0, next.fragments - s.fragments),
          at: next.nodes,
          before: s,
        });
      }
      queue.current = [...queue.current, a];
      firstAt.current ??= now;
      commit(next);
      persist();
      setSave((v) => (v === "offline" || v === "error" ? v : "saving"));
      if (flushDue(s, next, queue.current, firstAt.current, now)) void flush();
      else if (!timer.current && !inflight.current)
        timer.current = setTimeout(() => void flush(), flushDelay(firstAt.current, now));
      return { battle: fightBattle, fightEnded };
    },
    [commit, flush, persist],
  );

  const start = useCallback(
    async (opts: ExpStartOpts): Promise<ExpState> => {
      if (!mode) throw new Error("Falta el modo.");
      const s = await repo.expeditionStart(mode, opts);
      queue.current = [];
      firstAt.current = null;
      confirmed.current = s;
      store.set(queueKey(mode), null);
      setLastFight(null);
      commit(s);
      setSave("saved");
      return s;
    },
    [mode, commit],
  );

  /** Resolves when the queue was sent (or failed); use before leaving the screen. */
  const flushNow = useCallback(async (): Promise<boolean> => {
    attempt.current = 0;
    await flush();
    // a request in flight finishes its own loop; wait for it
    for (let i = 0; i < 40 && inflight.current; i++) await new Promise((r) => setTimeout(r, 100));
    return queue.current.length === 0;
  }, [flush]);

  return {
    state,
    loaded,
    loadError,
    save,
    notice,
    clearNotice: () => setNotice(null),
    lastFight,
    dismissFight: () => setLastFight(null),
    dispatch,
    start,
    flushNow,
    retry: () => void flushNow(),
    reload: load,
    pending: pendingN,
    /** Forgets a finished expedition locally (only once everything was confirmed). */
    reset: () => {
      setLastFight(null);
      commit(null);
    },
  };
}
