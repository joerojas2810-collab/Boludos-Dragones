import { describe, expect, it } from "vitest";
import { dayPayMult } from "./economy";

describe("dayPayMult", () => {
  it("decays by tier and never reaches zero", () => {
    expect([1, 10, 11, 30, 31, 60, 61, 500].map(dayPayMult)).toEqual([
      1, 1, 0.5, 0.5, 0.2, 0.2, 0.1, 0.1,
    ]);
  });
});
