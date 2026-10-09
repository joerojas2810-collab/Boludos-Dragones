import { describe, expect, it } from "vitest";
import { ASCEND, ascendPiece, starUpPiece, swapPieceRoll } from "./pieceGrowth";
import { generateCharacter } from "./characters";
import { ELEMENTS } from "./elements";
import { gearBonus, maxLines, PLUS_BONUS_PER_LEVEL } from "./gear";
import { HERO_FUSION, STAR_CARRY } from "./heroFusion";
import { characterKey, createProfile, grantPiece, heroFromOwned, migrate, slotKey, type Profile } from "./profile";
import { RARITY_IDS, type RarityId } from "./rarity";
import type { RunPiece } from "./loot";
import { createRng } from "./rng";
import {
  canUpgrade,
  DADO_BONUS,
  STREAK_BONUS,
  UPGRADE_TABLE,
  upgradeChance,
  upgradePiece,
} from "./upgrade";
import { WEAPON_TYPES, weaponKey } from "./weapons";

const piece = (type: (typeof WEAPON_TYPES)[number], el: (typeof ELEMENTS)[number], rarity: RarityId): RunPiece & { roll: number } => ({
  type,
  element: el,
  rarity,
  name: `${type}`,
  roll: 1,
});
const withPieces = (...ps: ReturnType<typeof piece>[]): Profile =>
  ps.reduce((p, x) => grantPiece(p, x), { ...createProfile(), coins: 100000 });
// `total` pieces of a rank, all different ids
const group = (rank: RarityId, total: number) =>
  Array.from({ length: total }, (_, i) => piece(WEAPON_TYPES[i % WEAPON_TYPES.length], ELEMENTS[i % 5], rank));

const mats = (ws: { id: string }[]) => ws.map((w) => ({ id: w.id, n: 1 }));
const asc = (p: Profile, baseId: string, ids: { id: string; n: number }[], keep?: "base" | "existing", seed = 1) =>
  ascendPiece(p, { baseId, materials: ids, keep }, createRng(seed));

