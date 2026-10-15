// Server side of the tower expedition (docs/torre/01-03). The server stores the canonical ExpState
// (tower_runs), folds the client's actions with the very same reducer and commits state + payouts +
// ranking + codex atomically (tower_run_commit). It never trusts client state, phase, prices, offers or
// rewards: the only client input is the action list.
import { CLASS_IDS } from "../game/characters";
import { ELEMENTS } from "../game/elements";
import {
  applyExpeditionAction,
  EXPEDITION_CATALOG_VERSION,
  startExpedition,
  type ExpAction,
  type ExpState,
  type LedgerEntry,
} from "../game/expedition";
import { masteryOf } from "../game/loadout";
import { loadoutError } from "../game/skills";
import { ENGINE_VERSION } from "../game/stage";
import {
  EXP_ACTION_BUDGET,
  expeditionSeed,
  isTowerMode,
  towerHero,
  type TowerMode,
} from "../game/tower";
import { ApiError } from "./http";
import { audit, call, limit, RpcError, type Deps } from "./rpc";
import { loadMe, MIN_ACTION_GRACE_MS, MIN_ACTION_MS, resolveLoadout, type Me } from "./services";

/** Unknown mode => 400 with a message that tells the player how to recover. */
export function parseTowerMode(v: unknown): TowerMode {
  if (isTowerMode(v)) return v;
  throw new ApiError(
    400,
    "invalid_mode",
    "Ese modo de torre no existe. Vuelve a la torre y elige Nivelada o Colección.",
    { recover: "/torre" },
  );
}

interface RunRow {
  id: string;
  mode: TowerMode;
  week: string;
  seed: number;
  engineVersion: number;
  catalogVersion: number;
  revision: number;
  status: "active" | "suspended" | "ended";
  state: ExpState;
  nodes: number;
  turns: number;
  actions: number;
  lastBatch: { first: string; last: string; count: number } | null;
  ageMs: number;
}
interface CurrentRes {
  week: string;
  run: RunRow | null;
  closed: RunRow | null;
}

const outdated = (r: RunRow) =>
  r.engineVersion !== ENGINE_VERSION || r.catalogVersion !== EXPEDITION_CATALOG_VERSION;

/**
 * The open run of a mode. A run of an old week is closed as 'season' by the database and one made with
 * another engine/catalog as 'engine' here (confirmed payouts stay); the closed run is returned once.
 */
async function openRun(d: Deps, playerId: string, mode: TowerMode): Promise<CurrentRes> {
  const cur = await call<CurrentRes>(d.rpc, "tower_run_current", { p_player: playerId, p_mode: mode });
  if (cur.run && outdated(cur.run)) {
    const closed = await call<RunRow>(d.rpc, "tower_run_end", {
      p_player: playerId,
      p_run: cur.run.id,
      p_reason: "engine",
    });
    return { week: cur.week, run: null, closed };
  }
  return cur;
}

export async function expeditionCurrentService(d: Deps, playerId: string, modeRaw: unknown) {
  const mode = parseTowerMode(modeRaw);
  await limit(d.rpc, `expcur:${playerId}`, 60, 60);
  const cur = await openRun(d, playerId, mode);
  return { state: (cur.run ?? cur.closed)?.state ?? null, week: cur.week };
}

export interface ExpStartBody {
  mode: unknown;
  characterId?: string;
  classId?: string;
  element?: string;
  loadout?: readonly string[];
}

