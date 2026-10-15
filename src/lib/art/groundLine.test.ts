import { describe, expect, it } from "vitest";
import { feetLift, FEET_PAD, GROUND } from "./groundLine";

describe("feetLift", () => {
  it("puts the feet on the floor line of a 16:9 scene that fills its box", () => {
    // 1920x1080 box, stage ends 160 px above the bottom: feet at 84 % of the image = 172.8 px above the bottom.
    expect(feetLift({ w: 1920, h: 1080 }, 16 / 9, 160, 700)).toBe(13);
    expect(feetLift({ w: 1920, h: 1080 }, 16 / 9, 100, 700)).toBe(Math.round(0.16 * 1080 - 100));
  });

  it("uses the width-scaled image height on ultra-wide boxes", () => {
    // 2000x967 -> image is 1125.6 px tall (cover by width, cropped on top).
    expect(feetLift({ w: 2000, h: 967 }, 1672 / 941, 0, 700)).toBe(Math.round(0.16 * (2000 * 941 / 1672)));
  });

  it("never drops below the stage nor rises above 60 % of it", () => {
    expect(feetLift({ w: 1366, h: 768 }, 16 / 9, 400, 300)).toBe(FEET_PAD);
    expect(feetLift({ w: 1000, h: 3000 }, 1, 0, 500)).toBe(300);
  });

  it("uses the square composition for 1:1 scenes", () => {
    expect(feetLift({ w: 390, h: 844 }, 1, 0, 800)).toBe(Math.round((1 - GROUND.square.feet) * 844));
  });
});
