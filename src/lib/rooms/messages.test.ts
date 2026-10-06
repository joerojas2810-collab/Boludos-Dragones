import { describe, expect, it } from "vitest";
import {
  advanceJitterMs,
  canEmote,
  clientMsg,
  createRoomMsg,
  joinRoomMsg,
  parseRealtime,
} from "./messages";

const room = "11111111-1111-4111-8111-111111111111";
const me = "22222222-2222-4222-8222-222222222222";

describe("clientMsg", () => {
  it.each([
    [{ v: 1, room, type: "leave" }, true],
    [{ v: 1, room, type: "leave", extra: 1 }, false],
    [{ v: 2, room, type: "leave" }, false],
    [{ v: 1, room: "x", type: "leave" }, false],
    [{ v: 1, room, type: "advance", phaseSeq: 3 }, true],
    [{ v: 1, room, type: "advance", phaseSeq: -1 }, false],
    [
      { v: 1, room, type: "bet", fighter: me, prediction: "win", stake: 10 },
      true,
    ],
    [
      { v: 1, room, type: "bet", fighter: me, prediction: "win", stake: 9 },
      false,
    ],
    [
      { v: 1, room, type: "bet", fighter: me, prediction: "maybe", stake: 20 },
      false,
    ],
    [
      { v: 1, room, type: "bet", fighter: me, prediction: "win", stake: 20.5 },
      false,
    ],
    [
      { v: 1, room, type: "interfere", fighter: me, kind: "adverse_element" },
      true,
    ],
    [{ v: 1, room, type: "interfere", fighter: me, kind: "nuke" }, false],
    [{ v: 1, room, type: "door", floor: 3, door: "hard" }, true],
    [{ v: 1, room, type: "door", floor: 11, door: "hard" }, false],
    [
      {
        v: 1,
        room,
        type: "submit",
        floor: 1,
        actions: [{ t: "act", a: "attack1" }],
      },
      true,
    ],
    [
      { v: 1, room, type: "submit", floor: 1, actions: [], outcome: "won" },
      false,
    ],
    [
      {
        v: 1,
        room,
        type: "submit",
        floor: 1,
        actions: Array(6001).fill({ t: "fin" }),
      },
      false,
    ],
    [{ v: 1, room, type: "set_turn_seconds", seconds: 5 }, false],
    [{ v: 1, room, type: "unknown" }, false],
  ])("%j -> %s", (msg, valid) => {
    expect(clientMsg.safeParse(msg).success).toBe(valid);
  });
  it("create / join", () => {
    expect(
      createRoomMsg.safeParse({ v: 1, type: "create", mode: "nivelado" })
        .success,
    ).toBe(true);
    expect(
      createRoomMsg.safeParse({ v: 1, type: "create", mode: "x" }).success,
    ).toBe(false);
    expect(joinRoomMsg.parse({ v: 1, type: "join", code: "abcd" }).code).toBe(
      "ABCD",
    );
    expect(
      joinRoomMsg.safeParse({ v: 1, type: "join", code: "ab1d" }).success,
    ).toBe(false);
  });
});

describe("realtime", () => {
  const phase = {
    v: 1,
    room,
    seq: 1,
    type: "phase",
    phase: "doors",
    phaseSeq: 4,
    deadlineMs: 1_700_000_000_000,
    round: 1,
    floor: 2,
  };
  it("accepts valid and drops invalid / oversized", () => {
    expect(parseRealtime(phase)).toEqual(phase);
    expect(parseRealtime({ ...phase, extra: 1 })).toBeNull();
    expect(parseRealtime({ ...phase, phase: "x" })).toBeNull();
    expect(
      parseRealtime({
        v: 1,
        room,
        seq: 1,
        type: "emote",
        from: me,
        id: "fire",
      }),
    ).not.toBeNull();
    expect(
      parseRealtime({
        v: 1,
        room,
        seq: 1,
        type: "emote",
        from: me,
        id: "poop",
      }),
    ).toBeNull();
    expect(parseRealtime({ ...phase, pad: "x".repeat(300) })).toBeNull();
    expect(parseRealtime("junk")).toBeNull();
  });
  it("turn and presence fit in 200 bytes", () => {
    const turn = {
      v: 1,
      room,
      seq: 9,
      type: "turn",
      fighter: me,
      n: 3,
      actor: "p",
      kind: "crit",
      dmg: 12,
      pHp: 40,
      eHp: 10,
    };
    expect(parseRealtime(turn)).not.toBeNull();
    const pres = {
      v: 1,
      room,
      seq: 9,
      type: "presence",
      player: me,
      ready: true,
      hero: "c-mago-fuego-raro",
      state: "online",
    };
    expect(parseRealtime(pres)).not.toBeNull();
  });
  it("emote throttle and jitter", () => {
    expect(canEmote(null, 5)).toBe(true);
    expect(canEmote(1000, 2500)).toBe(false);
    expect(canEmote(1000, 3000)).toBe(true);
    const j = advanceJitterMs(me);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThan(1000);
    expect(advanceJitterMs(me)).toBe(j);
  });
});
