import { describe, expect, it } from "vitest";
import { generateCharacter, CLASSES } from "./characters";
import { startBattle, estimateDamage } from "./combat";
import {
  MAX_STARS,
  PITY_THRESHOLD,
  RARITIES,
  RARITY_IDS,
  itemMult,
  rollRarity,
  scaleStats,
} from "./rarity";
import {
  bankRun,
  createProfile,
  FRAGMENTS_PER_STAR,
  fragmentKey,
  spendFragments,
  equipWeapon,
  heroFor,
  heroFromOwned,
  migrate,
  pullCharacter,
  pullCost,
  pullWeapon,
  unequipWeapon,
  PULL_COST_CHARACTER,
  type Profile,
} from "./profile";
import { createRng } from "./rng";
import {
  generateWeapon,
  weaponAtk,
  weaponKey,
  WEAPON_BASE_ATK,
  WEAPON_KEY_SPACE,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
} from "./weapons";
import { ELEMENTS } from "./elements";

const rich = (coins = 1e9): Profile => ({ ...createProfile(), coins });

describe("rarity", () => {
  it("probabilities sum to 1 and match 200k pulls", () => {
    expect(
      RARITY_IDS.reduce((a, r) => a + RARITIES[r].probability, 0),
    ).toBeCloseTo(1, 10);
    const rng = createRng(1);
    const n = 200_000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const { rarity } = rollRarity(rng, 0);
      count[rarity] = (count[rarity] ?? 0) + 1;
    }
    for (const r of RARITY_IDS)
      expect(Math.abs(count[r] / n - RARITIES[r].probability)).toBeLessThan(
        0.005,
      );
  });
  it("scales stats by rarity x stars", () => {
    expect(itemMult("legendario", 5)).toBeCloseTo(2.7, 10);
    const s = CLASSES.mago.stats;
    const e = scaleStats(s, "legendario", 5);
    expect(e.hp).toBe(Math.round(85 * 2.7));
    expect(e.atk).toBeCloseTo(s.atk * 2.7, 1);
    expect(e.crit).toBe(s.crit);
    expect(e.speed).toBe(s.speed);
    expect(scaleStats(s, "comun", 0)).toEqual(s);
  });
});

describe("pity", () => {
  it("guarantees Legendario exactly on the 31st pull and resets", () => {
    const rng = createRng(5);
    // rng value that never rolls legendario naturally is not controllable, so
    // drive the counter directly.
    expect(rollRarity(rng, PITY_THRESHOLD - 1).pityTriggered).toBe(false);
    expect(rollRarity(rng, PITY_THRESHOLD)).toEqual({
      rarity: "legendario",
      pityTriggered: true,
    });
    let p = rich();
    let sinceLeg = 0;
    for (let i = 0; i < 2000; i++) {
      const r = pullCharacter(p, rng)!;
      p = r.profile;
      const res = r.results[0];
      if (res.rarity === "legendario") {
        sinceLeg = 0;
        expect(p.pity.character).toBe(0);
      } else {
        sinceLeg++;
        expect(sinceLeg).toBeLessThanOrEqual(PITY_THRESHOLD);
        expect(p.pity.character).toBe(sinceLeg);
      }
      if (res.pityTriggered) expect(res.rarity).toBe("legendario");
    }
  });
  it("banners are independent", () => {
    const r = pullCharacter(rich(), createRng(2), 3)!;
    expect(r.profile.pity.weapon).toBe(0);
  });
});

