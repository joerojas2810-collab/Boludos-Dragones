import { describe, expect, it } from "vitest";
import { ASCEND, ascendPiece } from "./ascend";
import { generateCharacter } from "./characters";
import { ELEMENTS } from "./elements";
import { gearBonus, PLUS_BONUS_PER_LEVEL } from "./gear";
import { HERO_FUSION } from "./heroFusion";
import { characterKey, createProfile, grantPiece, heroFromOwned, migrate, slotKey, type Profile } from "./profile";
import { RARITY_IDS, type RarityId } from "./rarity";
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

const piece = (type: (typeof WEAPON_TYPES)[number], el: (typeof ELEMENTS)[number], rarity: RarityId) => ({
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

describe("Ascender", () => {
  it("uses the hero fusion table (total counts the base)", () => {
    for (const r of RARITY_IDS.slice(0, 8)) expect(ASCEND[r]).toEqual({ total: HERO_FUSION[r]!.ratio, coins: HERO_FUSION[r]!.coins });
    expect(ASCEND.ssr).toBeUndefined();
  });
  it("base + materials of any type and element -> the base one rank up, 0 stars and +0", () => {
    const g = group("f", ASCEND.f!.total);
    let p = withPieces(...g);
    p = { ...p, weapons: p.weapons.map((w, i) => (i === 0 ? { ...w, stars: 3, plus: 2 } : w)) };
    const base = p.weapons[0];
    const r = ascendPiece(p, base.id, p.weapons.slice(1).map((w) => w.id), createRng(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.weapons).toHaveLength(1);
    const w = r.profile.weapons[0];
    expect([w.id, w.rarity, w.stars, w.plus ?? 0, w.type, w.element, w.name]).toEqual([
      weaponKey(base.type, base.element, "e"), "e", 0, 0, base.type, base.element, base.name,
    ]);
    expect(r.profile.coins).toBe(100000 - ASCEND.f!.coins);
  });
  it("same input + same rng = same result (client and server agree)", () => {
    const g = group("c", ASCEND.c!.total);
    const p = withPieces(...g);
    const ids = p.weapons.slice(1).map((w) => w.id);
    const a = ascendPiece(p, p.weapons[0].id, ids, createRng(9));
    const b = ascendPiece(p, p.weapons[0].id, ids, createRng(9));
    expect(a).toEqual(b);
  });
  it("rejects wrong counts, other ranks, worn pieces, missing coins, SSR and a maxed target", () => {
    const g = group("f", ASCEND.f!.total);
    const p = withPieces(...g, piece("espada", "agua", "e"));
    const ids = p.weapons.slice(1, ASCEND.f!.total).map((w) => w.id);
    const base = p.weapons[0].id;
    expect(ascendPiece(p, base, ids.slice(1)).ok).toBe(false); // one short
    expect(ascendPiece(p, base, [...ids.slice(1), weaponKey("espada", "agua", "e")]).ok).toBe(false); // other rank
    expect(ascendPiece(p, base, [...ids.slice(1), base]).ok).toBe(false); // base as material
    expect(ascendPiece(p, base, [...ids.slice(1), ids[1]]).ok).toBe(false); // repeated
    expect(ascendPiece({ ...p, equipped: { h: ids[0] } }, base, ids).ok).toBe(false); // worn material
    expect(ascendPiece({ ...p, coins: 0 }, base, ids).ok).toBe(false);
    expect(ascendPiece(p, "w-nada-nada-f", ids).ok).toBe(false);
    const ssr = withPieces(piece("espada", "agua", "ssr"));
    expect(ascendPiece(ssr, ssr.weapons[0].id, []).ok).toBe(false);
    // target already owned with 5 stars
    const maxed = grantPiece(p, piece(g[0].type, g[0].element, "e"));
    const full = { ...maxed, weapons: maxed.weapons.map((w) => (w.rarity === "e" && w.type === g[0].type && w.element === g[0].element ? { ...w, stars: 5 } : w)) };
    expect(ascendPiece(full, base, ids).ok).toBe(false);
  });
  it("refuses materials that carry +N", () => {
    const g = group("f", ASCEND.f!.total);
    const p0 = withPieces(...g);
    const p = { ...p0, weapons: p0.weapons.map((w, i) => (i === 2 ? { ...w, plus: 1 } : w)) };
    const r = ascendPiece(p, p.weapons[0].id, p.weapons.slice(1).map((w) => w.id));
    expect(r.ok).toBe(false);
  });
  it("a worn base keeps its place; an owned target takes +1 star instead", () => {
    const g = group("f", ASCEND.f!.total);
    const p = { ...withPieces(...g), equipped: {} as Record<string, string> };
    const base = p.weapons[0];
    const ids = p.weapons.slice(1).map((w) => w.id);
    const worn = ascendPiece({ ...p, equipped: { h1: base.id } }, base.id, ids, createRng(1));
    expect(worn.ok && worn.profile.equipped.h1).toBe(weaponKey(base.type, base.element, "e"));
    const dup = grantPiece(p, piece(base.type, base.element, "e"));
    const r = ascendPiece(dup, base.id, ids, createRng(1));
    expect(r.ok && r.profile.weapons.find((w) => w.rarity === "e")!.stars).toBe(1);
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
  it("canUpgrade: S or above, 5 stars, below +10", () => {
    const w = (rarity: RarityId, stars: number, plus = 0) => ({ rarity, stars, plus });
    expect(canUpgrade(w("s", 5)).ok).toBe(true);
    expect(canUpgrade(w("ssr", 5, 9)).ok).toBe(true);
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
    const c = generateCharacter(createRng(3), "caballero", "s");
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
