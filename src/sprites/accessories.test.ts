import { describe, expect, it } from "vitest";
import { TRAIT_IDS, type TraitId } from "../lib/game/traits";
import { accessoryPatches } from "./accessories";
import { SPRITE_SIZE } from "./classes";
import { colorFor } from "./palettes";

const CLASSES = ["caballero", "mago", "picaro", "clerigo"] as const;

describe("accessories", () => {
  it("every trait has a small accessory inside the grid with known pixels", () => {
    for (const t of TRAIT_IDS)
      for (const c of CLASSES) {
        const patches = accessoryPatches(t, c);
        expect(patches.length, t).toBeGreaterThan(0);
        let n = 0;
        for (const [row, col, px] of patches) {
          expect(row, `${t}/${c}`).toBeGreaterThanOrEqual(0);
          expect(row, `${t}/${c}`).toBeLessThan(SPRITE_SIZE);
          expect(col, `${t}/${c}`).toBeGreaterThanOrEqual(0);
          expect(col + px.length, `${t}/${c}`).toBeLessThanOrEqual(SPRITE_SIZE);
          for (const ch of px) {
            if (ch === ".") continue;
            n++;
            expect(colorFor(ch, "fuego"), `${t}:${ch}`).not.toBeNull();
          }
        }
        expect(n, t).toBeLessThanOrEqual(64);
      }
  });

  it("trait pairs that used to share a spot no longer overlap", () => {
    const cells = (t: TraitId, c: (typeof CLASSES)[number]) =>
      new Set(
        accessoryPatches(t, c).flatMap(([r, col, px]) =>
          [...px].flatMap((ch, i) => (ch === "." ? [] : [`${r},${col + i}`])),
        ),
      );
    const pairs: [TraitId, TraitId][] = [
      ["terco", "veloz"],
      ["gafe", "paciente"],
      ["estoico", "fanfarron"],
      ["tenaz", "furioso"],
    ];
    for (const [a, b] of pairs)
      for (const c of CLASSES) {
        const ca = cells(a, c);
        // furioso eyes are meant to sit on the headband row at most 2 px
        const shared = [...cells(b, c)].filter((k) => ca.has(k)).length;
        expect(shared, `${a}+${b}/${c}`).toBeLessThanOrEqual(2);
      }
  });
});
