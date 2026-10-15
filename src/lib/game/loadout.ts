// Player-side skill selection (docs/ideal/01 §2). Pure helpers over the profile; the server
// revalidates every loadout with the same loadoutError, so nothing here grants anything.
import type { Character, ClassId } from "./characters";
import { characterKey, type Profile } from "./profile";
import { defaultLoadout, loadoutError, newlyUnlocked, sanitizeLoadout, type Loadout, type SkillDef } from "./skills";

/** Highest hero level reached with the class (stored value, never below what heroes show). */
export const masteryOf = (p: Profile, classId: ClassId): number =>
  Math.max(
    p.classMastery?.[classId] ?? 0,
    ...p.characters.filter((c) => c.classId === classId).map((c) => c.level),
  );

export const heroKey = (hero: Character) =>
  characterKey(hero.classId, hero.element, hero.rarity ?? "f");

/** The two skills to take into a fight. nivelado: all four available, saved per class. */
export function loadoutFor(profile: Profile, hero: Character, mode: "nivelado" | "coleccion"): Loadout {
  return mode === "nivelado"
    ? sanitizeLoadout(hero.classId, profile.levelLoadouts?.[hero.classId], null)
    : sanitizeLoadout(hero.classId, profile.loadouts?.[heroKey(hero)], masteryOf(profile, hero.classId));
}

/** Saves a selection (null = invalid, profile untouched). Never called automatically. */
export function equipLoadout(
  p: Profile,
  target: { key: string; classId: ClassId } | { classId: ClassId; nivelado: true },
  loadout: Loadout,
): Profile | null {
  const nivelado = "nivelado" in target;
  if (loadoutError(target.classId, loadout, nivelado ? null : masteryOf(p, target.classId))) return null;
  return nivelado
    ? { ...p, levelLoadouts: { ...p.levelLoadouts, [target.classId]: loadout } }
    : { ...p, loadouts: { ...p.loadouts, [target.key]: loadout } };
}

/** Replaces slot `slot` with `id`; if `id` is already in the other slot the two swap. */
export function withSkill(current: Loadout, slot: 0 | 1, id: Loadout[number]): Loadout {
  const other = current[slot === 0 ? 1 : 0];
  return id === other ? [current[1], current[0]] : slot === 0 ? [id, other] : [other, id];
}

export { defaultLoadout, newlyUnlocked };
export type { SkillDef };
