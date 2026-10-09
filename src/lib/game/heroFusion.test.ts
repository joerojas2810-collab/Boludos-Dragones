import { describe, expect, it } from "vitest";
import { CLASS_IDS, generateCharacter, type ClassId } from "./characters";
import { HERO_FUSION, STAR_CARRY, STAR_UNITS, fuseHeroes, starUpHero, swapTrait, unitsOf } from "./heroFusion";
import { characterKey, type OwnedCharacter, type Profile } from "./profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { TRAIT_IDS, type TraitId } from "./traits";
import { createRng } from "./rng";
import { ELEMENTS } from "./elements";

let n = 0;
function hero(
  rank: RarityId,
  classId: ClassId = "mago",
  el = ELEMENTS[n % 5],
  stars = 0,
  copies?: TraitId[],
): OwnedCharacter {
  const c = generateCharacter(createRng(++n), classId);
  return { ...c, element: el, id: characterKey(classId, el, rank), rarity: rank, stars, ...(copies ? { copies } : {}) };
}
const profile = (characters: OwnedCharacter[], coins = 100000, equipped: Record<string, string> = {}) =>
  ({ coins, characters, weapons: [], equipped, runsPlayed: 0 }) as unknown as Profile;
// the full group a rank-up needs (base + ratio-1 heroes), all different class/element
const group = (rank: RarityId) =>
  Array.from({ length: HERO_FUSION[rank]!.ratio }, (_, i) =>
    hero(rank, CLASS_IDS[i % 4], ELEMENTS[Math.floor(i / 4) % 5]),
  );
const mats = (hs: OwnedCharacter[]) => hs.map((h) => ({ id: h.id, n: 1 }));
const [T1, T2, T3] = TRAIT_IDS;