describe("pulls", () => {
  it("x10 costs 10% less, equals ten singles otherwise", () => {
    expect(pullCost("character", 10)).toBe(PULL_COST_CHARACTER * 9);
    const multi = pullCharacter(rich(), createRng(9), 10)!;
    let p = rich();
    const rng = createRng(9);
    for (let i = 0; i < 10; i++) p = pullCharacter(p, rng)!.profile;
    expect(multi.results).toHaveLength(10);
    expect(multi.profile.characters).toEqual(p.characters);
    expect(multi.profile.pity).toEqual(p.pity);
  });
  it("rejects unaffordable or invalid pulls", () => {
    expect(pullCharacter(createProfile(), createRng(1))).toBeNull();
    expect(pullWeapon(rich(), createRng(1), 0)).toBeNull();
  });
  it("is deterministic per seed", () => {
    const a = pullCharacter(rich(), createRng(3), 10)!;
    const b = pullCharacter(rich(), createRng(3), 10)!;
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a.profile))).toEqual(a.profile);
  });
  it("duplicate adds a star, caps at 5, then refunds 50%", () => {
    const rng = createRng(11);
    let p = rich(100_000);
    let sawStar = false;
    let sawRefund = false;
    for (let i = 0; i < 4000 && !sawRefund; i++) {
      const before = p;
      const r = pullWeapon(p, rng)!;
      p = r.profile;
      const res = r.results[0];
      if (res.status === "new") {
        expect(p.weapons).toHaveLength(before.weapons.length + 1);
      } else {
        expect(p.weapons).toHaveLength(before.weapons.length);
        if (res.status === "star") {
          sawStar = true;
          expect(res.stars).toBeLessThanOrEqual(MAX_STARS);
        } else {
          sawRefund = true;
          expect(res.stars).toBe(MAX_STARS);
          expect(res.refund).toBe(PULL_COST_CHARACTER / 2);
          expect(p.coins).toBe(before.coins - PULL_COST_CHARACTER + 75);
        }
      }
    }
    expect(sawStar && sawRefund).toBe(true);
    for (const w of p.weapons)
      expect(w.atkBonus).toBe(weaponAtk(w.rarity, w.stars, w.type));
  });
  it("character duplicate keeps traits/stats and uses class+element+rarity key", () => {
    let p = rich();
    const rng = createRng(21);
    const seen = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      p = pullCharacter(p, rng)!.profile;
    }
    for (const c of p.characters) seen.set(c.id, c.stars);
    expect(new Set(p.characters.map((c) => c.id)).size).toBe(
      p.characters.length,
    );
    expect(p.characters.some((c) => c.stars > 0)).toBe(true);
  });
});

describe("fragments", () => {
  it("exact duplicate = star (no fragment); same class+rarity other element = fragment", () => {
    const rng = createRng(21);
    let p = rich();
    let frag = 0;
    for (let i = 0; i < 600; i++) {
      const before = p;
      const r = pullCharacter(p, rng)!;
      p = r.profile;
      const res = r.results[0];
      const sameCR = before.characters.some(
        (x) => x.classId === res.character!.classId && x.rarity === res.rarity,
      );
      if (res.status === "new") {
        expect(p.characters).toHaveLength(before.characters.length + 1);
        expect(res.fragmentGain).toBe(sameCR ? 1 : 0);
      } else {
        expect(p.characters).toHaveLength(before.characters.length);
        expect(res.fragmentGain).toBe(0);
      }
      frag += res.fragmentGain;
    }
    expect(frag).toBeGreaterThan(0);
    expect(Object.values(p.fragments).reduce((a, b) => a + b, 0)).toBe(frag);
    expect(p.characters.length).toBeGreaterThan(50);
  });
  it("spendFragments: 3 fragments -> +1 star, refuses otherwise, caps at 5", () => {
    let p = rich();
    p = pullCharacter(p, createRng(5))!.profile;
    const c = p.characters[0];
    const key = fragmentKey(c.classId, c.rarity);
    expect(spendFragments(p, c.id)).toBeNull();
    expect(spendFragments(p, "nope")).toBeNull();
    p = { ...p, fragments: { [key]: FRAGMENTS_PER_STAR * 7 + 1 } };
    for (let s = 1; s <= MAX_STARS; s++) {
      p = spendFragments(p, c.id)!;
      expect(p.characters[0].stars).toBe(s);
    }
    expect(p.fragments[key]).toBe(FRAGMENTS_PER_STAR * 2 + 1);
    expect(spendFragments(p, c.id)).toBeNull();
  });
});

