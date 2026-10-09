import { describe, expect, it } from "vitest";
import type { Element } from "./elements";
import { maxLines, rollQuality } from "./gear";
import {
  autoEquipPlan,
  createProfile,
  equipWeapon,
  grantPiece,
  heroFromOwned,
  migrate,
  pullCharacter,
  pullWeapon,
  type Profile,
} from "./profile";
import { createRng } from "./rng";
import { isGearType, weaponKey } from "./weapons";

const rich = (): Profile => ({ ...createProfile(), coins: 1e9 });
const mk = (
  type: "casco" | "peto" | "espada",
  rarity: "f" | "s" | "c",
  element: Element = "fuego",
  extra: object = {},
) => ({ type, element, rarity, name: "x", ...extra });

describe("piece rolls", () => {
  it("every gacha piece gets its own roll and lines by rank", () => {
    const { profile } = pullWeapon(rich(), createRng(5), 40)!;
    for (const w of profile.weapons) {
      expect(w.roll).toBeGreaterThanOrEqual(0.85);
      expect(w.roll).toBeLessThanOrEqual(1.15);
      const n = isGearType(w.type) ? maxLines(w.rarity) : 0; // hand weapons have no lines; gear: regular + S capstone
      expect(w.lines?.length ?? 0).toBe(n);
    }
  });
  it("a duplicate is a spare copy with its own roll; the main roll does not change", () => {
    const base = { ...mk("espada", "c"), roll: 0.9 };
    let p = grantPiece(rich(), base);
    p = grantPiece(p, { ...base, roll: 1.1 });
    const w = p.weapons[0];
    expect([w.stars, w.roll, w.copies?.map((c) => c.roll)]).toEqual([0, 0.9, [1.1]]);
    p = grantPiece(p, { ...base, roll: 0.86 });
    expect(p.weapons[0].copies?.map((c) => c.roll)).toEqual([1.1, 0.86]);
    expect(p.weapons[0].atkBonus).toBeGreaterThan(0);
  });
  it("migrate validates rolls and lines, never trusts atkBonus, keeps legacy pieces", () => {
    const good = {
      id: "x", name: "c", type: "casco", element: "fuego", rarity: "c", stars: 0, atkBonus: 9999,
      roll: 5, lines: [{ stat: "crit", roll: 9 }, { stat: "atk", roll: 1 }, { stat: "crit", roll: 1 }, { stat: "resist", roll: 1.1 }],
    };
    const old = { id: "y", name: "e", type: "espada", element: "agua", rarity: "f", stars: 0, atkBonus: 1 };
    const q = migrate({ version: 5, weapons: [good, old] });
    const c = q.weapons.find((w) => w.type === "casco")!;
    expect(c.roll).toBe(1.15);
    expect(c.lines).toEqual([{ stat: "crit", roll: 1.15 }]); // atk invalid, dup dropped, rank C = 1 line
    expect(q.weapons.find((w) => w.type === "espada")!.roll).toBeUndefined();
    expect(q.weapons.every((w) => w.legacy === undefined)).toBe(true);
    expect(migrate({ version: 4, weapons: [old] }).weapons[0].legacy).toBe(true);
  });
});

describe("resonance in heroFromOwned", () => {
  it("adds resonance bonus on top of the gear lines", () => {
    let p = pullCharacter(rich(), createRng(3))!.profile;
    const c = p.characters[0];
    p = grantPiece(p, mk("casco", "s", "agua", { roll: 1, lines: [{ stat: "def", roll: 1 }] }));
    p = grantPiece(p, mk("peto", "s", "fuego", { roll: 1, lines: [{ stat: "hp", roll: 1 }] }));
    for (const w of p.weapons) p = equipWeapon(p, c.id, w.id);
    expect(heroFromOwned(p, c.id)!.gear!.dmgTaken).toBeGreaterThan(0);
  });
});

describe("autoEquipPlan modes", () => {
  const setup = () => {
    let p = pullCharacter(rich(), createRng(3), 2)!.profile;
    const [a, b] = p.characters;
    const own = mk("casco", "c", a.element);
    const other = mk("casco", "s", a.element === "agua" ? "fuego" : "agua");
    p = grantPiece(grantPiece(p, own), other);
    return { p, a, b, own: weaponKey("casco", a.element, "c"), other: weaponKey("casco", other.element, "s") };
  };
  it("set prefers the hero's element even if weaker; poder takes the strongest", () => {
    const { p, a, own, other } = setup();
    expect(autoEquipPlan(p, a.id, "set")).toContainEqual({ slot: "casco", weaponId: own });
    expect(autoEquipPlan(p, a.id, "poder")).toContainEqual({ slot: "casco", weaponId: other });
  });
  it("takeFromOthers lists the holder; default never takes", () => {
    const { p, a, b, other } = setup();
    const q = equipWeapon(p, b.id, other);
    expect(autoEquipPlan(q, a.id, "poder").some((x) => x.weaponId === other)).toBe(false);
    const plan = autoEquipPlan(q, a.id, "poder", { takeFromOthers: true });
    expect(plan).toContainEqual({ slot: "casco", weaponId: other, fromHeroId: b.id });
  });
  it("estilo picks the piece richest in the style group", () => {
    let p = pullCharacter(rich(), createRng(3))!.profile;
    const c = { ...p.characters[0], rarity: "c" as const, stars: 0, skill: "contraataque" as const, classId: "caballero" as const };
    p = { ...p, characters: [c] };
    const tank = mk("casco", "c", "agua", { roll: 1, lines: [{ stat: "def", roll: 1.15 }] });
    const crit = mk("casco", "c", "fuego", { roll: 1, lines: [{ stat: "crit", roll: 1.15 }] });
    p = grantPiece(grantPiece(p, crit), tank);
    expect(autoEquipPlan(p, c.id, "estilo")).toContainEqual({ slot: "casco", weaponId: weaponKey("casco", "agua", "c") });
  });
});

describe("roll quality", () => {
  it("rollQuality exists for ordering", () => {
    expect(rollQuality({ roll: 1.1 })).toBeGreaterThan(rollQuality({ roll: 0.9 }));
  });
});
