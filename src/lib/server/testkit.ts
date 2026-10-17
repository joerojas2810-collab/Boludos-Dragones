// Test helpers: in-memory fake of the Supabase RPC surface (no real backend).
import { defaultLoadout } from "../game/skills";
import {
  applyStageAction,
  initialStageReplay,
  type StageAction,
} from "../game/stageReplay";
import { levelFights } from "../game/stage";
import { levelsOf } from "../game/levels";
import type { RarityId } from "../game/rarity";
import { applyTowerAction, startTower } from "../game/tower";
import type { Character, HeroFactors } from "../game/characters";
import { RpcError, type Deps, type RpcResult } from "./rpc";

type Args = Record<string, unknown>;
export interface Row {
  key: string;
  kind: "char" | "weap";
  a: string; // class | type
  element: string;
  rarity: string;
  stars: number;
  data: unknown;
}

/** In-memory twin of the 0059 tower_runs / tower_run_* functions (the SQL itself is covered by PGlite tests). */
export interface FakeTowerRun {
  id: string;
  player: string;
  mode: string;
  week: string;
  deadline: number; // ms
  seed: number;
  engineVersion: number;
  catalogVersion: number;
  revision: number;
  status: "active" | "suspended" | "ended";
  state: Record<string, unknown>;
  nodes: number;
  turns: number;
  actions: number;
  lastBatch: unknown;
  endReason: string | null;
  heroId: string | null;
}

export class FakeDb {
  coins = 3000;
  version = 0;
  pity = { character: 0, weapon: 0 };
  pitySsr = { character: 0, weapon: 0 };
  rows: Row[] = [];
  escamas = 0;
  dados = 0;
  forged: Args[] = [];
  idem = new Map<string, unknown>();
  calls: { name: string; args: Args }[] = [];
  conflictOnce = false;
  rateLimited = false;
  run: {
    seed: number;
    hero: unknown;
    status: string;
    startedAt?: number;
  } | null = null;
  banked: Args[] = [];
  levelBanks: Args[] = [];
  levelStarts: Args[] = [];
  burned: Args[] = [];
  heroChanges: Args[] = [];
  pieceChanges: Args[] = [];
  xpGrants: Args[] = [];
  dungeons: { steps: Record<string, true>; routes: Record<string, number> } = { steps: {}, routes: {} };
  equipped: Record<string, string> = {};
  runsToday = 0;
  classMastery: Record<string, number> = {};
  loadouts: Record<string, string[]> = {};
  levelLoadouts: Record<string, string[]> = {};
  towerRecords: Args[] = [];
  // ---- tower expeditions (0059 twin) ----
  towerRuns: FakeTowerRun[] = [];
  nodePaid = new Set<string>();
  paidCoins = 0;
  paidXp: Args[] = [];
  scores: Record<string, { nodes: number; turns: number }> = {};
  codex: { relics: Set<string>; events: Set<string> } = { relics: new Set(), events: new Set() };
  nowMs = Date.parse("2026-10-07T12:00:00Z");
  weekDeadlineMs = Date.parse("2026-10-12T03:00:00Z");
  runAgeMs = 1e9; // age reported for open runs (the pace check compares it with the action count)
  beforeCommit: (() => void) | null = null; // lets a test commit "from another tab" first
  commits = 0;
  missionProgress: Record<string, number> = {};
  bestRank = "f";
  missionClaims: Args[] = [];
  audits: string[] = [];

  deps: Deps = {
    rpc: async (name, args) => this.handle(name, args),
    randomSeed: () => 12345,
    openRunId: async () => null,
    getRun: async () => this.run,
    runsToday: async () => this.runsToday,
  };

  private err(m: string): RpcResult {
    return { data: null, error: { message: m } };
  }
  private okv(data: unknown): RpcResult {
    return { data, error: null };
  }