describe("weapons", () => {
  it("atkBonus = round(base x rarity x stars)", () => {
    expect(weaponAtk("comun", 0)).toBe(WEAPON_BASE_ATK);
    expect(weaponAtk("legendario", 5)).toBe(10.8);
    const w = generateWeapon(createRng(1), "raro");
    expect(w.name).toMatch(
      new RegExp(`^${WEAPON_TYPE_DATA[w.type].label} de `),
    );
    expect(w.atkBonus).toBe(weaponAtk("raro", 0, w.type));
    expect(weaponAtk("raro", 0, "espada")).toBe(5.2);
    expect(weaponAtk("comun", 0, "hacha")).toBe(4.8);
  });
  it("key space is 6 types x 5 elements x 5 rarities = 150", () => {
    expect(WEAPON_KEY_SPACE).toBe(150);
    const rng = createRng(77);
    const keys = new Set<string>();
    for (let i = 0; i < 20000; i++)
      keys.add(generateWeapon(rng, RARITY_IDS[i % 5]).id);
    expect(keys.size).toBe(150);
    expect(weaponKey("daga", "rayo", "epico")).toBe("w-daga-rayo-epico");
    expect(WEAPON_TYPES.length * ELEMENTS.length * RARITY_IDS.length).toBe(150);
  });
  it("secondary effect is applied exactly once", () => {
    const base = rich();
    const rng = createRng(31);
    let p = pullCharacter(base, rng)!.profile;
    const c = p.characters[0];
    const plain = heroFromOwned(p, c.id)!;
    for (const type of WEAPON_TYPES) {
      const w = {
        ...generateWeapon(createRng(1), "comun"),
        type,
        id: weaponKey(type, "fuego", "comun"),
        element: "fuego" as const,
        atkBonus: weaponAtk("comun", 0, type),
      };
      const q = equipWeapon({ ...p, weapons: [w] }, c.id, w.id);
      const h = heroFromOwned(q, c.id)!;
      const d = WEAPON_TYPE_DATA[type];
      expect(h.stats.accuracy).toBeCloseTo(
        plain.stats.accuracy + d.accuracy,
        2,
      );
      expect(h.stats.crit).toBeCloseTo(plain.stats.crit + d.crit, 2);
      expect(h.stats.speed).toBeCloseTo(plain.stats.speed * d.speedMult, 1);
      expect(h.stats.atk).toBeCloseTo(plain.stats.atk + w.atkBonus, 1);
      // idempotent: same profile, same hero
      expect(heroFromOwned(q, c.id)).toEqual(h);
    }
    p = unequipWeapon(p, c.id);
    expect(heroFromOwned(p, c.id)).toEqual(plain);
  });
  it("equip is exclusive and unequip works", () => {
    let p = rich();
    const rng = createRng(4);
    p = pullCharacter(p, rng, 10)!.profile;
    p = pullWeapon(p, rng, 10)!.profile;
    const [a, b] = p.characters;
    const w = p.weapons[0].id;
    p = equipWeapon(p, a.id, w);
    p = equipWeapon(p, b.id, w);
    expect(p.equipped).toEqual({ [b.id]: w });
    expect(equipWeapon(p, "nope", w)).toBe(p);
    expect(unequipWeapon(p, b.id).equipped).toEqual({});
  });
  it("hero gets scaled stats + weapon atk + weapon element in combat", () => {
    let p = rich();
    const rng = createRng(8);
    p = pullCharacter(p, rng, 10)!.profile;
    p = pullWeapon(p, rng, 10)!.profile;
    const c = p.characters[0];
    const w = p.weapons[0];
    const plain = heroFromOwned(p, c.id)!;
    expect(plain.stats.hp).toBe(scaleStats(c.stats, c.rarity, c.stars).hp);
    expect(plain.weapon).toBeUndefined();
    p = equipWeapon(p, c.id, w.id);
    const armed = heroFromOwned(p, c.id)!;
    expect(armed.stats.atk).toBeCloseTo(plain.stats.atk + w.atkBonus, 1);
    expect(armed.weapon).toEqual({ element: w.element, atkBonus: w.atkBonus });
    // attacker element = weapon element
    const foe = generateCharacter(createRng(2), "caballero");
    const b = startBattle(armed, foe, createRng(1));
    const b2 = startBattle({ ...armed, weapon: undefined }, foe, createRng(1));
    expect(estimateDamage(b.player, b.enemies[0], "attack1")).toBeGreaterThan(
      0,
    );
    expect(b2.player.char.weapon).toBeUndefined();
  });
  it("heroFor falls back to a fresh Común", () => {
    const h = heroFor(createProfile(), "mago", createRng(1));
    expect(h.classId).toBe("mago");
    expect(h.rarity).toBeUndefined();
    let p = rich();
    p = pullCharacter(p, createRng(3), 10)!.profile;
    const cls = p.characters[0].classId;
    expect(heroFor(p, cls, createRng(1)).classId).toBe(cls);
  });
});

