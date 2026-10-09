import { GEAR_CAP } from "./gear";
import { describe, expect, it } from "vitest";
import { generateCharacter, CLASSES, CLASS_IDS } from "./characters";
import { startBattle, estimateDamage } from "./combat";
import { normalizeHero } from "./nivelado";
import {
  MAX_STARS,
  RARITIES,
  RARITY_IDS,
  itemMult,
  rollRarity,
  scaleStats,
  STAR_BONUS,
} from "./rarity";
import {
  bankRun,
  createProfile,
  FRAGMENT_REFUND,
  equipWeapon,
  heroPower,
  heroFor,
  autoEquipPlan,
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
  CLASS_WEAPONS,
  canUseWeapon,
  WEAPON_BASE_ATK,
  WEAPON_KEY_SPACE,
  WEAPON_TYPE_DATA,
  WEAPON_TYPES,
  HAND_TYPES,
  isGearType,
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
      const rarity = rollRarity(rng);
      count[rarity] = (count[rarity] ?? 0) + 1;
    }
    for (const r of RARITY_IDS)
      expect(Math.abs(count[r] / n - RARITIES[r].probability)).toBeLessThan(
        0.005,
      );
  });
  it("scales stats by rarity x stars", () => {
    const top = RARITIES.s.multiplier * (1 + STAR_BONUS * 5);
    expect(itemMult("s", 5)).toBeCloseTo(top, 10);
    const s = CLASSES.mago.stats;
    const e = scaleStats(s, "s", 5);
    expect(e.hp).toBe(Math.round(85 * top));
    expect(e.atk).toBeCloseTo(s.atk * top, 1);
    expect(e.crit).toBe(s.crit);
    expect(e.speed).toBe(s.speed);
    expect(scaleStats(s, "f", 0)).toEqual(s);
  });
});

describe("no pity", () => {
  it("S keeps its plain odds and the pity counters never move", () => {
    const rng = createRng(5);
    let p = rich();
    let tops = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const r = pullCharacter(p, rng)!;
      p = r.profile;
      if (r.results[0].rarity === "s") tops++;
      expect(p.pity.character).toBe(0);
      expect(p.pitySsr.character).toBe(0);
    }
    expect(Math.abs(tops / n - RARITIES.s.probability)).toBeLessThan(0.02);
  });
  it("legacy rarity ids and ids migrate to ranks", () => {
    const p = migrate({
      coins: 5,
      characters: [
        {
          id: "c-mago-fuego-legendario",
          classId: "mago",
          element: "fuego",
          rarity: "legendario",
          stars: 1,
          stats: CLASSES.mago.stats,
        },
      ],
      weapons: [
        {
          id: "w-espada-agua-epico",
          type: "espada",
          element: "agua",
          rarity: "epico",
          stars: 0,
        },
      ],
      equipped: { "c-mago-fuego-legendario": "w-espada-agua-epico" },
      fragments: { "mago:raro": 2 },
    });
    expect(p.characters[0]).toMatchObject({
      id: "c-mago-fuego-s",
      rarity: "s",
    });
    expect(p.weapons[0].id).toBe("w-espada-agua-a");
    expect("fragments" in p).toBe(false);
    expect(p.coins).toBe(5 + 2 * FRAGMENT_REFUND); // old fragment stock paid as coins
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
    let p = rich(2_000_000);
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
          expect(p.coins).toBe(
            before.coins - PULL_COST_CHARACTER + PULL_COST_CHARACTER / 2,
          );
        }
      }
    }
    expect(sawStar && sawRefund).toBe(true);
    for (const w of p.weapons)
      expect(w.atkBonus).toBe(weaponAtk(w.rarity, w.stars, w.type, w.roll));
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

describe("no fragments", () => {
  it("exact duplicate = star; any new hero is just a new hero (no fragment bookkeeping)", () => {
    const rng = createRng(21);
    let p = rich();
    for (let i = 0; i < 600; i++) {
      const before = p;
      const r = pullCharacter(p, rng)!;
      p = r.profile;
      const res = r.results[0];
      expect(p.characters).toHaveLength(before.characters.length + (res.status === "new" ? 1 : 0));
      expect("fragments" in p).toBe(false);
    }
    expect(p.characters.length).toBeGreaterThan(50);
  });
});

// Gives every hero a class that can use the first weapon (class gates equipping).
const fitClass = (p0: Profile): Profile => {
  const p = { ...p0, weapons: p0.weapons.filter((w) => !isGearType(w.type)) };
  const classId = CLASS_IDS.find((k) => canUseWeapon(k, p.weapons[0].type))!;
  return { ...p, characters: p.characters.map((c) => ({ ...c, classId })) };
};

