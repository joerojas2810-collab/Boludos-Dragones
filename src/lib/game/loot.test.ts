import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import {
  LOOT_FLOORS_PER_RANK,
  lootOffer,
  lootRank,
  rollPiece,
  type RunPiece,
} from "./loot";
import { createRng } from "./rng";
import {
  chooseDoor,
  chooseLoot,
  createRun,
  doorsFor,
  effectiveHero,
  maxHp,
  shopItems,
  type Run,
} from "./run";
import { CLASS_WEAPONS, isGearType } from "./weapons";

const hero = generateCharacter(createRng(5), "mago");
const sword: RunPiece = {
  type: "varita",
  element: "rayo",
  rarity: "c",
  name: "Varita de Rayo",
};
const helm: RunPiece = {
  type: "casco",
  element: "agua",
  rarity: "b",
  name: "Casco de Agua",
};

describe("run loot", () => {
  it("rank ceiling grows with the floor and weapons respect the class", () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++)
      expect(lootRank(rng, LOOT_FLOORS_PER_RANK - 1)).toBe("f");
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(lootRank(rng, 80));
    expect(seen.size).toBeGreaterThan(5);
    for (let i = 0; i < 300; i++) {
      const p = rollPiece(rng, "mago", 30);
      if (!isGearType(p.type)) expect(CLASS_WEAPONS.mago).toContain(p.type);
    }
    expect(lootOffer(9, 5, "mago", 2, 1, 73)).toEqual(
      lootOffer(9, 5, "mago", 2, 1, 73),
    );
  });

  it("taking a piece changes the effective hero for the run only", () => {
    const run = { ...createRun(1, hero, true), pendingLoot: [sword, helm] };
    const plain = effectiveHero(run);
    const withWeapon = chooseLoot(run, 0);
    const h = effectiveHero(withWeapon);
    expect(withWeapon.pendingLoot).toBeNull();
    expect(h.weapon?.element).toBe("rayo");
    expect(h.stats.atk).toBeGreaterThan(plain.stats.atk);
    const withHelm = chooseLoot({ ...run, pendingLoot: [helm] }, 0);
    expect(maxHp(withHelm)).toBeGreaterThan(maxHp(run));
    expect(withHelm.hp).toBeGreaterThan(run.hp); // max hp gain also heals
    expect(withHelm.hero).toEqual(run.hero); // base hero untouched
  });

  it("a new piece replaces the one worn in the same slot; skip keeps all", () => {
    let r: Run = { ...createRun(1, hero, true), pendingLoot: [helm] };
    r = chooseLoot(r, 0);
    const better: RunPiece = { ...helm, rarity: "ssr" };
    r = chooseLoot({ ...r, pendingLoot: [better] }, 0);
    expect(r.loot.casco).toEqual(better);
    const skipped = chooseLoot({ ...r, pendingLoot: [helm] }, -1);
    expect(skipped.loot.casco).toEqual(better);
    expect(skipped.pendingLoot).toBeNull();
    expect(chooseLoot(r, 0)).toBe(r); // nothing on offer
    expect(
      chooseLoot({ ...r, pendingLoot: [helm] }, 5).pendingLoot,
    ).not.toBeNull();
  });

  it("the boss drop advances the floor once taken", () => {
    const r = {
      ...createRun(1, hero, true),
      floorCleared: true,
      pendingLoot: [helm, sword],
    };
    const n = chooseLoot(r, 1);
    expect(n.floor).toBe(2);
    expect(n.floorCleared).toBe(false);
  });

  it("chests and shops only offer loot when enabled (not in room rounds)", () => {
    let chests = 0;
    for (let seed = 1; seed < 300; seed++) {
      for (const lootEnabled of [false, true]) {
        const run = createRun(seed, hero, lootEnabled);
        const i = doorsFor(seed, run.floor).findIndex(
          (d) => d.kind === "chest",
        );
        if (i < 0) continue;
        const r = chooseDoor(run, i)!.run;
        if (!lootEnabled) expect(r.pendingLoot).toBeNull();
        else if (r.pendingLoot) chests++;
      }
    }
    expect(chests).toBeGreaterThan(0);
    expect(shopItems(3, 4).some((x) => x.kind === "gear")).toBe(false);
    expect(shopItems(3, 4, "mago").some((x) => x.kind === "gear")).toBe(true);
  });

  it("pieces stay in the bag until a boss secures them", () => {
    let r: Run = { ...createRun(1, hero, true), pendingLoot: [helm] };
    r = chooseLoot(r, 0); // chest-style pick: node is null but floor not cleared
    expect(r.bag).toEqual([helm]);
    expect(r.secured).toEqual([]);
    // boss drop (floor cleared, no node): locks in the whole bag, incl. the drop
    r = { ...r, floorCleared: true, pendingLoot: [sword] };
    r = chooseLoot(r, 0);
    expect(r.secured).toEqual([helm, sword]);
    expect(r.bag).toEqual([]);
    // skipping the boss drop still secures what was carried
    let k: Run = { ...createRun(2, hero, true), bag: [helm] };
    k = chooseLoot({ ...k, floorCleared: true, pendingLoot: [sword] }, -1);
    expect(k.secured).toEqual([helm]);
  });
});
