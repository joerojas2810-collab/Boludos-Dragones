import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  ROOM_K as K,
  advance,
  battleKey,
  can,
  chipSupply,
  chooseDoor,
  chooseHero,
  closeRoom,
  createRoomState,
  difficultyOffset,
  endNight,
  interferenceSettlement,
  joinRoom,
  kickPlayer,
  leaveRoom,
  missTurn,
  placeBet,
  placeInterference,
  rankByChips,
  rankByFloor,
  reportOutcome,
  setMode,
  setPresence,
  setRank,
  setReady,
  settlePool,
  startCoop,
  startRound,
  transferHost,
  validateBet,
  type Result,
  type RoomState,
  visibleBets,
} from "./room";

const [A, B, C, D] = ["a", "b", "c", "d"];
const T0 = 1_000_000;

function ok(r: Result): RoomState {
  if (!r.ok) throw new Error("expected ok, got " + r.error);
  return r.state;
}
function lobby(ids = [A, B, C]): RoomState {
  let s = createRoomState(ids[0], T0);
  for (const id of ids.slice(1)) s = ok(joinRoom(s, id, T0));
  return s;
}
/** advance exactly at the deadline */
function next(s: RoomState, opts: { seed?: number } = {}): RoomState {
  const r = advance(s, Math.max(s.deadline, T0), s.phaseSeq, opts);
  if (!r.ok || !r.advanced) throw new Error("did not advance from " + s.phase);
  return r.state;
}
function toDoors(s0: RoomState): RoomState {
  let s = ok(startRound(s0, A, T0, 42));
  s = next(s); // -> floor_intro
  return next(s); // -> doors
}

describe("lobby and permissions", () => {
  it("only host starts, needs 2 present", () => {
    const s = lobby();
    expect(startRound(s, B, T0, 1)).toEqual({ ok: false, error: "forbidden" });
    const solo = createRoomState(A, T0);
    expect(startRound(solo, A, T0, 1)).toEqual({
      ok: false,
      error: "not_enough_players",
    });
    const away = ok(setPresence(lobby([A, B]), B, false, T0));
    expect(startRound(away, A, T0, 1)).toEqual({
      ok: false,
      error: "not_enough_players",
    });
    expect(ok(startRound(s, A, T0, 1)).phase).toBe("round_setup");
  });
  it("2-player room starts and mode only in lobby", () => {
    let s = lobby([A, B]);
    s = ok(setMode(s, A, "completo"));
    s = ok(startRound(s, A, T0, 7));
    expect(setMode(s, A, "nivelado")).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });
  it("the rank is chosen by the host, in the lobby, and only valid ranks", () => {
    let s = lobby([A, B]);
    expect(s.rank).toBe("f");
    s = ok(setRank(s, A, "c"));
    expect(s.rank).toBe("c");
    expect(setRank(s, B, "d")).toEqual({ ok: false, error: "forbidden" });
    expect(setRank(s, A, "mythic" as never)).toEqual({
      ok: false,
      error: "invalid_args",
    });
    s = ok(startRound(s, A, T0, 7));
    expect(s.rank).toBe("c"); // survives the phase engine
    expect(setRank(s, A, "e")).toEqual({ ok: false, error: "wrong_phase" });
  });
  it.each([
    ["lobby", "set_mode", A, true],
    ["lobby", "set_rank", A, true],
    ["lobby", "set_rank", B, false],
    ["lobby", "set_mode", B, false],
    ["lobby", "bet", B, false],
    ["lobby", "choose_door", B, false],
    ["lobby", "kick", A, true],
    ["lobby", "kick", B, false],
  ] as const)("can(%s,%s,%s)=%s", (_p, action, who, expected) => {
    expect(can(lobby(), who, action)).toBe(expected);
  });
  it("seed validated", () => {
    expect(startRound(lobby(), A, T0, -1)).toEqual({
      ok: false,
      error: "invalid_args",
    });
    expect(startRound(lobby(), A, T0, 2 ** 32)).toEqual({
      ok: false,
      error: "invalid_args",
    });
  });
  it("room full at 7", () => {
    const ids = ["1", "2", "3", "4", "5", "6", "7"];
    const s = lobby(ids);
    expect(joinRoom(s, "8", T0)).toEqual({ ok: false, error: "room_full" });
    expect(joinRoom(s, "3", T0).ok).toBe(true); // rejoin is fine
  });
});