describe("Ascender (piece growth)", () => {
  it("uses the hero fusion table (total counts the base)", () => {
    for (const r of RARITY_IDS.slice(0, -1)) expect(ASCEND[r]).toEqual({ total: HERO_FUSION[r]!.ratio, coins: HERO_FUSION[r]!.coins });
    expect(ASCEND.s).toBeUndefined(); // S is the top rank
  });
  it("base + materials of any type and element -> the base one rank up, keeping its roll; stars convert, +N resets", () => {
    const g = group("f", ASCEND.f!.total);
    let p = withPieces(...g);
    p = { ...p, weapons: p.weapons.map((w, i) => (i === 0 ? { ...w, stars: 5, plus: 2, roll: 1.07 } : w)) };
    const base = p.weapons[0];
    const r = asc(p, base.id, mats(p.weapons.slice(1)));
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.weapons).toHaveLength(1);
    const w = r.profile.weapons[0];
    expect([w.id, w.rarity, w.stars, w.plus ?? 0, w.type, w.element, w.roll]).toEqual([
      weaponKey(base.type, base.element, "e"), "e", STAR_CARRY.f![5], 0, base.type, base.element, 1.07,
    ]);
    expect(r.profile.coins).toBe(100000 - ASCEND.f!.coins);
  });
  it("gear keeps its lines and rolls only the ones the new rank adds (capstone at S)", () => {
    const base = { ...piece("casco", "fuego", "a"), lines: [{ stat: "def" as const, roll: 1.1 }, { stat: "crit" as const, roll: 0.95 }] };
    const others = group("a", ASCEND.a!.total - 1).map((x, i) => ({ ...x, type: "peto" as const, element: ELEMENTS[i % 5] }));
    const p = withPieces(base, ...others);
    const b = p.weapons.find((w) => w.type === "casco")!;
    const r = asc(p, b.id, mats(p.weapons.filter((w) => w.id !== b.id)));
    if (!r.ok) throw new Error(r.error);
    const up = r.profile.weapons.find((w) => w.type === "casco")!;
    expect(up.rarity).toBe("s");
    expect(up.lines).toHaveLength(maxLines("s"));
    expect(up.lines!.slice(0, 2)).toEqual(base.lines); // the old lines stay, same rolls
    expect(up.lines!.some((l) => l.stat === "dmgTaken")).toBe(true);
  });
  it("same input + same rng = same result (client and server agree)", () => {
    const g = group("c", ASCEND.c!.total);
    const p = withPieces(...g);
    const ids = mats(p.weapons.slice(1));
    expect(asc(p, p.weapons[0].id, ids, undefined, 9)).toEqual(asc(p, p.weapons[0].id, ids, undefined, 9));
  });
  it("rejects wrong counts, other ranks, worn pieces, missing coins, the top rank", () => {
    const g = group("f", ASCEND.f!.total);
    const p = withPieces(...g, piece("espada", "agua", "e"));
    const ids = mats(p.weapons.slice(1, ASCEND.f!.total));
    const base = p.weapons[0].id;
    expect(asc(p, base, ids.slice(1)).ok).toBe(false); // one short
    expect(asc(p, base, [...ids.slice(1), { id: weaponKey("espada", "agua", "e"), n: 1 }]).ok).toBe(false); // other rank
    expect(asc(p, base, [...ids.slice(1), { id: base, n: 1 }]).ok).toBe(false); // the base gives only copies
    expect(asc(p, base, [...ids.slice(1), ids[1]]).ok).toBe(false); // repeated
    expect(asc({ ...p, equipped: { h: ids[0].id } }, base, ids).ok).toBe(false); // worn material
    expect(asc({ ...p, coins: 0 }, base, ids).ok).toBe(false);
    expect(asc(p, "w-nada-nada-f", ids).ok).toBe(false);
    const top = withPieces(piece("espada", "agua", "s"));
    expect(asc(top, top.weapons[0].id, []).ok).toBe(false); // S cannot go higher
  });
  it("refuses materials that carry +N", () => {
    const g = group("f", ASCEND.f!.total);
    const p0 = withPieces(...g);
    const p = { ...p0, weapons: p0.weapons.map((w, i) => (i === 2 ? { ...w, plus: 1 } : w)) };
    expect(asc(p, p.weapons[0].id, mats(p.weapons.slice(1))).ok).toBe(false);
  });
  it("a worn base keeps its slot; an owned piece of the next rank merges and you choose the roll", () => {
    const g = group("f", ASCEND.f!.total);
    const p = { ...withPieces(...g), equipped: {} as Record<string, string> };
    const base = { ...p.weapons[0], roll: 1.1 };
    const ids = mats(p.weapons.slice(1));
    const worn = asc({ ...p, equipped: { h1: base.id } }, base.id, ids);
    expect(worn.ok && worn.profile.equipped.h1).toBe(weaponKey(base.type, base.element, "e"));
    const owned = { ...piece(base.type, base.element, "e"), roll: 0.9 };
    const withOwned = grantPiece({ ...p, weapons: p.weapons.map((w) => (w.id === base.id ? base : w)) }, owned);
    const keepBase = asc(withOwned, base.id, ids, "base");
    if (!keepBase.ok) throw new Error(keepBase.error);
    const m = keepBase.profile.weapons.find((w) => w.rarity === "e")!;
    expect([m.roll, m.copies?.[0]?.roll, keepBase.fusion?.merged]).toEqual([1.1, 0.9, true]);
    const keepOld = asc(withOwned, base.id, ids, "existing");
    expect(keepOld.ok && keepOld.profile.weapons.find((w) => w.rarity === "e")!.roll).toBe(0.9);
  });
  it("copies are material and the base's unspent copies stay behind as a piece of the old rank", () => {
    const g = group("c", ASCEND.c!.total);
    let p = withPieces(...g);
    const base = p.weapons[0];
    p = { ...p, weapons: p.weapons.map((w) => (w.id === base.id ? { ...w, copies: [{ roll: 1.02 }, { roll: 0.97 }, { roll: 1.05 }] } : w)) };
    const others = p.weapons.slice(1, 3); // ratio 4 -> 3 units: two pieces + one copy of the base
    const r = asc(p, base.id, [...mats(others), { id: base.id, n: 1 }]);
    if (!r.ok) throw new Error(r.error);
    const left = r.profile.weapons.find((w) => w.id === base.id)!;
    expect([left.rarity, left.stars, left.roll, left.copies?.length]).toEqual(["c", 0, 1.02, 1]);
    expect(r.profile.weapons.find((w) => w.rarity === "b")).toBeDefined();
  });
});

