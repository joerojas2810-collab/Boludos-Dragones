import { describe, expect, it } from "vitest";
import {
  WEAPON_SIZE,
  WEAPON_SPRITES,
  WEAPON_SPRITES_BY_TYPE,
  WEAPON_TYPES,
} from "./weapons";
import { colorFor } from "./palettes";
import type { Element } from "../lib/game/elements";

const elements = Object.keys(WEAPON_SPRITES) as Element[];

describe("weapon sprites", () => {
  it("are 32x32 with known pixels", () => {
    for (const e of elements) {
      const rows = WEAPON_SPRITES[e];
      expect(rows, e).toHaveLength(WEAPON_SIZE);
      rows.forEach((r) => expect(r, e).toHaveLength(WEAPON_SIZE));
      for (const ch of rows.join("")) {
        if (ch !== "." && ch !== "p")
          expect(colorFor(ch, e), `${e} ${ch}`).not.toBeNull();
      }
      expect(rows.join("")).toContain("p");
      expect(rows.join("")).toContain("o");
    }
  });

  it("differ per element and blade lengths vary", () => {
    const lens = elements.map(
      (e) => WEAPON_SPRITES[e].filter((r) => /[abc]/.test(r)).length,
    );
    expect(new Set(WEAPON_SPRITES.fuego.concat()).size).toBeGreaterThan(5);
    expect(new Set(elements.map((e) => WEAPON_SPRITES[e].join(""))).size).toBe(
      5,
    );
    expect(Math.max(...lens)).toBeGreaterThan(Math.min(...lens) + 5);
  });
});

describe("weapon types", () => {
  it("14 types x 5 elements are 32x32, known chars and all distinct", () => {
    const hashes = new Set<string>();
    for (const t of WEAPON_TYPES)
      for (const e of elements) {
        const rows = WEAPON_SPRITES_BY_TYPE[t][e];
        expect(rows, `${t}/${e}`).toHaveLength(WEAPON_SIZE);
        rows.forEach((r) => expect(r, `${t}/${e}`).toHaveLength(WEAPON_SIZE));
        for (const ch of rows.join(""))
          if (ch !== "." && ch !== "p")
            expect(colorFor(ch, e), `${t}/${e} ${ch}`).not.toBeNull();
        expect(rows.join(""), `${t}/${e}`).toContain("p");
        hashes.add(rows.join(""));
      }
    expect(hashes.size).toBe(70);
  });
});
