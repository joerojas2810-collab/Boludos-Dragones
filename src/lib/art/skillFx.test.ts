import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { iconFor } from "../art";
import { EFFECTS } from "./effects.generated";
import { PIXEL_ICON_NAMES } from "./pixel";
import { SKILL_FX, basicIcon, eventVfx, pickCallouts, skillTag, stepNumbers } from "./skillFx";
import type { CombatEvent } from "@/lib/game/combat";
import { CLASS_IDS } from "@/lib/game/characters";
import { HAND_TYPES } from "@/lib/game/weapons";
import { RESOURCE_NAME, SKILLS, SKILL_IDS } from "@/lib/game/skills";

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
      expect(SKILL_FX[id].icon).toBe(`skill_${id}`);
      expect(iconFor("skill", id)).toBe(`skill_${id}`);
      expect(PIXEL_ICON_NAMES).toContain(`skill_${id}`);
      expect(existsSync(join(process.cwd(), `public/art/icons/icon_skill_${id}.webp`))).toBe(true);
    }
  });
});

const iconFile = (name: string) =>
  join(process.cwd(), "public/art", name.startsWith("part_") ? "equipment" : "icons", `icon_${name}.webp`);

describe("presentation map", () => {
  it("every action and basic-attack icon is an existing file (painted and pixel)", () => {
    const names = [...Object.values(SKILL_FX).map((f) => f.icon), ...CLASS_IDS.map((c) => basicIcon(c)), ...HAND_TYPES.map((w) => basicIcon("caballero", w))];
    for (const n of names) {
      expect(existsSync(iconFile(n)), n).toBe(true);
      expect(PIXEL_ICON_NAMES, n).toContain(n);
    }
  });

  it("the basic attack icon follows the weapon, else the class, and never reuses a skill icon", () => {
    expect(basicIcon("berserker")).toBe("part_axe");
    expect(basicIcon("mago", "baston")).toBe("part_staff");
    expect(basicIcon("picaro", "arco")).toBe("part_bow");
    const skillIcons = new Set(SKILL_IDS.map((id) => SKILL_FX[id].icon));
    for (const c of CLASS_IDS) expect(skillIcons.has(basicIcon(c))).toBe(false);
  });

  it("Bastión/Barrera and Paso/Sabotaje/Remate are told apart by icon and look", () => {
    expect(SKILL_FX.knight_bastion.icon).not.toBe(SKILL_FX.mage_barrier.icon);
    expect(SKILL_FX.knight_bastion.look).not.toBe(SKILL_FX.mage_barrier.look);
    expect(SKILL_FX.knight_bastion.vfx).toBe("shield");
    expect(SKILL_FX.mage_barrier.vfx).toBe("shield");
    const three = [SKILL_FX.rogue_step.icon, SKILL_FX.rogue_sabotage.icon, SKILL_FX.rogue_finish.icon];
    expect(new Set(three).size).toBe(3);
    expect(SKILL_FX.rogue_step.icon).not.toBe(iconFor("skill", "contraataque"));
  });

  it("consequence text is derived from the SkillDef (generation, mitigation) so it cannot drift", () => {
    for (const id of SKILL_IDS) {
      const d = SKILLS[id];
      if (d.gen) expect(skillTag(id)).toContain(`+${d.gen} ${RESOURCE_NAME[d.classId]}`);
    }
    expect(skillTag("berserker_charge")).toContain("+2 Furia");
    expect(skillTag("berserker_charge")).not.toContain("+1 Furia");
    expect(skillTag("rogue_step")).toContain("40 %");
  });

  it("cleanse plays its sheet only from the statusRemoved event, on the one cleansed", () => {
    expect(eventVfx(ev("statusRemoved", { actor: 0, target: 0, detail: "escarcha" }))).toEqual({ id: "ritual_interrupt", at: 0 });
    expect(SKILL_FX.cleric_cleanse.vfx).toBeNull(); // the cast alone never plays a cleanse
  });

  it("numbers come from event amounts: a hit, a heal and self-damage stay separate", () => {
    const nums = stepNumbers([
      ev("hit", { actor: 1, target: 0, value: 30 }),
      ev("healed", { actor: 0, target: 0, value: 12 }),
      ev("hit", { actor: 1, target: 0, value: 20 }),
      ev("selfDamaged", { actor: 0, target: 0, value: 20 }),
      ev("hit", { actor: 0, target: 1, value: 0 }),
    ]);
    expect(nums).toEqual([
      { target: 0, kind: "dmg", value: 50, actor: 1 },
      { target: 0, kind: "heal", value: 12, actor: 0 },
      { target: 0, kind: "self", value: 20, actor: 0 },
    ]);
  });

  it("callouts keep Quiebre/cancel/phase over tempo notes and say how many were cut", () => {
    const list = [
      { glyph: "»", text: "t1", prio: 3 }, { glyph: "»", text: "t2", prio: 3 }, { glyph: "⚠", text: "t3", prio: 3 },
      { glyph: "✹", text: "consume", prio: 1 }, { glyph: "◆", text: "Quiebre", prio: 0 }, { glyph: "☗", text: "fase", prio: 0 },
    ];
    const out = pickCallouts(list, 4);
    expect(out.map((c) => c.text)).toEqual(["t1", "consume", "Quiebre", "fase", "y 2 más (ver el registro)"]);
    expect(pickCallouts(list.slice(3), 4)).toHaveLength(3);
  });
});
