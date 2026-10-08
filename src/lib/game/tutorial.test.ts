import { describe, expect, it } from "vitest";
import { canUseWeapon } from "./weapons";
import { migrate, slotKey } from "./profile";
import { createRng } from "./rng";
import { autoAdvance, newAccountProfile, createStarterHero, tutorialStep } from "./tutorial";

describe("tutorial", () => {
  it("creates one F hero with a usable weapon and no extra coins", () => {
    const p = createStarterHero(newAccountProfile(), "mago", createRng(7));
    expect(p.characters).toHaveLength(1);
    expect(p.characters[0].rarity).toBe("f");
    expect(canUseWeapon("mago", p.weapons[0].type)).toBe(true);
    expect(p.weapons[0].element).toBe(p.characters[0].element);
    expect(p.coins).toBe(0);
    expect(tutorialStep(p)).toBe(1);
    expect(createStarterHero(p, "mago", createRng(8))).toBe(p); // only once
  });
  it("existing profiles count as done; equip auto-advances", () => {
    expect(tutorialStep(migrate({ version: 5, coins: 10 }))).toBe(7);
    let p = createStarterHero(newAccountProfile(), "picaro", createRng(3));
    p = { ...p, dungeons: { f: [1] } };
    expect(tutorialStep(autoAdvance(p))).toBe(2);
    p = {
      ...p,
      equipped: { [slotKey(p.characters[0].id, "arma")]: p.weapons[0].id },
    };
    expect(tutorialStep(autoAdvance(p))).toBe(3);
  });
});
