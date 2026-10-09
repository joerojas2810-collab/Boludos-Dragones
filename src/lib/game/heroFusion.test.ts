import { describe, expect, it } from "vitest";
import { CLASS_IDS, generateCharacter, type ClassId } from "./characters";
import { FUSION_STARS, HERO_FUSION, fuseHeroes } from "./heroFusion";
import { characterKey, type OwnedCharacter, type Profile } from "./profile";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { createRng } from "./rng";
import { ELEMENTS } from "./elements";

let n = 0;
function hero(rank: RarityId, classId: ClassId = "mago", el = ELEMENTS[n % 5], stars = 0): OwnedCharacter {
  const c = generateCharacter(createRng(++n), classId, rank);
  return { ...c, element: el, id: characterKey(classId, el, rank), rarity: rank, stars };
}
const profile = (characters: OwnedCharacter[], coins = 100000, equipped: Record<string, string> = {}) =>
  ({ coins, characters, weapons: [], equipped, runsPlayed: 0 }) as unknown as Profile;
// the full group a fusion needs (base + materials), all different class/element
const five = (rank: RarityId) =>
  Array.from({ length: HERO_FUSION[rank]!.ratio }, (_, i) =>
    hero(rank, CLASS_IDS[i % 4], ELEMENTS[Math.floor(i / 4) % 5], i === 0 ? FUSION_STARS : 0),
  );

describe("fuseHeroes", () => {
  it("a group of heroes of a rank becomes the base one rank higher, keeping identity and level", () => {
    const hs = five("f").map((h, i) => ({ ...h, level: i === 0 ? 7 : 1 }));
    const base = hs[0];
    const r = fuseHeroes(profile(hs), { baseId: base.id, materialIds: hs.slice(1).map((h) => h.id) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.characters).toHaveLength(1);
    const h = r.profile.characters[0];
    expect(h.rarity).toBe("e");
    expect(h.id).toBe(characterKey(base.classId, base.element, "e"));
    expect([h.name, h.element, h.level, h.stars]).toEqual([base.name, base.element, 7, 0]);
    expect(r.profile.coins).toBe(100000 - HERO_FUSION.f!.coins);
  });

  it("spends 3 stars of the base and keeps the rest; refuses a base under 3 stars", () => {
    const hs = five("f");
    const ids = hs.slice(1).map((h) => h.id);
    const rich = [{ ...hs[0], stars: 5 }, ...hs.slice(1)];
    const r = fuseHeroes(profile(rich), { baseId: hs[0].id, materialIds: ids });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters[0].stars).toBe(2); // 5 - 3
    const poor = [{ ...hs[0], stars: 2 }, ...hs.slice(1)];
    const f = fuseHeroes(profile(poor), { baseId: hs[0].id, materialIds: ids });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain("3★");
  });

  it("adds the traits the new rank grants (2 at C, a rule trait at S)", () => {
    const toC = five("d");
    const r = fuseHeroes(profile(toC), { baseId: toC[0].id, materialIds: toC.slice(1).map((h) => h.id) });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters[0].traits).toHaveLength(2);
    const toS = five("a");
    const s = fuseHeroes(profile(toS), { baseId: toS[0].id, materialIds: toS.slice(1).map((h) => h.id) });
    if (!s.ok) throw new Error(s.error);
    expect(s.fusion.addedTraits.length).toBeGreaterThanOrEqual(1);
  });

  it("an owned hero of the result rank gets +1 star instead", () => {
    const hs = five("f");
    const owned = { ...hero("e", hs[0].classId, hs[0].element), stars: 2 };
    const r = fuseHeroes(profile([...hs, owned]), { baseId: hs[0].id, materialIds: hs.slice(1).map((h) => h.id) });
    if (!r.ok) throw new Error(r.error);
    expect(r.profile.characters).toEqual([{ ...owned, stars: 3 }]);
    expect(r.fusion.hero).toBeUndefined();
  });

  it("gear follows the base hero, materials unequip", () => {
    const hs = five("f");
    const equipped = { [hs[0].id]: "w-a", [`${hs[0].id}|casco`]: "w-b", [hs[1].id]: "w-c" };
    const r = fuseHeroes(profile(hs, 1000, equipped), { baseId: hs[0].id, materialIds: hs.slice(1).map((h) => h.id) });
    if (!r.ok) throw new Error(r.error);
    const id = r.profile.characters[0].id;
    expect(r.profile.equipped).toEqual({ [id]: "w-a", [`${id}|casco`]: "w-b" });
  });

  it("rejects wrong counts, mixed ranks, missing coins and SSR", () => {
    const hs = five("f");
    const ids = hs.slice(1).map((h) => h.id);
    expect(fuseHeroes(profile(hs), { baseId: hs[0].id, materialIds: ids.slice(1) }).ok).toBe(false);
    expect(fuseHeroes(profile(hs), { baseId: hs[0].id, materialIds: [...ids.slice(1), hs[0].id] }).ok).toBe(false);
    expect(fuseHeroes(profile(hs, 1), { baseId: hs[0].id, materialIds: ids }).ok).toBe(false);
    const mixed = [...hs.slice(0, 4), hero("e")];
    expect(fuseHeroes(profile(mixed), { baseId: mixed[0].id, materialIds: mixed.slice(1).map((h) => h.id) }).ok).toBe(false);
    const top = [0, 1, 2].map((i) => hero("s", CLASS_IDS[i], ELEMENTS[i])); // S is the top rank
    expect(fuseHeroes(profile(top), { baseId: top[0].id, materialIds: top.slice(1).map((h) => h.id) }).ok).toBe(false);
  });
});

describe("hero fusion ratios", () => {
  it("ask for more of the common heroes and fewer of the rare ones", () => {
    const ratios = RARITY_IDS.flatMap((r) => (HERO_FUSION[r] ? [HERO_FUSION[r]!.ratio] : []));
    expect(ratios).toHaveLength(RARITY_IDS.length - 1); // every rank but the top one
    expect(HERO_FUSION.s).toBeUndefined();
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThanOrEqual(ratios[i - 1]);
    expect(ratios[ratios.length - 1]).toBeLessThanOrEqual(3); // A -> S must be reachable
  });

  it("fusing everything pulled adds S on top of the pulled S, about +70%", () => {
    // 250 pulls give 250*p heroes per rank; fuse them all upwards to S.
    const top = RARITY_IDS.length - 1;
    let extra = 0;
    RARITY_IDS.slice(0, top).forEach((r, i) => {
      let h = 250 * RARITIES[r].probability;
      for (const next of RARITY_IDS.slice(i, top)) h /= HERO_FUSION[next]!.ratio;
      extra += h;
    });
    const pulled = 250 * RARITIES.s.probability;
    expect(extra).toBeGreaterThan(0.5 * pulled);
    expect(extra).toBeLessThan(1.0 * pulled);
  });
});
