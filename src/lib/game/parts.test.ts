import { describe, expect, it } from "vitest";
import { bankRun, createProfile, migrate } from "./profile";
import {
  addParts,
  coreKey,
  isPartKey,
  MAX_STACK,
  parsePartKey,
  partKey,
  partLabel,
} from "./parts";
import { RARITY_IDS } from "./rarity";
import { WEAPON_TYPES } from "./weapons";


describe("part keys", () => {
  it("round-trip and reject garbage", () => {
    for (const t of WEAPON_TYPES)
      for (const r of RARITY_IDS) {
        const k = partKey(t, r);
        expect(parsePartKey(k)).toEqual({ kind: "part", type: t, rank: r });
      }
    expect(parsePartKey(coreKey("fuego"))).toEqual({
      kind: "core",
      element: "fuego",
    });
    for (const bad of [
      "p-espada-zz",
      "core-hielo",
      "p-sable-f",
      "x",
      "p-espada-f; drop",
    ])
      expect(isPartKey(bad), bad).toBe(false);
    expect(partLabel(partKey("espada", "ssr"))).toBe("Hoja de espada SSR");
    expect(partLabel(coreKey("agua"))).toBe("Núcleo de Agua");
  });
  it("stacks cap at MAX_STACK", () => {
    const k = partKey("peto", "s");
    expect(addParts({ [k]: MAX_STACK - 1 }, { [k]: 5 })[k]).toBe(MAX_STACK);
  });
});

describe("parts in the profile", () => {
  it("bankRun adds the secured parts; migrate keeps valid keys only", () => {
    const k = partKey("hacha", "d");
    let p = bankRun(createProfile(), 0, 1, "r1", [], { [k]: 2 });
    p = bankRun(p, 0, 1, "r2", [], { [k]: 1, [coreKey("rayo")]: 1 });
    expect(p.parts).toEqual({ [k]: 3, [coreKey("rayo")]: 1 });
    expect(bankRun(p, 0, 1, "r2", [], { [k]: 9 }).parts[k]).toBe(3); // same run id
    const m = migrate({
      parts: {
        [k]: 5,
        "p-junk-f": 3,
        [coreKey("agua")]: -2,
        [coreKey("fuego")]: 99999,
      },
    });
    expect(m.parts).toEqual({ [k]: 5, [coreKey("fuego")]: MAX_STACK });
  });
});
