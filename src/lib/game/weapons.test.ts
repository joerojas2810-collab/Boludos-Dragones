import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { attackOf } from "./combat";
import { createRng } from "./rng";
import { HAND_TYPES, WEAPON_TYPE_DATA, weaponSpecial } from "./weapons";

describe("weapon special (Ataque 2)", () => {
  it("every weapon a class can use defines its own Ataque 2", () => {
    for (const type of ["espada", "hacha", "baston", "varita", "daga", "arco", "maza", "libro"] as const) {
      const sp = weaponSpecial(type);
      expect(sp, type).toBeDefined();
      expect(sp!.cooldown).toBeGreaterThan(0);
    }
  });
  it("attackOf replaces Ataque 2 only when the weapon defines one", () => {
    const base = generateCharacter(createRng(1), "caballero");
    const armed = { ...base, weapon: { element: base.element, atkBonus: 0, type: "hacha" } };
    const c = (ch: typeof base) => ({ char: ch }) as unknown as Parameters<typeof attackOf>[0];
    expect(attackOf(c(armed), "attack2").name).toBe("Hachazo");
    expect(attackOf(c(base), "attack2").name).toBe("Estocada");
    expect(attackOf(c(armed), "attack1").name).toBe("Hachazo");
    expect(attackOf(c(base), "attack1").name).toBe("Tajo"); // no weapon: keep the class basic.
  });
  it("all ten weapon basics have neutral power and no extra effects", () => {
    expect(HAND_TYPES).toHaveLength(10);
    for (const type of HAND_TYPES) {
      expect(WEAPON_TYPE_DATA[type].basic, type).toMatchObject({ power: 1 });
      expect(WEAPON_TYPE_DATA[type].basic?.crit ?? 0, type).toBe(0);
      expect(WEAPON_TYPE_DATA[type].basic?.heal ?? 0, type).toBe(0);
    }
  });
});