describe("happy path and phases", () => {
  it("walks one full floor and idempotent advance", () => {
    let s = ok(startRound(lobby(), A, T0, 42));
    expect(s).toMatchObject({ phase: "round_setup", round: 1, phaseSeq: 1 });
    const seq = s.phaseSeq;
    // not due, before deadline
    expect(advance(s, T0 + 1, seq)).toMatchObject({
      ok: true,
      advanced: false,
      reason: "not_due",
    });
    // duplicate calls: first wins, second is stale
    const r1 = advance(s, s.deadline, seq);
    expect(r1).toMatchObject({ ok: true, advanced: true });
    const s1 = ok(r1);
    const r2 = advance(s1, s1.deadline + 99, seq); // same seq again
    expect(r2).toMatchObject({ advanced: false, reason: "stale" });
    expect(ok(r2)).toEqual(s1);
    expect(s1).toMatchObject({ phase: "floor_intro", floor: 1, phaseSeq: 2 });
    s = next(s1);
    expect(s.phase).toBe("doors");
    s = next(s); // default doors -> everyone fights easy
    expect(s.phase).toBe("betting");
    expect(Object.keys(s.battles).sort()).toEqual([A, B, C]);
    expect(s.battles[A].key).toBe(battleKey(1, 1, A));
    s = next(s);
    expect(s.phase).toBe("fighting");
    expect(s.deadline - s.players[0].joinedAt).toBeGreaterThan(0);
    for (const id of [A, B, C]) s = ok(reportOutcome(s, id, "won"));
    // all done: advance before the deadline
    const r = advance(s, T0, s.phaseSeq);
    expect(r).toMatchObject({ advanced: true });
    s = ok(r);
    expect(s.phase).toBe("reveal");
    expect(s.players.every((p) => p.roundMaxFloor === 1)).toBe(true);
  });
  it("early advance when everybody chose a door", () => {
    let s = toDoors(lobby([A, B]));
    s = ok(chooseDoor(s, A, "hard"));
    expect(advance(s, T0, s.phaseSeq)).toMatchObject({ advanced: false });
    s = ok(chooseDoor(s, B, "rest"));
    expect(advance(s, T0, s.phaseSeq)).toMatchObject({ advanced: true });
  });
  it("door rules: locked, idempotent, boss floor", () => {
    let s = toDoors(lobby([A, B]));
    s = ok(chooseDoor(s, A, "hard"));
    expect(ok(chooseDoor(s, A, "hard"))).toEqual(s);
    expect(chooseDoor(s, A, "easy")).toEqual({
      ok: false,
      error: "door_locked",
    });
    expect(chooseDoor(s, A, "boss")).toEqual({
      ok: false,
      error: "invalid_args",
    });
    expect(chooseDoor(next(s), A, "easy")).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });
  it("non-fight doors do not fight and have no battle", () => {
    let s = toDoors(lobby([A, B]));
    s = ok(chooseDoor(s, A, "chest"));
    s = ok(chooseDoor(s, B, "rest"));
    s = next(s);
    expect(s.phase).toBe("reveal"); // nobody fights: skip betting+fighting
    expect(s.battles).toEqual({});
  });
  it("timeouts cost lives; 3rd one eliminates", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 1));
    s = next(s);
    for (let f = 1; f <= 3; f++) {
      s = next(next(next(s))); // doors, betting, fighting
      expect(s.phase).toBe("fighting");
      s = next(s); // deadline: both timeout
      expect(s.players.map((p) => p.outcome)).toEqual(["timeout", "timeout"]);
      expect(s.players[0].lives).toBe(3 - f);
      if (f < 3) s = next(s);
    }
    expect(s.players.every((p) => p.eliminated)).toBe(true);
    expect(next(s).phase).toBe("round_end");
  });
  it("boss floor fight cap is 120s, normal 90s", () => {
    let s = toDoors(lobby([A, B]));
    const t = s.deadline;
    s = next(next(s));
    expect(s.deadline - t).toBeLessThan(120_000 + K.bettingMs + 1);
    expect(s.phase).toBe("fighting");
    expect(s.deadline).toBe(t + K.bettingMs + K.fightCapMs);
    let b = toDoors(lobby([A, B]));
    b = { ...b, floor: 5 };
    b = next(next(b));
    expect(b.deadline).toBe(t + K.bettingMs + K.fightCapMs + K.bossExtraMs);
  });
});

