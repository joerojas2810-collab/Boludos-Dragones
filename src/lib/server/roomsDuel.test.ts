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
  return { d, st, adv, after, at: (t: number) => (clock = t), base: () => base, get clock() { return clock; } };
}
const pick = { classId: "mago", element: "agua" } as const;
const total = (s: RoomState) => s.players.reduce((a, p) => a + p.chips, 0);

describe("duel services", () => {
  it("full night: start, picks, bets, secret moves, payout, back to the lobby", async () => {
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
    // a pick is secret: the view only says who answered
    await duelMoveService(h.d, A, R, key, "attack1");
    let v = (await duelViewOf(h.d, await h.st(), R, B))!.matches[0].fight!;
    expect(v.picked).toEqual({ a: true, b: false });
    expect(v.turn).toBe(1);
    await expect(duelMoveService(h.d, C, R, key, "attack1")).rejects.toThrow("battle_not_found");
    await duelMoveService(h.d, B, R, key, "attack1"); // both answered -> resolves
    v = (await duelViewOf(h.d, await h.st(), R, B))!.matches[0].fight!;
    expect(v.turn).toBe(2);
    expect(v.last).toEqual({ a: "attack1", b: "attack1" });
    for (let i = 0; i < 80 && !(await h.st()).duels[0].reported; i++) {
      await duelMoveService(h.d, A, R, key, "attack1");
      await duelMoveService(h.d, B, R, key, "attack1");
    }
    s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(["ko", "draw"]).toContain(s.duels[0].end);
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
    await duelMoveService(h.d, A, R, key, "attack1");
    await duelMoveService(h.d, B, R, key, "defend");
    const f = (await duelViewOf(h.d, await h.st(), R, A))!.matches[0].fight!;
    expect(f.heroes.a.name).toBe("Ana");
    const text = f.log.join(" ");
    expect(text).toContain("Ana");
    expect(text).toContain("Beto se defiende");
    expect(text).not.toMatch(/Mago|Caballero/);
  });

  it("an absent duelist never holds the turn and forfeits after two misses", async () => {
    const h = harness([A, B, C]);
    await duelStartService(h.d, A, R, "real", [[A, B]]);
    await duelPickService(h.d, A, R, { heroId: "seed_default" });
    await h.after();
    await h.adv(); // defaults B, -> betting (C watches)
    await h.after();
    await h.adv(); // -> fight
    const key = (await h.st()).duels[0].key;
    h.base().players.find((p) => p.id === B)!.present = false;
    await duelMoveService(h.d, A, R, key, "attack1"); // resolves at once: B is away
    const f = (await duelViewOf(h.d, await h.st(), R, A))!.matches[0].fight!;
    expect(f.turn).toBe(2);
    await duelMoveService(h.d, A, R, key, "attack1"); // 2nd miss -> forfeit (unless A already won)
    const s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(["forfeit", "ko"]).toContain(s.duels[0].end);
    expect(s.duels[0].winner).toBe(A);
  });

  it("overdue turns resolve from a plain tick (nobody answered)", async () => {
    const h = harness([A, B]);
    await duelStartService(h.d, A, R, "balanceado");
    await h.after();
    await h.adv(); // no fans -> straight to the fight
    expect((await h.st()).phase).toBe("duel_fight");
    h.at(h.clock + 31_000);
    await duelTick(h.d, R); // turn 1 unanswered by both
    h.at(h.clock + 31_000);
    await duelTick(h.d, R); // turn 2: both forfeit
    const s = await h.st();
    expect(s.duels[0].reported).toBe(true);
    expect(s.duels[0].end).toBe("draw"); // both forfeited at the same time
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
    expect(h).toMatchObject({ classId: "mago", element: "agua", level: 1 });
    const same = heroForRound({} as never, "pick:mago:agua", "nivelado", 99, "q");
    expect(same.stats).toEqual(h.stats); // same power for everybody
  });
});
