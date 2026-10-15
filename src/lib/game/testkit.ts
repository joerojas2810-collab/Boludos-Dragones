// Shared fixtures for the turn-engine tests. Explicit stats, no random heroes, so order-sensitive
// assertions stay readable. Not imported by production code.
import { generateCharacter, type Character, type ClassId } from "./characters";
import { startBattle, TURN_THRESHOLD, type Battle, type BattleOptions, type Combatant, type Intent } from "./combat";
import { createRng, type Rng } from "./rng";

/** Character with explicit stats: agua, no traits, no weapon, speed 10 (rate 1000). */
export const unit = (
  classId: ClassId,
  stats: Partial<Character["stats"]> = {},
  extra: Partial<Character> = {},
): Character => {
  const c = generateCharacter(createRng(1), classId);
  return {
    ...c,
    name: "Foe0", // personality "agresor" (see brain.personalityOf); named tests override it
    element: "agua",
    traits: [],
    stats: {
      hp: 1000, atk: 20, def: 0, crit: 0, resist: 0, accuracy: 0.5,
      critDmg: 1.5, regen: 0, lifesteal: 0, speed: 10,
      ...stats,
    },
    ...extra,
  };
};

/** Every roll succeeds if its probability is decent; crit 0 therefore never crits. */
export const noCrit = (): Rng => ({ ...createRng(1), chance: (p) => p >= 0.5 });
/** Every roll succeeds (crits included). */
export const allRolls = (): Rng => ({ ...createRng(1), chance: () => true });

/** Rng that counts how many draws were taken. */
export function spyRng(seed: number): Rng & { calls: () => number } {
  const base = createRng(seed);
  let n = 0;
  return {
    next: () => (n++, base.next()),
    int: (a, b) => (n++, base.int(a, b)),
    chance: (p) => (n++, base.chance(p)),
    pick: (items) => (n++, base.pick(items)),
    calls: () => n,
  };
}

/** Overrides committed intents of the enemies (unanswered: the human has not acted since). */
export const withIntents = (b: Battle, intents: (Intent | undefined)[]): Battle => ({
  ...b,
  enemies: b.enemies.map((e, i) => ({
    ...e,
    ...(intents[i] !== undefined ? { intent: intents[i], intentAnswered: false } : {}),
  })),
});

export const mapEnemy = (b: Battle, i: number, f: (e: Combatant) => Partial<Combatant>): Battle => ({
  ...b,
  enemies: b.enemies.map((e, k) => (k === i ? { ...e, ...f(e) } : e)),
});

export const mapPlayer = (b: Battle, f: Partial<Combatant>): Battle => ({ ...b, player: { ...b.player, ...f } });

/** Sets progress bars: id 0 = player, k = enemies[k-1]. */
export const withProgress = (b: Battle, p: Record<number, number>): Battle => ({
  ...b,
  player: p[0] !== undefined ? { ...b.player, progress: p[0] } : b.player,
  enemies: b.enemies.map((e, i) => (p[i + 1] !== undefined ? { ...e, progress: p[i + 1] } : e)),
});

export interface FightOpts extends BattleOptions {
  intents?: (Intent | undefined)[];
  res?: number;
  seed?: number;
  /** enemies never pick a strong intent (strong-hit cooldown stays up) */
  quiet?: boolean;
}

/**
 * Battle resting at the hero's first decision. Enemy intents can be forced. Enemies are
 * `quiet` by default: plain attack announced, and no strong threat unless a test asks for it.
 */
export function fight(hero: Character, foes: Character | Character[], o: FightOpts = {}): Battle {
  const { intents, res, seed, quiet = true, ...opts } = o;
  let b = startBattle(hero, foes, createRng(seed ?? 4), opts);
  if (quiet) {
    for (let s = (seed ?? 4) + 1; s < 60 && b.cev.some((e) => e.type === "telegraphStarted"); s++)
      b = startBattle(hero, foes, createRng(s), opts);
  }
  if (quiet)
    // openings may announce a threat (and hold that enemy's progress at 0): neutralise it. Tests
    // that depend on the exact order set progress explicitly with `withProgress`.
    b = { ...b, enemies: b.enemies.map((e) => ({ ...e, cooldown: 999, intent: "attack1" as const, intentAnswered: true })) };
  if (intents) b = withIntents(b, intents);
  if (res !== undefined) b = mapPlayer(b, { res });
  return b;
}

/** Actors (0 player, k enemy k-1) in the order their turns started, from a list of steps. */
export const turnOrder = (battles: Battle[]): number[] =>
  battles.flatMap((b) => b.cev.filter((e) => e.type === "turnStarted").map((e) => e.actor));

export { TURN_THRESHOLD };
