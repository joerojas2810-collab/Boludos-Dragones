import { describe, expect, it } from "vitest";
import type { PlayerView, RoomView } from "./types";
import {
  betMessage,
  formatCountdown,
  movement,
  phaseBanner,
  phaseComplete,
  playerStatus,
  rankRows,
  settlementToast,
  textBar,
} from "./viewModels";

const P = (id: string, o: Partial<PlayerView> = {}): PlayerView => ({
  id,
  name: id,
  hero: null,
  heroId: null,
  chips: 100,
  lives: 3,
  eliminated: false,
  present: true,
  ready: false,
  isHost: false,
  activeFromFloor: 0,
  roundMaxFloor: 0,
  nightMaxFloor: 0,
  doorChosen: false,
  door: null,
  outcome: null,
  fights: false,
  ...o,
});
const V = (o: Partial<RoomView> = {}): RoomView => ({
  code: "ABCD",
  me: "a",
  mode: "nivelado",
  rank: "f",
  turnSeconds: 30,
  phase: "betting",
  phaseSeq: 1,
  round: 1,
  floor: 1,
  deadline: 0,
  seed: 1,
  hostId: "a",
  players: [P("a"), P("b")],
  battles: {},
  awards: null,
  connection: "online",
  ...o,
});

describe("formatCountdown", () => {
  it("formats m:ss and never goes negative", () => {
    expect(formatCountdown(23_000)).toBe("0:23");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(999)).toBe("0:01");
    expect(formatCountdown(-500)).toBe("0:00");
    expect(formatCountdown(null)).toBe("—:——");
  });
});

describe("phaseBanner", () => {
  it("names the floor and flags bosses", () => {
    expect(phaseBanner("doors", 3, 1).title).toContain("Piso 3");
    const b = phaseBanner("floor_intro", 5, 1);
    expect(b.tone).toBe("boss");
    expect(b.title).toContain("Jefe");
    expect(phaseBanner("round_setup", 0, 2).title).toContain("Ronda 2");
  });
});

describe("rankRows", () => {
  const ps = [
    P("a", { chips: 50, nightMaxFloor: 7 }),
    P("b", { chips: 120, nightMaxFloor: 2 }),
    P("c", { chips: 120, nightMaxFloor: 4 }),
  ];
  it("sorts by chips then floor", () => {
    expect(rankRows(ps, "chips", "a").map((r) => r.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
  it("sorts by floor then chips and marks me", () => {
    const r = rankRows(ps, "floor", "a");
    expect(r.map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(r[0].isMe).toBe(true);
    expect(r[0].pos).toBe(1);
  });
  it("computes movement", () => {
    expect(movement(["a", "b", "c"], ["c", "a", "b"], "c")).toBe(2);
    expect(movement(["a", "b"], ["b", "a"], "a")).toBe(-1);
    expect(movement(["a"], ["a"], "zz")).toBe(0);
  });
});

describe("betMessage", () => {
  it("explains every refusal in Spanish", () => {
    expect(betMessage(50, 100, true)).toMatch(/ti mismo/);
    expect(betMessage(5, 100, false)).toMatch(/mínima es 10/);
    expect(betMessage(150, 100, false)).toMatch(/fichas/);
    expect(betMessage(25, 100, false)).toBeNull();
  });
});

describe("settlementToast", () => {
  const base = (outcome: "win" | "lose" | "void") =>
    V({
      battles: {
        b: {
          fighter: "b",
          bets: [
            { bettor: "a", prediction: "win", stake: 20 },
            { bettor: "c", prediction: "lose", stake: 20 },
          ],
          status: "settled",
          outcome,
          voidReason: outcome === "void" ? "fled" : null,
          interferedByMe: null,
          interfered: false,
          interferenceFrom: null,
        },
      },
    });
  it("reports wins, losses and refunds", () => {
    expect(settlementToast(base("win"))).toBe("Ganaste 20 fichas");
    expect(settlementToast(base("lose"))).toBe("Perdiste 20 fichas");
    expect(settlementToast(base("void"))).toBe("Apuestas devueltas");
    expect(settlementToast(V())).toBeNull();
  });
});

describe("phaseComplete", () => {
  it("betting needs every connected player ready", () => {
    expect(phaseComplete(V())).toBe(false);
    expect(
      phaseComplete(
        V({ players: [P("a", { ready: true }), P("b", { ready: true })] }),
      ),
    ).toBe(true);
    expect(
      phaseComplete(
        V({ players: [P("a", { ready: true }), P("b", { present: false })] }),
      ),
    ).toBe(true);
  });
  it("fighting needs every fighter outcome", () => {
    const v = V({
      phase: "fighting",
      players: [
        P("a", { fights: true, outcome: "won" }),
        P("b", { fights: true }),
      ],
    });
    expect(phaseComplete(v)).toBe(false);
  });
});

describe("playerStatus", () => {
  it("covers absent, eliminated and fighting", () => {
    const v = V({ phase: "fighting" });
    expect(playerStatus(v, P("b", { present: false }), null).kind).toBe("warn");
    expect(playerStatus(v, P("b", { eliminated: true }), null).text).toBe(
      "Eliminado",
    );
    expect(playerStatus(v, P("b", { fights: true }), 62).text).toBe(
      "Peleando 62%",
    );
    expect(
      playerStatus(v, P("b", { fights: true, outcome: "won" }), 10).text,
    ).toBe("Ganó");
  });
});

describe("textBar", () => {
  it("renders proportional blocks", () => {
    expect(textBar(50, 8)).toBe("████░░░░");
    expect(textBar(150, 4)).toBe("████");
    expect(textBar(-5, 4)).toBe("░░░░");
  });
});
