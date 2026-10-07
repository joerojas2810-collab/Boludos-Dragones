import { describe, expect, it } from "vitest";
import { createProfile } from "./profile";
import { localWeekSeed, towerHero } from "./tower";

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
});
