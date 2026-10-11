import { describe, expect, it } from "vitest";
import { generateCharacter } from "./characters";
import { attackOf } from "./combat";
import { createRng } from "./rng";
import { HAND_TYPES, WEAPON_TYPE_DATA } from "./weapons";

describe("weapon basics", () => {
  it("players use the weapon basic; the legacy-named strong profile is enemy-only", () => {
    const base = generateCharacter(createRng(1), "caballero");
    const armed = { ...base, weapon: { element: base.element, atkBonus: 0, type: "hacha" } };
    const c = (ch: typeof base) => ({ char: ch }) as unknown as Parameters<typeof attackOf>[0];
    expect(attackOf(c(armed), "attack2").name).toBe("Estocada");
    expect(attackOf(c(base), "attack2").name).toBe("Estocada");
    expect(attackOf(c(armed), "attack1").name).toBe("Hachazo");
    expect(attackOf(c(base), "attack1").name).toBe("Tajo"); // no weapon: keep the class basic.
    const staff = { ...base, weapon: { element: base.element, atkBonus: 0, type: "baston" as const } };
    const hammer = { ...base, weapon: { element: base.element, atkBonus: 0, type: "martillo" as const } };
    expect(attackOf(c(staff), "attack1").name).toBe("Golpe rúnico");
    expect(attackOf(c(hammer), "attack1").name).toBe("Impacto de martillo");
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
