import { describe, expect, it } from "vitest";
import { CLASS_IDS, type ClassId } from "./characters";
import { actionError, step, TURN_CAP, type Action, type Battle } from "./combat";
import {
  balancedHero,
  DUEL_MAX_TURN,
  duelStatus,
  FALLBACK_ACTION,
  replayDuel,
  sanitize,
  sideToMove,
  startDuel,
  swapOrderOf,
  type DuelSetup,
} from "./duel";
import { createRng, type Rng } from "./rng";
import { defaultLoadout } from "./skills";

const setup = (a: ClassId = "caballero", b: ClassId = "caballero", seed = 2, speed?: number): DuelSetup => {
  const ha = balancedHero(a, "fuego");
  return {
    seed,
    heroes: { a: speed ? { ...ha, stats: { ...ha.stats, speed } } : ha, b: balancedHero(b, "fuego") },
    loadouts: { a: defaultLoadout(a), b: defaultLoadout(b) },
  };
};

// Plays a full duel with a seeded random bot choosing among the legal actions.
function play(s: DuelSetup, botSeed: number): { b: Battle; actions: Action[] } {
  const rng: Rng = createRng(s.seed);
  const bot: Rng = createRng(botSeed);
  let b = startDuel(s, rng);
  const actions: Action[] = [];
  for (let i = 0; i < 700 && b.status === "ongoing"; i++) {
    const me = sideToMove(b) === "a" ? b.player : b.enemies[0];
    const legal = (["attack1", "defend", ...(me.loadout ?? [])] as Action[]).filter((x) => actionError(b, x) === null);
    const act = legal[Math.floor(bot.next() * legal.length)];
    actions.push(act);
    b = step(b, act, rng);
  }
  return { b, actions };
}

describe("duel on the shared engine", () => {
  it("alternates by speed: the much faster side moves more often", () => {
    const s = setup("caballero", "caballero", 2, 12);
    const rng = createRng(s.seed);
    let b = startDuel(s, rng);
    const turns = { a: 0, b: 0 };
    for (let i = 0; i < 12; i++) {
      turns[sideToMove(b)!]++;
      b = step(b, "defend", rng);
    }
    expect(turns.a).toBeGreaterThan(turns.b);
  });

  it("equal speed: the tie-break alternates with the shared seed parity", () => {
    const first = (seed: number) => sideToMove(startDuel(setup("mago", "mago", seed), createRng(seed)));
    expect(swapOrderOf(2)).toBe(false);
    expect(swapOrderOf(3)).toBe(true);
    expect(first(2)).not.toBe(first(3));
  });

  it("Defender is the fallback for a missing or illegal action", () => {
    const b = startDuel(setup("mago", "caballero"), createRng(2));
    expect(sanitize(b, null)).toBe(FALLBACK_ACTION);
    expect(sanitize(b, "knight_advance")).toBe("defend"); // other class' skill
    expect(sanitize(b, "mage_detonate")).toBe("defend"); // costs 2, resource is 0
    expect(sanitize(b, "attack1")).toBe("attack1");
    expect(sanitize(b, "mage_inscribe")).toBe("mage_inscribe");
  });

  it("replays are deterministic and always end", () => {
    for (const a of CLASS_IDS)
      for (const c of CLASS_IDS) {
        const s = setup(a, c, 11);
        const r = play(s, 5);
        expect(r.b.status).not.toBe("ongoing");
        expect(r.b.turn).toBeLessThanOrEqual(DUEL_MAX_TURN);
        const again = replayDuel(s, r.actions).battle;
        expect(again.log).toEqual(r.b.log);
        expect(again.player.hp).toBe(r.b.player.hp);
        expect(again.enemies[0].hp).toBe(r.b.enemies[0].hp);
      }
  });

  it("both sides defending forever hits the turn cap as a draw", () => {
    const rng = createRng(2);
    let b = startDuel(setup(), rng);
    for (let i = 0; i < 2 * TURN_CAP && b.status === "ongoing"; i++) b = step(b, "defend", rng);
    expect(duelStatus(b)).toBe("draw");
    expect(b.turn).toBeGreaterThanOrEqual(TURN_CAP);
  });

  it("maps the engine status to a / b and ignores moves after the end", () => {
    const r = play(setup("mago", "picaro", 4), 3);
    expect(["a", "b", "draw"]).toContain(duelStatus(r.b));
    expect(step(r.b, "attack1", createRng(1))).toBe(r.b);
    expect(sideToMove(r.b)).toBeNull();
  });

  it("is side-symmetric: a mirror matchup is a coin flip once the order alternates", () => {
    for (const c of ["caballero", "mago"] as ClassId[]) {
      let a = 0;
      const N = 120;
      for (let seed = 1; seed <= N; seed++) if (duelStatus(play(setup(c, c, seed), seed).b) === "a") a++;
      expect(a / N).toBeGreaterThan(0.3);
      expect(a / N).toBeLessThan(0.7);
    }
  });
});
