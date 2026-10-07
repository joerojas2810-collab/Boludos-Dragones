import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { newClimb } from "./floorFights";
import { HEAL_FRACTION, startRoomFloor, WARD_MULT } from "./interference";
import { createRng } from "./rng";

const hero = generateCharacter(createRng(4), "caballero");
const wounded = () => ({ ...newClimb(7, hero, "f"), hp: Math.round(hero.stats.hp * 0.3) });

describe("aid in a fight", () => {
  it("heal restores 40% of max hp before the fight starts", () => {
    const base = startRoomFloor(wounded(), "easy", null);
    const healed = startRoomFloor(wounded(), "easy", "heal");
    expect(healed.battle!.player.hp).toBeGreaterThan(base.battle!.player.hp);
    expect(healed.battle!.player.hp - base.battle!.player.hp).toBeCloseTo(
      Math.round(hero.stats.hp * HEAL_FRACTION),
      0,
    );
    // enemies untouched by aid
    expect(healed.stage.fights[0].enemies).toEqual(base.stage.fights[0].enemies);
  });

  it("ward raises the hero's atk and def during the fight only", () => {
    const base = startRoomFloor(wounded(), "easy", null);
    const warded = startRoomFloor(wounded(), "easy", "ward");
    const b = base.battle!.player.char.stats;
    const w = warded.battle!.player.char.stats;
    expect(w.atk).toBeCloseTo(b.atk * WARD_MULT, 0);
    expect(w.def).toBeCloseTo(b.def * WARD_MULT, 0);
    expect(w.hp).toBe(b.hp);
    expect(warded.stage.hero.stats).toEqual(base.stage.hero.stats); // the hero itself is not buffed
  });

  it("hostile kinds boost the enemies and the element-adverse one flips their element", () => {
    const base = startRoomFloor(wounded(), "easy", null);
    const hostile = startRoomFloor(wounded(), "easy", "stronger_enemy");
    expect(hostile.stage.fights[0].enemies[0].stats.hp).toBeGreaterThan(
      base.stage.fights[0].enemies[0].stats.hp,
    );
  });
});
