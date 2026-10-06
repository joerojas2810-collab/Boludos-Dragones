// Hero helpers shared by the real room page and the demo.
import { generateCharacter, type Character } from "../game/characters";
import { normalizeHero } from "../game/nivelado";
import { heroFromOwned, type Profile } from "../game/profile";
import { createRng, hashSeed } from "../game/rng";
import { DEFAULT_HERO, type RoomMode } from "../game/room";
import type { HeroSummary } from "./types";

export const heroSummary = (c: Character): HeroSummary => ({
  name: c.name,
  classId: c.classId,
  element: c.element,
  rarity: c.rarity ?? "comun",
  stars: c.stars ?? 0,
  traits: c.traits,
});

/** Card of one of MY owned heroes (others' heroes are not exposed). */
export const ownedSummary = (p: Profile | null, key: string | null) => {
  const c = p && key && key !== DEFAULT_HERO ? heroFromOwned(p, key) : null;
  return c ? heroSummary(c) : null;
};

/** Demo hero: owned (normalized for the mode) or a seeded Común. */
export function demoHero(
  p: Profile | null,
  key: string | null,
  mode: RoomMode,
  seed: number,
): Character {
  const owned = p && key && key !== DEFAULT_HERO ? heroFromOwned(p, key) : null;
  return normalizeHero(owned ?? generateCharacter(createRng(hashSeed(seed, 7))), mode);
}