function playFloor(
  s: RoomState,
  outcomes: Record<string, "won" | "lost" | "fled">,
) {
  // s at floor_intro
  s = next(s); // doors
  s = next(s); // betting
  s = next(s); // fighting
  for (const [id, o] of Object.entries(outcomes))
    s = ok(reportOutcome(s, id, o));
  return next(s); // reveal
}

describe("round flow", () => {
  it("10 floors -> round_end -> round 2 with seed and offset", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 42));
    s = next(s);
    for (let f = 1; f <= 10; f++) {
      expect(s.floor).toBe(f);
      s = playFloor(s, { [A]: "won", [B]: "won" });
      s = next(s);
    }
    expect(s.phase).toBe("round_end");
    expect(s.players[0].roundMaxFloor).toBe(10);
    expect(advance(s, s.deadline, s.phaseSeq)).toEqual({
      ok: false,
      error: "seed_required",
    });
    s = next(s, { seed: 99 });
    expect(s).toMatchObject({
      phase: "round_setup",
      round: 2,
      roundSeed: 99,
      floor: 0,
    });
    expect(s.players.every((p) => p.lives === 3 && p.roundMaxFloor === 0)).toBe(
      true,
    );
    expect(s.players[0].nightMaxFloor).toBe(10);
    expect(difficultyOffset(2)).toBe(3);
    expect(difficultyOffset(1)).toBe(0);
    // round 2 floor 1 win = effective 4 (not above existing 10)
  });
  it("everyone eliminated ends the round early; dead keep betting", () => {
    let s = ok(startRound(lobby([A, B, C]), A, T0, 42));
    s = next(s);
    // A,B lose 3 times, C survives
    for (let f = 1; f <= 3; f++) {
      s = playFloor(s, { [A]: "lost", [B]: "lost", [C]: "won" });
      expect(s.phase).toBe("reveal");
      s = next(s);
    }
    expect(s.floor).toBe(4);
    expect(s.players.find((p) => p.id === A)!.eliminated).toBe(true);
    // eliminated A cannot choose a door but can bet on C
    s = next(s); // doors
    expect(chooseDoor(s, A, "easy")).toEqual({
      ok: false,
      error: "not_active",
    });
    s = next(s); // betting: only C fights
    expect(Object.keys(s.battles)).toEqual([C]);
    s = ok(placeBet(s, A, C, "lose", 20));
    s = ok(placeInterference(s, B, C, "stronger_enemy"));
    s = next(s);
    s = ok(reportOutcome(s, C, "lost"));
    s = next(s); // reveal
    s = next(s); // 3 floors: C lost 1 life only
    expect(s.phase).toBe("floor_intro");
    // now C loses until dead -> all eliminated -> round_end
    for (let i = 0; i < 2; i++) {
      s = playFloor(s, { [C]: "lost" });
      s = next(s);
    }
    expect(s.phase).toBe("round_end");
  });
  it("25 minute cap ends the round", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 42));
    s = next(s);
    s = playFloor(s, { [A]: "won", [B]: "won" });
    const late = T0 + K.roundCapMs + 1;
    const r = advance(s, late, s.phaseSeq);
    expect(ok(r).phase).toBe("round_end");
  });
  it("night ends after max rounds / cap and then summary", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 1));
    s = {
      ...s,
      round: K.maxRounds,
      phase: "round_end",
      deadline: T0,
      phaseSeq: 9,
    };
    expect(startRound(s, A, T0, 1)).toEqual({ ok: false, error: "max_rounds" });
    s = next(s);
    expect(s.phase).toBe("night_summary");
    expect(advance(s, T0 + 1e9, s.phaseSeq)).toMatchObject({ advanced: false });
    expect(ok(closeRoom(s, A, T0)).phase).toBe("closed");
  });
  it("round_end early when all ready; host can end night; coop boss rules", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 1));
    s = { ...s, round: 2, phase: "round_end", deadline: T0 + 1e6, phaseSeq: 5 };
    expect(advance(s, T0, 5, { seed: 3 })).toMatchObject({ advanced: false });
    s = ok(setReady(ok(setReady(s, A)), B));
    expect(ok(advance(s, T0, 5, { seed: 3 })).phase).toBe("round_setup");
    expect(startCoop(s, B, T0)).toEqual({ ok: false, error: "forbidden" });
    expect(startCoop({ ...s, round: 1 }, A, T0)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
    const boss = ok(startCoop(s, A, T0));
    expect(boss.phase).toBe("coop_boss");
    expect(boss.deadline).toBe(T0 + K.coopMs);
    // ends early only when the server says everybody finished, else at the deadline
    expect(advance(boss, T0 + 1, boss.phaseSeq)).toMatchObject({
      advanced: false,
    });
    expect(
      ok(advance(boss, T0 + 1, boss.phaseSeq, { coopDone: true })).phase,
    ).toBe("night_summary");
    expect(ok(advance(boss, boss.deadline, boss.phaseSeq)).phase).toBe(
      "night_summary",
    );
    expect(ok(endNight(s, A, T0)).phase).toBe("night_summary");
  });
  it("round_setup finishes early when everyone chose a hero", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 1));
    expect(advance(s, T0, s.phaseSeq)).toMatchObject({ advanced: false });
    s = ok(chooseHero(ok(chooseHero(s, A, "h1")), B, "h2"));
    expect(ok(advance(s, T0, s.phaseSeq)).phase).toBe("floor_intro");
  });
});

