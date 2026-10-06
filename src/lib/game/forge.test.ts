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
