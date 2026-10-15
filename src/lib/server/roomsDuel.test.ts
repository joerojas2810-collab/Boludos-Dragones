import { describe, expect, it } from "vitest";
import { overlayDuel, type DuelDb } from "../game/duelRoom";
import {
  createRoomState,
  joinRoom,
  ROOM_K as K,
  type RoomState,
} from "../game/room";
import { RpcError } from "./rpc";
import {
  duelAdvanceService,
  duelBetService,
  duelMoveService,
  duelOnDeparture,
  duelPickService,
  duelStartService,
  duelTick,
  duelViewOf,
} from "./roomsDuel";
import type { DuelSaveOpts, RoomDeps, RoomStore } from "./roomsStore";

const [A, B, C, D] = ["a", "b", "c", "d"];
const R = "room";

/** In-memory twin of the SQL side: version check, chip deltas, phase move. */
function harness(ids = [A, B, C, D]) {
  let base = createRoomState(A, 1_000);
  for (const id of ids.slice(1)) {
    const r = joinRoom(base, id, 1_000);
    if (r.ok) base = r.state;
  }
  let db: DuelDb | null = null;
  let version = 0;
  let clock = 1_000;
  const store = {
    loadState: async () => overlayDuel(structuredClone(base), db),
    loadMeta: async () => ({
      code: "ABCD",
      names: { a: "Ana", b: "Beto", c: "Carla", d: "Dani" } as Record<string, string>,
    }),
    loadDuel: async () => (db ? { version, db: structuredClone(db) } : null),
    saveDuel: async (_r: string, ev: number, ndb: DuelDb, o: DuelSaveOpts) => {
      if (ev !== version) throw new RpcError("conflict");
      if (o.phase && o.phase.expectedSeq !== base.phaseSeq) throw new RpcError("stale");
      for (const x of o.deltas) {
        const p = base.players.find((q) => q.id === x.player)!;
        if (p.chips + x.delta < 0) throw new RpcError("insufficient_chips");
        p.chips += x.delta;
      }
      version++;
      db = structuredClone(ndb);
      if (o.phase) {
        base.phase = o.phase.to;
        base.phaseSeq++;
        base.deadline = o.phase.deadlineMs;
        for (const p of base.players) p.ready = false;
      }
    },
  } as unknown as RoomStore;
  const d: RoomDeps = {
    store,
    broadcast: async () => {},
    loadProfile: async () => ({ profile: {} as never, name: "x" }),
    randomSeed: () => 987_654,
    randomCode: () => "ABCD",
    now: () => clock,
  };
  const st = () => store.loadState(R) as Promise<RoomState>;
  const adv = async () => duelAdvanceService(d, R, (await st()).phaseSeq);
  const after = async () => {
    clock = (await st()).deadline + 1;
  };
  return { d, st, adv, after, at: (t: number) => (clock = t), base: () => base, db: () => db, get clock() { return clock; } };
}
const pick = { classId: "mago", element: "agua" } as const;
type H = ReturnType<typeof harness>;
const view = async (h: H, who = A) => (await duelViewOf(h.d, await h.st(), R, who))!.matches[0].fight!;
/** Id of the duelist whose decision is pending (a = first of the pair). */
const mover = async (h: H) => {
  const f = await view(h);
  const m = (await h.st()).duels[0];
  return f.toMove === "a" ? m.a : m.b;
};
/** Both duelists attack in turn until the verdict (or `max` decisions). */
async function playOut(h: H, key: string, max = 400) {
  for (let i = 0; i < max && !(await h.st()).duels[0].reported; i++)
    await duelMoveService(h.d, await mover(h), R, key, "attack1");
}
const total = (s: RoomState) => s.players.reduce((a, p) => a + p.chips, 0);

