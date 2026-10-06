import { describe, expect, it } from "vitest";
import { autoPolicy } from "./auto";
import { step } from "./combat";
import { generateCharacter } from "./characters";
import {
  coopNode,
  coopPool,
  coopRank,
  coopTally,
  replayCoop,
  startCoop,
} from "./coop";
import type { RunAction } from "./replay";
import { createRng } from "./rng";
import { createRun } from "./run";

const run = createRun(11, generateCharacter(createRng(5), "mago"), false);
const node = coopNode(11, null);

// Plays the bot until the hero falls and returns the recorded log.
function botLog(): RunAction[] {
  const f = startCoop(run, node)!;
  let b = f.battle;
  const log: RunAction[] = [];
  for (let i = 0; i < 400 && b.status === "ongoing"; i++) {
    const p = autoPolicy(b, { guard: true });
    const n = step(b, p.action, f.rng, p.target);
    if (n === b) break;
    log.push({
      t: "act",
      a: p.action,
      ...(p.target ? { target: p.target } : {}),
    });
    b = n;
  }
  return log;
}

describe("coop boss", () => {
  it("is deterministic and never a Clérigo", () => {
    expect(coopNode(11, null)).toEqual(node);
    for (let s = 1; s < 60; s++)
      expect(coopNode(s, null).enemy.classId).not.toBe("clerigo");
  });

  it("replay counts damage, grows with the log and ends when the hero falls", () => {
    const log = botLog();
    const half = replayCoop(
      run,
      node,
      log.slice(0, Math.floor(log.length / 2)),
    );
    const all = replayCoop(run, node, log);
    expect(half.rejectedAt).toBeNull();
    expect(half.finished).toBe(false);
    expect(all.finished).toBe(true);
    expect(all.damage).toBeGreaterThan(half.damage);
    expect(all.damage).toBeLessThanOrEqual(node.enemy.stats.hp);
  });

  it("rejects anything but plain fight actions", () => {
    expect(replayCoop(run, node, [{ t: "auto" }]).rejectedAt).toBe(0);
    expect(replayCoop(run, node, [{ t: "door", i: 0 }]).rejectedAt).toBe(0);
    const log = botLog();
    const extra = replayCoop(run, node, [...log, { t: "act", a: "attack1" }]);
    expect(extra.rejectedAt).toBe(log.length); // fight already over
    expect(extra.damage).toBe(replayCoop(run, node, log).damage);
  });

  it("pool scales with players and the tally picks win and MVP", () => {
    expect(coopPool(11, null, 4)).toBe(coopPool(11, null, 2) * 2);
    const pool = coopPool(11, null, 2);
    const lost = coopTally(pool, { a: pool * 0.3, b: pool * 0.2 });
    expect(lost.won).toBe(false);
    expect(lost.mvp).toBe("a");
    const won = coopTally(pool, { a: pool * 0.6, b: pool * 0.7 });
    expect(won.won).toBe(true);
    expect(won.total).toBe(pool);
    expect(coopTally(pool, {}).mvp).toBeNull();
    expect(coopRank("nivelado", "s")).toBeNull();
    expect(coopRank("completo", "s")).toBe("s");
  });
});