export async function expeditionStartService(d: Deps, playerId: string, body: ExpStartBody) {
  const mode = parseTowerMode(body.mode);
  await limit(d.rpc, `expstart:${playerId}`, 10, 60);
  await limit(d.rpc, `expstarth:${playerId}`, 20, 3600);
  const cur = await openRun(d, playerId, mode);
  if (cur.run) return { state: cur.run.state, resumed: true as const };

  if (mode === "nivelado") {
    if (!(CLASS_IDS as readonly string[]).includes(body.classId ?? "") || !(ELEMENTS as readonly string[]).includes(body.element ?? ""))
      throw new ApiError(400, "invalid_input", "Elige una clase y un elemento para la torre nivelada.");
  } else if (!body.characterId) {
    throw new ApiError(400, "invalid_input", "Elige un héroe de tu colección.");
  }
  const me = await loadMe(d.rpc, playerId);
  const hero = towerHero(
    me.profile,
    mode,
    body.characterId ?? null,
    (body.classId ?? "caballero") as Parameters<typeof towerHero>[3],
    (body.element ?? null) as Parameters<typeof towerHero>[4],
  );
  if (!hero) throw new ApiError(404, "character_not_found", "Personaje no encontrado.");
  const loadout = resolveLoadout(me.profile, hero, mode, body.loadout);

  for (let attempt = 0; ; attempt++) {
    // The week and its seed come from the database clock; the run freezes both.
    const ws = await call<{ week: string; seed: number }>(d.rpc, "get_weekly_seed", { p_seed: d.randomSeed() });
    const state = startExpedition({
      mode,
      seed: expeditionSeed(Number(ws.seed), mode),
      weekKey: ws.week,
      hero,
      loadout,
    });
    try {
      const r = await call<{ created: boolean; run: RunRow }>(d.rpc, "tower_run_create", {
        p_player: playerId,
        p_mode: mode,
        p_week: ws.week,
        p_seed: state.seed,
        p_engine: state.engineVersion,
        p_catalog: state.catalogVersion,
        p_state: state,
        p_hero_id: mode === "coleccion" ? body.characterId : null,
      });
      return { state: r.run.state, resumed: !r.created };
    } catch (e) {
      // Monday midnight passed between the two calls: fix the new week once.
      if (e instanceof RpcError && e.message === "week_changed" && attempt < 2) continue;
      throw e;
    }
  }
}

export interface ExpActBody {
  mode: unknown;
  actions: ExpAction[];
}
export interface ExpActResult {
  state: ExpState;
  applied: number;
  rejectedAt: number | null;
  error?: string;
  cursor: { revision: number; lastActionId: string | null };
  prize?: { nodes: number; coins: number; xp: number };
}

const lastId = (s: ExpState) => s.recent[s.recent.length - 1] ?? null;
const cursorOf = (s: ExpState) => ({ revision: s.revision, lastActionId: lastId(s) });
const forceLimit = (s: ExpState): ExpState => ({
  ...s,
  phase: "ended",
  battle: null,
  revision: s.revision + 1,
  end: { reason: "limit", node: s.nodes },
});

/**
 * Folds a batch of actions over the STORED state and commits the result. Actions before `rejectedAt`
 * are applied, the rest is discarded; the canonical state always comes back so the client can reconcile.
 */
