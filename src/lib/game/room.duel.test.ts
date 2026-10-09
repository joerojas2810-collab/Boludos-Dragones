import { describe, expect, it } from "vitest";
import {
  ROOM_K as K,
  advance,
  autoPairs,
  can,
  chipSupply,
  chooseDuelPick,
  closeRoom,
  createRoomState,
  joinRoom,
  leaveRoom,
  placeDuelBet,
  reportDuel,
  setReady,
  startDuels,
  type Result,
  type RoomState,
} from "./room";

const [A, B, C, D] = ["a", "b", "c", "d"];
const T0 = 1_000_000;
const ok = (r: Result): RoomState => {
  if (!r.ok) throw new Error("expected ok, got " + r.error);
  return r.state;
};
const err = (r: Result) => (r.ok ? "ok" : r.error);
const lobby = (ids = [A, B, C, D]) => {
  let s = createRoomState(ids[0], T0);
  for (const id of ids.slice(1)) s = ok(joinRoom(s, id, T0));
  return s;
};
const next = (s: RoomState) => {
  const r = advance(s, Math.max(s.deadline, T0), s.phaseSeq);
  if (!r.ok || !r.advanced) throw new Error("no advance from " + s.phase);
  return r.state;
};
const pick = { classId: "mago", element: "agua" } as const;
/** A vs B with C and D watching, up to the betting phase. */
function toBetting(mode: "balanceado" | "real" = "balanceado") {
  let s = ok(startDuels(lobby(), A, T0, mode, [[A, B]]));
  const p = mode === "real" ? { heroId: "h1" } : pick;
  s = ok(chooseDuelPick(s, A, p));
  s = ok(chooseDuelPick(s, B, p));
  return next(s);
}
const supplyOk = (s: RoomState) => {
  const { held, expected } = chipSupply(s);
  expect(held).toBe(expected);
};

