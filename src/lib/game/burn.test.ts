
import { describe, expect, it } from "vitest";
import { burnMany, burnValue } from "./burn";
describe("burnMany", () => {
  it("burns what it can and skips equipped pieces", () => {
    const p = {
      coins: 0,
      characters: [{ id: "c-a", rarity: "f", legacy: false }],
      weapons: [
        { id: "w-1", rarity: "f", legacy: false },
        { id: "w-2", rarity: "f", legacy: false },
      ],
      equipped: { "c-a": "w-2" },
    } as never;
    const r = burnMany(p, ["w-1", "w-2", "w-nope"]);
    expect(r.count).toBe(1);
    expect(r.coins).toBe(burnValue("f"));
    expect(burnMany(p, ["c-a"]).count).toBe(0); // heroes are not burned
  });
});