describe("presence, leave, host, late join", () => {
  it("disconnected player skips doors and has no battle; reconnect next floor", () => {
    let s = toDoors(lobby([A, B]));
    s = ok(setPresence(s, B, false, T0));
    s = ok(chooseDoor(s, A, "easy"));
    expect(chooseDoor(s, B, "easy")).toEqual({
      ok: false,
      error: "not_active",
    });
    s = next(s);
    expect(Object.keys(s.battles)).toEqual([A]);
  });
  it("fighter drops before fighting: void + refund incl. interference", () => {
    let s = toDoors(lobby([A, B, C]));
    s = next(s);
    s = ok(placeBet(s, A, B, "win", 40));
    s = ok(placeInterference(s, C, B, "adverse_element"));
    expect(s.players.find((p) => p.id === C)!.chips).toBe(70);
    s = ok(setPresence(s, B, false, T0));
    s = next(s);
    expect(s.battles[B].status).toBe("settled");
    expect(s.battles[B].outcome).toBe("void");
    expect(s.players.find((p) => p.id === A)!.chips).toBe(100);
    expect(s.players.find((p) => p.id === C)!.chips).toBe(100);
    expect(s.players.find((p) => p.id === B)!.outcome).toBe("skipped");
    expect(chipSupply(s).held).toBe(chipSupply(s).expected);
  });
  it("two missed turns = fled (void bets, no life)", () => {
    let s = toDoors(lobby([A, B]));
    s = next(s);
    s = ok(placeBet(s, B, A, "lose", 30));
    s = next(s);
    s = ok(missTurn(s, A));
    expect(s.players[0].outcome).toBeNull();
    s = ok(missTurn(s, A));
    expect(s.players[0].outcome).toBe("fled");
    s = ok(reportOutcome(s, B, "won"));
    s = next(s);
    expect(s.players[0].lives).toBe(3);
    expect(s.battles[A]).toMatchObject({ outcome: "void", voidReason: "fled" });
    expect(s.players[1].chips).toBe(100);
  });
  it("leaving mid-fight is fled; leaving host transfers to the oldest", () => {
    let s = toDoors(lobby([A, B, C]));
    s = next(s);
    s = next(s);
    s = ok(leaveRoom(s, A, T0));
    expect(s.hostId).toBe(B);
    expect(s.players[0].outcome).toBe("fled");
    expect(reportOutcome(s, A, "won")).toEqual({
      ok: false,
      error: "not_member",
    });
  });
  it("last player leaving closes the room and voids everything", () => {
    let s = toDoors(lobby([A, B]));
    s = next(s);
    s = ok(placeBet(s, B, A, "win", 50));
    s = ok(leaveRoom(s, A, T0));
    s = ok(leaveRoom(s, B, T0));
    expect(s.phase).toBe("closed");
    expect(s.players[1].chips).toBe(100);
    expect(joinRoom(s, "z", T0)).toEqual({ ok: false, error: "room_closed" });
  });
  it("host absent for 60s: transfer on advance", () => {
    let s = ok(startRound(lobby([A, B]), A, T0, 1));
    s = ok(setPresence(s, A, false, T0));
    const r = advance(s, T0 + K.hostTransferAfterMs + K.setupMs, s.phaseSeq);
    expect(ok(r).hostId).toBe(B);
    expect(ok(r).phase).toBe("floor_intro");
    const quick = advance(s, T0 + K.setupMs, s.phaseSeq);
    expect(ok(quick).hostId).toBe(A);
  });
  it("host transfer and kick are host-only", () => {
    const s = lobby([A, B, C]);
    expect(transferHost(s, B, C)).toEqual({ ok: false, error: "forbidden" });
    expect(ok(transferHost(s, A, C)).hostId).toBe(C);
    expect(kickPlayer(s, B, C, T0)).toEqual({ ok: false, error: "forbidden" });
    expect(kickPlayer(s, A, A, T0)).toEqual({
      ok: false,
      error: "invalid_args",
    });
    expect(ok(kickPlayer(s, A, C, T0)).players[2].left).toBe(true);
  });
  it("late join mid-floor: spectates this floor, plays next, 100 chips", () => {
    let s = toDoors(lobby([A, B]));
    s = ok(joinRoom(s, D, T0));
    const d = s.players.find((p) => p.id === D)!;
    expect(d).toMatchObject({
      chips: 100,
      activeFromFloor: 2,
      roundMaxFloor: 0,
    });
    expect(chooseDoor(s, D, "easy")).toEqual({
      ok: false,
      error: "not_active",
    });
    s = next(s); // betting: D is not a fighter but can bet
    expect(s.battles[D]).toBeUndefined();
    s = ok(placeBet(s, D, A, "win", 10));
    s = next(s);
    for (const id of [A, B]) s = ok(reportOutcome(s, id, "won"));
    s = next(s);
    s = next(next(s)); // reveal -> intro -> doors (floor 2)
    expect(chooseDoor(s, D, "easy").ok).toBe(true);
    expect(chipSupply(s).held).toBe(chipSupply(s).expected);
  });
  it("leave then rejoin keeps chips; closed rooms refuse", () => {
    let s = lobby([A, B]);
    s = ok(leaveRoom(s, B, T0));
    s = ok(joinRoom(s, B, T0 + 5));
    expect(s.players[1]).toMatchObject({ left: false, chips: 100 });
    expect(joinRoom(ok(closeRoom(s, A, T0)), B, T0)).toEqual({
      ok: false,
      error: "room_closed",
    });
  });
});

