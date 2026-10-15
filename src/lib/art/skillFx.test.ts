import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { iconFor } from "../art";
import { EFFECTS } from "./effects.generated";
import { PIXEL_ICON_NAMES } from "./pixel";
import { SKILL_FX, eventVfx } from "./skillFx";
import type { CombatEvent } from "@/lib/game/combat";

const ev = (type: CombatEvent["type"], extra: Partial<CombatEvent> = {}): CombatEvent => ({ seq: 0, turn: 1, type, actor: 1, ...extra });

describe("semantic event VFX", () => {
  it("maps each consumed status to its element sheet", () => {
    const ids = ["quemadura", "escarcha", "impulso", "ruptura", "sobrecarga"]
      .map((d) => eventVfx(ev("statusConsumed", { actor: 0, target: 1, detail: d }))?.id);
    expect(ids).toEqual(["consume_fire", "consume_water", "consume_wind", "consume_earth", "consume_lightning"]);
    expect(eventVfx(ev("statusConsumed", { actor: 0, target: 1, detail: "impulso" }))?.at).toBe(0);
    expect(eventVfx(ev("statusConsumed", { actor: 0, target: 1, detail: "ruptura" }))?.at).toBe(1);
  });

  it("only plays the ritual and armor sheets for their exact outcome", () => {
    expect(eventVfx(ev("staggerBroken", { actor: 0, target: 2 }))).toEqual({ id: "stagger_break", at: 2 });
    expect(eventVfx(ev("telegraphCancelled", { detail: "channeling" }))?.id).toBe("ritual_interrupt");
    expect(eventVfx(ev("telegraphCancelled", { detail: "charge" }))).toBeNull();
    expect(eventVfx(ev("bossPhaseChanged", { detail: "armadura" }))?.id).toBe("armor_rebuild");
    expect(eventVfx(ev("bossPhaseChanged", { detail: "roto" }))).toBeNull();
    expect(eventVfx(ev("staggerDamaged"))).toBeNull();
  });

  it("registers every referenced effect and skill icon with files on disk", () => {
    for (const id of ["consume_fire", "consume_water", "consume_wind", "consume_earth", "consume_lightning", "stagger_break", "ritual_interrupt", "armor_rebuild"]) {
      expect(EFFECTS[id]).toMatchObject({ frames: 6, fps: 10, loop: false, finish: "remove", cell: [512, 512] });
      for (const p of [`effects/${id}.webp`, `effects/reduced/${id}.webp`, `effects-px/${id}.png`, `effects-px/reduced/${id}.png`])
        expect(existsSync(join(process.cwd(), "public/art", p)), p).toBe(true);
    }
    for (const id of ["mage_seal", "cleric_cleanse", "berserker_charge", "berserker_release", "berserker_recover", "berserker_shatter"] as const) {
      expect(SKILL_FX[id].icon).toBe(id);
      expect(iconFor("skill", id)).toBe(`skill_${id}`);
      expect(PIXEL_ICON_NAMES).toContain(`skill_${id}`);
      expect(existsSync(join(process.cwd(), `public/art/icons/icon_skill_${id}.webp`))).toBe(true);
    }
  });
});
