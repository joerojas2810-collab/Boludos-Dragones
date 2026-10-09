import { describe, expect, it } from "vitest";
import { CLASS_IDS, type ClassId } from "./characters";
import type { Action } from "./combat";
import {
  balancedHero,
  canAct,
  DUEL_MAX_TURN,
  duelRound,
  sanitize,
  startDuel,
  type Duel,
} from "./duel";
import { createRng, type Rng } from "./rng";

const hero = (c: ClassId = "caballero", speed?: number) => {
  const h = balancedHero(c, "fuego");
  return speed ? { ...h, stats: { ...h.stats, speed } } : h;
};
const ALL: Action[] = ["attack1", "attack2", "attack3", "defend"];

// Plays a full duel with a seeded random bot for both sides.
function play(a: ClassId, b: ClassId, seed: number): Duel {
  const rng = createRng(seed);
  const bot = (d: Duel, side: "a" | "b") => {
    const c = d[side];
    const legal = ALL.filter((x) => canAct(c, x));
    return legal[Math.floor(rng.next() * legal.length)];
  };
  let d = startDuel(hero(a), hero(b));
  for (let i = 0; i < 400 && d.status === "ongoing"; i++)
    d = duelRound(d, bot(d, "a"), bot(d, "b"), rng);
  return d;
}

describe("duel", () => {
  it("both defending changes nothing but the turn counter", () => {
    const d = duelRound(startDuel(hero(), hero()), "defend", "defend", createRng(1));
    expect(d.a.hp).toBe(d.a.char.stats.hp);
    expect(d.b.hp).toBe(d.b.char.stats.hp);
    expect(d.turn).toBe(2);
  });

  it("missing or illegal picks become Defender", () => {
    const d = startDuel(hero(), hero());
    expect(sanitize(d.a, null)).toBe("defend");
    const cd = { ...d.a, cooldown: 2 };
    expect(sanitize(cd, "attack2")).toBe("defend");
    expect(sanitize(cd, "attack1")).toBe("attack1");
  });

  it("perfect guard: Defender against Ataque 2 earns the class bonus", () => {
    const d = duelRound(startDuel(hero("picaro"), hero()), "defend", "attack2", createRng(3));
    expect(d.guard.a).toBe(true);
    expect(d.a.riposte).toBe(true); // Pícaro: Ojo certero waits for the next hit
    expect(d.log.some((l) => l.startsWith("¡Guardia perfecta!"))).toBe(true);
    // guarding a weak hit is not perfect
    const e = duelRound(startDuel(hero(), hero()), "defend", "attack1", createRng(3));
    expect(e.guard.a).toBe(false);
  });

  it("guarding cuts the strong hit more than a plain stance would", () => {
    const base = startDuel(hero(), hero());
    let guarded = 0;
    let open = 0;
    for (let s = 1; s <= 60; s++) {
      guarded += base.a.hp - duelRound(base, "defend", "attack2", createRng(s)).a.hp;
      open += base.a.hp - duelRound(base, "attack1", "attack2", createRng(s)).a.hp;
    }
    expect(guarded).toBeLessThan(open * 0.5);
  });

  it("ataque 2 goes on cooldown and ticks down", () => {
    let d = duelRound(startDuel(hero(), hero()), "attack2", "defend", createRng(5));
    expect(d.a.cooldown).toBeGreaterThan(0);
    expect(canAct(d.a, "attack2")).toBe(false);
    d = duelRound(d, "attack1", "defend", createRng(6));
    d = duelRound(d, "attack1", "defend", createRng(7));
    expect(canAct(d.a, "attack2")).toBe(true);
  });

  it("the much faster side acts twice per round", () => {
    const d = duelRound(
      startDuel(hero("caballero", 12), hero("caballero", 6)),
      "attack1",
      "attack1",
      createRng(9),
    );
    expect(d.log.filter((l) => l.includes("actúa de nuevo")).length).toBe(1);
  });

  it("is deterministic and always ends", () => {
    for (const a of CLASS_IDS)
      for (const b of CLASS_IDS) {
        const d1 = play(a, b, 11);
        const d2 = play(a, b, 11);
        expect(d1.status).not.toBe("ongoing");
        expect(d1.turn).toBeLessThanOrEqual(DUEL_MAX_TURN + 1);
        expect(d1.log).toEqual(d2.log);
        expect(Number.isFinite(d1.a.hp + d1.b.hp)).toBe(true);
      }
  });

  it("a finished duel ignores more rounds", () => {
    const d = play("mago", "picaro", 4);
    const rng: Rng = createRng(1);
    expect(duelRound(d, "attack1", "attack1", rng)).toBe(d);
  });
});
