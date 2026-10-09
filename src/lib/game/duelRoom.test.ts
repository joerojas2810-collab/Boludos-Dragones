import { describe, expect, it } from "vitest";
import { duelMissions, resolveTurn, newLive } from "./duelRoom";
import { balancedHero } from "./duel";
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

describe("resolveTurn", () => {
  const live = () => newLive(7, { a: balancedHero("mago", "agua"), b: balancedHero("caballero", "fuego") }, 0, 30_000);
  it("waits for both picks until the deadline, then answers for the silent side", () => {
    const l = live();
    const here = { a: true, b: true };
    expect(resolveTurn({ ...l, pending: { a: "attack1" } }, 1_000, 30_000, here)).toBeNull();
    const r = resolveTurn({ ...l, pending: { a: "attack1" } }, 31_000, 30_000, here)!;
    expect(r.live.history).toEqual([["attack1", null]]);
    expect(r.live.missed).toEqual({ a: 0, b: 1 });
    expect(r.live.deadline).toBe(61_000);
  });
  it("never waits for an absent player", () => {
    const r = resolveTurn({ ...live(), pending: { a: "defend" } }, 10, 30_000, { a: true, b: false });
    expect(r?.live.history.length).toBe(1);
  });
});
