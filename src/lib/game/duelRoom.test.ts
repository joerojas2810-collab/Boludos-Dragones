import { describe, expect, it } from "vitest";
import {
  applyMove,
  decideByHp,
  duelMissions,
  liveIsStale,
  newLive,
  replayLive,
  resolveTurn,
  type DuelLive,
} from "./duelRoom";
import { balancedHero, sideToMove } from "./duel";
import { defaultLoadout } from "./skills";
import { createRoomState, type DuelMatch, type RoomState } from "./room";

const match = (o: Partial<DuelMatch> = {}): DuelMatch => ({
  key: "k", a: "a", b: "b", bets: [], status: "locked", reported: false,
  winner: null, end: null, outcome: null, ...o,
});
const st = (duels: DuelMatch[]): RoomState => ({ ...createRoomState("a", 0), duels });

describe("duelMissions", () => {
  it("credits the winner and the bettors that won, once", () => {
    const settled = match({
      status: "settled", winner: "a", outcome: "win",
      bets: [
        { bettor: "c", prediction: "win", stake: 20 },
        { bettor: "d", prediction: "lose", stake: 20 },
      ],
    });
    const out = duelMissions(st([match()]), st([settled]));
    expect(out).toEqual([
      { player: "a", key: "duel_win" },
      { player: "c", key: "bet_win" },
    ]);
    expect(duelMissions(st([settled]), st([settled]))).toEqual([]); // already counted
  });
  it("a draw or a refunded pool credits nothing", () => {
    const draw = match({ status: "settled", outcome: "void", bets: [{ bettor: "c", prediction: "win", stake: 20 }] });
    expect(duelMissions(st([match()]), st([draw]))).toEqual([]);
    const oneSided = match({ status: "settled", winner: "b", outcome: "lose", bets: [{ bettor: "c", prediction: "lose", stake: 20 }] });
    expect(duelMissions(st([match()]), st([oneSided]))).toEqual([{ player: "b", key: "duel_win" }]);
  });
});

describe("turn loop", () => {
  const live = (seed = 2) =>
    newLive(
      seed,
      { a: balancedHero("mago", "agua"), b: balancedHero("caballero", "fuego") },
      { a: defaultLoadout("mago"), b: defaultLoadout("caballero") },
      0,
      30_000,
    );
  const here = { a: true, b: true };
  const toMove = (l: DuelLive) => sideToMove(replayLive(l).battle)!;

  it("only the side to move acts, and a move opens the next 30 s turn", () => {
    const l = live();
    const side = toMove(l);
    const other = side === "a" ? "b" : "a";
    expect(applyMove(l, other, "attack1", 5_000, 30_000)).toBe("not_turn");
    expect(applyMove(l, side, side === "a" ? "mage_detonate" : "knight_breaker", 5_000, 30_000)).toBe("illegal"); // costs 2, resource 0
    const r = applyMove(l, side, "defend", 5_000, 30_000);
    if (r === "not_turn" || r === "illegal") throw new Error(r);
    expect(r.live.history).toEqual([{ side, act: "defend" }]);
    expect(r.live.deadline).toBe(35_000);
    expect(r.live.missed[side]).toBe(0);
  });

  it("waits until the deadline, then plays Defender for the silent side", () => {
    const l = live();
    const side = toMove(l);
    expect(resolveTurn(l, 1_000, 30_000, here)).toBeNull();
    const r = resolveTurn(l, 31_000, 30_000, here)!;
    expect(r.live.history).toEqual([{ side, act: "defend", auto: true }]);
    expect(r.live.missed[side]).toBe(1);
    expect(r.live.deadline).toBe(61_000);
  });

  it("never waits for an absent player and flees after two missed own turns", () => {
    let l = live();
    const absent = toMove(l);
    const h = { a: absent !== "a", b: absent !== "b" };
    let over = null as ReturnType<typeof resolveTurn>;
    for (let i = 0; i < 20 && !over?.over; i++) {
      if (toMove(l) === absent) {
        over = resolveTurn(l, 10 + i, 30_000, h);
        l = over!.live;
      } else {
        const r = applyMove(l, toMove(l), "defend", 10 + i, 30_000);
        if (typeof r === "string") throw new Error(r);
        l = r.live;
      }
    }
    expect(over?.over).toEqual({ winner: absent === "a" ? "b" : "a", end: "forfeit" });
  });

  it("is deterministic from the log and rejects a stale engine version", () => {
    let l = live();
    for (let i = 0; i < 6; i++) {
      const r = applyMove(l, toMove(l), i % 2 ? "defend" : "attack1", i, 30_000);
      if (typeof r === "string") throw new Error(r);
      l = r.live;
    }
    const x = replayLive(l).battle;
    const y = replayLive(structuredClone(l)).battle;
    expect(x.log).toEqual(y.log);
    expect(x.player.hp).toBe(y.player.hp);
    expect(liveIsStale(l)).toBe(false);
    expect(() => replayLive({ ...l, v: l.v - 1 })).toThrow("engine_outdated");
  });

  it("the cap is decided by hp fraction (equal = draw)", () => {
    const b = replayLive(live()).battle;
    expect(decideByHp(b)).toEqual({ winner: null, end: "draw" });
    const hurt = { ...b, player: { ...b.player, hp: 1 } };
    expect(decideByHp(hurt)).toEqual({ winner: "b", end: "time" });
  });
});
