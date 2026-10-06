// Test helpers: in-memory fake of the Supabase RPC surface (no real backend).
import { applyRunAction, initialReplay, type RunAction } from "../game/replay";
import { skillOffer, upgradeOffer } from "../game/run";
import type { Character } from "../game/characters";
import { RpcError, type Deps, type RpcResult } from "./rpc";

type Args = Record<string, unknown>;
interface Row {
  key: string;
  kind: "char" | "weap";
  a: string; // class | type
  element: string;
  rarity: string;
  stars: number;
  data: unknown;
}

export class FakeDb {
  coins = 1500;
  version = 0;
  pity = { character: 0, weapon: 0 };
  rows: Row[] = [];
  idem = new Map<string, unknown>();
  calls: { name: string; args: Args }[] = [];
  conflictOnce = false;
  rateLimited = false;
  run: { seed: number; hero: unknown; status: string } | null = null;
  banked: Args[] = [];
  audits: string[] = [];

  deps: Deps = {
    rpc: async (name, args) => this.handle(name, args),
    randomSeed: () => 12345,
    openRunId: async () => null,
    getRun: async () => this.run,
  };

  private err(m: string): RpcResult {
    return { data: null, error: { message: m } };
  }
  private okv(data: unknown): RpcResult {
    return { data, error: null };
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
          equipped: {},
          fragments: {},
          bestFloor: 0,
        });
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
      default:
        throw new RpcError(`unexpected rpc ${name}`);
    }
  }
}

// Plays a simple deterministic bot through the engine and returns its log.
export function playBot(
  seed: number,
  hero: Character,
  maxActions = 400,
): RunAction[] {
  let s = initialReplay(seed, hero);
  const log: RunAction[] = [];
  const push = (a: RunAction): boolean => {
    const n = applyRunAction(s, a);
    if (!n) return false;
    s = n;
    log.push(a);
    return true;
  };
  while (log.length < maxActions && s.run.status === "active") {
    const r = s.run;
    let done = false;
    if (s.fight) {
      done = s.fight.result
        ? push({ t: "fin" })
        : push({ t: "act", a: "attack1" }) || push({ t: "act", a: "defend" });
    } else if (s.picks)
      done = r.pendingSkill
        ? push({ t: "skill", id: skillOffer(r)[0] })
        : push({ t: "pick", id: upgradeOffer(r)[0] });
    else if (r.pendingRelic) done = push({ t: "relic", id: r.pendingRelic[0] });
    else if (r.node?.type === "event") {
      for (let i = 0; i < 4 && !done; i++) done = push({ t: "event", i });
      if (!done) break;
    } else if (r.node?.type === "shop" && !s.fight) {
      for (const it of r.node.items) push({ t: "buy", id: it.id }); // may be refused
      done = push({ t: "leave" });
    } else if (r.node || r.floorCleared) done = push({ t: "leave" });
    else done = push({ t: "door", i: 0 });
    if (!done) break;
  }
  return log;
}
