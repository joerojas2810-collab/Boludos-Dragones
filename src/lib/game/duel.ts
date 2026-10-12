// 1v1 duel between two heroes (rooms). Both sides pick an action in secret and
// the round resolves at once. Reuses the combat primitives (strike, damage,
// cooldowns); there is no announced intent, so the perfect guard is a guess:
// Defender while the rival chooses Golpe. Pure and deterministic.
import {
  actionCounts,
  ENRAGE_AFTER_TURN,
  ENRAGE_STEP,
  classHeal,
  earnGuard,
  speedOf,
  statusTick,
  passiveHeal,
  strike,
  type Action,
  type BattleEvent,
  type Combatant,
} from "./combat";
import { CLASSES, type Character, type ClassId } from "./characters";
import type { Element } from "./elements";
import type { Rng } from "./rng";
import { UNIVERSAL_COOLDOWN_CONVERSION, UNIVERSAL_SKILLS } from "./universalSkills";

export const DUEL_MAX_TURN = 60; // hard cap; the higher hp fraction wins
export type DuelStatus = "ongoing" | "a" | "b" | "draw";
export type DuelSide = "a" | "b";

export interface Duel {
  a: Combatant;
  b: Combatant;
  turn: number;
  carry: number; // speed remainder of the faster side (see actionCounts)
  status: DuelStatus;
  log: string[];
  events: BattleEvent[]; // last round; side a is actor "player", b is "enemy"
  guard: { a: boolean; b: boolean }; // perfect guard earned in the last round
}

const other = (x: DuelSide): DuelSide => (x === "a" ? "b" : "a");

// Balanced mode evens the classes out (scripts/duel-sim.ts): the class templates are tuned for
// dungeons with gear and weapons, so in a plain 1v1 some are far ahead and some far behind.
export const DUEL_TUNE: Record<ClassId, { hp: number; atk: number }> = {
  caballero: { hp: 1.02, atk: 0.99 },
  mago: { hp: 1.0, atk: 0.99 },
  picaro: { hp: 1.1, atk: 1.04 },
  clerigo: { hp: 1.14, atk: 1.12 },
  berserker: { hp: 1.0, atk: 0.98 },
};

/** Balanced mode: pick a class, everyone gets the same plain hero of it. */
export function balancedHero(
  classId: ClassId,
  element: Element,
): Character {
  const t = CLASSES[classId];
  return {
    name: t.name,
    classId,
    element,
    stats: {
      ...t.stats,
      hp: Math.round(t.stats.hp * DUEL_TUNE[classId].hp),
      atk: Math.round(t.stats.atk * DUEL_TUNE[classId].atk * 10) / 10,
    },
    traits: [],
    catchphrase: "",
    level: 1,
    xp: 0,
  };
}

const fresh = (char: Character): Combatant => ({
  char,
  hp: char.stats.hp,
  cooldown: 0,
  universalCooldowns: {},
  defending: false,
});

export const startDuel = (a: Character, b: Character): Duel => ({
  a: fresh(a),
  b: fresh(b),
  turn: 1,
  carry: 0,
  status: "ongoing",
  log: [`${a.name} y ${b.name} se enfrentan.`],
  events: [],
  guard: { a: false, b: false },
});

/** Whether `act` can be used now. */
export function canAct(c: Combatant, act: Action): boolean {
  if (act === "quebrar") return false; // Duel opponents do not have Aguante.
  if (act in UNIVERSAL_SKILLS) {
    const skill = UNIVERSAL_SKILLS[act as keyof typeof UNIVERSAL_SKILLS];
    return skill.enabled && (c.universalCooldowns?.[skill.id] ?? 0) <= 1e-9;
  }
  return act === "attack1" || act === "defend";
}

/** Missing (timeout) or illegal picks become Defender. */
export const sanitize = (c: Combatant, act: Action | null | undefined): Action =>
  act && canAct(c, act) ? act : "defend";

const decide = (a: Combatant, b: Combatant): DuelStatus =>
  a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp <= 0 ? "b" : b.hp <= 0 ? "a" : "ongoing";

