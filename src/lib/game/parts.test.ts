import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { bankRun, createProfile, migrate } from "./profile";
import {
  addParts,
  coreKey,
  isPartKey,
  MAX_STACK,
  parsePartKey,
  partCount,
  partKey,
  partLabel,
  rollDrops,
} from "./parts";
import { RARITY_IDS } from "./rarity";
import { createRng } from "./rng";
import { chooseDoor, chooseLoot, createRun, doorsFor, type Run } from "./run";
import { WEAPON_TYPES } from "./weapons";

const hero = generateCharacter(createRng(3), "caballero");

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

describe("drops", () => {
  it("are deterministic; bosses always drop, easy fights sometimes, final boss is richer", () => {
    expect(rollDrops("boss", 1, 5, 1, "c", "fuego")).toEqual(
      rollDrops("boss", 1, 5, 1, "c", "fuego"),
    );
    let easy = 0;
    for (let s = 1; s <= 400; s++) {
      if (partCount(rollDrops("easy", s, 3, 1, "c", "fuego")) > 0) easy++;
      expect(partCount(rollDrops("boss", s, 5, 1, "c", "fuego"))).toBe(3); // 2 parts + 1 core
      expect(partCount(rollDrops("finalBoss", s, 8, 1, "c", "fuego"))).toBe(5);
      expect(
        partCount(rollDrops("chest", s, 2, 0, "c", "fuego")),
      ).toBeGreaterThanOrEqual(1);
    }
    expect(easy).toBeGreaterThan(60);
    expect(easy).toBeLessThan(140); // ~25%
  });
});

describe("parts in a run", () => {
  it("chests drop into the bag, a boss secures it, and rooms get nothing", () => {
    let found: Run | null = null;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const run = createRun(seed, hero, true, "f");
      const i = doorsFor(seed, run.floor, "f").findIndex(
        (d) => d.kind === "chest",
      );
      if (i >= 0) found = chooseDoor(run, i)!.run;
    }
    expect(found).not.toBeNull();
    const r = found!;
    expect(partCount(r.partBag) > 0 || r.pendingLoot !== null).toBe(true); // parts or a piece
    expect(r.lastDrops).toEqual(r.partBag);
    expect(partCount(r.partSecured)).toBe(0);
    // boss drop: securing moves the part bag to the secured stock
    const boss: Run = {
      ...r,
      floorCleared: true,
      node: null,
      pendingLoot: [] as never,
    };
    const secured = chooseLoot(
      {
        ...boss,
        pendingLoot: [
          { type: "casco", element: "agua", rarity: "f", name: "x" },
        ],
      },
      -1,
    );
    expect(partCount(secured.partSecured)).toBe(partCount(r.partBag));
    expect(partCount(secured.partBag)).toBe(0);
    // room rounds (loot disabled) never drop
    for (let seed = 1; seed < 200; seed++) {
      const room = createRun(seed, hero, false, null);
      const i = doorsFor(seed, room.floor).findIndex((d) => d.kind === "chest");
      if (i >= 0) expect(chooseDoor(room, i)!.run.partBag).toEqual({});
    }
  });
  it("bankRun adds the secured parts; migrate keeps valid keys only", () => {
    const k = partKey("hacha", "d");
    let p = bankRun(createProfile(), 0, 1, "r1", [], undefined, { [k]: 2 });
    p = bankRun(p, 0, 1, "r2", [], undefined, { [k]: 1, [coreKey("rayo")]: 1 });
    expect(p.parts).toEqual({ [k]: 3, [coreKey("rayo")]: 1 });
    expect(bankRun(p, 0, 1, "r2", [], undefined, { [k]: 9 }).parts[k]).toBe(3); // same run id
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