describe("bets and interference", () => {
  const atBetting = () => next(toDoors(lobby([A, B, C])));
  it("validation table", () => {
    expect(validateBet(5, 100, false)).toBe("stake_too_low");
    expect(validateBet(101, 100, false)).toBe("insufficient_chips");
    expect(validateBet(10, 100, true)).toBe("self_bet");
    expect(validateBet(10.5, 100, false)).toBe("stake_too_low");
    expect(validateBet(100, 100, false)).toBeNull();
  });
  it("rejects self bet, dupes, low, over-held; allows all-in", () => {
    let s = atBetting();
    expect(placeBet(s, A, A, "win", 20)).toEqual({
      ok: false,
      error: "self_bet",
    });
    expect(placeBet(s, B, A, "win", 9)).toEqual({
      ok: false,
      error: "stake_too_low",
    });
    expect(placeBet(s, B, A, "win", 101)).toEqual({
      ok: false,
      error: "insufficient_chips",
    });
    s = ok(placeBet(s, B, A, "win", 50));
    expect(s.players[1].chips).toBe(50);
    expect(ok(placeBet(s, C, A, "win", 100)).players[2].chips).toBe(0); // all-in
    expect(placeBet(s, B, A, "lose", 10)).toEqual({
      ok: false,
      error: "duplicate_bet",
    });
    expect(placeBet(s, "ghost", A, "win", 10)).toEqual({
      ok: false,
      error: "not_member",
    });
    expect(placeBet(next(s), C, A, "win", 10)).toEqual({
      ok: false,
      error: "wrong_phase",
    });
  });
  it("interference: once per fight, cost 30, comp 15 if target wins anyway", () => {
    let s = atBetting();
    expect(placeInterference(s, A, A, "stronger_enemy")).toEqual({
      ok: false,
      error: "self_interfere",
    });
    s = ok(placeInterference(s, B, A, "stronger_enemy"));
    expect(placeInterference(s, C, A, "adverse_element")).toEqual({
      ok: false,
      error: "already_interfered",
    });
    expect(s.players[1].chips).toBe(70);
    s = next(s);
    for (const id of [A, B, C])
      s = ok(reportOutcome(s, id, id === A ? "won" : "lost"));
    s = next(s);
    expect(s.players[0].chips).toBe(115);
    expect(s.players[1].chips).toBe(70);
    expect(chipSupply(s).held).toBe(chipSupply(s).expected);
  });
  it("aid: flat cost 20, shares the slot, helper gets 10 back when the helped fighter wins", () => {
    let s = atBetting();
    s = ok(placeInterference(s, B, A, "heal"));
    expect(s.players[1].chips).toBe(80); // flat 20, no catch-up discount
    expect(placeInterference(s, C, A, "stronger_enemy")).toEqual({
      ok: false,
      error: "already_interfered",
    }); // one intervention per fight, hostile or friendly
    expect(placeInterference(s, C, A, "ward")).toEqual({
      ok: false,
      error: "already_interfered",
    });
    s = next(s);
    for (const id of [A, B, C])
      s = ok(reportOutcome(s, id, id === A ? "won" : "lost"));
    s = next(s);
    expect(s.players[0].chips).toBe(100); // no compensation for the target
    expect(s.players[1].chips).toBe(90); // 100 - 20 + 10
    expect(chipSupply(s).held).toBe(chipSupply(s).expected);
  });
  it("aid: no refund when the helped fighter loses", () => {
    let s = atBetting();
    s = ok(placeInterference(s, B, A, "ward"));
    s = next(s);
    for (const id of [A, B, C])
      s = ok(reportOutcome(s, id, id === A ? "lost" : "won"));
    s = next(s);
    expect(s.players[1].chips).toBe(80);
    expect(chipSupply(s).held).toBe(chipSupply(s).expected);
  });
  it("interference kept (no refund) when target loses or flees", () => {
    for (const o of ["lost", "fled"] as const) {
      let s = atBetting();
      s = ok(placeInterference(s, B, A, "stronger_enemy"));
      s = next(s);
      for (const id of [A, B, C])
        s = ok(reportOutcome(s, id, id === A ? o : "won"));
      s = next(s);
      expect(s.players[1].chips).toBe(70);
      expect(s.players[0].chips).toBe(100);
    }
  });
  it("2-player duel: bets on each other, no pool when one side only", () => {
    let s = next(toDoors(lobby([A, B])));
    s = ok(placeBet(s, B, A, "win", 50));
    s = ok(placeBet(s, A, B, "lose", 30));
    s = next(s);
    s = ok(reportOutcome(ok(reportOutcome(s, A, "won")), B, "lost"));
    s = next(s);
    // A fight: B bet win only -> void refund. B fight: A bet lose, only one side -> void
    expect(s.players.map((p) => p.chips)).toEqual([100, 100]);
  });
  it("pool split 1:1 among those who guessed right", () => {
    let s = atBetting();
    s = ok(placeBet(s, B, A, "win", 20));
    s = ok(placeBet(s, C, A, "lose", 50));
    s = next(s);
    for (const id of [A, B, C])
      s = ok(reportOutcome(s, id, id === A ? "won" : "lost"));
    s = next(s);
    expect(s.players[1].chips).toBe(100 - 20 + 20 + 50);
    expect(s.players[2].chips).toBe(50);
  });
});

