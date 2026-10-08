import { describe, expect, it } from "vitest";
import { compareGear } from "./gearSort";

const p = (type: "espada" | "casco" | "collar", rarity: "f" | "s", element: "agua" | "fuego", stars = 0, plus = 0) =>
  ({ type, rarity, element, stars, plus }) as const;

describe("compareGear", () => {
  it("orders slot > rank desc > element > stars desc > plus desc", () => {
    const list = [
      p("collar", "s", "agua"),
      p("casco", "f", "agua"),
      p("espada", "f", "fuego"),
      p("espada", "s", "fuego"),
      p("espada", "s", "agua", 1, 0),
      p("espada", "s", "agua", 5, 1),
      p("espada", "s", "agua", 5, 3),
    ];
    const out = [...list].sort(compareGear).map((w) => `${w.type}${w.rarity}${w.element}${w.stars}${w.plus}`);
    expect(out).toEqual([
      "espadasagua53",
      "espadasagua51",
      "espadasagua10",
      "espadasfuego00",
      "espadaffuego00",
      "cascofagua00",
      "collarsagua00",
    ]);
  });
});
