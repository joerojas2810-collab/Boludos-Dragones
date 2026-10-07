import { describe, expect, it } from "vitest";
import {
  createProfile,
  migrate,
  pullCharacter,
  pullWeapon,
} from "./game/profile";
import { createRng } from "./game/rng";
import {
  loadProfile,
  PROFILE_KEY,
  saveProfile,
  type KV,
} from "./profileStorage";
import {
  filterSortCharacters,
  pieceDelta,
  resultViews,
  summarizePull,
} from "./viewModels";

const rich = { ...createProfile(), coins: 100000 };

describe("viewModels", () => {
  it("maps every pull result to a view with stat lines and badge", () => {
    const r = pullCharacter(rich, createRng(1), 10)!;
    const views = resultViews(r.results);
    expect(views).toHaveLength(10);
    expect(views.every((v) => v.badge && v.lines?.[0].startsWith("PV"))).toBe(
      true,
    );
    const w = pullWeapon(rich, createRng(2), 3)!;
    const wv = resultViews(w.results);
    expect(wv.every((v) => v.kind === "weapon")).toBe(true);
    if (wv[0].kind === "weapon") expect(wv[0].type).toBeDefined();
  });

  it("summarizes a pull", () => {
    const r = pullCharacter(rich, createRng(3), 10)!;
    expect(summarizePull(r.results)).toMatch(/nuevos.*Mejor: /);
  });

  it("filters and sorts the collection", () => {
    const { profile } = pullCharacter(rich, createRng(4), 10)!;
    const all = filterSortCharacters(profile.characters, {
      classId: "all",
      rarity: "all",
      sort: "rarity",
    });
    expect(all).toHaveLength(profile.characters.length);
    const cls = all[0].classId;
    const only = filterSortCharacters(profile.characters, {
      classId: cls,
      rarity: "all",
      sort: "stars",
    });
    expect(only.every((c) => c.classId === cls)).toBe(true);
  });
});

describe("profileStorage", () => {
  const mem = (init?: string): KV & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    if (init !== undefined) data.set(PROFILE_KEY, init);
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
  };
  it("falls back to a fresh profile on missing or corrupt data", () => {
    expect(loadProfile(mem()).coins).toBe(0);
    expect(loadProfile(mem("{not json")).coins).toBe(0);
    expect(loadProfile(mem('{"coins":"x"}')).coins).toBe(0);
  });
  it("round-trips and migrates", () => {
    const s = mem();
    expect(saveProfile({ ...createProfile(), coins: 42 }, s)).toBe(true);
    expect(loadProfile(s)).toEqual(migrate({ ...createProfile(), coins: 42 }));
  });
  it("survives a throwing storage", () => {
    const bad: KV = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadProfile(bad).coins).toBe(0);
    expect(saveProfile(createProfile(), bad)).toBe(false);
  });
});

describe("pieceDelta", () => {
  const piece = (type: string, rarity: string, stars: number, atkBonus = 0) =>
    ({
      id: `${type}${rarity}${stars}`,
      name: type,
      type,
      element: "tierra",
      rarity,
      stars,
      atkBonus,
    }) as never;
  it("shows gains and losses against the worn piece, nothing for an empty slot", () => {
    const worn = piece("casco", "f", 0);
    const better = piece("casco", "c", 2);
    const d = pieceDelta(better, worn);
    expect(d.every((x) => x.good === true)).toBe(true);
    expect(d.map((x) => x.text).join()).toMatch(/\+\d+(\.\d)?% vida/);
    const worse = pieceDelta(worn, better);
    expect(worse.every((x) => x.good === false)).toBe(true);
    expect(worse[0].text.startsWith("−")).toBe(true);
    expect(pieceDelta(worn, worn)).toEqual([
      { text: "Igual que la equipada", good: null },
    ]);
    expect(pieceDelta(better, undefined)).toEqual([]);
  });
  it("weapons compare their attack bonus", () => {
    expect(
      pieceDelta(piece("espada", "c", 0, 9), piece("hacha", "f", 0, 5)),
    ).toEqual([{ text: "+4 ATQ", good: true }]);
  });
});
