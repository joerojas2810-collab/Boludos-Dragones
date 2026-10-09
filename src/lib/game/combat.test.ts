import { describe, expect, it } from "vitest";
import { generateCharacter, type Character, type ClassId } from "./characters";
import {
  actionCounts,
  actionsLeft,
  buildQueue,
  type EnemySlot,
  type Slot,
  MAX_ACTIONS_PER_ROUND,
  pendingIntents,
  startBattle,
  step,
  withRound,
  type Battle,
} from "./combat";
import { createRng, type Rng } from "./rng";

const unit = (
  classId: ClassId,
  stats: Partial<Character["stats"]> = {},
): Character => {
  const c = generateCharacter(createRng(1), classId);
  return {
    ...c,
    element: "agua",
    traits: [],
    stats: {
      hp: 1000,
      atk: 20,
      def: 0,
      crit: 0,
      resist: 0,
      accuracy: 0.5,
      critDmg: 1.5,
      regen: 0,
      lifesteal: 0,
      speed: 10,
      ...stats,
    },
  };
};
const always: Rng = { ...createRng(1), chance: () => true };
const never: Rng = { ...createRng(1), chance: () => false };

// actions of the fast side over n rounds
const seq = (fast: number, slow: number, n: number) => {
  const out: number[] = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const r = actionCounts(fast, slow, carry);
    out.push(r.player);
    carry = r.carry;
  }
  return out;
};

describe("actions from speed", () => {
  it("12 vs 6 -> 2 every round", () =>
    expect(seq(12, 6, 4)).toEqual([2, 2, 2, 2]));
  it("12 vs 8 -> 1,2,1,2", () =>
    expect(seq(12, 8, 6)).toEqual([1, 2, 1, 2, 1, 2]));
  it("12 vs 11 -> one extra action on round 11", () => {
    const s = seq(12, 11, 22);
    expect(s.map((n, i) => (n === 2 ? i + 1 : 0)).filter(Boolean)).toEqual([
      11, 22,
    ]);
  });
  it("is capped and keeps only the fractional carry", () => {
    const r = actionCounts(100, 5, 0);
    expect(r).toEqual({ player: MAX_ACTIONS_PER_ROUND, enemy: 1, carry: 0 });
    expect(actionCounts(100, 7, 0).carry).toBeLessThan(1);
  });
  it("equal speeds -> 1 each, and the enemy can be the fast side", () => {
    expect(actionCounts(10, 10, 0)).toEqual({ player: 1, enemy: 1, carry: 0 });
    expect(actionCounts(6, 12, 0)).toEqual({ player: 1, enemy: 2, carry: 0 });
  });
});

const slots = (n: number): EnemySlot[] =>
  Array.from({ length: n }, (_, i) => ({ e: 0, n: i, intent: "attack1" }));
const sides = (q: Slot[]) =>
  q.map((s) => (s === "player" ? "P" : "E")).join("");

describe("round queue", () => {
  it("alternates from the opener, then the leftover actions", () => {
    expect(sides(buildQueue(2, slots(1), 0))).toEqual("PEP");
    expect(sides(buildQueue(2, slots(1), 1))).toEqual("EPP");
    expect(sides(buildQueue(1, slots(2), 1))).toEqual("EPE");
    expect(sides(buildQueue(1, slots(2), 0))).toEqual("PEE");
    expect(sides(buildQueue(3, slots(1), 0))).toEqual("PEPP");
    expect(sides(buildQueue(1, slots(1), 1))).toEqual("EP");
  });
});