export async function expeditionActService(d: Deps, playerId: string, body: ExpActBody): Promise<ExpActResult> {
  const mode = parseTowerMode(body.mode);
  await limit(d.rpc, `expact:${playerId}`, 90, 60);
  const actions = body.actions;
  if (!actions.length) throw new ApiError(400, "invalid_input", "Datos inválidos.");
  let me: Me | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await openRun(d, playerId, mode);
    const run = cur.run;
    if (!run) {
      // Closed under our feet (week change, engine) or never started.
      if (cur.closed)
        return { state: cur.closed.state, applied: 0, rejectedAt: 0, error: cur.closed.state.end?.reason === "season" ? "season" : "engine_outdated", cursor: cursorOf(cur.closed.state) };
      throw new ApiError(404, "no_expedition", "No tienes una expedición activa en este modo. Empieza una nueva.");
    }
    let state = run.state;

    // A retried batch (response lost after commit): skip what the last commit already contains.
    let skipped = 0;
    const lb = run.lastBatch;
    if (lb && actions.length >= lb.count && actions[0].actionId === lb.first && actions[lb.count - 1].actionId === lb.last)
      skipped = lb.count;
    const todo = actions.slice(skipped);
    if (!todo.length)
      return { state, applied: skipped, rejectedAt: null, cursor: cursorOf(state) };

    // Nobody plays faster than a person clicking: such a batch stays pending on the client (429 is retried).
    if ((run.actions + todo.length) * MIN_ACTION_MS > run.ageMs + MIN_ACTION_GRACE_MS) {
      await audit(d.rpc, playerId, "expedition_too_fast", { runId: run.id, n: todo.length, ageMs: run.ageMs });
      throw new ApiError(429, "too_fast", "Vas demasiado rápido para ser real: espera un momento.", { retryAfter: 2 });
    }

    const ledgerBefore = state.ledger.length;
    let appliedNew = 0;
    let processed = 0;
    let rejectedAt: number | null = null;
    let error: string | undefined;
    const budget = EXP_ACTION_BUDGET - run.actions;
    for (let i = 0; i < todo.length; i++) {
      const a = todo[i];
      // Collection loadouts are checked against the mastery THIS server stores, before the reducer sees them.
      if (a.type === "set_loadout" && state.mode === "coleccion") {
        me ??= await loadMe(d.rpc, playerId);
        const err = loadoutError(state.hero.classId, a.loadout, masteryOf(me.profile, state.hero.classId));
        if (err) {
          rejectedAt = skipped + i;
          error = err;
          break;
        }
      }
      let r: ReturnType<typeof applyExpeditionAction>;
      try {
        r = applyExpeditionAction(state, a);
      } catch {
        r = { state, error: "Acción inválida." };
      }
      if (r.error) {
        rejectedAt = skipped + i;
        error = r.error;
        break;
      }
      if (!r.duplicate) appliedNew++;
      processed++;
      state = r.state;
      if (state.phase !== "ended" && appliedNew >= budget) {
        state = forceLimit(state);
        error = "limit";
        break;
      }
    }
    const applied = skipped + processed;
    if (appliedNew === 0 && state === run.state)
      return { state, applied, rejectedAt, ...(error ? { error } : {}), cursor: cursorOf(state) };

    const paid = state.ledger.slice(ledgerBefore).map((e: LedgerEntry) => ({ node: e.node, kind: e.kind }));
    try {
      const res = await call<{
        season: boolean;
        run?: RunRow;
        prize?: { nodes: number; coins: number; xp: number };
      }>(d.rpc, "tower_run_commit", {
        p_run: run.id,
        p_player: playerId,
        p_revision: run.revision,
        p_state: state,
        p_paid: paid,
        p_added: appliedNew,
        p_batch: applied > 0 ? { first: actions[0].actionId, last: actions[applied - 1].actionId, count: applied } : null,
      });
      if (res.season && res.run)
        return { state: res.run.state, applied: 0, rejectedAt: 0, error: "season", cursor: cursorOf(res.run.state) };
      return {
        state,
        applied,
        rejectedAt,
        ...(error ? { error } : {}),
        cursor: cursorOf(state),
        ...(res.prize ? { prize: res.prize } : {}),
      };
    } catch (e) {
      // Another tab/request committed first: reload and fold again on top of the canonical state.
      if (e instanceof RpcError && e.message === "conflict" && attempt < 3) continue;
      if (e instanceof RpcError && e.message === "run_ended")
        throw new ApiError(409, "run_ended", "Esa expedición ya terminó.");
      if (e instanceof RpcError && e.message === "conflict")
        throw new ApiError(409, "conflict", "La expedición cambió en otra pestaña. Recarga para continuar.");
      throw e;
    }
  }
  throw new ApiError(409, "conflict", "La expedición cambió en otra pestaña. Recarga para continuar.");
}

export async function expeditionCodexService(d: Deps, playerId: string, modeRaw: unknown) {
  const mode = modeRaw == null || modeRaw === "" ? null : parseTowerMode(modeRaw);
  await limit(d.rpc, `expcodex:${playerId}`, 30, 60);
  return call<Record<string, unknown>>(d.rpc, "tower_codex_get", { p_player: playerId, p_mode: mode });
}
