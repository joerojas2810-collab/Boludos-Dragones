import { describe, expect, it, vi } from "vitest";
import {
  allStatusLayerIds, diffLayers, eventCarrier, layerChangeDelayMs, layerOpacities, LAYER_MAX, statusLayers,
  statusLayerSrc,
} from "./statusLayers";
import { existsSync } from "node:fs";
import { join } from "node:path";

const st = (id: "escarcha" | "quemadura" | "impulso" | "ruptura", stacks: number) => ({ id, stacks, turns: 3 });
const ids = (c: Parameters<typeof statusLayers>[0]) => statusLayers(c).map((l) => l.id);

describe("statusLayers mapping", () => {
  it("picks one asset per state and stack", () => {
    for (const [id, kind, max] of [
      ["escarcha", "frost", 3], ["quemadura", "burn", 2], ["impulso", "wind", 3], ["ruptura", "fracture", 3],
    ] as const)
      for (let n = 1; n <= max; n++) expect(ids({ hp: 10, statuses: [st(id, n)] })).toEqual([`status_${kind}_${n}`]);
    for (let n = 1; n <= 3; n++) expect(ids({ hp: 10, charge: n })).toEqual([`status_charge_${n}`]);
  });

  it("shows nothing for 0, absent or dead", () => {
    expect(ids({ hp: 10 })).toEqual([]);
    expect(ids({ hp: 10, statuses: [st("escarcha", 0)], charge: 0 })).toEqual([]);
    expect(ids({ hp: 0, statuses: [st("ruptura", 2)], charge: 3 })).toEqual([]);
  });

  it("clamps out-of-range stacks for display only", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = { hp: 5, statuses: [st("quemadura", 3), st("escarcha", 9)], charge: 7 };
    expect(ids(c)).toEqual(["status_frost_3", "status_burn_2", "status_charge_3"]);
    expect(c.statuses[0].stacks).toBe(3); // the combatant is untouched
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("only reads Sobrecarga from `charge`: not the class resource, not an enemy's Carga", () => {
    const c = { hp: 5, res: 3, chargePending: true, chargeUsed: true, intent: "charge" } as unknown as Parameters<typeof statusLayers>[0];
    expect(ids(c)).toEqual([]);
    expect(ids({ ...c, charge: 2 })).toEqual(["status_charge_2"]);
  });

  it("paints in a fixed order and keeps every coexisting state", () => {
    const layers = statusLayers({ hp: 5, statuses: [st("impulso", 1), st("escarcha", 2), st("ruptura", 3), st("quemadura", 1)], charge: 3 });
    expect(layers.map((l) => l.kind)).toEqual(["frost", "fracture", "burn", "wind", "charge"]);
  });

  it("has a delivered file in both styles for every id", () => {
    expect(allStatusLayerIds).toHaveLength(14);
    for (const id of allStatusLayerIds) {
      expect(existsSync(join(process.cwd(), "public", statusLayerSrc(id, false).split("?")[0]))).toBe(true);
      expect(existsSync(join(process.cwd(), "public", statusLayerSrc(id, true).split("?")[0]))).toBe(true);
    }
    expect(LAYER_MAX.burn).toBe(2);
  });
});

describe("layer lifecycle helpers", () => {
  const L = (c: Parameters<typeof statusLayers>[0]) => statusLayers(c);

  it("detects only what disappeared or changed", () => {
    const prev = L({ hp: 5, statuses: [st("escarcha", 2), st("quemadura", 1)] });
    const next = L({ hp: 5, statuses: [st("escarcha", 3)] });
    const d = diffLayers(prev, next);
    expect(d.leaving.map((l) => l.id)).toEqual(["status_frost_2", "status_burn_1"]);
    expect(d.entering.map((l) => l.id)).toEqual(["status_frost_3"]);
    expect(diffLayers(next, next)).toEqual({ leaving: [], entering: [] });
  });

  it("a mount with the same state replays nothing", () => {
    const l = L({ hp: 5, statuses: [st("ruptura", 2)], charge: 1 });
    expect(diffLayers(l, [...l])).toEqual({ leaving: [], entering: [] });
  });

  it("consumption leaves the bearer: Impulso/Sobrecarga the actor, the rest the target", () => {
    expect(eventCarrier({ type: "statusConsumed", actor: 0, target: 2, detail: "impulso" })).toBe(0);
    expect(eventCarrier({ type: "statusConsumed", actor: 0, target: 2, detail: "sobrecarga" })).toBe(0);
    for (const d of ["escarcha", "quemadura", "ruptura"]) expect(eventCarrier({ type: "statusConsumed", actor: 0, target: 2, detail: d })).toBe(2);
    expect(eventCarrier({ type: "statusRemoved", actor: 1, target: 1, detail: "escarcha" })).toBe(1);
    expect(eventCarrier({ type: "statusExpired", actor: 1 })).toBeNull();
  });

  it("delays a change only for the combatant an event touches", () => {
    const cev = [{ seq: 0, turn: 1, type: "statusConsumed" as const, actor: 0, target: 2, detail: "ruptura" }];
    expect(layerChangeDelayMs(cev, 2)).toBeGreaterThan(0);
    expect(layerChangeDelayMs(cev, 0)).toBe(0);
    expect(layerChangeDelayMs([], 2)).toBe(0);
  });

  it("recedes secondary layers only from three coexisting states", () => {
    const two = L({ hp: 5, statuses: [st("escarcha", 1), st("ruptura", 1)] });
    expect(Object.values(layerOpacities(two))).toEqual([1, 1]);
    const three = L({ hp: 5, statuses: [st("escarcha", 3), st("ruptura", 1)], charge: 1 });
    const o = layerOpacities(three);
    expect(o.frost).toBe(1);
    expect(o.fracture).toBeLessThan(1);
    expect(o.charge).toBeLessThan(1);
  });
});
