// Shared fixed preset for levelled play in rooms, duels, and the weekly tower.
import type { Character, ClassId } from "./characters";
import type { Element } from "./elements";
import { balancedHero } from "./duel";
import { niveladoBonus } from "./nivelado";

export const NIVELADO_PRESET = { rank: "d", stars: 0, level: 1 } as const;

export function niveladoHero(classId: ClassId, element: Element): Character {
  const hero = balancedHero(classId, element);
  const bonus = 1 + niveladoBonus(NIVELADO_PRESET.rank, NIVELADO_PRESET.stars);
  return {
    ...hero,
    rarity: NIVELADO_PRESET.rank,
    stars: NIVELADO_PRESET.stars,
    level: NIVELADO_PRESET.level,
    xp: 0,
    traits: [],
    gear: undefined,
    weapon: undefined,
    stats: {
      ...hero.stats,
      hp: Math.round(hero.stats.hp * bonus),
      atk: Math.round(hero.stats.atk * bonus * 10) / 10,
      def: Math.round(hero.stats.def * bonus * 10) / 10,
      regen: 0,
      lifesteal: 0,
    },
  };
}