  private view(r: FakeTowerRun) {
    return {
      id: r.id, mode: r.mode, week: r.week, seed: r.seed, engineVersion: r.engineVersion,
      catalogVersion: r.catalogVersion, revision: r.revision, status: r.status,
      state: JSON.parse(JSON.stringify(r.state)), nodes: r.nodes, turns: r.turns, actions: r.actions,
      lastBatch: r.lastBatch, endReason: r.endReason, ageMs: this.runAgeMs,
    };
  }
  private endRun(r: FakeTowerRun, reason: string) {
    if (r.status === "ended") return;
    r.status = "ended";
    r.endReason = reason;
    r.revision += 1;
    r.state = { ...r.state, phase: "ended", battle: null, revision: r.revision, end: { reason, node: r.nodes } };
  }
  private openRun(player: string, mode: string) {
    return this.towerRuns.find((r) => r.player === player && r.mode === mode && r.status !== "ended");
  }

  // Mirrors tower_run_* of 0059 (same errors, same idempotency rules).
  private tower(name: string, a: Args): RpcResult {
    const player = String(a.p_player);
    switch (name) {
      case "tower_run_current": {
        const run = this.openRun(player, String(a.p_mode));
        let closed = null;
        let open = run;
        if (run && this.nowMs >= run.deadline) {
          this.endRun(run, "season");
          closed = this.view(run);
          open = undefined;
        }
        return this.okv({ week: "2026-10-05", run: open ? this.view(open) : null, closed });
      }
      case "tower_run_end": {
        const r = this.towerRuns.find((x) => x.id === a.p_run && x.player === player);
        if (!r) return this.err("run_not_found");
        if (!["season", "engine", "limit"].includes(String(a.p_reason))) return this.err("invalid_args");
        this.endRun(r, String(a.p_reason));
        return this.okv(this.view(r));
      }
      case "tower_run_create": {
        const mode = String(a.p_mode);
        const open = this.openRun(player, mode);
        if (open) return this.okv({ created: false, run: this.view(open) });
        const st = a.p_state as Record<string, unknown>;
        const r: FakeTowerRun = {
          id: `run-${this.towerRuns.length + 1}`, player, mode, week: String(a.p_week), deadline: this.weekDeadlineMs,
          seed: Number(a.p_seed), engineVersion: Number(a.p_engine), catalogVersion: Number(a.p_catalog),
          revision: 0, status: "active", state: JSON.parse(JSON.stringify(st)), nodes: 0, turns: 0, actions: 0,
          lastBatch: null, endReason: null, heroId: (a.p_hero_id as string | null) ?? null,
        };
        this.towerRuns.push(r);
        return this.okv({ created: true, run: this.view(r) });
      }
      case "tower_run_commit": {
        this.beforeCommit?.();
        this.beforeCommit = null;
        const r = this.towerRuns.find((x) => x.id === a.p_run && x.player === player);
        if (!r) return this.err("run_not_found");
        if (r.status === "ended") return this.err("run_ended");
        if (r.revision !== a.p_revision) return this.err("conflict");
        if (this.nowMs >= r.deadline) {
          this.endRun(r, "season");
          return this.okv({ season: true, run: this.view(r) });
        }
        const st = JSON.parse(JSON.stringify(a.p_state)) as Record<string, unknown>;
        let coins = 0;
        let xp = 0;
        let n = 0;
        for (const e of a.p_paid as { node: number; kind: string }[]) {
          const key = `${player}:${r.mode}:${r.week}:${e.node}`;
          if (e.node < 1 || e.node > 30 || this.nodePaid.has(key)) continue;
          this.nodePaid.add(key);
          coins += { normal: 5, elite: 150, boss: 300 }[e.kind] ?? 0;
          xp += r.mode === "coleccion" && r.heroId ? { normal: 25, elite: 63, boss: 125 }[e.kind] ?? 0 : 0;
          n++;
        }
        this.coins += coins;
        this.paidCoins += coins;
        if (xp > 0) this.paidXp.push({ p_character_id: r.heroId, p_xp: xp });
        const nodes = Number(st.nodes);
        const turns = Number(st.turns);
        const key = `${player}:${r.mode}`;
        const best = this.scores[key];
        if (nodes > 0 && (!best || nodes > best.nodes || (nodes === best.nodes && turns < best.turns)))
          this.scores[key] = { nodes, turns };
        for (const x of ((st.seen as { relics?: string[] })?.relics ?? [])) this.codex.relics.add(x);
        for (const x of ((st.seen as { events?: string[] })?.events ?? [])) this.codex.events.add(x);
        r.state = st;
        r.revision = Number(st.revision);
        r.nodes = nodes;
        r.turns = turns;
        r.actions += Number(a.p_added);
        r.lastBatch = a.p_batch;
        r.status = st.phase === "ended" ? "ended" : st.phase === "suspended" ? "suspended" : "active";
        r.endReason = r.status === "ended" ? String((st.end as { reason: string }).reason) : null;
        this.commits++;
        return this.okv({ season: false, revision: r.revision, status: r.status, prize: { nodes: n, coins, xp } });
      }
      default:
        return this.okv({ relics: [...this.codex.relics], events: [...this.codex.events], best: null, history: [] });
    }
  }

