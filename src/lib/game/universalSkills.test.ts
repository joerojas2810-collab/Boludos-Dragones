import { describe, expect, it } from "vitest";
import {
  UNIVERSAL_COOLDOWN_CONVERSION,
  UNIVERSAL_SKILLS,
  universalCooldownLabel,
} from "./universalSkills";

describe("universal skill definitions", () => {
  it("declares all five actions and enables Interrumpir for its channeling pilot", () => {
    expect(Object.keys(UNIVERSAL_SKILLS).sort()).toEqual([
      "barrido",
      "explotar",
      "golpe",
      "interrumpir",
      "quebrar",
    ]);
    expect(UNIVERSAL_SKILLS.quebrar.enabled).toBe(true);
    expect(UNIVERSAL_SKILLS.quebrar.disabledReason).toBeUndefined();
    expect(UNIVERSAL_SKILLS.interrumpir.enabled).toBe(true);
    expect(UNIVERSAL_SKILLS.interrumpir.disabledReason).toBeUndefined();
    expect(UNIVERSAL_SKILLS.explotar.enabled).toBe(false);
    expect(UNIVERSAL_SKILLS.explotar.disabledReason).toBeTruthy();
  });

  it("uses the E2 0.85 conversion and rounds displayed cooldowns up", () => {
    expect(UNIVERSAL_COOLDOWN_CONVERSION).toBe(0.85);
    expect(UNIVERSAL_SKILLS.golpe.cooldown * UNIVERSAL_COOLDOWN_CONVERSION).toBeCloseTo(1.7);
    expect(universalCooldownLabel(1.7)).toBe(2);
    expect(universalCooldownLabel(0.85)).toBe(1);
    expect(universalCooldownLabel(0)).toBe(0);
  });
});
