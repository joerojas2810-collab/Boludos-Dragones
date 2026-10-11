import { describe, expect, it } from "vitest";
import {
  UNIVERSAL_COOLDOWN_CONVERSION,
  UNIVERSAL_SKILLS,
  universalCooldownLabel,
} from "./universalSkills";

describe("universal skill definitions", () => {
  it("declares all five actions and exposes reasons for the deferred three", () => {
    expect(Object.keys(UNIVERSAL_SKILLS).sort()).toEqual([
      "barrido",
      "explotar",
      "golpe",
      "interrumpir",
      "quebrar",
    ]);
    for (const id of ["quebrar", "interrumpir", "explotar"] as const) {
      expect(UNIVERSAL_SKILLS[id].enabled).toBe(false);
      expect(UNIVERSAL_SKILLS[id].disabledReason).toBeTruthy();
    }
  });

  it("uses the E2 0.85 conversion and rounds displayed cooldowns up", () => {
    expect(UNIVERSAL_COOLDOWN_CONVERSION).toBe(0.85);
    expect(UNIVERSAL_SKILLS.golpe.cooldown * UNIVERSAL_COOLDOWN_CONVERSION).toBeCloseTo(1.7);
    expect(universalCooldownLabel(1.7)).toBe(2);
    expect(universalCooldownLabel(0.85)).toBe(1);
    expect(universalCooldownLabel(0)).toBe(0);
  });
});