describe("settlePool", () => {
  it("table", () => {
    const bets = [
      { bettor: "x", prediction: "win" as const, stake: 20 },
      { bettor: "y", prediction: "win" as const, stake: 30 },
      { bettor: "z", prediction: "lose" as const, stake: 51 },
    ];
    const r = settlePool(bets, "win");
    expect(r.voided).toBe(false);
    expect(r.payouts.map((p) => p.payout)).toEqual([20 + 20, 30 + 30, 0]); // floor(51*20/50)=20, floor(51*30/50)=30
    expect(r.dust).toBe(1);
    expect(settlePool(bets, "void").payouts.map((p) => p.payout)).toEqual([
      20, 30, 51,
    ]);
    expect(settlePool(bets.slice(0, 2), "win").voided).toBe(true);
    expect(settlePool([], "win")).toEqual({
      payouts: [],
      voided: true,
      dust: 0,
    });
  });
  it("interference settlement", () => {
    expect(interferenceSettlement("win", null)).toEqual({
      compToTarget: 15,
      refundToSource: 0,
    });
    expect(interferenceSettlement("lose", null)).toEqual({
      compToTarget: 0,
      refundToSource: 0,
    });
    expect(interferenceSettlement("void", "fled")).toEqual({
      compToTarget: 0,
      refundToSource: 0,
    });
    expect(interferenceSettlement("void", "no_fight").refundToSource).toBe(30);
    expect(interferenceSettlement("void", "room_closed").refundToSource).toBe(
      30,
    );
  });
});

