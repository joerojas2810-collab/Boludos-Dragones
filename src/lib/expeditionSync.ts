// Pure queue / batching / conflict logic of the expedition client (docs/torre/03 "Persistencia").
// The hook (useExpedition.ts) only wires these to React, timers and the network, so everything that
// can go wrong around saving is testable here.
import { applyExpeditionAction, type ExpAction, type ExpState } from "./game/expedition";

export const BATCH_MAX_ACTIONS = 256;
export const BATCH_MAX_BYTES = 64 * 1024;
export const FLUSH_COMBAT_ACTIONS = 10;
export const FLUSH_AFTER_MS = 5000;
export const RETRY_BASE_MS = 3000;
export const RETRY_MAX_MS = 30_000;

export type SaveStatus = "saving" | "saved" | "offline" | "error";
export const SAVE_LABEL: Record<SaveStatus, string> = {
  saving: "Guardando",
  saved: "Guardado",
  offline: "Pendiente de conexión",
  error: "Error",
};

/** Distributive Omit so every member of the ExpAction union keeps its own fields. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ExpActionInput = DistOmit<ExpAction, "actionId" | "expectedRevision">;

export const stamp = (input: ExpActionInput, state: Pick<ExpState, "revision">, actionId: string): ExpAction =>
  ({ ...input, actionId, expectedRevision: state.revision }) as ExpAction;

const isCombat = (a: ExpAction) => a.type === "combat_action" || a.type === "combat_auto";
export const combatCount = (queue: readonly ExpAction[]) => queue.filter(isCombat).length;

/** The next batch to send: at most 256 actions and 64 KiB (never empty if the queue is not). */
export function takeBatch(queue: readonly ExpAction[]): ExpAction[] {
  const out: ExpAction[] = [];
  let bytes = 2;
  for (const a of queue) {
    const size = JSON.stringify(a).length + 1;
    if (out.length >= BATCH_MAX_ACTIONS || (out.length > 0 && bytes + size > BATCH_MAX_BYTES)) break;
    out.push(a);
    bytes += size;
  }
  return out;
}

/** True when the queue must be sent now: a node was resolved, the run stopped, 10 combat actions or 5 s. */
export function flushDue(
  prev: Pick<ExpState, "nodes" | "phase">,
  next: Pick<ExpState, "nodes" | "phase">,
  queue: readonly ExpAction[],
  firstPendingAt: number | null,
  now: number,
): boolean {
  if (!queue.length) return false;
  if (next.nodes > prev.nodes || next.phase === "ended" || next.phase === "suspended") return true;
  if (combatCount(queue) >= FLUSH_COMBAT_ACTIONS) return true;
  return firstPendingAt !== null && now - firstPendingAt >= FLUSH_AFTER_MS;
}

/** Milliseconds until the 5 s deadline of the first pending action (0 = already due). */
export const flushDelay = (firstPendingAt: number, now: number): number =>
  Math.max(0, FLUSH_AFTER_MS - (now - firstPendingAt));

export const retryDelay = (attempt: number): number => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));

/** Network trouble is retried; a definite 4xx answer (not 408/429) is an error the player must see. */
export function isOfflineError(e: unknown): boolean {
  const status = typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : 0;
  if (!status) return true;
  return status >= 500 || status === 408 || status === 429;
}

export interface Reconciled {
  state: ExpState;
  queue: ExpAction[]; // still unconfirmed, replayed on top of `state`
  dropped: number; // actions that could not be kept
  diverged: boolean; // the server moved on from somewhere else: the local actions were discarded
}

/**
 * Adopts the server's canonical state and decides what to do with the unconfirmed queue.
 * Every accepted action raises the revision by one, so the queue is read against that revision:
 * actions below it are already applied (their lineage is checked through `recent`), the first one at
 * it is replayed, and anything that no longer fits (another tab, a rejected action) is dropped.
 */
export function reconcile(canonical: ExpState, queue: readonly ExpAction[]): Reconciled {
  let i = 0;
  while (i < queue.length && queue[i].expectedRevision < canonical.revision) i++;
  const none = (diverged: boolean): Reconciled => ({
    state: canonical,
    queue: [],
    dropped: queue.length - i,
    diverged,
  });
  if (i > 0 && !canonical.recent.includes(queue[i - 1].actionId)) return { ...none(true), dropped: queue.length };
  const rest = queue.slice(i);
  if (!rest.length) return none(false);
  if (rest[0].expectedRevision !== canonical.revision) return none(true);
  let state = canonical;
  const kept: ExpAction[] = [];
  for (const a of rest) {
    const r = applyExpeditionAction(state, a);
    if (r.duplicate) continue;
    if (r.error) break;
    state = r.state;
    kept.push(a);
  }
  return { state, queue: kept, dropped: rest.length - kept.length, diverged: false };
}

// ---- local persistence of the unconfirmed queue ----------------------------------------------

export interface StoredQueue {
  seed: number;
  weekKey: string;
  actions: readonly ExpAction[];
}
export const queueKey = (mode: string) => `bd-exp-queue:${mode}`;

export const serializeQueue = (state: Pick<ExpState, "seed" | "weekKey">, actions: readonly ExpAction[]): string =>
  JSON.stringify({ seed: state.seed, weekKey: state.weekKey, actions } satisfies StoredQueue);

/** Parses a stored queue; anything that does not belong to this run (or is malformed) gives []. */
export function parseQueue(raw: string | null, state: Pick<ExpState, "seed" | "weekKey">): ExpAction[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as Partial<StoredQueue> | null;
    if (!v || v.seed !== state.seed || v.weekKey !== state.weekKey || !Array.isArray(v.actions)) return [];
    return (v.actions as unknown[]).filter(
      (a): a is ExpAction =>
        !!a && typeof a === "object" && typeof (a as ExpAction).actionId === "string" &&
        Number.isInteger((a as ExpAction).expectedRevision) && typeof (a as ExpAction).type === "string",
    );
  } catch {
    return [];
  }
}

// ---- keypress guard ----------------------------------------------------------------------------

/**
 * A click that comes from the keyboard (detail 0) or a held key right after the view changed must not
 * confirm anything in the new view (an Enter/Space that bought the previous item, key repeat).
 */
export const GUARD_MS = 450;
export const keyGuardBlocks = (now: number, blockedUntil: number, detail: number, repeat = false): boolean =>
  repeat || (detail === 0 && now < blockedUntil);
