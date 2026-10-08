import { describe, expect, it } from "vitest";
import { autoPolicy } from "./auto";
import { generateCharacter } from "./characters";
import { createProfile } from "./profile";
import { createRng } from "./rng";
import type { StageAction } from "./stageReplay";
import {
  applyTowerAction,
  dailyKingWindow,
  towerBadges,
  towerFloorReward,
  towerXp,
  localWeekSeed,
  replayTower,
  startTower,
  towerHero,
} from "./tower";

// Plays the tower with the quick-play policy; returns the log and the final state.
function play(seed: number, maxFloors: number) {
  const hero = generateCharacter(createRng(seed), "caballero");
  let s = startTower(seed, hero);
  const log: StageAction[] = [];
  for (let k = 0; k < 5000 && s.climb.status === "active"; k++) {
    if (s.climb.floor > maxFloors) break;
    let a: StageAction = { t: "fin" };
    if (!s.rs.settled) {
      const p = autoPolicy(s.rs.battle!);
      a = { t: "act", a: p.action, target: p.target };
    }
    const n = applyTowerAction(s, a);
    if (!n) break;
    s = n;
    log.push(a);
  }
  return { hero, s, log };
}

describe("tower", () => {
  const p = createProfile();
  it("random hero is a function of the week seed and the player", () => {
    const a = towerHero(p, "nivelado", null, "mago", 5, "u1")!;
    expect(towerHero(p, "nivelado", null, "mago", 5, "u1")).toEqual(a);
    expect(towerHero(p, "nivelado", null, "mago", 6, "u1")!.name).not.toBe(
      a.name,
    );
    expect(a.classId).toBe("mago");
  });
  it("an unknown character is refused", () => {
    expect(
      towerHero(p, "coleccion", "c-mago-fuego-f", "mago", 5, "u1"),
    ).toBeNull();
  });
  it("the local week seed is stable within a week and changes on Monday", () => {
    const mon = new Date(Date.UTC(2026, 9, 5, 12)); // Monday
    const sun = new Date(Date.UTC(2026, 9, 11, 23)); // Sunday of that week
    const next = new Date(Date.UTC(2026, 9, 12, 1)); // next Monday
    expect(localWeekSeed(mon)).toBe(localWeekSeed(sun));
    expect(localWeekSeed(next)).not.toBe(localWeekSeed(mon));
  });

  it("replay repeats the client's climb exactly (floors, rounds, hp)", () => {
    const { hero, s, log } = play(11, 6);
    const r = replayTower(11, hero, log);
    expect(r.rejectedAt).toBeNull();
    expect(r.climb).toEqual(s.climb);
    expect(r.floors).toBeGreaterThan(0);
  });
  it("an illegal action stops the replay where it happens; nothing after counts", () => {
    const { hero, log } = play(11, 3);
    const bad: StageAction[] = [...log, { t: "fin" }, { t: "fin" }];
    const r = replayTower(11, hero, bad);
    expect(r.rejectedAt).not.toBeNull();
    expect(r.applied).toBeLessThan(bad.length);
  });
  it("one life: a lost fight ends the climb, and quitting too", () => {
    const hero = generateCharacter(createRng(3), "mago");
    const r = replayTower(3, hero, [{ t: "quit" }]);
    expect(r.climb.status).toBe("over");
    expect(r.floors).toBe(0);
    const weak = { ...hero, stats: { ...hero.stats, hp: 1, def: 0 } };
    let s = startTower(9, weak);
    for (let k = 0; k < 200 && s.climb.status === "active"; k++) {
      const n = applyTowerAction(s, { t: "act", a: "defend" });
      if (!n) break;
      s = n;
    }
    expect(s.climb.status).toBe("over");
  });
  it("logs from another engine version are refused", () => {
    const hero = generateCharacter(createRng(1), "mago");
    expect(replayTower(1, hero, [], 3).error).toBe("engine_version");
  });
});

describe("tower prizes", () => {
  it("floor cycle pays 5 / 100+core / 250+core", () => {
    expect(towerFloorReward(3).coins).toBe(5);
    expect(towerFloorReward(5)).toEqual({ coins: 100, cores: 1 });
    expect(towerFloorReward(10).coins).toBe(250);
    expect(towerFloorReward(25).coins).toBe(100);
    expect(towerFloorReward(30).coins).toBe(250);
  });
  it("daily window ends at 21:00 ART (00:00 UTC)", () => {
    const w = dailyKingWindow(new Date("2026-10-07T15:00:00Z")); // 12:00 ART
    expect(w.end.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(w.key).toBe("2026-10-07");
    expect(dailyKingWindow(new Date("2026-10-08T00:00:00Z")).key).toBe("2026-10-08");
  });
  it("badges and exp", () => {
    expect(towerBadges(25)).toEqual(["Torre 10", "Torre 20"]);
    expect(towerBadges(9)).toEqual([]);
    expect(towerXp({ wins: 5, bossWins: 1 })).toBe(Math.round(0.25 * (4 * 100 + 250)));
  });
});
