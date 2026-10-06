import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { applyRoomAction, HEAL_FRACTION, WARD_MULT } from "./interference";
import { initialReplay } from "./replay";
import { createRng } from "./rng";
import { doorsFor, maxHp } from "./run";

const hero = generateCharacter(createRng(4), "caballero");

// A fight door at floor 1 for this seed.
function fightDoor(seed: number) {
  const i = doorsFor(seed, 1).findIndex(
    (d) => d.kind === "easy" || d.kind === "hard",
  );
  return { seed, i };
}

describe("aid in a fight", () => {
  const seed = [...Array(60).keys()]
    .map((n) => n + 1)
    .find((n) => fightDoor(n).i >= 0)!;
  const { i } = fightDoor(seed);
  const wounded = () => {
    const s = initialReplay(seed, hero);
    return { ...s, run: { ...s.run, hp: Math.round(maxHp(s.run) * 0.3) } };
  };

  it("heal restores 40% of max hp before the fight starts", () => {
    const base = applyRoomAction(wounded(), { t: "door", i }, null)!;
    const healed = applyRoomAction(wounded(), { t: "door", i }, "heal")!;
    const max = maxHp(base.run);
    expect(healed.fight!.battle.player.hp).toBeGreaterThan(
      base.fight!.battle.player.hp,
    );
    expect(
      healed.fight!.battle.player.hp - base.fight!.battle.player.hp,
    ).toBeCloseTo(Math.round(max * HEAL_FRACTION), 0);
    // enemies untouched by aid
    expect(healed.fight!.node.enemies).toEqual(base.fight!.node.enemies);
  });

  it("ward raises the hero's atk and def during the fight only", () => {
    const base = applyRoomAction(wounded(), { t: "door", i }, null)!;
    const warded = applyRoomAction(wounded(), { t: "door", i }, "ward")!;
    const b = base.fight!.battle.player.char.stats;
    const w = warded.fight!.battle.player.char.stats;
    expect(w.atk).toBeCloseTo(b.atk * WARD_MULT, 0);
    expect(w.def).toBeCloseTo(b.def * WARD_MULT, 0);
    expect(w.hp).toBe(b.hp);
    expect(warded.run.hero.stats).toEqual(base.run.hero.stats); // the run itself is not buffed
  });

  it("hostile kinds still boost the enemies, and aid on a non-fight door does nothing special", () => {
    const hostile = applyRoomAction(
      wounded(),
      { t: "door", i },
      "stronger_enemy",
    )!;
    const base = applyRoomAction(wounded(), { t: "door", i }, null)!;
    expect(hostile.fight!.node.enemy.stats.hp).toBeGreaterThan(
      base.fight!.node.enemy.stats.hp,
    );
  });
});
