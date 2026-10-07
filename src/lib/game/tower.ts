// Weekly tower: everybody climbs the same endless run (the week's seed), in two
// separate modes with separate rankings and unlimited attempts (best floor counts).
// No coins, loot or parts from the run itself: only the weekly prizes (SQL tower_settle).
import { generateCharacter, type Character, type ClassId } from "./characters";
import { normalizeHero } from "./nivelado";
import { heroFromOwned, type Profile } from "./profile";
import { createRng, hashSeed } from "./rng";

export type TowerMode = "nivelado" | "coleccion";
export const TOWER_MODES: readonly TowerMode[] = ["nivelado", "coleccion"];
export const isTowerMode = (v: unknown): v is TowerMode =>
  v === "nivelado" || v === "coleccion";

export const TOWER_LABEL: Record<TowerMode, string> = {
  nivelado: "Torre nivelada",
  coleccion: "Torre de colección",
};
export const TOWER_BLURB: Record<TowerMode, string> = {
  nivelado: "Todos con poder base parecido: gana quien juega mejor.",
  coleccion: "Tu héroe con todo su poder: rango, estrellas y equipo cuentan.",
};

// Weekly prizes for the top 3 of each mode (needs TOWER_MIN_FLOOR). Keep in sync with
// tower_settle in 0022_tower.sql.
export const TOWER_MIN_FLOOR = 8;
export const TOWER_PRIZES = [
  { place: 1, coins: 300, cores: 2 },
  { place: 2, coins: 200, cores: 1 },
  { place: 3, coins: 100, cores: 1 },
] as const;

const strHash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/**
 * The hero of a tower attempt: an owned character (levelled in `nivelado`, full power in
 * `coleccion`) or a random one from the week's seed. Null if the character is not owned.
 */
export function towerHero(
  profile: Profile,
  mode: TowerMode,
  characterId: string | null,
  classId: ClassId,
  seed: number,
  playerId: string,
): Character | null {
  let hero: Character | null;
  if (characterId) {
    hero = heroFromOwned(profile, characterId);
    if (!hero) return null;
  } else
    hero = generateCharacter(
      createRng(hashSeed(seed, strHash(playerId))),
      classId,
    );
  return normalizeHero(hero, mode === "nivelado" ? "nivelado" : "completo");
}

/** Week seed for local (offline) play: stable per ISO week, same for every player. */
export function localWeekSeed(d: Date = new Date()): number {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const week = Math.floor((t / 86_400_000 + 3) / 7); // weeks start on Monday
  return hashSeed(week, 7771);
}
