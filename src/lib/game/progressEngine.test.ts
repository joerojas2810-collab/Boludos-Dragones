import { describe, expect, it } from "vitest";
import { CLASSES, CLASS_IDS } from "./characters";
import {
  actionCounts,
  buildQueue,
  type EnemySlot,
  type Slot,
} from "./combat";
import { createRng, hashSeed } from "./rng";
import {
  activationTicks,
  advanceActivationTimer,
  initialProgressFromRoll,
  nextActivations,
  THRESHOLD,
  type Runner,
} from "./progressEngine";

const labels = (slots: Slot[]) =>
  slots.map((slot) => (slot === "player" ? "player" : "enemy"));

function gateSample(index: number) {
  const playerClass = CLASS_IDS[Math.floor(index / 400) % CLASS_IDS.length];
  const enemyClass = CLASS_IDS[index % CLASS_IDS.length];
  const variation = createRng(hashSeed(13013, index));
  const playerSpeed =
    CLASSES[playerClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    [0.7, 0.8, 0.9, 1, 1.08, 1.16, 1.24][variation.int(0, 6)];
  const enemySpeed =
    CLASSES[enemyClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    [0.7, 0.8, 0.9, 1, 1.08, 1.16, 1.24][variation.int(0, 6)];
  const counts = actionCounts(playerSpeed, enemySpeed, 0);
  const initiative = createRng(hashSeed(13013, index, 91));
  for (let n = 0; n < counts.enemy; n++) initiative.next();
  const enemyRoll = enemySpeed * (0.7 + 0.6 * initiative.next());
  const playerRoll = playerSpeed * (0.7 + 0.6 * initiative.next());
  const enemyFirst = enemyRoll > playerRoll ? 1 : 0;
  const enemySlots: EnemySlot[] = Array.from({ length: counts.enemy }, (_, n) => ({
    e: 0,
    n,
    intent: "attack1",
  }));
  const reference = labels(
    buildQueue(Math.max(1, counts.player), enemySlots, enemyFirst),
  );
  const runners = [
    {
      id: "player",
      speed: playerSpeed,
      progress: initialProgressFromRoll(playerSpeed, playerRoll),
    },
    {
      id: "enemy",
      speed: enemySpeed,
      progress: initialProgressFromRoll(enemySpeed, enemyRoll),
    },
  ];
  const natural = nextActivations(runners).order;
  const candidate = nextActivations(runners, {
    activations: { player: Math.max(1, counts.player), enemy: counts.enemy },
  }).order;
  return {
    playerSpeed,
    enemySpeed,
    countMatch:
      candidate.filter((id) => id === "player").length === Math.max(1, counts.player) &&
      candidate.filter((id) => id === "enemy").length === counts.enemy,
    naturalCountMatch:
      natural.filter((id) => id === "player").length === Math.max(1, counts.player) &&
      natural.filter((id) => id === "enemy").length === counts.enemy,
    orderMatch: candidate.join(",") === reference.join(","),
  };
}

describe("progressEngine feasibility prototype", () => {
  it("is deterministic, pure, and keeps progress within its threshold", () => {
    const runners: Runner[] = [
      { id: "player", speed: 12, progress: 20 },
      { id: "enemy", speed: 8, progress: 40 },
    ];
    const first = nextActivations(runners);
    expect(nextActivations(runners)).toEqual(first);
    expect(runners).toEqual([
      { id: "player", speed: 12, progress: 20 },
      { id: "enemy", speed: 8, progress: 40 },
    ]);
    expect(first.runners.every((runner) => runner.progress >= 0 && runner.progress < THRESHOLD)).toBe(true);
  });

  it("maps the ENGINE 13 roll into a bounded initial progress lead", () => {
    expect(initialProgressFromRoll(10, 7)).toBeCloseTo(0, 8);
    expect(initialProgressFromRoll(10, 13)).toBeGreaterThan(0);
    expect(initialProgressFromRoll(10, 13)).toBeLessThan(THRESHOLD);
    expect(initialProgressFromRoll(10, 13)).toBeCloseTo(
      initialProgressFromRoll(20, 26),
      8,
    );
  });

  it("converts actor activations into fractional timer decay and burn ticks", () => {
    expect(advanceActivationTimer(2, 3, 0.5)).toBe(0.5);
    expect(activationTicks(0.25, 2, 0.5)).toEqual({ ticks: 1, remainder: 0.25 });
  });

  it("uses input order for equal-speed ties and caps a 10x runner at 3", () => {
    expect(
      nextActivations([
        { id: "player", speed: 10, progress: 0 },
        { id: "enemy", speed: 10, progress: 0 },
      ]).order,
    ).toEqual(["player", "enemy"]);
    expect(
      nextActivations(
        [
          { id: "player", speed: 100, progress: 0 },
          { id: "enemy", speed: 10, progress: 0 },
        ],
        { cap: 3 },
      ).order,
    ).toEqual(["player", "player", "player", "enemy"]);
  });

  it("retains fractional carry across cycles and discards capped whole activations", () => {
    const first = nextActivations([
      { id: "player", speed: 12, progress: 0 },
      { id: "enemy", speed: 8, progress: 0 },
    ]);
    expect(first.order).toEqual(["player", "enemy"]);
    expect(first.runners[0].progress).toBeCloseTo(50, 6);
    expect(nextActivations(first.runners).order).toEqual([
      "player",
      "enemy",
      "player",
    ]);

    const capped = nextActivations([
      { id: "fast", speed: 34, progress: 0 },
      { id: "slow", speed: 10, progress: 0 },
    ]);
    expect(capped.order).toEqual(["fast", "fast", "fast", "slow"]);
    expect(capped.runners[0].progress).toBeCloseTo(40, 6);
  });

  it("runs the required 10,000-pair E2a gate and records exact-order failures", () => {
    let countMismatches = 0;
    let naturalCountMismatches = 0;
    let orderMismatches = 0;
    let minSpeed = Number.POSITIVE_INFINITY;
    let maxSpeed = 0;
    for (let i = 0; i < 10_000; i++) {
      const sample = gateSample(i);
      if (!sample.countMatch) countMismatches++;
      if (!sample.naturalCountMatch) naturalCountMismatches++;
      if (!sample.orderMatch) orderMismatches++;
      minSpeed = Math.min(minSpeed, sample.playerSpeed, sample.enemySpeed);
      maxSpeed = Math.max(maxSpeed, sample.playerSpeed, sample.enemySpeed);
    }
    expect(minSpeed).toBeGreaterThan(0);
    expect(maxSpeed).toBeGreaterThan(minSpeed);
    // Motor actionCounts provide cycle quotas; progress/roll only order them.
    expect(countMismatches).toBe(0);
    expect(naturalCountMismatches).toBe(170);
    expect(orderMismatches).toBe(45);
  });
});