describe("starUpPiece and swapPieceRoll", () => {
  it("3 units (copies count) give +1 star and the attack follows", () => {
    const base = { ...piece("espada", "fuego", "b"), roll: 1 };
    let p = withPieces(base, base, base, base); // 1 piece + 3 copies
    const id = p.weapons[0].id;
    expect(p.weapons[0].copies).toHaveLength(3);
    const r = starUpPiece(p, { baseId: id, materials: [{ id, n: 3 }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.weapons[0].stars).toBe(1);
    expect(r.profile.weapons[0].copies).toBeUndefined();
    expect(r.profile.weapons[0].atkBonus).toBeGreaterThan(p.weapons[0].atkBonus);
    expect(starUpPiece(p, { baseId: id, materials: [{ id, n: 2 }] }).ok).toBe(false);
    p = { ...p, weapons: p.weapons.map((w) => ({ ...w, stars: 5 })) };
    expect(starUpPiece(p, { baseId: id, materials: [{ id, n: 3 }] }).ok).toBe(false);
  });
  it("swapPieceRoll trades the main roll with a copy's", () => {
    const p = withPieces({ ...piece("casco", "agua", "c"), roll: 1.1, lines: [{ stat: "def", roll: 1.1 }] }, { ...piece("casco", "agua", "c"), roll: 0.9, lines: [{ stat: "crit", roll: 0.9 }] });
    const id = p.weapons[0].id;
    const r = swapPieceRoll(p, { id, index: 0 });
    if (!r.ok) throw new Error(r.error);
    const w = r.profile.weapons[0];
    expect([w.roll, w.lines?.[0].stat, w.copies?.[0].roll]).toEqual([0.9, "crit", 1.1]);
    expect(swapPieceRoll(p, { id, index: 3 }).ok).toBe(false);
  });
});

describe("Mejorar", () => {
  const prof = (extra: object = {}, escamas = 100, dados = 3): Profile => {
    const base = grantPiece(createProfile(), piece("casco", "fuego", "s"));
    return { ...base, escamas, dados, weapons: base.weapons.map((w) => ({ ...w, stars: 5, ...extra })) };
  };
  it("table: chances 100..30 and cost = level", () => {
    expect(Object.values(UPGRADE_TABLE).map((r) => r.chance)).toEqual([100, 90, 80, 70, 60, 50, 45, 40, 35, 30]);
    expect(Object.entries(UPGRADE_TABLE).every(([lv, r]) => r.escamas === Number(lv))).toBe(true);
    expect([DADO_BONUS, STREAK_BONUS, PLUS_BONUS_PER_LEVEL]).toEqual([0.2, 0.05, 0.04]);
  });
  it("canUpgrade: S, 5 stars, below +10", () => {
    const w = (rarity: RarityId, stars: number, plus = 0) => ({ rarity, stars, plus });
    expect(canUpgrade(w("s", 5)).ok).toBe(true);
    expect(canUpgrade(w("s", 5, 9)).ok).toBe(true);
    expect(canUpgrade(w("a", 5)).ok).toBe(false);
    expect(canUpgrade(w("s", 4)).ok).toBe(false);
    expect(canUpgrade(w("s", 5, 10)).ok).toBe(false);
  });
  it("chance = table + 5% per failure + 20% with the die, never above 1", () => {
    expect(upgradeChance({ rarity: "s", stars: 5, plus: 4, plusStreak: 0 }, false)).toBeCloseTo(0.6);
    expect(upgradeChance({ rarity: "s", stars: 5, plus: 4, plusStreak: 2 }, false)).toBeCloseTo(0.7);
    expect(upgradeChance({ rarity: "s", stars: 5, plus: 9, plusStreak: 0 }, true)).toBeCloseTo(0.5);
    expect(upgradeChance({ rarity: "s", stars: 5, plus: 1, plusStreak: 3 }, true)).toBe(1);
  });
  it("success: +1 and streak 0; failure: lose the Escamas (and the die), keep the piece, streak +1", () => {
    const p = prof({ plus: 3, plusStreak: 2 });
    const id = p.weapons[0].id;
    const win = upgradePiece(p, id, false, { ...createRng(1), chance: () => true });
    expect(win.ok && [win.piece.plus, win.piece.plusStreak, win.profile.escamas, win.profile.dados, win.spent]).toEqual([4, 0, 96, 3, 4]);
    const lose = upgradePiece(p, id, true, { ...createRng(1), chance: () => false });
    expect(lose.ok && [lose.piece.plus, lose.piece.plusStreak, lose.profile.escamas, lose.profile.dados, lose.profile.weapons.length]).toEqual([3, 3, 96, 2, 1]);
  });
  it("refuses without Escamas, without dice and on pieces that cannot be upgraded", () => {
    const rng = createRng(1);
    expect(upgradePiece(prof({}, 0), prof().weapons[0].id, false, rng).ok).toBe(false);
    expect(upgradePiece(prof({}, 100, 0), prof().weapons[0].id, true, rng).ok).toBe(false);
    expect(upgradePiece(prof({ stars: 4 }), prof().weapons[0].id, false, rng).ok).toBe(false);
    expect(upgradePiece(prof(), "w-x-y-z", false, rng).ok).toBe(false);
  });
  it("+1 is never lost (100%), +10 gives +40% of the piece's stats before the cap", () => {
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) expect(upgradePiece(prof(), prof().weapons[0].id, false, rng).ok && true).toBe(true);
    const base = gearBonus([{ type: "casco", rarity: "s", stars: 5, roll: 1 }]);
    const plus10 = gearBonus([{ type: "casco", rarity: "s", stars: 5, roll: 1, plus: 10 }]);
    for (const k of Object.keys(base) as (keyof typeof base)[]) if (base[k] > 0) expect(plus10[k] / base[k]).toBeCloseTo(1.4, 1);
  });
  it("the +N reaches the hero's stats (armor and weapon)", () => {
    const c = generateCharacter(createRng(3), "caballero");
    const oc = { ...c, id: characterKey("caballero", c.element, "s"), rarity: "s" as const, stars: 0 };
    const mk = (plus: number) => {
      let p: Profile = { ...createProfile(), characters: [oc] };
      p = grantPiece(p, piece("espada", "fuego", "s"));
      p = grantPiece(p, piece("peto", "fuego", "s"));
      p = { ...p, weapons: p.weapons.map((w) => ({ ...w, plus })), equipped: { [slotKey(oc.id, "arma")]: weaponKey("espada", "fuego", "s"), [slotKey(oc.id, "peto")]: weaponKey("peto", "fuego", "s") } };
      return heroFromOwned(p, oc.id)!;
    };
    const a = mk(0);
    const b = mk(10);
    expect(b.stats.atk).toBeGreaterThan(a.stats.atk);
    expect(b.stats.def + b.stats.hp).toBeGreaterThan(a.stats.def + a.stats.hp);
    expect(b.weapon!.atkBonus / a.weapon!.atkBonus).toBeCloseTo(1.4, 5);
  });
});

describe("migrate (v8 -> v9)", () => {
  it("converts old parts and cores without loss and keeps plus", () => {
    const m = migrate({
      version: 5,
      coins: 10,
      parts: { "p-espada-s": 3, "p-casco-ss": 2, "p-peto-ssr": 1, "p-daga-f": 2, "p-maza-a": 1, "p-libro-c": 1, "core-agua": 2, "core-rayo": 1 },
      weapons: [{ type: "casco", element: "fuego", rarity: "s", stars: 5, plus: 7, plusStreak: 2, roll: 1 }],
    });
    expect([m.escamas, m.dados, m.coins]).toEqual([11, 3, 10 + 90]);
    expect(m.weapons[0]).toMatchObject({ plus: 7, plusStreak: 2 });
    expect("parts" in m).toBe(false);
    expect(migrate(m)).toEqual(m);
  });
});
