import { describe, expect, it } from "vitest";
import { autoPolicy } from "./auto";
import { generateCharacter } from "./characters";
import { step } from "./combat";
import {
  DUNGEON_THEMES,
  LEVELS_PER_ROUTE,
  ROUTE_IDS,
  levelElement,
  levelsOf,
} from "./levels";
import { createRng } from "./rng";
import {
  createStage,
  ENGINE_VERSION,
  finishFight,
  healBetween,
  levelFights,
  startFight,
  type Stage,
} from "./stage";

describe("levels", () => {
  it("has the configured number of levels, deterministic, last is a 5-fight final", () => {
    for (const r of ROUTE_IDS) {
      const ls = levelsOf(r, "f");
      expect(ls).toHaveLength(LEVELS_PER_ROUTE);
      expect(levelsOf(r, "f")).toBe(ls);
      const last = ls[ls.length - 1];
      expect(last.final).toBe(true);
      expect(last.length).toBe(3);
      expect(last.element).toBe(DUNGEON_THEMES[r].bossElement);
      expect(ls.slice(0, -1).every((l) => !l.final)).toBe(true);
      expect(ls.every((l) => [2, 3].includes(l.length))).toBe(true);
    }
  });

  it("changes the element every ascension but never the drop slot", () => {
    const l = levelsOf(ROUTE_IDS[0], "c")[2];
    let prev = levelElement(l, 0);
    for (let a = 1; a <= 5; a++) {
      const e = levelElement(l, a);
      expect(e).not.toBe(prev);
      prev = e;
    }
  });
});

describe("stage", () => {
  const hero = generateCharacter(createRng(3), "caballero");
  const strong = {
    ...hero,
    stats: { ...hero.stats, hp: hero.stats.hp * 20, atk: hero.stats.atk * 10 },
  };

  const play = (st: Stage): Stage => {
        let cur = st;
    while (cur.status === "playing") {
      const f = startFight(cur);
      let b = f.battle;
      for (let i = 0; i < 500 && b.status === "ongoing"; i++) {
        const p = autoPolicy(b);
        b = step(b, p.action, f.rng, p.target);
      }
      cur = finishFight(cur, b);
    }
    return cur;
  };

  it("fights are deterministic and end with an elite/boss", () => {
    const spec = levelsOf(ROUTE_IDS[0], "f")[0];
    const a = levelFights(spec, 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(levelFights(spec, 0)));
    expect(a).toHaveLength(spec.length);
    expect(a[a.length - 1].role).toBe("elite");
    const fin = levelsOf(ROUTE_IDS[0], "f")[LEVELS_PER_ROUTE - 1];
    const f = levelFights(fin, 0);
    expect(f[f.length - 1].role).toBe("final");
    expect(f[f.length - 1].enemies[0].name).toBe(DUNGEON_THEMES[ROUTE_IDS[0]].bossName);
  });

  it("a strong hero clears a level and earns EXP; a dead hero loses", () => {
    const fights = levelFights(levelsOf(ROUTE_IDS[0], "f")[0], 0);
    const won = play(createStage(1, strong, fights));
    expect(won.status).toBe("cleared");
    expect(won.xp).toBeGreaterThan(0);
    const weak = { ...hero, stats: { ...hero.stats, hp: 1, atk: 1 } };
    const lost = play(createStage(1, weak, fights));
    expect(lost.status).toBe("lost");
  });

  it("ascension reduces the heal between fights", () => {
    expect(healBetween(0)).toBeGreaterThan(healBetween(2));
    expect(healBetween(5)).toBe(0);
  });
});

describe("stage replay", () => {
  it("replays a recorded auto/fin log to the same result and rejects illegal actions", async () => {
    const { replayStage } = await import("./stageReplay");
    const h = generateCharacter(createRng(3), "caballero");
    const strong = { ...h, stats: { ...h.stats, hp: h.stats.hp * 20, atk: h.stats.atk * 10 } };
    const fights = levelFights(levelsOf(ROUTE_IDS[0], "f")[0], 0);
    const log = fights.flatMap(() => [{ t: "auto" as const }, { t: "fin" as const }]);
    const r = replayStage(5, strong, fights, log);
    expect(r.rejectedAt).toBeNull();
    expect(r.stage.status).toBe("cleared");
    expect(replayStage(5, strong, fights, [{ t: "fin" }]).rejectedAt).toBe(0);
    expect(replayStage(5, strong, fights, [{ t: "quit" }]).stage.status).toBe("lost");
    // v15 adds Aguante/Quiebre; motor 14 replays must be rejected because outcomes can differ.
    expect(replayStage(5, strong, fights, log, 0, ENGINE_VERSION - 1).error).toBe("engine_version");
  });

  it("accepts a class skill in a server stage replay and rejects a retired action", async () => {
    const { replayStage } = await import("./stageReplay");
    const h = generateCharacter(createRng(3), "caballero");
    const strong = { ...h, stats: { ...h.stats, hp: h.stats.hp * 20, atk: h.stats.atk * 10 } };
    const elite = levelFights(levelsOf(ROUTE_IDS[0], "f")[0], 0).at(-1)!;
    const result = replayStage(5, strong, [elite], [{ t: "act", a: "knight_advance" }]);
    expect(result.applied).toBe(1);
    expect(result.rejectedAt).toBeNull();
    const retired = replayStage(5, strong, [elite], [{ t: "act", a: "quebrar" as never }]);
    expect(retired.applied).toBe(0);
    expect(retired.rejectedAt).toBe(0);
  });
});