describe("room duels", () => {
  it("only the host starts, with valid disjoint present pairs", () => {
    const s = lobby();
    expect(err(startDuels(s, B, T0, "balanceado", [[A, B]]))).toBe("forbidden");
    expect(err(startDuels(s, A, T0, "balanceado", [[A, A]]))).toBe("invalid_args");
    expect(err(startDuels(s, A, T0, "balanceado", [[A, B], [B, C]]))).toBe("invalid_args");
    expect(err(startDuels(s, A, T0, "balanceado", [[A, "zz"]]))).toBe("not_member");
    expect(err(startDuels(s, A, T0, "balanceado", []))).toBe("not_enough_players");
    expect(ok(startDuels(s, A, T0, "balanceado", [[A, B]])).phase).toBe("duel_setup");
  });

  it("autoPairs pairs neighbours by chips and leaves the odd one out", () => {
    expect(autoPairs(lobby([A, B, C])).length).toBe(1);
    expect(autoPairs(lobby()).length).toBe(2);
  });

  it("pick validation follows the duel mode; only duelists pick", () => {
    const s = ok(startDuels(lobby(), A, T0, "balanceado", [[A, B]]));
    expect(can(s, C, "choose_duel_pick")).toBe(false);
    expect(err(chooseDuelPick(s, C, pick))).toBe("not_active");
    expect(err(chooseDuelPick(s, A, { heroId: "h" }))).toBe("invalid_args");
    expect(err(chooseDuelPick(s, A, { classId: "x", element: "agua" } as never))).toBe("invalid_args");
    const r = ok(startDuels(lobby(), A, T0, "real", [[A, B]]));
    expect(err(chooseDuelPick(r, A, pick))).toBe("invalid_args");
    expect(ok(chooseDuelPick(r, A, { heroId: "h" })).players[0].duelPick).toEqual({ heroId: "h" });
  });

  it("full flow: bets settle, winner gets the prize, back to the lobby", () => {
    let s = toBetting();
    expect(s.phase).toBe("duel_betting");
    const key = s.duels[0].key;
    expect(err(placeDuelBet(s, A, key, "win", 20))).toBe("self_bet");
    expect(err(placeDuelBet(s, C, key, "win", 1))).toBe("stake_too_low");
    s = ok(placeDuelBet(s, C, key, "win", 20));
    s = ok(placeDuelBet(s, D, key, "lose", 20));
    expect(err(placeDuelBet(s, C, key, "lose", 20))).toBe("duplicate_bet");
    supplyOk(s);
    s = ok(setReady(s, C));
    s = ok(setReady(s, D));
    s = next(s); // locks -> duel_fight
    expect(s.phase).toBe("duel_fight");
    expect(err(placeDuelBet(s, D, key, "win", 20))).toBe("wrong_phase");
    expect(err(reportDuel(s, C, key, A, "ko"))).toBe("not_active");
    s = ok(reportDuel(s, A, key, A, "ko"));
    s = ok(reportDuel(s, B, key, B, "ko")); // first report wins
    expect(s.duels[0].winner).toBe(A);
    s = next(s); // settles -> duel_reveal
    expect(s.phase).toBe("duel_reveal");
    const chips = Object.fromEntries(s.players.map((p) => [p.id, p.chips]));
    expect(chips).toEqual({ a: K.initialChips + K.duelWinChips, b: K.initialChips, c: K.initialChips + 20, d: K.initialChips - 20 });
    expect(s.players[0].duelWins).toBe(1);
    supplyOk(s);
    s = next(s);
    expect(s.phase).toBe("lobby");
  });

  it("with nobody to bet it goes straight to the fight; returns to round_end", () => {
    const base = { ...lobby([A, B]), phase: "round_end" as const };
    let s = ok(startDuels(base, A, T0, "balanceado", [[A, B]]));
    s = ok(chooseDuelPick(s, A, pick));
    s = ok(chooseDuelPick(s, B, pick));
    s = next(s);
    expect(s.phase).toBe("duel_fight");
    s = ok(reportDuel(s, B, s.duels[0].key, B, "ko"));
    expect(advance(s, T0, s.phaseSeq).ok).toBe(true); // done early: all reported
    s = next(s);
    s = next(s);
    expect(s.phase).toBe("round_end");
  });

  it("slow pick gets a default; unreported duel at the cap is a draw (refund, no prize)", () => {
    let s = ok(startDuels(lobby(), A, T0, "real", [[A, B]]));
    s = next(s);
    expect(s.players[0].duelPick).toEqual({ heroId: "seed_default" });
    const key = s.duels[0].key;
    s = ok(placeDuelBet(s, C, key, "win", 30));
    s = next(s); // betting -> fight
    s = next(s); // cap -> reveal
    expect(s.duels[0]).toMatchObject({ winner: null, end: "time", outcome: "void" });
    expect(s.players.find((p) => p.id === C)!.chips).toBe(K.initialChips);
    expect(s.players[0].duelWins).toBe(0);
    supplyOk(s);
  });

  it("leaving: before the fight voids and refunds, mid-fight the rival wins", () => {
    let s = toBetting();
    const key = s.duels[0].key;
    s = ok(placeDuelBet(s, C, key, "win", 25));
    const early = ok(leaveRoom(s, B, T0));
    expect(early.duels[0]).toMatchObject({ status: "settled", outcome: "void" });
    expect(early.players.find((p) => p.id === C)!.chips).toBe(K.initialChips);
    supplyOk(early);
    s = next(s);
    const mid = ok(leaveRoom(s, B, T0));
    expect(mid.duels[0]).toMatchObject({ reported: true, winner: A, end: "forfeit" });
    const fin = next(mid);
    expect(fin.players[0].chips).toBe(K.initialChips + K.duelWinChips);
    supplyOk(fin);
  });

  it("closing the room refunds open duel bets", () => {
    let s = toBetting();
    s = ok(placeDuelBet(s, C, s.duels[0].key, "win", 25));
    const c = ok(closeRoom(s, A, T0));
    expect(c.phase).toBe("closed");
    expect(c.players.find((p) => p.id === C)!.chips).toBe(K.initialChips);
    supplyOk(c);
  });
});