describe("multi-action rounds", () => {
  const fastClerigo = () =>
    startBattle(
      unit("clerigo", { speed: 12, hp: 200 }),
      unit("caballero", { speed: 6 }),
      createRng(4),
    );

  it("announces one intent per enemy action and the player's actions", () => {
    const b = fastClerigo();
    expect(actionsLeft(b)).toBe(2);
    expect(b.playerActions).toBe(2);
    expect(pendingIntents(b)).toHaveLength(1);
    expect(b.log.some((l) => l.includes("— Ronda 1 —"))).toBe(true);
    expect(b.log.some((l) => l.includes("actúa 2 veces"))).toBe(true);
    const slow = startBattle(
      unit("caballero", { speed: 6 }),
      unit("picaro", { speed: 12 }),
      createRng(4),
    );
    expect(slow.queue.filter((s) => s !== "player")).toHaveLength(2);
    expect(pendingIntents(slow)).toHaveLength(2);
  });

  it("ticks cooldown and regen once per round, not per action", () => {
    let b = withRound(fastClerigo(), false, ["attack1"], 2);
    b = { ...b, player: { ...b.player, hp: 100 } };
    b = step(b, "attack2", never);
    expect(b.turn).toBe(1);
    expect(actionsLeft(b)).toBe(1);
    expect(b.player.cooldown).toBe(3);
    expect(b.log.some((l) => l.includes("se recupera"))).toBe(false);
    // attack2 is locked for the second action
    expect(step(b, "attack2", never)).toBe(b);
    const hpBefore = b.player.hp;
    b = step(b, "attack1", never);
    expect(b.turn).toBe(2);
    expect(b.player.cooldown).toBe(2);
    expect(b.player.hp).toBeGreaterThan(hpBefore);
    expect(b.log.filter((l) => l.includes("se recupera"))).toHaveLength(1);
    expect(b.log.filter((l) => l.includes("— Ronda 2 —"))).toHaveLength(1);
  });

  it("an enemy that is twice as fast acts twice between player prompts", () => {
    const b0 = startBattle(
      unit("caballero", { speed: 6 }),
      unit("picaro", { speed: 12 }),
      createRng(4),
    );
    const b = withRound(b0, false, ["attack1", "attack1"], 1);
    const n = step(b, "defend", always);
    expect(n.turn).toBe(2);
    expect(n.events.filter((e) => e.actor === "enemy")).toHaveLength(2);
    expect(n.log.some((l) => l.includes("actúa de nuevo"))).toBe(true);
  });

  it("an extra action means one more prompt; the enemy answers in between", () => {
    const b0 = withRound(fastClerigo(), false, ["attack1"], 2); // P E P
    const s1 = step(b0, "attack1", always);
    expect(s1.turn).toBe(1);
    expect(s1.events.map((e) => e.actor)).toEqual(["player", "enemy"]);
    expect(actionsLeft(s1)).toBe(1);
    const s2 = step(s1, "attack1", always);
    expect(s2.events.map((e) => e.actor)).toEqual(["player"]);
    expect(s2.turn).toBe(2);
  });



  it("dying mid-round ends the round at once", () => {
    const b0 = startBattle(
      unit("caballero", { speed: 6, hp: 1000 }),
      unit("picaro", { speed: 12, atk: 9999 }),
      createRng(4),
    );
    const b = withRound(
      { ...b0, player: { ...b0.player, hp: 1 } },
      true,
      ["attack1", "attack1"],
      1,
    ); // E P E
    const s = step(b, "attack1", always);
    expect(s.status).toBe("lost");
    expect(s.queue).toEqual([]);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].actor).toBe("enemy");
  });

  it("a win mid-round stops the queue", () => {
    const b0 = withRound(fastClerigo(), false, ["attack1"], 2);
    const b = { ...b0, enemies: [{ ...b0.enemies[0], hp: 1 }] };
    const s = step(b, "attack1", always);
    expect(s.status).toBe("won");
    expect(s.queue).toEqual([]);
    expect(s.events.every((e) => e.actor === "player")).toBe(true);
  });
});

describe("determinism and serialization", () => {
  const play = (seed: number): Battle => {
    const rng = createRng(seed);
    let b = startBattle(
      generateCharacter(rng, "picaro"),
      generateCharacter(rng, "mago"),
      rng,
    );
    for (let i = 0; i < 200 && b.status === "ongoing"; i++)
      b = step(b, i % 3 === 0 ? "attack2" : "attack1", rng);
    return b;
  };
  it("same seed -> same log", () => {
    expect(play(7).log).toEqual(play(7).log);
  });
  it("a mid-round battle survives a JSON round trip", () => {
    const rng = createRng(3);
    const b = withRound(
      startBattle(
        unit("picaro", { speed: 12 }),
        unit("caballero", { speed: 6 }),
        rng,
      ),
      false,
      ["attack1"],
      2,
    );
    const mid = step(b, "attack1", createRng(5));
    expect(mid.queue.length).toBeGreaterThan(0);
    const copy: Battle = JSON.parse(JSON.stringify(mid));
    expect(copy).toEqual(mid);
    expect(step(copy, "attack1", createRng(9))).toEqual(
      step(mid, "attack1", createRng(9)),
    );
  });
});