describe("starUpHero", () => {
  it("3 heroes of the same rank give the base +1 star and are spent", () => {
    const hs = [hero("s", "mago", "fuego", 1), ...[0, 1, 2].map((i) => hero("s", CLASS_IDS[i], "agua"))];
    const r = starUpHero(profile(hs), { baseId: hs[0].id, materials: mats(hs.slice(1)) });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters).toHaveLength(1);
    expect(r.profile.characters[0]).toMatchObject({ id: hs[0].id, stars: 2, level: hs[0].level });
  });

  it("copies are material: the base gives only its own, others give copies first and stay", () => {
    const base = hero("a", "mago", "fuego", 0, [T1, T2]);
    const other = hero("a", "picaro", "agua", 2, [T3, T3]);
    const r = starUpHero(profile([base, other]), {
      baseId: base.id,
      materials: [
        { id: base.id, n: 1 },
        { id: other.id, n: 2 },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    const [b, o] = r.profile.characters;
    expect([b.stars, b.copies]).toEqual([1, [T1]]); // the last copy of the base went
    expect([o.stars, o.copies]).toBeDefined();
    expect(o.copies).toBeUndefined(); // both copies spent; the hero and its stars stay
    expect(o.stars).toBe(2);
  });

  it("a hero leaves only when all its units are used; the base never leaves", () => {
    const base = hero("a", "mago", "fuego");
    const other = hero("a", "picaro", "agua", 0, [T1, T2]);
    const ok = starUpHero(profile([base, other]), { baseId: base.id, materials: [{ id: other.id, n: 3 }] });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.profile.characters.map((c) => c.id)).toEqual([base.id]);
    expect(starUpHero(profile([base, other]), { baseId: base.id, materials: [{ id: base.id, n: 1 }, { id: other.id, n: 2 }] }).ok).toBe(false);
  });

  it("rejects the wrong amount, mixed ranks, repeats, strangers and the max stars", () => {
    const base = hero("c", "mago", "fuego");
    const three = [0, 1, 2].map((i) => hero("c", CLASS_IDS[i], "agua"));
    const run = (m: { id: string; n: number }[], b = base, rest = three) =>
      starUpHero(profile([b, ...rest]), { baseId: b.id, materials: m });
    expect(run(mats(three.slice(1))).ok).toBe(false);
    expect(run([...mats(three), { id: "c-x", n: 1 }]).ok).toBe(false);
    expect(run([{ id: three[0].id, n: 1 }, { id: three[0].id, n: 2 }]).ok).toBe(false);
    expect(run(mats([...three.slice(0, 2), hero("b")]), base, [...three, hero("b")]).ok).toBe(false);
    expect(run(mats(three), { ...base, stars: MAX_STARS }).ok).toBe(false);
    expect(run([{ id: three[0].id, n: 0 }, ...mats(three.slice(1))]).ok).toBe(false);
  });
});

describe("fuseHeroes", () => {
  it("a group of heroes of a rank becomes the base one rank higher, keeping identity and level", () => {
    const hs = group("f").map((h, i) => ({ ...h, level: i === 0 ? 7 : 1 }));
    const base = hs[0];
    const r = fuseHeroes(profile(hs), { baseId: base.id, materials: mats(hs.slice(1)) });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters).toHaveLength(1);
    const h = r.profile.characters[0];
    expect(h.rarity).toBe("e");
    expect(h.id).toBe(characterKey(base.classId, base.element, "e"));
    expect([h.name, h.element, h.level, h.stars, h.traits]).toEqual([base.name, base.element, 7, 0, base.traits]);
    expect(r.profile.coins).toBe(100000 - HERO_FUSION.f!.coins);
  });

  it("works from the very first star count: no minimum stars", () => {
    const hs = group("d");
    expect(fuseHeroes(profile(hs), { baseId: hs[0].id, materials: mats(hs.slice(1)) }).ok).toBe(true);
  });

  it("converts the stars with STAR_CARRY and caps the level to what they allow", () => {
    const hs = group("a");
    const base = { ...hs[0], stars: 5, level: 70 };
    const r = fuseHeroes(profile([base, ...hs.slice(1)]), { baseId: base.id, materials: mats(hs.slice(1)) });
    if (!r.ok) throw new Error(r.error);
    const h = r.profile.characters[0];
    expect(h.stars).toBe(STAR_CARRY.a![5]); // 2
    expect(h.level).toBe(20 + 10 * h.stars);
    expect(h.xp).toBe(0);
  });

  it("copies are material, and the base's unspent copies stay behind as a hero of the old rank", () => {
    const base = hero("c", "mago", "fuego", 3, [T1, T2, T3]);
    const others = [0, 1].map((i) => hero("c", CLASS_IDS[i], "agua"));
    // ratio 4 -> 3 units: the other two heroes + the base's last copy
    const r = fuseHeroes(profile([base, ...others]), {
      baseId: base.id,
      materials: [...mats(others), { id: base.id, n: 1 }],
    });
    if (!r.ok) throw new Error(r.error);
    const up = r.profile.characters.find((c) => c.rarity === "b")!;
    const left = r.profile.characters.find((c) => c.rarity === "c")!;
    expect(up).toMatchObject({ stars: STAR_CARRY.c![3], traits: base.traits });
    expect(up.copies).toBeUndefined();
    expect(left).toMatchObject({ id: base.id, stars: 0, level: 1, traits: [T1], copies: [T2] });
    expect(r.profile.characters).toHaveLength(2);
    expect(r.fusion.split?.id).toBe(base.id);
  });

  it("an owned hero of the result rank merges: the trait you pick stays, the other becomes a copy", () => {
    const hs = group("f");
    const owned = { ...hero("e", hs[0].classId, hs[0].element, 2, [T3]), level: 33 };
    const run = (keep?: "base" | "existing") =>
      fuseHeroes(profile([...hs, owned]), { baseId: hs[0].id, materials: mats(hs.slice(1)), keep });
    const a = run();
    if (!a.ok) throw new Error(a.error);
    expect(a.fusion.merged).toBe(true);
    expect(a.profile.characters).toHaveLength(1);
    expect(a.profile.characters[0]).toMatchObject({
      id: owned.id,
      stars: 2, // the owned hero's: higher than the converted 0
      level: 33,
      traits: hs[0].traits,
      copies: [T3, ...owned.traits],
    });
    const b = run("existing");
    if (!b.ok) throw new Error(b.error);
    expect(b.profile.characters[0]).toMatchObject({ traits: owned.traits, copies: [T3, ...hs[0].traits] });
  });

  it("a merge takes the higher stars of the two", () => {
    const hs = group("a").map((h, i) => (i === 0 ? { ...h, stars: 5 } : h));
    const owned = hero("s", hs[0].classId, hs[0].element, 1);
    const r = fuseHeroes(profile([...hs, owned]), { baseId: hs[0].id, materials: mats(hs.slice(1)) });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters[0].stars).toBe(STAR_CARRY.a![5]);
  });

  it("gear follows the base hero, materials unequip, a merge keeps the owned hero's gear", () => {
    const hs = group("f");
    const equipped = { [hs[0].id]: "w-a", [`${hs[0].id}|casco`]: "w-b", [hs[1].id]: "w-c" };
    const r = fuseHeroes(profile(hs, 1000, equipped), { baseId: hs[0].id, materials: mats(hs.slice(1)) });
    if (!r.ok) throw new Error(r.error);
    const id = r.profile.characters[0].id;
    expect(r.profile.equipped).toEqual({ [id]: "w-a", [`${id}|casco`]: "w-b" });
    const owned = hero("e", hs[0].classId, hs[0].element);
    const m = fuseHeroes(profile([...hs, owned], 1000, { ...equipped, [owned.id]: "w-d" }), {
      baseId: hs[0].id,
      materials: mats(hs.slice(1)),
    });
    if (!m.ok) throw new Error(m.error);
    expect(m.profile.equipped).toEqual({ [owned.id]: "w-d" });
  });

  it("rejects wrong counts, mixed ranks, missing coins and S", () => {
    const hs = group("f");
    const ids = mats(hs.slice(1));
    expect(fuseHeroes(profile(hs), { baseId: hs[0].id, materials: ids.slice(1) }).ok).toBe(false);
    expect(fuseHeroes(profile(hs), { baseId: hs[0].id, materials: [...ids.slice(1), { id: hs[0].id, n: 1 }] }).ok).toBe(false);
    expect(fuseHeroes(profile(hs, 1), { baseId: hs[0].id, materials: ids }).ok).toBe(false);
    const mixed = [...hs.slice(0, 4), hero("e")];
    expect(fuseHeroes(profile(mixed), { baseId: mixed[0].id, materials: mats(mixed.slice(1)) }).ok).toBe(false);
    const top = [0, 1, 2, 3].map((i) => hero("s", CLASS_IDS[i], ELEMENTS[i])); // S is the top rank
    expect(fuseHeroes(profile(top), { baseId: top[0].id, materials: mats(top.slice(1)) }).ok).toBe(false);
  });
});

