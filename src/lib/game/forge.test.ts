import { describe, expect, it } from "vitest";
import {
  applyForge,
  COMBINE,
  craft,
  craftCoins,
  combineParts,
  combinePieces,
  CRAFT_PARTS,
  dismantle,
  refine,
} from "./forge";
import { coreKey, partKey } from "./parts";
import {
  createProfile,
  equipWeapon,
  grantPiece,
  type Profile,
} from "./profile";
import { createRng } from "./rng";
import { generateCharacter } from "./characters";
import { MAX_STARS, RARITY_IDS } from "./rarity";
import { weaponKey } from "./weapons";

const rich = (parts: Record<string, number>, coins = 1_000_000): Profile => ({
  ...createProfile(),
  coins,
  parts,
});
const piece = (
  type: "espada" | "casco",
  element: "fuego" | "agua" | "rayo" | "tierra" | "viento",
  rarity: "f" | "e" | "d",
) => ({
  type,
  element,
  rarity,
  name: "x",
});

describe("craft", () => {
  it("consumes parts, a core and coins, and grants the piece", () => {
    const p = rich({ [partKey("espada", "d")]: 4, [coreKey("fuego")]: 2 });
    const r = craft(p, { type: "espada", element: "fuego", rank: "d" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.parts).toEqual({
      [partKey("espada", "d")]: 4 - CRAFT_PARTS,
      [coreKey("fuego")]: 1,
    });
    expect(r.profile.coins).toBe(1_000_000 - craftCoins("d"));
    expect(r.profile.weapons[0]).toMatchObject({
      id: weaponKey("espada", "fuego", "d"),
      stars: 0,
    });
    expect(r.diff.grant).toHaveLength(1);
  });
  it("a duplicate adds a star; at max stars it is refused; missing materials fail without side effects", () => {
    let p = rich({ [partKey("casco", "f")]: 99, [coreKey("agua")]: 99 });
    for (let i = 0; i <= MAX_STARS; i++) {
      const r = craft(p, { type: "casco", element: "agua", rank: "f" });
      expect(r.ok).toBe(true);
      if (r.ok) p = r.profile;
    }
    expect(p.weapons[0].stars).toBe(MAX_STARS);
    expect(
      craft(p, { type: "casco", element: "agua", rank: "f" }),
    ).toMatchObject({ ok: false });
    const poor = rich({ [partKey("casco", "f")]: 2, [coreKey("agua")]: 1 });
    const r = craft(poor, { type: "casco", element: "agua", rank: "f" });
    expect(r).toMatchObject({ ok: false });
    expect(
      craft(rich({ [partKey("casco", "f")]: 3, [coreKey("agua")]: 1 }, 1), {
        type: "casco",
        element: "agua",
        rank: "f",
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("combine parts / refine / dismantle", () => {
  it("merges the doc ratios up the whole ladder", () => {
    for (const r of RARITY_IDS.slice(0, -1)) {
      const rule = COMBINE[r]!;
      const p = rich({
        [partKey("hacha", r)]: rule.ratio,
        [coreKey("rayo")]: 1,
      });
      const out = combineParts(p, { type: "hacha", rank: r, core: "rayo" });
      expect(out.ok, r).toBe(true);
      if (!out.ok) continue;
      expect(Object.keys(out.profile.parts)).toEqual([
        partKey("hacha", RARITY_IDS[RARITY_IDS.indexOf(r) + 1]),
      ]);
      expect(out.profile.coins).toBe(1_000_000 - rule.coins);
    }
    expect(
      combineParts(
        rich({ [partKey("hacha", "ssr")]: 9, [coreKey("rayo")]: 1 }),
        { type: "hacha", rank: "ssr", core: "rayo" },
      ),
    ).toMatchObject({ ok: false });
    expect(COMBINE.f?.ratio).toBe(4);
    expect(COMBINE.d?.ratio).toBe(3);
    expect(COMBINE.ss?.ratio).toBe(2);
    const coins = RARITY_IDS.slice(0, -1).map((r) => COMBINE[r]!.coins);
    expect([...coins].sort((a, b) => a - b)).toEqual(coins); // costs grow with rank
  });
  it("refine turns 3 same-rank parts of any type into one of the chosen type", () => {
    const p = rich({ [partKey("espada", "e")]: 2, [partKey("lanza", "e")]: 1 });
    const r = refine(p, {
      spend: { [partKey("espada", "e")]: 2, [partKey("lanza", "e")]: 1 },
      toType: "libro",
      rank: "e",
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(Object.keys(r.profile.parts)).toEqual([partKey("libro", "e")]);
    expect(
      refine(p, {
        spend: { [partKey("espada", "e")]: 2 },
        toType: "libro",
        rank: "e",
      }),
    ).toMatchObject({ ok: false });
    expect(
      refine(rich({ [partKey("espada", "d")]: 3 }), {
        spend: { [partKey("espada", "d")]: 3 },
        toType: "libro",
        rank: "e",
      }),
    ).toMatchObject({ ok: false });
  });
  it("dismantle returns 2 + stars parts and refuses equipped pieces", () => {
    let p = grantPiece(
      grantPiece(rich({}), piece("espada", "fuego", "d")),
      piece("espada", "fuego", "d"),
    );
    const id = weaponKey("espada", "fuego", "d");
    const r = dismantle(p, { id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.parts[partKey("espada", "d")]).toBe(3); // 2 + 1 star
      expect(r.profile.weapons).toHaveLength(0);
    }
    const c = generateCharacter(createRng(3), "caballero");
    p = {
      ...p,
      characters: [
        { ...c, id: "c-caballero-fuego-f", rarity: "f", stars: 0 } as never,
      ],
    };
    p = equipWeapon(p, "c-caballero-fuego-f", id);
    expect(dismantle(p, { id })).toMatchObject({ ok: false });
  });
});

describe("combine pieces", () => {
  it("merges N different-element pieces of one type and rank into the next rank", () => {
    let p = rich({ [coreKey("agua")]: 1 });
    for (const e of ["fuego", "agua", "rayo", "tierra"] as const)
      p = grantPiece(p, piece("espada", e, "f"));
    const ids = p.weapons.map((w) => w.id);
    const r = combinePieces(p, { ids, element: "agua" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.weapons.map((w) => w.id)).toEqual([
      weaponKey("espada", "agua", "e"),
    ]);
    expect(r.profile.parts).toEqual({});
    expect(
      combinePieces(p, { ids: ids.slice(0, 3), element: "agua" }),
    ).toMatchObject({ ok: false }); // needs 4
    expect(combinePieces(p, { ids, element: "viento" })).toMatchObject({
      ok: false,
    }); // element not among them
  });
});

describe("applyForge", () => {
  it("dispatches by op", () => {
    const p = rich({ [partKey("peto", "f")]: 3, [coreKey("tierra")]: 1 });
    expect(
      applyForge(p, { op: "craft", type: "peto", element: "tierra", rank: "f" })
        .ok,
    ).toBe(true);
  });
});

describe("shortcuts (bulk)", () => {
  const F = (t: "espada" | "hacha" | "lanza") => partKey(t, "f");
  it("mergeAll merges every affordable group in one net diff", () => {
    const p = rich({
      [F("espada")]: 9,
      [F("hacha")]: 5,
      [coreKey("fuego")]: 3,
    });
    const r = applyForge(p, { op: "mergeAll", rank: "f" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.parts).toEqual({
      [F("espada")]: 1,
      [F("hacha")]: 1,
      [partKey("espada", "e")]: 2,
      [partKey("hacha", "e")]: 1,
    });
    expect(r.diff.coins).toBe(3 * COMBINE.f!.coins);
    expect(r.diff.spend[coreKey("fuego")]).toBe(3);
  });
  it("is limited by cores and by coins, and says so when nothing can be done", () => {
    const noCore = rich({ [F("espada")]: 8 });
    expect(applyForge(noCore, { op: "mergeAll", rank: "f" })).toMatchObject({
      ok: false,
    });
    const oneCore = rich({ [F("espada")]: 8, [coreKey("rayo")]: 1 });
    const r = applyForge(oneCore, { op: "mergeAll", rank: "f" });
    expect(r.ok && r.profile.parts[partKey("espada", "e")]).toBe(1);
    const broke = rich(
      { [F("espada")]: 8, [coreKey("rayo")]: 2 },
      COMBINE.f!.coins,
    );
    const b = applyForge(broke, { op: "mergeAll", rank: "f" });
    expect(b.ok && b.profile.parts[partKey("espada", "e")]).toBe(1);
  });
  it("chain climbs rank by rank and intermediate parts cancel out of the diff", () => {
    const p = rich({ [F("espada")]: 16, [coreKey("agua")]: 9 });
    const r = applyForge(p, { op: "chain", maxRank: "d", refine: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.parts).toEqual({
      [partKey("espada", "d")]: 1,
      [coreKey("agua")]: 4,
    });
    expect(Object.keys(r.diff.gain)).toEqual([partKey("espada", "d")]); // no E parts in the diff
    expect(r.diff.coins).toBe(4 * COMBINE.f!.coins + COMBINE.e!.coins);
  });
  it("refineAll completes the biggest stack from leftovers; chain can use it", () => {
    const p = rich({
      [F("espada")]: 5,
      [F("hacha")]: 2,
      [F("lanza")]: 2,
      [coreKey("tierra")]: 5,
    });
    const r = applyForge(p, { op: "refineAll", rank: "f" });
    expect(r.ok && r.profile.parts[F("espada")]).toBe(6);
    const c = applyForge(p, { op: "chain", maxRank: "e", refine: true });
    expect(c.ok && c.profile.parts[partKey("espada", "e")]).toBe(1);
    expect(
      applyForge(p, { op: "chain", maxRank: "e", refine: false }).ok && 1,
    ).toBe(1);
  });
  it("dismantleLow removes only unequipped pieces within rank and star limits", () => {
    let p = rich({});
    for (const [t, r] of [
      ["espada", "f"],
      ["espada", "e"],
      ["casco", "f"],
    ] as const)
      p = grantPiece(p, piece(t, "fuego", r as "f" | "e"));
    p = grantPiece(p, piece("casco", "fuego", "f")); // casco F now has 1 star
    const c = generateCharacter(createRng(3), "caballero");
    p = {
      ...p,
      characters: [
        { ...c, id: "c-caballero-fuego-f", rarity: "f", stars: 0 } as never,
      ],
    };
    p = equipWeapon(
      p,
      "c-caballero-fuego-f",
      weaponKey("espada", "fuego", "f"),
    );
    const r = applyForge(p, { op: "dismantleLow", maxRank: "f", maxStars: 0 });
    expect(r.ok).toBe(false); // espada F is equipped; casco F has 1 star; espada E is above F
    const r2 = applyForge(p, { op: "dismantleLow", maxRank: "f", maxStars: 1 });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.profile.weapons.map((w) => w.id).sort()).toEqual(
        [
          weaponKey("espada", "fuego", "e"),
          weaponKey("espada", "fuego", "f"),
        ].sort(),
      );
      expect(r2.profile.parts[partKey("casco", "f")]).toBe(3); // 2 + 1 star
    }
  });
  it("craftMax forges until the stars or the materials run out", () => {
    const rich1 = rich({ [partKey("libro", "d")]: 99, [coreKey("rayo")]: 99 });
    const r = applyForge(rich1, {
      op: "craftMax",
      type: "libro",
      element: "rayo",
      rank: "d",
    });
    expect(r.ok && r.profile.weapons[0].stars).toBe(MAX_STARS);
    expect(r.ok && r.diff.grant).toHaveLength(MAX_STARS + 1);
    const few = rich({ [partKey("libro", "d")]: 7, [coreKey("rayo")]: 99 });
    const f = applyForge(few, {
      op: "craftMax",
      type: "libro",
      element: "rayo",
      rank: "d",
    });
    expect(f.ok && f.profile.weapons[0].stars).toBe(1); // 7 parts = 2 crafts
  });
});