describe("duel services", () => {
  it("full night: start, picks, bets, alternating turns, payout, back to the lobby", async () => {
    const h = harness();
    await duelStartService(h.d, A, R, "balanceado", [[A, B]]);
    await duelPickService(h.d, A, R, pick);
    await duelPickService(h.d, B, R, { classId: "caballero", element: "fuego" });
    expect((await h.adv()).advanced).toBe(true); // everybody picked -> betting
    let s = await h.st();
    expect(s.phase).toBe("duel_betting");
    const key = s.duels[0].key;
    await duelBetService(h.d, C, R, key, "win", 20);
    await duelBetService(h.d, D, R, key, "lose", 20);
    await expect(duelBetService(h.d, A, R, key, "win", 20)).rejects.toThrow("self_bet");
    // bets are private until the duel locks
    const mine = await duelViewOf(h.d, await h.st(), R, C);
    expect(mine!.matches[0].bets.map((b) => b.bettor)).toEqual([C]);
    await h.after();
    expect((await h.adv()).advanced).toBe(true); // locks -> fight
    s = await h.st();
    expect(s.phase).toBe("duel_fight");
    // public, turn-based state: someone is to move, with their skills, queue and no secrets
    let f = await view(h, B);
    expect(f.n).toBe(0);
    expect(f.toMove).not.toBeNull();
    expect(f.loadouts.a).toEqual(["mage_inscribe", "mage_detonate"]);
    expect(f.queue.length).toBe(6);
    const first = await mover(h);
    const second = first === A ? B : A;
    await expect(duelMoveService(h.d, C, R, key, "attack1")).rejects.toThrow("battle_not_found");
    await duelMoveService(h.d, second, R, key, "attack1", 0); // not your turn: ignored
    expect((await view(h)).n).toBe(0);
    await expect(duelMoveService(h.d, first, R, key, "mage_detonate" as never)).rejects.toThrow(); // other class or no resource
    await duelMoveService(h.d, first, R, key, "attack1", 0);
    f = await view(h);
    expect(f.n).toBe(1);
    expect(f.last).toMatchObject({ side: first === A ? "a" : "b", action: "attack1", auto: false });
    await duelMoveService(h.d, first, R, key, "attack1", 0); // stale n: ignored
    expect((await view(h)).n).toBe(1);
    await playOut(h, key);
    s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(["ko", "time", "draw"]).toContain(s.duels[0].end);
    expect((await h.adv()).advanced).toBe(true); // all reported -> settle + reveal
    s = await h.st();
    expect(s.phase).toBe("duel_reveal");
    expect(s.duels[0].status).toBe("settled");
    // stakes come back through the pool; the only new chips are the prize
    const won = s.duels[0].winner !== null;
    expect(total(s)).toBe(4 * K.initialChips + (won ? K.duelWinChips : 0) - s.totals.dust);
    await h.after();
    await h.adv();
    expect((await h.st()).phase).toBe("lobby");
  });

  it("the fight log names the players, not their classes", async () => {
    const h = harness([A, B]);
    await duelStartService(h.d, A, R, "balanceado");
    await duelPickService(h.d, A, R, { classId: "mago", element: "agua" });
    await duelPickService(h.d, B, R, { classId: "caballero", element: "fuego" });
    await h.adv(); // no fans -> fight
    const key = (await h.st()).duels[0].key;
    await duelMoveService(h.d, await mover(h), R, key, "defend");
    const f = await view(h, A);
    expect(f.heroes.a.name).toBe("Ana");
    expect(f.heroes.b.name).toBe("Beto");
    const text = f.log.join(" ");
    expect(text).toContain("Ana");
    expect(text).not.toMatch(/Mago|Caballero/);
  });

  it("picks carry a validated loadout: class, duplicates and unlocks", async () => {
    const h = harness([A, B]);
    await duelStartService(h.d, A, R, "balanceado");
    const bad = (loadout: [string, string]) => duelPickService(h.d, A, R, { classId: "mago", element: "agua", loadout });
    await expect(bad(["knight_advance", "knight_breaker"])).rejects.toThrow("invalid_args");
    await expect(bad(["mage_seal", "mage_seal"])).rejects.toThrow("invalid_args");
    await duelPickService(h.d, A, R, { classId: "mago", element: "agua", loadout: ["mage_barrier", "mage_seal"] }); // balanced: all four open
    await duelPickService(h.d, B, R, { classId: "caballero", element: "fuego" }); // default loadout
    await h.adv();
    const f = await view(h);
    expect(f.loadouts.a).toEqual(["mage_barrier", "mage_seal"]);
    expect(f.loadouts.b).toEqual(["knight_advance", "knight_breaker"]);
  });

  it("an absent duelist never holds the turn and forfeits after two missed turns", async () => {
    const h = harness([A, B, C]);
    await duelStartService(h.d, A, R, "real", [[A, B]]);
    await duelPickService(h.d, A, R, { heroId: "seed_default" });
    await h.after();
    await h.adv(); // defaults B, -> betting (C watches)
    await h.after();
    await h.adv(); // -> fight
    const key = (await h.st()).duels[0].key;
    h.base().players.find((p) => p.id === B)!.present = false;
    for (let i = 0; i < 6 && !(await h.st()).duels[0].reported; i++) {
      await duelTick(h.d, R); // B's turn is answered for them at once
      if ((await h.st()).duels[0].reported) break;
      await duelMoveService(h.d, A, R, key, "attack1");
    }
    const s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(["forfeit", "ko"]).toContain(s.duels[0].end);
    expect(s.duels[0].winner).toBe(A);
  });

  it("overdue turns resolve from a plain tick with the Defender fallback", async () => {
    const h = harness([A, B]);
    await duelStartService(h.d, A, R, "balanceado");
    await h.after();
    await h.adv(); // no fans -> straight to the fight
    expect((await h.st()).phase).toBe("duel_fight");
    const first = await view(h);
    h.at(h.clock + 31_000);
    await duelTick(h.d, R); // nobody answered: Defender for the side to move
    const f = await view(h);
    expect(f.n).toBe(1);
    expect(f.last).toMatchObject({ action: "defend", auto: true });
    expect(f.last!.side).toBe(first.toMove);
    for (let i = 0; i < 6 && !(await h.st()).duels[0].reported; i++) {
      h.at(h.clock + 31_000);
      await duelTick(h.d, R);
    }
    const s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(s.duels[0].end).toBe("forfeit"); // two missed turns in a row
    expect(s.duels[0].winner).not.toBeNull();
  });

  it("a duel started on another engine version is voided, never replayed", async () => {
    const h = harness([A, B]);
    await duelStartService(h.d, A, R, "balanceado");
    await h.after();
    await h.adv();
    const key = (await h.st()).duels[0].key;
    h.db()!.live[key].v -= 1;
    await expect(duelMoveService(h.d, A, R, key, "attack1")).rejects.toThrow("engine_outdated");
    expect((await duelViewOf(h.d, await h.st(), R, A))!.matches[0].fight).toBeNull();
    await duelTick(h.d, R);
    const s = await h.st();
    expect(s.duels[0]).toMatchObject({ reported: true, winner: null, end: "no_fight" });
  });

  it("leaving mid-fight: the rival wins and the bets are paid", async () => {
    const h = harness();
    await duelStartService(h.d, A, R, "balanceado", [[A, B]]);
    await h.after();
    await h.adv();
    const key = (await h.st()).duels[0].key;
    await duelBetService(h.d, C, R, key, "win", 30);
    await duelBetService(h.d, D, R, key, "lose", 30);
    await h.after();
    await h.adv();
    await duelOnDeparture(h.d, R, B, "leave");
    const s = await h.st();
    expect(s.duels[0]).toMatchObject({ reported: true, winner: A, end: "forfeit" });
    await h.adv();
    const fin = await h.st();
    expect(fin.players.find((p) => p.id === C)!.chips).toBe(K.initialChips + 30);
    expect(fin.players.find((p) => p.id === D)!.chips).toBe(K.initialChips - 30);
  });

  it("a stale phaseSeq changes nothing", async () => {
    const h = harness();
    await duelStartService(h.d, A, R, "balanceado", [[A, B]]);
    const r = await duelAdvanceService(h.d, R, 0);
    expect(r).toEqual({ advanced: false, reason: "stale" });
  });
});

describe("nivelado hero keys", () => {
  it("the round hero is the plain class + element the player picked", async () => {
    const { heroForRound } = await import("./roomRun");
    const h = heroForRound({} as never, "pick:mago:agua", "nivelado", 1, "p");
    expect(h).toMatchObject({
      classId: "mago",
      element: "agua",
      rarity: "d",
      stars: 0,
      level: 1,
      traits: [],
    });
    const same = heroForRound({} as never, "pick:mago:agua", "nivelado", 99, "q");
    expect(same.stats).toEqual(h.stats); // same power for everybody
  });
});