describe("swapTrait", () => {
  it("trades the main trait with a copy's", () => {
    const h = hero("b", "mago", "fuego", 1, [T2, T3]);
    const r = swapTrait(profile([h]), { id: h.id, index: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters[0]).toMatchObject({ traits: [T3], copies: [T2, h.traits[0]], stars: 1 });
    expect(swapTrait(profile([h]), { id: h.id, index: 2 }).ok).toBe(false);
    expect(swapTrait(profile([hero("b")]), { id: "c-x", index: 0 }).ok).toBe(false);
  });
});

describe("unitsOf", () => {
  it("is 1 plus the spare copies", () => {
    expect([unitsOf(hero("f")), unitsOf(hero("f", "mago", "fuego", 0, [T1, T2]))]).toEqual([1, 3]);
  });
});

describe("hero growth balance", () => {
  it("asks for more of the common heroes and fewer of the rare ones", () => {
    const ratios = RARITY_IDS.flatMap((r) => (HERO_FUSION[r] ? [HERO_FUSION[r]!.ratio] : []));
    expect(ratios).toHaveLength(RARITY_IDS.length - 1); // every rank but the top one
    expect(HERO_FUSION.s).toBeUndefined();
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThanOrEqual(ratios[i - 1]);
    expect(ratios[ratios.length - 1]).toBeLessThanOrEqual(4); // A -> S must be reachable
  });

  it("a rank-up never keeps more star value than the next rank's rarity allows (no shortcut)", () => {
    RARITY_IDS.slice(0, -1).forEach((r, i) => {
      const ratio = RARITIES[RARITY_IDS[i + 1]].probability / RARITIES[r].probability;
      STAR_CARRY[r]!.forEach((kept, stars) => {
        expect(kept).toBeLessThanOrEqual(Math.floor(stars * ratio + 1e-9));
        expect(kept).toBeLessThanOrEqual(MAX_STARS);
      });
      expect(STAR_CARRY[r]).toHaveLength(MAX_STARS + 1);
    });
  });

  it("5 stars bought at F reach S as 0 stars", () => {
    let s = 5;
    for (const r of RARITY_IDS.slice(0, -1)) s = STAR_CARRY[r]![s];
    expect(s).toBe(0);
  });

  it("a star costs about as many pulls as a rank-up of the same rank", () => {
    for (const r of RARITY_IDS.slice(0, -1)) {
      const starPulls = (STAR_UNITS + 1) / RARITIES[r].probability;
      const rankPulls = HERO_FUSION[r]!.ratio / RARITIES[r].probability;
      expect(starPulls / rankPulls).toBeGreaterThan(0.6);
      expect(starPulls / rankPulls).toBeLessThan(1.3);
    }
  });

  it("fusing everything pulled adds S on top of the pulled S, about +78%", () => {
    // 250 pulls give 250*p heroes per rank; fuse them all upwards to S.
    const top = RARITY_IDS.length - 1;
    let extra = 0;
    RARITY_IDS.slice(0, top).forEach((r, i) => {
      let h = 250 * RARITIES[r].probability;
      for (const next of RARITY_IDS.slice(i, top)) h /= HERO_FUSION[next]!.ratio;
      extra += h;
    });
    const pulled = 250 * RARITIES.s.probability;
    expect(extra).toBeGreaterThan(0.6 * pulled);
    expect(extra).toBeLessThan(1.0 * pulled);
  });
});