  private handle(name: string, a: Args): RpcResult {
    this.calls.push({ name, args: a });
    switch (name) {
      case "rate_limit_hit":
        return this.okv({ allowed: !this.rateLimited, hits: 1 });
      case "log_audit":
        this.audits.push(String(a.p_event));
        return this.okv(null);
      case "get_profile":
        return this.okv({
          name: "Ana",
          isAdmin: false,
          stateVersion: this.version,
          coins: this.coins,
          pity: this.pity,
          pitySsr: this.pitySsr,
          escamas: this.escamas,
          dados: this.dados,
          characters: this.rows
            .filter((r) => r.kind === "char")
            .map((r) => ({
              id: r.key,
              classId: r.a,
              element: r.element,
              rarity: r.rarity,
              stars: r.stars,
              data: r.data,
            })),
          weapons: this.rows
            .filter((r) => r.kind === "weap")
            .map((r) => ({
              id: r.key,
              type: r.a,
              element: r.element,
              rarity: r.rarity,
              stars: r.stars,
              data: r.data,
            })),
          dungeonProgress: this.dungeons,
          equipped: this.equipped,
          bestFloor: 0,
          classMastery: this.classMastery,
          loadouts: this.loadouts,
          levelLoadouts: this.levelLoadouts,
        });
      case "set_loadout": {
        const skills = a.p_skills as string[];
        if (a.p_scope === "level") this.levelLoadouts[String(a.p_key)] = skills;
        else this.loadouts[String(a.p_key)] = skills;
        return this.okv({ scope: a.p_scope, key: a.p_key, skills });
      }
      case "start_level": {
        const h = a.p_hero as Args;
        this.run = {
          seed: Number(a.p_seed),
          hero: {
            ...h,
            kind: "level",
            route: a.p_route,
            difficulty: a.p_difficulty,
            level: a.p_level,
            asc: a.p_asc,
            heroId: a.p_character_id,
          },
          status: "open",
          startedAt: Date.now(),
        };
        this.levelStarts.push(a);
        return this.okv({ run_id: "00000000-0000-4000-8000-000000000002" });
      }
      case "bank_level":
        this.levelBanks.push(a);
        if (this.run) this.run.status = "closed";
        return this.okv({
          cleared: a.p_status === "cleared" && a.p_verdict !== "rejected",
          repeat: a.p_repeat,
          coins: 25,
          chest: 0,
          xp: a.p_verdict === "rejected" ? 0 : a.p_xp,
          levelsGained: 0,
          newLevel: 1,
          dungeonDone: false,
          escamas: 0,
          dados: a.p_dados,
          verdict: a.p_verdict,
        });
      case "grant_hero_xp":
        this.xpGrants.push(a);
        return this.okv({ xp: a.p_xp, level: 1, gained: 0, applied: true });
      case "burn_item":
      case "burn_hero":
        this.burned.push({ name, ...a });
        if (a.p_version !== this.version) return this.err("conflict");
        this.rows = this.rows.filter((r) => r.key !== a.p_key);
        this.version++;
        return this.okv({ burned: a.p_key });
      case "apply_hero_change": {
        // Mirrors 0050: one atomic write-set (upserts, then deletes), optimistic version.
        if (a.p_version !== this.version) return this.err("conflict");
        if (this.coins < Number(a.p_coins)) return this.err("insufficient_coins");
        this.heroChanges.push(a);
        for (const h of a.p_upsert as Args[]) {
          const key = `c-${h.class}-${h.element}-${h.rarity}`;
          const row: Row = {
            key,
            kind: "char",
            a: String(h.class),
            element: String(h.element),
            rarity: String(h.rarity),
            stars: Number(h.stars),
            data: {
              ...(h.data as object),
              level: h.level,
              xp: h.xp,
              legacy: h.legacy,
              copies: h.copies,
            },
          };
          const i = this.rows.findIndex((r) => r.key === key);
          if (i >= 0) this.rows[i] = row;
          else this.rows.push(row);
        }
        const gone = new Set(a.p_delete as string[]);
        this.rows = this.rows.filter((r) => !gone.has(r.key));
        this.coins -= Number(a.p_coins);
        this.version++;
        return this.okv({ coins: this.coins, version: this.version });
      }
      case "apply_piece_change": {
        // Mirrors 0053: one atomic write-set for pieces (upserts, then deletes), optimistic version.
        if (a.p_version !== this.version) return this.err("conflict");
        if (this.coins < Number(a.p_coins)) return this.err("insufficient_coins");
        this.pieceChanges.push(a);
        for (const w of a.p_upsert as Args[]) {
          const key = `w-${w.type}-${w.element}-${w.rarity}`;
          const row: Row = {
            key,
            kind: "weap",
            a: String(w.type),
            element: String(w.element),
            rarity: String(w.rarity),
            stars: Number(w.stars),
            data: {
              name: w.name,
              roll: w.roll,
              lines: w.lines,
              legacy: w.legacy,
              plus: w.plus,
              plusStreak: w.plusStreak,
              copies: w.copies,
            },
          };
          const i = this.rows.findIndex((r) => r.key === key);
          if (i >= 0) this.rows[i] = row;
          else this.rows.push(row);
        }
        const gone = new Set(a.p_delete as string[]);
        this.rows = this.rows.filter((r) => !gone.has(r.key));
        this.coins -= Number(a.p_coins);
        this.version++;
        return this.okv({ coins: this.coins, version: this.version });
      }
      case "apply_pull": {
        const idem = String(a.p_idem);
        if (this.idem.has(idem))
          return this.okv({
            ...(this.idem.get(idem) as object),
            replayed: true,
          });
        if (this.conflictOnce) {
          this.conflictOnce = false;
          this.version++;
          return this.err("conflict");
        }
        if (a.p_version !== this.version) return this.err("conflict");
        if (this.coins < Number(a.p_cost))
          return this.err("insufficient_coins");
        this.coins -= Number(a.p_cost);
        this.version++;
        this.pity[a.p_banner as "character" | "weapon"] = Number(a.p_pity);
        this.pitySsr[a.p_banner as "character" | "weapon"] = Number(
          a.p_pity_ssr,
        );
        for (const it of a.p_items as Args[]) {
          const kind = it.class ? "char" : "weap";
          const k = `${kind === "char" ? "c" : "w"}-${it.class ?? it.type}-${it.element}-${it.rarity}`;
          const have = this.rows.find((r) => r.key === k);
          if (have) have.stars = Math.min(5, have.stars + 1);
          else
            this.rows.push({
              key: k,
              kind,
              a: String(it.class ?? it.type),
              element: String(it.element),
              rarity: String(it.rarity),
              stars: 0,
              data: it.data,
            });
        }
        const res = {
          replayed: false,
          coins: this.coins,
          version: this.version,
          pity: a.p_pity,
        };
        this.idem.set(idem, res);
        return this.okv(res);
      }
      case "apply_upgrade":
        if (a.p_version !== this.version) return this.err("conflict");
        this.forged.push({ name, ...a });
        this.version++;
        return this.okv({ coins: this.coins, version: this.version });
      case "bank_run":
        this.banked.push(a);
        if (this.run) this.run.status = "closed";
        return this.okv({
          coinsAdded: a.p_coins,
          coins: 0,
          bestFloor: a.p_max_floor,
          capped: false,
        });
      case "start_run":
        return this.okv({ run_id: "00000000-0000-4000-8000-000000000001" });
      case "get_weekly_seed":
        return this.okv({ week: "2026-10-05", seed: 777 });
      case "tower_record":
        this.towerRecords.push(a);
        return this.okv({
          week: "2026-10-05",
          max_floor: a.p_floor,
          prize: { floors: Number(a.p_floor), coins: 5, dados: 0 },
        });
      case "tower_state":
        return this.okv({ week: "2026-10-05", modes: {}, last: {} });
      case "tower_run_current":
      case "tower_run_end":
      case "tower_run_create":
      case "tower_run_commit":
      case "tower_codex_get":
        return this.tower(name, a);
      case "mission_get": {
        const sc = (progress: Record<string, number>) => ({
          progress,
          claimed: 0,
          rerolled: null,
        });
        return this.okv({
          day: "2026-10-07", // a Wednesday: no event
          week: "2026-10-05",
          daily: sc(this.missionProgress),
          weekly: sc(this.missionProgress),
          event: sc({}),
        });
      }
      case "best_cleared_rank":
        return this.okv(this.bestRank);
      case "mission_claim":
        this.missionClaims.push(a);
        return this.okv({ coins: 0, dados: 0, pieces: 0, claimed: a.p_reached });
      case "sync_tutorial":
        return this.okv(7);
      case "get_streak":
        return this.okv(null);
      case "settle_daily_streak":
        return this.okv({ streak: 1, bonus: 0 });
      default:
        throw new RpcError(`unexpected rpc ${name}`);
    }
  }
}

