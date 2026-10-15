// Offline (no Supabase) tower expedition: the same reducer as the server over localStorage, one active
// run per mode, week key from artWeekKey. No ranking and no rewards: those only exist on the server.
import type { ClassId } from "./game/characters";
import type { Element } from "./game/elements";
import {
  applyExpeditionAction,
  artWeekKey,
  startExpedition,
  type EndReason,
  type EventId,
  type ExpAction,
  type ExpState,
} from "./game/expedition";
import { loadoutFor, masteryOf } from "./game/loadout";
import type { Profile } from "./game/profile";
import type { OwnedRelic, RelicId } from "./game/relics";
import { loadoutError, type Loadout } from "./game/skills";
import { EXP_BATCH_MAX_ACTIONS, expeditionSeed, localWeekSeed, towerHero, type TowerMode } from "./game/tower";

export interface ExpStartOpts {
  characterId?: string;
  classId?: ClassId;
  element?: Element;
  loadout?: Loadout;
}
export interface ExpActResult {
  state: ExpState;
  applied: number;
  rejectedAt: number | null;
  error?: string;
}
export interface ExpHistoryEntry {
  id: string;
  weekKey: string;
  mode: TowerMode;
  nodes: number;
  combats: number;
  turns: number;
  relics: OwnedRelic[];
  reason: EndReason;
  killer: string[];
  heroName: string;
  classId: ClassId | null;
  element: Element | null;
  at: string | null;
}
export interface ExpCodex {
  relics: RelicId[];
  events: EventId[];
  best: { nodes: number; turns: number } | null;
  history: ExpHistoryEntry[];
}
export class ExpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export interface KV {
  get(k: string): string | null;
  set(k: string, v: string | null): void;
}
export const browserKV: KV = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: local mode just forgets */
    }
  },
};

const stateKey = (m: TowerMode) => `bd-exp-local:${m}`;
const codexKey = (m: TowerMode) => `bd-exp-codex:${m}`;
const emptyCodex = (): ExpCodex => ({ relics: [], events: [], best: null, history: [] });
const read = <T>(kv: KV, k: string): T | null => {
  try {
    const raw = kv.get(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export function createLocalExpedition(kv: KV, getProfile: () => Profile, now: () => Date = () => new Date()) {
  const codexOf = (mode: TowerMode): ExpCodex => ({ ...emptyCodex(), ...(read<Partial<ExpCodex>>(kv, codexKey(mode)) ?? {}) });

  // Discovery + personal record on every save; the history entry is added once when the run ends.
  const record = (s: ExpState) => {
    const c = codexOf(s.mode);
    const better = !c.best || s.nodes > c.best.nodes || (s.nodes === c.best.nodes && s.turns < c.best.turns);
    const entry: ExpHistoryEntry = {
      id: `${s.weekKey}:${s.seed}`,
      weekKey: s.weekKey,
      mode: s.mode,
      nodes: s.nodes,
      combats: s.combats,
      turns: s.turns,
      relics: s.relics,
      reason: s.end?.reason ?? "death",
      killer: s.end?.killer ?? [],
      heroName: s.hero.name,
      classId: s.hero.classId,
      element: s.hero.element,
      at: now().toISOString(),
    };
    const history = s.phase === "ended" ? [entry, ...c.history.filter((h) => h.id !== entry.id)].slice(0, 20) : c.history;
    kv.set(
      codexKey(s.mode),
      JSON.stringify({
        relics: [...new Set([...c.relics, ...s.seen.relics])],
        events: [...new Set([...c.events, ...s.seen.events])],
        best: s.nodes > 0 && better ? { nodes: s.nodes, turns: s.turns } : c.best,
        history,
      } satisfies ExpCodex),
    );
  };
  const save = (s: ExpState) => {
    record(s);
    kv.set(stateKey(s.mode), s.phase === "ended" ? null : JSON.stringify(s));
  };
  // A run of an old week ends as "season" (never carried into the new week).
  const live = (mode: TowerMode): { state: ExpState | null; closed: ExpState | null } => {
    const s = read<ExpState>(kv, stateKey(mode));
    if (!s || s.phase === "ended") return { state: null, closed: null };
    if (s.weekKey !== artWeekKey(now())) {
      const closed: ExpState = { ...s, phase: "ended", battle: null, revision: s.revision + 1, end: { reason: "season", node: s.nodes } };
      save(closed);
      return { state: null, closed };
    }
    return { state: s, closed: null };
  };

  return {
    current: async (mode: TowerMode): Promise<ExpState | null> => {
      const l = live(mode);
      return l.state ?? l.closed;
    },
    start: async (mode: TowerMode, opts: ExpStartOpts): Promise<ExpState> => {
      const l = live(mode);
      if (l.state) return l.state;
      const profile = getProfile();
      const hero = towerHero(profile, mode, opts.characterId ?? null, opts.classId ?? "caballero", opts.element ?? null);
      if (!hero) throw new ExpError("character_not_found", "Personaje no encontrado.");
      if (opts.loadout) {
        const err = loadoutError(hero.classId, opts.loadout, mode === "nivelado" ? null : masteryOf(profile, hero.classId));
        if (err) throw new ExpError("invalid_loadout", err);
      }
      const s = startExpedition({
        mode,
        seed: expeditionSeed(localWeekSeed(now()), mode),
        weekKey: artWeekKey(now()),
        hero,
        loadout: opts.loadout ?? loadoutFor(profile, hero, mode),
      });
      kv.set(stateKey(mode), JSON.stringify(s));
      return s;
    },
    act: async (mode: TowerMode, _client: ExpState, actions: ExpAction[]): Promise<ExpActResult> => {
      const l = live(mode);
      if (!l.state) {
        if (l.closed) return { state: l.closed, applied: 0, rejectedAt: 0, error: "season" };
        throw new ExpError("no_expedition", "No tienes una expedición activa en este modo.");
      }
      if (actions.length === 0 || actions.length > EXP_BATCH_MAX_ACTIONS) throw new ExpError("invalid_input", "Datos inválidos.");
      let state = l.state;
      let applied = 0;
      let error: string | undefined;
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        if (a.type === "set_loadout" && state.mode === "coleccion") {
          const err = loadoutError(state.hero.classId, a.loadout, masteryOf(getProfile(), state.hero.classId));
          if (err) {
            error = err;
            break;
          }
        }
        const r = applyExpeditionAction(state, a);
        if (r.error) {
          error = r.error;
          break;
        }
        state = r.state;
        applied++;
      }
      if (applied > 0) save(state);
      return { state, applied, rejectedAt: error ? applied : null, ...(error ? { error } : {}) };
    },
    codex: async (mode?: TowerMode): Promise<ExpCodex> => {
      const modes: TowerMode[] = mode ? [mode] : ["nivelado", "coleccion"];
      const all = modes.map(codexOf);
      return {
        relics: [...new Set(all.flatMap((c) => c.relics))],
        events: [...new Set(all.flatMap((c) => c.events))],
        best: all.reduce<ExpCodex["best"]>(
          (b, c) => (c.best && (!b || c.best.nodes > b.nodes || (c.best.nodes === b.nodes && c.best.turns < b.turns)) ? c.best : b),
          null,
        ),
        history: all.flatMap((c) => c.history).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 20),
      };
    },
  };
}