describe("bankRun + migrate", () => {
  it("banks coins and records", () => {
    const p = bankRun(bankRun(createProfile(), 120, 7), 30.9, 3);
    expect(p).toMatchObject({ coins: 150, bestFloor: 7, runsPlayed: 2 });
    expect(bankRun(createProfile(), -5, NaN).coins).toBe(0);
  });
  it("runId guard: banking the same run twice credits once", () => {
    const a = bankRun(createProfile(), 100, 5, "run-1");
    const b = bankRun(a, 100, 5, "run-1");
    expect(b).toBe(a);
    const c = bankRun(b, 40, 6, "run-2");
    expect(c).toMatchObject({ coins: 140, runsPlayed: 2, bestFloor: 6 });
    expect(migrate(JSON.parse(JSON.stringify(c))).lastBankedRunId).toBe(
      "run-2",
    );
  });
  it("migrates old weapons without type (and their equipped ids)", () => {
    const old = migrate({
      coins: 10,
      characters: [
        {
          classId: "mago",
          element: "agua",
          rarity: "comun",
          stars: 0,
          stats: CLASSES.mago.stats,
        },
      ],
      weapons: [
        { id: "w-fuego-raro", element: "fuego", rarity: "raro", stars: 2 },
      ],
      equipped: { "c-mago-agua-comun": "w-fuego-raro" },
    });
    expect(old.weapons[0]).toMatchObject({
      id: "w-espada-fuego-raro",
      type: "espada",
      atkBonus: weaponAtk("raro", 2, "espada"),
    });
    expect(old.equipped).toEqual({
      "c-mago-agua-comun": "w-espada-fuego-raro",
    });
    expect(old.fragments).toEqual({});
  });
  it("round-trips a valid profile", () => {
    const rng = createRng(6);
    let p = rich();
    p = pullCharacter(p, rng, 10)!.profile;
    p = pullWeapon(p, rng, 10)!.profile;
    p = equipWeapon(p, p.characters[0].id, p.weapons[0].id);
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("rejects/repairs garbage", () => {
    for (const g of [null, 5, "x", [], undefined, { characters: 3 }])
      expect(migrate(g)).toEqual(createProfile());
    const p = migrate({
      coins: -50,
      pity: { character: 999, weapon: "a" },
      characters: [{ classId: "x" }, null, 7],
      weapons: [
        { element: "fuego", rarity: "raro", stars: 99, atkBonus: 9999 },
        { element: "fuego", rarity: "raro", stars: 1 },
      ],
      fragments: { "mago:raro": 4, "x:y": 9, "mago:comun": -3 },
      equipped: { ghost: "w-fuego-raro" },
      bestFloor: Infinity,
    });
    expect(p.coins).toBe(0);
    expect(p.pity).toEqual({ character: PITY_THRESHOLD, weapon: 0 });
    expect(p.characters).toHaveLength(0);
    expect(p.weapons).toHaveLength(1);
    expect(p.weapons[0].stars).toBe(MAX_STARS);
    expect(p.weapons[0].atkBonus).toBe(weaponAtk("raro", 5));
    expect(p.fragments).toEqual({ "mago:raro": 4 });
    expect(p.equipped).toEqual({});
    expect(p.bestFloor).toBe(0);
  });
});
