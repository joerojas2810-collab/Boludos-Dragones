// Day-1 tutorial (local flow): ONE starter hero (class of choice, rank F, random element)
// plus a starter weapon of its class. No extra coins. Progress lives in Profile.tutorial.
import { generateCharacter, type ClassId } from "./characters";
import { isRouteDone } from "./dungeonProgress";
import { ROUTE_IDS } from "./levels";
import {
  characterKey,
  createProfile,
  slotKey,
  TUTORIAL_DONE,
  type OwnedCharacter,
  type OwnedWeapon,
  type Profile,
} from "./profile";
import { rollPiece } from "./gear";
import type { Rng } from "./rng";
import { CLASS_WEAPONS, weaponAtk, weaponKey, weaponName } from "./weapons";

export const TUTORIAL_STEPS = [
  {
    id: "pick",
    title: "Elige tu héroe inicial",
    text: "Tu primer héroe es de rango F, con elemento al azar y un arma de su clase.",
  },
  {
    id: "level",
    title: "Nivel 1 del dungeon F",
    text: "En Dungeons entra al nivel 1 de F. Tienes cuatro botones: Básico nunca falla y te da recurso de clase; las dos habilidades lo gastan o lo generan; Defender te da la mitad de daño hasta tu próximo turno. Cada rival anuncia lo que hará antes de que elijas: si defiendes justo ante su golpe fuerte, es guardia perfecta y casi no recibes daño.",
  },
  {
    id: "equip",
    title: "Equipa tu arma",
    text: "En Héroes, abre tu héroe y pon el arma inicial en la casilla de arma.",
  },
  {
    id: "clear",
    title: "Limpia el dungeon F",
    text: "Limpia todos los niveles de F. El último da un cofre de monedas.",
  },
  {
    id: "pull",
    title: "Tu primera tirada de 10",
    text: "En Invocar, gasta las monedas del cofre en una tirada de 10.",
  },
  {
    id: "forge",
    title: "La forja",
    text: "Con las partes que sueltan los dungeons armas y mejoras piezas. Abre la forja y pulsa «Ver tutorial».",
  },
  {
    id: "missions",
    title: "Misiones",
    text: "Cada día hay misiones con partes, núcleos y monedas. Se ven en la pestaña Misiones al jugar conectado.",
  },
] as const;

/** A brand-new local account: empty profile that starts the tutorial. */
export const newAccountProfile = (): Profile => ({ ...createProfile(), tutorial: 0 });

export const tutorialStep = (p: Profile): number =>
  Math.min(TUTORIAL_DONE, Math.max(0, p.tutorial ?? TUTORIAL_DONE));

/** Moves the tutorial forward (never back). */
export const setTutorialStep = (p: Profile, step: number): Profile =>
  step > tutorialStep(p) ? { ...p, tutorial: Math.min(TUTORIAL_DONE, step) } : p;

/**
 * Gives a new account its single starter hero and weapon (equipped) and moves the tutorial
 * to step 1. Only applies at step 0 with an empty collection; otherwise returns `profile`.
 */
export function createStarterHero(
  profile: Profile,
  classId: ClassId,
  rng: Rng,
): Profile {
  if (tutorialStep(profile) !== 0 || profile.characters.length > 0)
    return profile;
  const base = generateCharacter(rng, classId);
  const hero: OwnedCharacter = {
    ...base,
    id: characterKey(classId, base.element, "f"),
    rarity: "f",
    stars: 0,
  };
  const type = rng.pick(CLASS_WEAPONS[classId]);
  const rolled = rollPiece(rng, type, "f");
  const weapon: OwnedWeapon = {
    id: weaponKey(type, base.element, "f"),
    name: weaponName(type, base.element, "f"),
    type,
    element: base.element,
    rarity: "f",
    stars: 0,
    ...rolled,
    atkBonus: weaponAtk("f", 0, type, rolled.roll),
  };
  return {
    ...profile,
    characters: [hero],
    weapons: [...profile.weapons, weapon],
    equipped: { ...profile.equipped }, // equipping is tutorial step 3
    tutorial: 1,
  };
}

/** Steps that can be detected from the profile advance by themselves. */
export function autoAdvance(p: Profile): Profile {
  let s = tutorialStep(p);
  if (s >= TUTORIAL_DONE || s === 0) return p;
  const hero = p.characters[0];
  const cleared1 = Object.entries(p.dungeons.routes).some(([key, count]) => key.endsWith(":f:0") && count >= 1);
  if (s === 1 && cleared1) s = 2;
  if (s === 2 && hero && p.equipped[slotKey(hero.id, "arma")]) s = 3;
  if (s === 3 && ROUTE_IDS.some((route) => isRouteDone(p.dungeons, route, "f", 0))) s = 4;
  return setTutorialStep(p, s);
}
