import { describe, expect, it } from "vitest";
import { applyExpeditionAction, EVENT_IDS, startExpedition } from "./game/expedition";
import { niveladoHero } from "./game/niveladoHero";
import { RELIC_IDS, type OwnedRelic } from "./game/relics";
import { stamp } from "./expeditionSync";
import {
  eventMechanics,
  goodView,
  hudLine,
  needsReplace,
  offerView,
  relicEffect,
  relicRows,
  restOptionsView,
  sanctuaryOptionsView,
  scoreLine,
} from "./expeditionView";

const s0 = startExpedition({ mode: "nivelado", seed: 7, weekKey: "2026-10-12", hero: niveladoHero("mago", "agua") });
const six: OwnedRelic[] = RELIC_IDS.slice(0, 6).map((id) => ({ id, tier: 1 as const }));

describe("expedition view helpers", () => {
  it("always shows six relic slots, empty ones included", () => {
    const rows = relicRows([{ id: "bear_heart", tier: 2 }]);
    expect(rows).toHaveLength(6);
    expect(rows[0].relic?.id).toBe("bear_heart");
    expect(rows[0].tier).toBe("Nivel II");
    expect(rows[0].effect).toContain("12 %");
    expect(rows[5].relic).toBeNull();
  });
  it("describes tier effects from the catalog", () => {
    expect(relicEffect("whetstone", 1)).toContain("8 %");
    expect(relicEffect("whetstone", 2)).toContain("12 %");
  });
  it("offers an upgrade as tier II and asks for a slot only for a new relic with full slots", () => {
    expect(offerView({ id: "o0", relicId: "bear_heart", tier: 2 }).tier).toBe("Mejora a nivel II");
    expect(needsReplace(six, { tier: 1 })).toBe(true);
    expect(needsReplace(six, { tier: 2 })).toBe(false);
    expect(needsReplace(six.slice(0, 5), { tier: 1 })).toBe(false);
  });
  it("explains why a shop good cannot be bought", () => {
    const shop = { goods: [], bought: false };
    const poor = goodView({ ...s0, fragments: 5, shop }, { id: "g2", kind: "heal", price: 20 });
    expect(poor.disabled).toBe("Te faltan 15 fragmentos.");
    const done = goodView({ ...s0, fragments: 500, shop: { goods: [], bought: true } }, { id: "g2", kind: "heal", price: 20 });
    expect(done.disabled).toContain("compra");
    const ok = goodView({ ...s0, fragments: 500, relics: six, shop }, { id: "g0", kind: "relic", price: 40, relicId: "old_book" });
    expect(ok.disabled).toBeNull();
    expect(ok.replace).toBe(true);
  });
  it("disables rest healing at full health and the sanctuary upgrade without tier I relics", () => {
    expect(restOptionsView(s0)[0].disabled).toBeTruthy();
    expect(restOptionsView({ ...s0, hp: 1 })[0].disabled).toBeUndefined();
    expect(sanctuaryOptionsView(s0).find((o) => o.id === "upgrade")?.disabled).toBeTruthy();
    expect(sanctuaryOptionsView({ ...s0, relics: [{ id: "bear_heart", tier: 1 }] }).find((o) => o.id === "upgrade")?.disabled).toBeUndefined();
  });
  it("shows both answers of every event even if undiscovered", () => {
    for (const id of EVENT_IDS) {
      const o = eventMechanics(id);
      expect(o.map((x) => x.id)).toEqual(["a", "b"]);
      expect(o.every((x) => x.label.length > 5)).toBe(true);
    }
  });
  it("formats position and score", () => {
    expect(hudLine({ sector: 2, node: 4, combats: 9 })).toBe("Sector 2 · piso 14 · combate 10");
    expect(hudLine({ sector: 1, node: 3, combats: 2 })).toBe("Sector 1 · piso 3 · combate 2");
    expect(scoreLine(23, 410)).toBe("Nodo 23 · 410 turnos");
  });
  it("walks the real reducer from the same view helpers (route options exist at the first node)", () => {
    const begun = applyExpeditionAction(s0, stamp({ type: "begin" }, s0, "b")).state;
    expect(begun.offer?.options.length).toBeGreaterThan(0);
  });
});