describe("run loot banking", () => {
  const piece = {
    type: "casco" as const,
    element: "agua" as const,
    rarity: "b" as const,
    name: "Casco de Agua",
  };
  it("grants new pieces, +1 star on duplicates and a refund at max stars", () => {
    let p = rich(0);
    p = bankRun(p, 10, 3, "r1", [piece, piece]);
    expect(p.weapons).toHaveLength(1);
    expect(p.weapons[0].stars).toBe(1);
    expect(p.coins).toBe(10);
    p = bankRun(p, 0, 3, "r1", [piece]); // same run id: nothing again
    expect(p.weapons[0].stars).toBe(1);
    for (let i = 0; i < 6; i++) p = bankRun(p, 0, 3, `x${i}`, [piece]);
    expect(p.weapons[0].stars).toBe(5);
    expect(p.coins).toBeGreaterThan(10); // refunds once maxed
  });
});

describe("heroPower (hero sort order)", () => {
  it("grows with rank, stars and equipped gear", () => {
    const base = pullCharacter(rich(), createRng(3))!.profile;
    const c = base.characters[0];
    const mk = (rarity: "f" | "s", stars: number): Profile => ({
      ...base,
      characters: [{ ...c, id: "x", rarity, stars }],
    });
    expect(heroPower(mk("s", 0), "x")).toBeGreaterThan(
      heroPower(mk("f", 0), "x"),
    );
    expect(heroPower(mk("f", 3), "x")).toBeGreaterThan(
      heroPower(mk("f", 0), "x"),
    );
    expect(heroPower(mk("f", 0), "nope")).toBe(0);
    const geared: Profile = {
      ...mk("f", 0),
      weapons: [
        {
          ...generateWeapon(createRng(1), "s"),
          type: "casco",
          id: weaponKey("casco", "fuego", "s"),
          element: "fuego",
          atkBonus: 0,
        },
      ],
    };
    const worn = equipWeapon(geared, "x", weaponKey("casco", "fuego", "s"));
    expect(heroPower(worn, "x")).toBeGreaterThan(heroPower(geared, "x"));
  });
});

describe("gear", () => {
  const piece = (
    type: "casco" | "peto" | "piernas" | "zapatos" | "collar",
    rarity: "f" | "s" = "f",
  ) => ({
    ...generateWeapon(createRng(1), rarity),
    type,
    id: weaponKey(type, "fuego", rarity),
    element: "fuego" as const,
    atkBonus: 0,
  });
  it("each slot holds one piece and equipping a piece moves it", () => {
    let p = pullCharacter(rich(), createRng(3), 2)!.profile;
    const [a, b] = p.characters;
    const helm = piece("casco");
    const chest = piece("peto");
    p = { ...p, weapons: [helm, chest] };
    p = equipWeapon(p, a.id, helm.id);
    p = equipWeapon(p, a.id, chest.id);
    expect(p.equipped).toEqual({
      [`${a.id}|casco`]: helm.id,
      [`${a.id}|peto`]: chest.id,
    });
    p = equipWeapon(p, b.id, helm.id);
    expect(p.equipped[`${a.id}|casco`]).toBeUndefined();
    expect(p.equipped[`${b.id}|casco`]).toBe(helm.id);
    expect(
      unequipWeapon(p, b.id, "casco").equipped[`${b.id}|casco`],
    ).toBeUndefined();
  });
  it("worn gear raises stats, caps hold, and it survives a round trip", () => {
    let p = pullCharacter(rich(), createRng(3))!.profile;
    const c = p.characters[0];
    const plain = heroFromOwned(p, c.id)!;
    const all = (
      ["casco", "peto", "piernas", "zapatos", "collar"] as const
    ).map((t) => ({ ...piece(t, "s"), stars: 5 }));
    p = { ...p, weapons: all };
    for (const w of all) p = equipWeapon(p, c.id, w.id);
    const h = heroFromOwned(p, c.id)!;
    expect(h.stats.hp).toBeGreaterThan(plain.stats.hp * 1.4); // a full S 5★ set
    expect(h.stats.hp).toBeLessThanOrEqual(
      Math.round(plain.stats.hp * (1 + GEAR_CAP.hp)),
    );
    expect(h.stats.def).toBeGreaterThan(plain.stats.def * 1.2);
    expect(h.stats.def).toBeLessThanOrEqual(
      plain.stats.def * (1 + GEAR_CAP.def) + 0.1,
    );
    expect(h.stats.speed).toBeGreaterThan(plain.stats.speed);
    expect(h.stats.speed).toBeLessThanOrEqual(
      plain.stats.speed * (1 + GEAR_CAP.speed) + 0.1,
    );
    expect(h.stats.crit).toBeGreaterThan(plain.stats.crit + 0.1);
    expect(h.stats.crit).toBeLessThanOrEqual(
      plain.stats.crit + GEAR_CAP.crit + 0.001,
    );
    expect(h.gear).toBeDefined();
    expect(migrate(JSON.parse(JSON.stringify(p))).equipped).toEqual(p.equipped);
  });
  it("auto-equip picks the best free piece per slot and skips other heroes' pieces", () => {
    let p = pullCharacter(rich(), createRng(3), 2)!.profile;
    const [a, b] = p.characters;
    const low = piece("casco", "f");
    const high = {
      ...piece("casco", "s"),
      id: "w-casco-agua-s",
      element: "agua" as const,
    };
    const chest = piece("peto", "f");
    p = { ...p, weapons: [low, high, chest] };
    p = equipWeapon(p, a.id, low.id);
    const plan = autoEquipPlan(p, a.id);
    expect(plan).toContainEqual({ slot: "casco", weaponId: high.id });
    expect(plan).toContainEqual({ slot: "peto", weaponId: chest.id });
    // the SSR helm is worn by b: a must not take it
    const q = equipWeapon(p, b.id, high.id);
    expect(autoEquipPlan(q, a.id).some((x) => x.weaponId === high.id)).toBe(
      false,
    );
    expect(autoEquipPlan(q, a.id)).toContainEqual({
      slot: "peto",
      weaponId: chest.id,
    });
  });
  it("nivelado ignores gear", () => {
    let p = pullCharacter(rich(), createRng(3))!.profile;
    const c = p.characters[0];
    const base = normalizeHero(heroFromOwned(p, c.id)!, "nivelado");
    const all = (
      ["casco", "peto", "piernas", "zapatos", "collar"] as const
    ).map((t) => ({ ...piece(t, "s"), stars: 5 }));
    p = { ...p, weapons: all };
    for (const w of all) p = equipWeapon(p, c.id, w.id);
    const geared = normalizeHero(heroFromOwned(p, c.id)!, "nivelado").stats;
    for (const k of Object.keys(base.stats) as (keyof typeof geared)[])
      // gear is applied rounded to 0.1 and undone by division: allow that rounding
      expect(geared[k], k).toBeCloseTo(base.stats[k], 0);
  });
});

