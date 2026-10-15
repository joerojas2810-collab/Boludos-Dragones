// Torre relics: catalog, eligibility, offers, slots/upgrades and the aggregation caps.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "./characters";
import { ELEMENTS } from "./elements";
import {
  aggregateRelics,
  buildOffer,
  eligibleRelics,
  MAX_RELICS,
  RELIC_CAPS,
  RELIC_IDS,
  RELICS,
  takeRelic,
  upgradable,
  valueOf,
  type OwnedRelic,
  type RelicId,
} from "./relics";

const t1 = (id: RelicId): OwnedRelic => ({ id, tier: 1 });
const t2 = (id: RelicId): OwnedRelic => ({ id, tier: 2 });
const cat = (id: RelicId) => RELICS[id].category;

describe("catalog", () => {
  it("has 18 unique ids, each keyed by itself and matching the data contract", () => {
    expect(RELIC_IDS).toHaveLength(18);
    expect(new Set(RELIC_IDS).size).toBe(18);
    expect(Object.keys(RELICS).sort()).toEqual([...RELIC_IDS].sort());
    const contract = JSON.parse(readFileSync("docs/torre/CONTRATO-DATOS.json", "utf8")) as {
      relics: { artId: string }[];
    };
    expect(contract.relics.map((r) => r.artId)).toEqual([...RELIC_IDS]);
    for (const id of RELIC_IDS) expect(RELICS[id].id).toBe(id);
  });

  it("has increasing tier values and readable text for both tiers", () => {
    for (const id of RELIC_IDS) {
      const [a, b] = RELICS[id].values;
      expect(b).toBeGreaterThan(a);
      for (const tier of [1, 2] as const) {
        const txt = RELICS[id].text(valueOf({ id, tier }));
        expect(txt.length).toBeGreaterThan(5);
        expect(txt).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("splits into 6 global, 5 class, 5 element and 2 risk relics", () => {
    const n = (f: (c: string) => boolean) => RELIC_IDS.filter((id) => f(cat(id))).length;
    expect(n((c) => c === "global")).toBe(6);
    expect(n((c) => c === "riesgo")).toBe(2);
    expect(n((c) => (CLASS_IDS as readonly string[]).includes(c))).toBe(5);
    expect(n((c) => (ELEMENTS as readonly string[]).includes(c))).toBe(5);
  });
});

describe("eligibility", () => {
  it("is 6 global + 1 class + 1 element + 2 risk for every class x element", () => {
    for (const c of CLASS_IDS)
      for (const e of ELEMENTS) {
        const ids = eligibleRelics(c, e);
        expect(ids).toHaveLength(10);
        expect(ids.filter((id) => cat(id) === "global")).toHaveLength(6);
        expect(ids.filter((id) => cat(id) === "riesgo")).toHaveLength(2);
        expect(ids.filter((id) => cat(id) === c)).toHaveLength(1);
        expect(ids.filter((id) => cat(id) === e)).toHaveLength(1);
      }
  });
});

describe("offers", () => {
  const sample = (owned: OwnedRelic[] = [], n = 200) =>
    Array.from({ length: n }, (_, i) => buildOffer(1234, "mago", "fuego", owned, [1, 2, i]));

  it("are deterministic for the same seed and salt, and vary with the salt", () => {
    expect(buildOffer(7, "mago", "fuego", [], [1, 2, 3])).toEqual(buildOffer(7, "mago", "fuego", [], [1, 2, 3]));
    const set = new Set(sample().map((o) => o.map((x) => x.relicId).join()));
    expect(set.size).toBeGreaterThan(5);
  });

  it("give up to 3 unique options with >=1 global, >=1 class/element and <=1 risk", () => {
    for (const offer of sample()) {
      expect(offer).toHaveLength(3);
      const ids = offer.map((o) => o.relicId);
      expect(new Set(ids).size).toBe(3);
      expect(new Set(offer.map((o) => o.id)).size).toBe(3);
      expect(ids.filter((id) => cat(id) === "global").length).toBeGreaterThanOrEqual(1);
      expect(ids.filter((id) => cat(id) === "mago" || cat(id) === "fuego").length).toBeGreaterThanOrEqual(1);
      expect(ids.filter((id) => cat(id) === "riesgo").length).toBeLessThanOrEqual(1);
      for (const id of ids) expect(eligibleRelics("mago", "fuego")).toContain(id);
    }
  });

  it("offer a tier-I owned relic as the tier-II upgrade, and never a tier-II one", () => {
    const owned = [t1("bear_heart"), t2("whetstone"), t1("old_book")];
    let sawUpgrade = false;
    for (const offer of sample(owned, 400)) {
      for (const o of offer) {
        expect(o.relicId).not.toBe("whetstone");
        if (o.relicId === "bear_heart" || o.relicId === "old_book") {
          expect(o.tier).toBe(2);
          sawUpgrade = true;
        } else expect(o.tier).toBe(1);
      }
    }
    expect(sawUpgrade).toBe(true);
  });

  it("degrade to fewer options (down to none) when too few ids are eligible", () => {
    const eligible = eligibleRelics("mago", "fuego");
    const most = eligible.slice(0, 9).map(t2);
    const one = buildOffer(5, "mago", "fuego", most, [1]);
    expect(one).toHaveLength(1);
    expect(one[0].relicId).toBe(eligible[9]);
    expect(buildOffer(5, "mago", "fuego", eligible.map(t2), [1])).toEqual([]);
    // only risk + global left: still no duplicates and at most one risk
    const rest = eligible.filter((id) => cat(id) !== "riesgo" && cat(id) !== "global").map(t2);
    const offer = buildOffer(5, "mago", "fuego", rest, [2]);
    expect(offer.length).toBeLessThanOrEqual(3);
    expect(offer.filter((o) => cat(o.relicId) === "riesgo").length).toBeLessThanOrEqual(1);
  });
});

describe("slots and upgrades", () => {
  it("adds up to six, upgrades I to II once, and rejects invalid picks", () => {
    let owned: OwnedRelic[] = [];
    for (const id of RELIC_IDS.slice(0, MAX_RELICS)) {
      const r = takeRelic(owned, { relicId: id, tier: 1 });
      expect("error" in r).toBe(false);
      owned = r as OwnedRelic[];
    }
    expect(owned).toHaveLength(MAX_RELICS);
    const up = takeRelic(owned, { relicId: owned[0].id, tier: 2 }) as OwnedRelic[];
    expect(up).toHaveLength(MAX_RELICS);
    expect(up[0].tier).toBe(2);
    expect(owned[0].tier).toBe(1); // immutable input
    expect(takeRelic(up, { relicId: owned[0].id, tier: 2 })).toHaveProperty("error"); // II does not upgrade again
    expect(takeRelic(owned, { relicId: "phoenix_heart", tier: 2 })).toHaveProperty("error"); // not owned
    expect(takeRelic(owned, { relicId: owned[1].id, tier: 1 })).toHaveProperty("error"); // duplicate, never a second copy
  });

  it("needs an explicit valid slot to replace when full, and the replacement is tier I", () => {
    const owned = RELIC_IDS.slice(0, MAX_RELICS).map(t2);
    const pick = { relicId: "phoenix_heart" as RelicId, tier: 1 as const };
    for (const slot of [undefined, -1, 6, 1.5]) expect(takeRelic(owned, pick, slot)).toHaveProperty("error");
    const r = takeRelic(owned, pick, 2) as OwnedRelic[];
    expect(r).toHaveLength(MAX_RELICS);
    expect(r[2]).toEqual(t1("phoenix_heart"));
    expect(r.filter((_, i) => i !== 2)).toEqual(owned.filter((_, i) => i !== 2));
  });

  it("upgradable lists only tier-I relics", () => {
    expect(upgradable([t1("bear_heart"), t2("whetstone")])).toEqual([t1("bear_heart")]);
  });
});

describe("aggregation", () => {
  const allII = RELIC_IDS.map(t2);

  it("keeps every temporary bonus under its global cap, with one copy per relic", () => {
    const a = aggregateRelics(allII);
    expect(a.hpMult - 1).toBeLessThanOrEqual(RELIC_CAPS.hp);
    expect(a.mods.basicDmg ?? 0).toBeLessThanOrEqual(RELIC_CAPS.basic);
    expect(a.mods.skillDmg ?? 0).toBeLessThanOrEqual(RELIC_CAPS.skill);
    expect(a.mods.critPts ?? 0).toBeLessThanOrEqual(RELIC_CAPS.crit);
    expect(a.mods.hitReduction ?? 0).toBeLessThanOrEqual(RELIC_CAPS.hitReduction);
    expect(RELIC_CAPS).toEqual({ hp: 0.3, basic: 0.3, skill: 0.3, crit: 0.12, hitReduction: 0.18 });
  });

  it("maps each relic only to its own components", () => {
    const keysOf = (id: RelicId) => Object.keys(aggregateRelics([t2(id)]).mods).sort();
    expect(keysOf("whetstone")).toEqual(["basicDmg"]);
    expect(keysOf("vorpal_blade")).toEqual(["hitExtra", "skillDmg"]);
    expect(keysOf("bronze_armor")).toEqual(["hitReduction"]);
    expect(keysOf("hunter_lens")).toEqual(["critPts"]);
    expect(keysOf("bear_heart")).toEqual([]);
    expect(keysOf("bottomless_purse")).toEqual([]);
    expect(keysOf("dragon_fang")).toEqual(["burnDmg"]);
    expect(keysOf("moss_amulet")).toEqual(["frostBonus"]);
    expect(keysOf("broken_clock")).toEqual(["windBonus"]);
    expect(keysOf("scholar_seal")).toEqual(["dischargeBonus"]);
    expect(keysOf("plate_armor")).toEqual(["pierceBonus"]);
    expect(keysOf("duelist_glove")).toEqual(["exposedFirst"]);
    expect(keysOf("thirsty_chalice")).toEqual(["chaliceShield"]);
    expect(keysOf("blood_ring")).toEqual(["recklessCut"]);
    expect(keysOf("runic_shield")).toEqual(["startRes"]);
    expect(keysOf("winged_boots")).toEqual(["startProgress"]);
    expect(keysOf("old_book")).toEqual(["inscribeDmg"]);
    expect(keysOf("phoenix_heart")).toEqual(["phoenix"]);
  });

  it("scales by tier and exposes hp and fragment bonuses outside the engine mods", () => {
    expect(aggregateRelics([t1("bear_heart")]).hpMult).toBeCloseTo(1.08);
    expect(aggregateRelics([t2("bear_heart")]).hpMult).toBeCloseTo(1.12);
    expect(aggregateRelics([t1("bottomless_purse")]).winFragments).toBe(5);
    expect(aggregateRelics([t2("bottomless_purse")]).winFragments).toBe(8);
    expect(aggregateRelics([t1("vorpal_blade")]).mods).toMatchObject({ skillDmg: 0.12, hitExtra: 0.06 });
    expect(aggregateRelics([]).mods).toEqual({});
    expect(aggregateRelics([]).hpMult).toBe(1);
  });

  it("is order independent", () => {
    const a = aggregateRelics(allII);
    const b = aggregateRelics([...allII].reverse());
    expect(b).toEqual(a);
  });
});