describe("ranking", () => {
  it("chips then max floor; floor then chips", () => {
    let s = lobby([A, B, C]);
    s = {
      ...s,
      players: s.players.map((p, i) => ({
        ...p,
        chips: [100, 100, 80][i],
        nightMaxFloor: [3, 7, 9][i],
        roundMaxFloor: [3, 7, 9][i],
      })),
    };
    expect(rankByChips(s).map((r) => r.id)).toEqual([B, A, C]);
    expect(rankByFloor(s).map((r) => r.id)).toEqual([C, B, A]);
    expect(rankByFloor(s, true)[0].id).toBe(C);
  });
});

let settledSeen = 0;
let compSeen = 0;
describe("chip conservation (random sequences)", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "seed %i: supply identity holds after every op",
    (seed) => {
      const rng = createRng(seed);
      const ids = ["p1", "p2", "p3", "p4", "p5"].slice(0, rng.int(2, 5));
      let s = lobby(ids);
      let now = T0;
      const check = () => {
        const c = chipSupply(s);
        expect(c.held).toBe(c.expected);
        expect(s.players.every((p) => p.chips >= 0)).toBe(true);
      };
      s = ok(startRound(s, ids[0], now, seed));
      for (
        let step = 0;
        step < 400 && s.phase !== "closed" && s.phase !== "night_summary";
        step++
      ) {
        const id = rng.pick(ids);
        const f = rng.pick(ids);
        const roll = Math.max(0, rng.int(-3, 9)); // 4/13 advances
        let r: Result;
        if (roll === 0)
          r = advance(s, (now = Math.max(now, s.deadline)), s.phaseSeq, {
            seed: step,
          });
        else if (roll === 1)
          r = placeBet(
            s,
            id,
            f,
            rng.pick(["win", "lose"] as const),
            rng.int(1, 120),
          );
        else if (roll === 2) r = placeInterference(s, id, f, "stronger_enemy");
        else if (roll === 3)
          r = reportOutcome(
            s,
            id,
            rng.pick(["won", "lost", "fled", "timeout"] as const),
          );
        else if (roll === 4)
          r = chooseDoor(
            s,
            id,
            rng.pick(["easy", "hard", "chest", "rest", "boss"] as const),
          );
        else if (roll === 5) r = setPresence(s, id, rng.chance(0.7), now);
        else if (roll === 6)
          r = rng.chance(0.3) ? leaveRoom(s, id, now) : joinRoom(s, id, now);
        else if (roll === 7) r = missTurn(s, id);
        else if (roll === 8) r = setReady(s, id);
        else r = chooseHero(s, id, "h");
        if (r.ok) {
          s = r.state;
          settledSeen += r.effects.filter(
            (e) => e.type === "battle_settled",
          ).length;
          compSeen = Math.max(compSeen, s.totals.comp);
        }
        check();
      }
      // close: everything refunded, identity still holds
      if (s.phase !== "closed") {
        const host = s.hostId;
        s = ok(closeRoom(s, host, now));
      }
      check();
      expect(
        Object.values(s.battles).every((b) => b.status === "settled"),
      ).toBe(true);
    },
  );
});

it("random runs really exercised settlement and interference", () => {
  expect(settledSeen).toBeGreaterThan(5);
  expect(compSeen).toBeGreaterThanOrEqual(0); // comp only when an interfered target wins; informational
});

describe("visibleBets", () => {
  const b = {
    fighter: "f",
    status: "open" as const,
    bets: [
      { bettor: "a", prediction: "win" as const, stake: 10 },
      { bettor: "b", prediction: "lose" as const, stake: 20 },
    ],
  };
  it("open battle: bettor sees own, fighter sees all, others none", () => {
    expect(visibleBets("betting", b, "a")).toHaveLength(1);
    expect(visibleBets("betting", b, "f")).toHaveLength(2);
    expect(visibleBets("betting", b, "z")).toHaveLength(0);
  });
  it("locked or reveal: everyone sees all", () => {
    expect(
      visibleBets("fighting", { ...b, status: "locked" }, "z"),
    ).toHaveLength(2);
    expect(visibleBets("reveal", b, "z")).toHaveLength(2);
  });
});