describe("weapons", () => {
  it("every class has 2-3 weapon types and every type has a class", () => {
    for (const k of CLASS_IDS)
      expect(CLASS_WEAPONS[k].length).toBeGreaterThanOrEqual(2);
    for (const k of CLASS_IDS)
      expect(CLASS_WEAPONS[k].length).toBeLessThanOrEqual(3);
    for (const t of WEAPON_TYPES)
      expect(
        CLASS_IDS.some((k) => canUseWeapon(k, t)),
        t,
      ).toBe(true);
  });
  it("a class cannot equip a weapon type it cannot use", () => {
    const w = {
      ...generateWeapon(createRng(1), "f"),
      type: "arco" as const,
    };
    const base = pullCharacter(rich(), createRng(2))!.profile;
    const c = { ...base.characters[0], classId: "clerigo" as const };
    const p = { ...base, characters: [c], weapons: [w] };
    expect(equipWeapon(p, c.id, w.id)).toBe(p);
  });
  it("atkBonus = round(base x rarity x stars)", () => {
    expect(weaponAtk("f", 0)).toBe(WEAPON_BASE_ATK);
    expect(weaponAtk("s", 5)).toBeCloseTo(
      WEAPON_BASE_ATK * RARITIES.s.multiplier * (1 + STAR_BONUS * 5),
      10,
    );
    const w = generateWeapon(createRng(1), "c");
    expect(w.name).toMatch(
      new RegExp(`^${WEAPON_TYPE_DATA[w.type].noun} \\S+ de `),
    );
    expect(w.atkBonus).toBe(weaponAtk("c", 0, w.type));
    expect(weaponAtk("c", 0, "espada")).toBe(6);
    expect(weaponAtk("f", 0, "hacha")).toBe(4.4);
  });
  it("key space is 15 types x 5 elements x 7 ranks = 525", () => {
    expect(WEAPON_KEY_SPACE).toBe(525);
    const rng = createRng(77);
    const keys = new Set<string>();
    for (let i = 0; i < 20000; i++)
      keys.add(generateWeapon(rng, RARITY_IDS[i % RARITY_IDS.length]).id);
    expect(keys.size).toBe(525);
    expect(weaponKey("daga", "rayo", "a")).toBe("w-daga-rayo-a");
    expect(WEAPON_TYPES.length * ELEMENTS.length * RARITY_IDS.length).toBe(525);
  });
  it("secondary effect is applied exactly once", () => {
    const base = rich();
    const rng = createRng(31);
    let p = pullCharacter(base, rng)!.profile;
    const c = p.characters[0];
    const plain = heroFromOwned(p, c.id)!;
    for (const type of HAND_TYPES) {
      const classId = CLASS_IDS.find((k) => canUseWeapon(k, type))!;
      const pc = { ...p, characters: [{ ...c, classId }] };
      const w = {
        ...generateWeapon(createRng(1), "f"),
        type,
        id: weaponKey(type, "fuego", "f"),
        element: "fuego" as const,
        atkBonus: weaponAtk("f", 0, type),
      };
      const q = equipWeapon({ ...pc, weapons: [w] }, c.id, w.id);
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
    p = fitClass(pullWeapon(p, rng, 10)!.profile);
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
    p = fitClass(pullWeapon(p, rng, 10)!.profile);
    const c = p.characters[0];
    const w = p.weapons[0];
    const plain = heroFromOwned(p, c.id)!;
    expect(plain.stats.hp).toBe(scaleStats(c.stats, c.rarity, c.stars).hp);
    expect(plain.weapon).toBeUndefined();
    p = equipWeapon(p, c.id, w.id);
    const armed = heroFromOwned(p, c.id)!;
    expect(armed.stats.atk).toBeCloseTo(plain.stats.atk + w.atkBonus, 1);
    expect(armed.weapon).toEqual({ element: w.element, atkBonus: w.atkBonus, type: w.type });
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
          classId: "caballero",
          element: "agua",
          rarity: "f",
          stars: 0,
          stats: CLASSES.caballero.stats,
        },
      ],
      weapons: [{ id: "w-fuego-c", element: "fuego", rarity: "c", stars: 2 }],
      equipped: { "c-caballero-agua-f": "w-fuego-c" },
    });
    expect(old.weapons[0]).toMatchObject({
      id: "w-espada-fuego-c",
      type: "espada",
      atkBonus: weaponAtk("c", 2, "espada"),
    });
    expect(old.equipped).toEqual({
      "c-caballero-agua-f": "w-espada-fuego-c",
    });
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
        { element: "fuego", rarity: "c", stars: 99, atkBonus: 9999 },
        { element: "fuego", rarity: "c", stars: 1 },
      ],
      fragments: { "mago:c": 4, "x:y": 9, "mago:f": -3 }, // junk entries are ignored, valid ones paid
      equipped: { ghost: "w-fuego-c" },
      bestFloor: Infinity,
    });
    expect(p.coins).toBe(4 * FRAGMENT_REFUND);
    expect(p.pity).toEqual({ character: 0, weapon: 0 }); // pity is gone: old counters clamp to 0
    expect(p.characters).toHaveLength(0);
    expect(p.weapons).toHaveLength(1);
    expect(p.weapons[0].stars).toBe(MAX_STARS);
    expect(p.weapons[0].atkBonus).toBe(weaponAtk("c", 5));
    expect(p.equipped).toEqual({});
    expect(p.bestFloor).toBe(0);
  });
});