// (methods of FakeDb are declared above; the tower twin lives in a prototype extension below)
// Plays a simple deterministic bot through the tower engine and returns its log.
export function playBot(
  seed: number,
  hero: Character,
  maxActions = 400,
): StageAction[] {
  let s = startTower(seed, hero);
  const log: StageAction[] = [];
  const push = (a: StageAction): boolean => {
    const n = applyTowerAction(s, a);
    if (!n) return false;
    s = n;
    log.push(a);
    return true;
  };
  while (log.length < maxActions && s.climb.status === "active") {
    const done = s.rs.settled
      ? push({ t: "fin" })
      : push({ t: "act", a: "attack1" }) || push({ t: "act", a: "defend" });
    if (!done) break;
  }
  return log;
}


/** A character row (as get_profile returns it) from a generated hero, optionally stronger. */
export function heroRow(
  c: Character,
  rank: RarityId = "f",
  power = 1,
): Row {
  return {
    key: `c-${c.classId}-${c.element}-${rank}`,
    kind: "char",
    a: c.classId,
    element: c.element,
    rarity: rank,
    stars: 0,
    data: {
      name: c.name,
      stats: {
        ...c.stats,
        hp: c.stats.hp * power,
        atk: c.stats.atk * power,
        def: c.stats.def * power,
      },
      // Persist the generated H1 factors with simulated server rows. Keep a
      // neutral valid profile for hand-built Character fixtures.
      factors: (c as Character & { factors?: HeroFactors }).factors ?? {
        hp: 1,
        atk: 1,
        def: 1,
        crit: 1,
        speed: 1,
      },
      traits: c.traits,
      catchphrase: c.catchphrase,
      level: 1,
      xp: 0,
    },
  };
}

/** Plays a dungeon level with a simple bot (attack, else defend) and returns the log. */
export function playLevelBot(
  seed: number,
  hero: Character,
  rank: RarityId,
  level: number,
  asc = 0,
  maxActions = 600,
): StageAction[] {
  let s = initialStageReplay(seed, hero, levelFights(levelsOf("lord_of_flies", rank)[level], asc), asc, defaultLoadout(hero.classId));
  const log: StageAction[] = [];
  const push = (a: StageAction): boolean => {
    const n = applyStageAction(s, a);
    if (!n) return false;
    s = n;
    log.push(a);
    return true;
  };
  while (log.length < maxActions && s.stage.status === "playing") {
    const ok = s.settled
      ? push({ t: "fin" })
      : push({ t: "act", a: "attack1" }) || push({ t: "act", a: "defend" });
    if (!ok) break;
  }
  return log;
}
