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
const ALL: Action[] = ["attack1", "golpe", "barrido", "quebrar", "interrumpir", "explotar", "defend"];

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
    expect(canAct(d.a, "attack2" as never)).toBe(false);
    expect(canAct(d.a, "quebrar")).toBe(false);
    expect(sanitize(d.a, "quebrar")).toBe("defend");
    expect(sanitize(d.a, "attack3" as never)).toBe("defend");
    const cd = { ...d.a, universalCooldowns: { golpe: 1.7 } };
    expect(sanitize(cd, "golpe")).toBe("defend");
    expect(sanitize(cd, "attack1")).toBe("attack1");
  });

  it("perfect guard: Defender against Golpe earns the class bonus", () => {
    const d = duelRound(startDuel(hero("picaro"), hero()), "defend", "golpe", createRng(3));
    expect(d.guard.a).toBe(true);
    expect(d.a.riposte).toBe(true); // Pícaro: Ojo certero waits for the next hit
    expect(d.log.some((l) => l.startsWith("¡Guardia perfecta!"))).toBe(true);
    // guarding a weak hit is not perfect
    const e = duelRound(startDuel(hero(), hero()), "defend", "attack1", createRng(3));
    expect(e.guard.a).toBe(false);
  });

  it("Knight keeps Resolution through a guard and spends it on the next Golpe", () => {
    const first = duelRound(startDuel(hero(), hero()), "defend", "golpe", createRng(22));
    expect(first.a.resolution).toBe(true);
    const next = duelRound(first, "golpe", "defend", createRng(23));
    expect(next.log.some((line) => line.includes("consume Resolución"))).toBe(true);
    expect(next.a.resolution).toBeUndefined();
  });

  it("Berserker's guard bonus shortens the next skill cooldown in duels", () => {
    const first = duelRound(startDuel(hero("berserker"), hero()), "defend", "golpe", createRng(24));
    expect(first.a.riposte).toBe(true);
    const next = duelRound(first, "golpe", "defend", createRng(25));
    expect(next.a.universalCooldowns?.golpe).toBe(0.85);
    expect(next.a.riposte).toBe(false);
  });

  it("guarding cuts the strong hit more than a plain stance would", () => {
    const base = startDuel(hero(), hero());
    let guarded = 0;
    let open = 0;
    for (let s = 1; s <= 60; s++) {
      guarded += base.a.hp - duelRound(base, "defend", "golpe", createRng(s)).a.hp;
      open += base.a.hp - duelRound(base, "attack1", "golpe", createRng(s)).a.hp;
    }
    expect(guarded).toBeLessThan(open * 0.5);
  });

  it("Golpe goes on cooldown and ticks by own activations", () => {
    let d = duelRound(startDuel(hero(), hero()), "golpe", "defend", createRng(5));
    expect(d.a.universalCooldowns?.golpe).toBeGreaterThan(0);
    expect(canAct(d.a, "golpe")).toBe(false);
    d = duelRound(d, "attack1", "defend", createRng(6));
    d = duelRound(d, "attack1", "defend", createRng(7));
    expect(canAct(d.a, "golpe")).toBe(true);
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

  it("is side-symmetric: a mirror matchup is a coin flip (both sides apply statuses and universal skills)", () => {
    for (const c of CLASS_IDS) {
      let a = 0;
      const N = 160;
      for (let seed = 1; seed <= N; seed++) if (play(c, c, seed).status === "a") a++;
      expect(a / N).toBeGreaterThan(0.35);
      expect(a / N).toBeLessThan(0.65);
    }
  });
});