/** Resolves one round with both (secret) picks; null = no answer in time. */
export function duelRound(
  d: Duel,
  pickA: Action | null,
  pickB: Action | null,
  rng: Rng,
): Duel {
  if (d.status !== "ongoing") return d;
  const log: string[] = [];
  const events: BattleEvent[] = [];
  const resolutionReady = { a: !!d.a.resolution, b: !!d.b.resolution };
  const s: Record<DuelSide, Combatant> = {
    a: { ...d.a, resolution: undefined },
    b: { ...d.b, resolution: undefined },
  };
  const pick: Record<DuelSide, Action> = {
    a: sanitize(d.a, pickA),
    b: sanitize(d.b, pickB),
  };
  const guard = { a: false, b: false };

  // In a duel, Golpe is the announced-strength equivalent for perfect guard.
  for (const x of ["a", "b"] as const) {
    if (pick[x] !== "defend") continue;
    s[x].defending = true;
    if (pick[x] === "defend") log.push(`${s[x].char.name} se defiende.`);
    if (pick[other(x)] === "golpe") {
      s[x] = earnGuard(s[x], log);
      guard[x] = true;
    }
  }

  // Initiative: faster side first, then alternate; extra actions are Ataque 1.
  const counts = actionCounts(
    speedOf(d.a),
    speedOf(d.b),
    d.carry,
  );
  const ra = speedOf(d.a) * (0.7 + 0.6 * rng.next());
  const rb = speedOf(d.b) * (0.7 + 0.6 * rng.next());
  const left = { a: counts.player, b: counts.enemy };
  const used = { a: 0, b: 0 };
  const slots: { x: DuelSide; k: number }[] = [];
  let cur: DuelSide = ra >= rb ? "a" : "b";
  while (left.a + left.b > 0) {
    if (left[cur] === 0) cur = other(cur);
    slots.push({ x: cur, k: used[cur]++ });
    left[cur]--;
    cur = other(cur);
  }

  const play = (x: DuelSide, key: Action) => {
    if (key === "defend") return;
    const y = other(x);
    const actor = x === "a" ? "player" : "enemy";
    let att = s[x];
    let def = s[y];
    const cooldownDiscount =
      key !== "attack1" && att.char.classId === "berserker" && att.riposte ? 1 : 0;
    let factor = 1;
    if (key === "golpe") {
      if (att.char.classId === "caballero" && resolutionReady[x]) factor *= 1.15;
      if (att.char.classId === "mago" && def.statuses?.length) factor *= 1.15;
      if (att.char.classId === "picaro" && def.exposed) factor *= 1.2;
      if (att.char.classId === "berserker" && att.hp < att.char.stats.hp * 0.5) factor *= 1.2;
    } else if (key === "barrido") {
      if (att.char.classId === "mago" && def.statuses?.length) factor *= 1.1;
      if (att.char.classId === "picaro") factor *= 1.1;
      if (att.char.classId === "berserker" && att.hp < att.char.stats.hp * 0.5) factor *= 1.1;
    }
    const eventCount = events.length;
    const r = strike(att, def, key, rng, log, events, actor, 0, factor, true);
    att = r.attacker;
    def = r.defender;
    const landed = events.length > eventCount && events.at(-1)?.kind !== "miss";
    if (landed && att.char.classId === "clerigo") {
      const before = att.hp;
      att = classHeal(att, 0.01);
      const heal = att.hp - before;
      if (heal) log.push(`${att.char.name} recupera ${heal} de vida.`);
    }
    if (key === "golpe" && att.char.classId === "caballero" && resolutionReady[x])
      log.push(`${att.char.name} consume Resolución: +15 % de daño.`);
    if (key === "golpe" || key === "barrido") {
      att = {
        ...att,
        universalCooldowns: {
          ...att.universalCooldowns,
          [key]: Math.max(0, UNIVERSAL_SKILLS[key].cooldown - cooldownDiscount) * UNIVERSAL_COOLDOWN_CONVERSION,
        },
      };
      if (cooldownDiscount) att = { ...att, riposte: false };
    }
    if (r.dmg > 0 && !(key === "attack1" && att.char.classId === "berserker" && att.riposte))
      att = { ...att, riposte: false };
    s[x] = att;
    s[y] = def;
  };

  let status: DuelStatus = "ongoing";
  for (const { x, k } of slots) {
    if (pick[x] === "defend") continue;
    if (k > 0) s[x] = { ...s[x], resolution: undefined, nextHitReduction: undefined };
    if (k > 0) log.push(`${s[x].char.name} actúa de nuevo.`);
    play(x, k === 0 ? pick[x] : "attack1");
    status = decide(s.a, s.b);
    if (status !== "ongoing") break;
  }
  for (const x of ["a", "b"] as const)
    if (s[x].hp <= 0) log.push(`${s[x].char.name} cae.`);
  if (status !== "ongoing")
    return { ...d, a: s.a, b: s.b, status, events, guard, log: [...d.log, ...log] };

  // End of round: stances drop, cooldowns tick, passive heal, enrage, hard cap.
  const turn = d.turn + 1;
  const end = (c: Combatant, side: DuelSide): Combatant => {
    let n: Combatant = {
      ...c,
      defending: false,
      guard: false,
      cooldown: Math.max(0, c.cooldown - 1),
      universalCooldowns: Object.fromEntries(
        Object.entries(c.universalCooldowns ?? {}).map(([id, value]) => [
          id,
          Math.max(0, value - UNIVERSAL_COOLDOWN_CONVERSION * Math.max(0, used[side] - (pick[side] in UNIVERSAL_SKILLS ? 1 : 0))),
        ]),
      ),
      nextHitReduction: undefined,
      classHealThisRound: 0,
      classShieldThisRound: 0,
    };
    n = statusTick(passiveHeal(n, log), log);
    if (turn > ENRAGE_AFTER_TURN) {
      n = {
        ...n,
        char: {
          ...n.char,
          stats: { ...n.char.stats, atk: n.char.stats.atk * (1 + ENRAGE_STEP) },
        },
      };
      log.push(`${n.char.name} se enfurece.`);
    }
    return n;
  };
  const a = end(s.a, "a");
  const b = end(s.b, "b");
  status = decide(a, b);
  if (turn > DUEL_MAX_TURN) {
    const fa = a.hp / a.char.stats.hp;
    const fb = b.hp / b.char.stats.hp;
    status = fa === fb ? "draw" : fa > fb ? "a" : "b";
  }
  return {
    a,
    b,
    turn,
    carry: counts.carry,
    status,
    events,
    guard,
    log: [...d.log, ...log],
  };
}
