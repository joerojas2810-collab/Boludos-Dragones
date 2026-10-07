import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import {
  advanceClimb,
  alignClimb,
  floorFight,
  floorStage,
  isBossRoom,
  kindOfFloor,
  newClimb,
  timeoutClimb,
} from "./floorFights";
import { createRng } from "./rng";
import { finishFight, startFight } from "./stage";
import { step } from "./combat";

describe("floorFight", () => {
  it("is a pure function of (seed, floor, opts)", () => {
    expect(floorFight(7, 3)).toEqual(floorFight(7, 3));
    expect(floorFight(7, 3)).not.toEqual(floorFight(8, 3));
  });
  it("every 5th floor is a boss, every 10th a named boss room", () => {
    expect(kindOfFloor(4)).toBe("easy");
    expect(kindOfFloor(5)).toBe("boss");
    expect(floorFight(1, 5).role).toBe("elite");
    expect(isBossRoom(10)).toBe(true);
    const room = floorFight(1, 10);
    expect(room.role).toBe("final");
    expect(room.enemies[0].bossId).toBeTruthy();
  });
  it("enemies carry a family and get stronger with depth and with the room rank", () => {
    const a = floorFight(2, 2).enemies[0];
    expect(a.family).toBeTruthy();
    const hp = (f: number, rank?: "f" | "s") =>
      floorFight(2, f, { rank, kind: "easy" }).enemies.reduce(
        (t, e) => t + e.stats.hp,
        0,
      );
    expect(hp(20)).toBeGreaterThan(hp(5));
    expect(hp(5, "s")).toBeGreaterThan(hp(5, "f"));
  });
  it("modifiers appear only deep (tower floors)", () => {
    expect(floorFight(1, 3).mods).toEqual([]);
    expect(floorFight(1, 25).mods).toContain("regeneracion");
  });
  it("hard fights bring a group; bosses are escorted only deep", () => {
    expect(floorFight(1, 2, { kind: "hard" }).enemies.length).toBeGreaterThan(1);
    expect(floorFight(1, 5).enemies.length).toBe(1);
  });
});

describe("climb", () => {
  const hero = generateCharacter(createRng(5), "caballero");
  it("a win heals a little, moves on and counts; a loss ends it (one life)", () => {
    const c = { ...newClimb(4, hero), hp: Math.round(hero.stats.hp * 0.5) };
    let st = floorStage(c);
    expect(st.hp).toBe(c.hp);
    const f = startFight(st);
    let b = f.battle;
    for (let i = 0; i < 300 && b.status === "ongoing"; i++)
      b = step(b, "attack1", f.rng);
    st = finishFight(st, b);
    const next = advanceClimb(c, st, "normal", b.turn);
    if (st.status === "cleared") {
      expect(next.floor).toBe(2);
      expect(next.wins).toBe(1);
      expect(next.rounds).toBe(b.turn);
    } else expect(next.status).toBe("over");
    expect(timeoutClimb(c).status).toBe("over");
  });
  it("a late joiner is aligned forward, never back", () => {
    const c = newClimb(4, hero);
    expect(alignClimb(c, 4).floor).toBe(4);
    expect(alignClimb({ ...c, floor: 6 }, 4).floor).toBe(6);
  });
});