describe("migrate: heroes saved before Run v2", () => {
  it("keeps a hero whose stats have flee and no critDmg, filling class defaults", () => {
    const old = {
      version: 4,
      coins: 10,
      characters: [
        {
          id: "x",
          name: "Viejo",
          classId: "picaro",
          element: "fuego",
          rarity: "c",
          stars: 2,
          traits: ["cobarde"],
          catchphrase: "hola",
          level: 1,
          xp: 0,
          stats: { hp: 90, atk: 17, def: 4, crit: 0.25, resist: 0.2, accuracy: 0, flee: 0.1, speed: 10 },
        },
        {
          id: "y",
          name: "Viejo2",
          classId: "mago",
          element: "agua",
          rarity: "f",
          stars: 0,
          stats: { hp: 80, atk: 22, def: 3, crit: 0.1, resist: 0.05, accuracy: 0, flee: 0, speed: 10 },
        },
      ],
    };
    const p = migrate(old);
    expect(p.characters).toHaveLength(2);
    const pic = p.characters.find((c) => c.classId === "picaro")!;
    expect(pic.stats.critDmg).toBe(2);
    expect(pic.stats.regen).toBe(0);
    expect(p.characters.find((c) => c.classId === "mago")!.stats.critDmg).toBe(1.5);
    expect(pic.legacy).toBe(true);
  });
});
