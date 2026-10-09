// 1v1 duel between two heroes (rooms). Both sides pick an action in secret and
// the round resolves at once. Reuses the combat primitives (strike, damage,
// cooldowns); there is no announced intent, so the perfect guard is a guess:
// Defender while the rival throws Ataque 2. Pure and deterministic.
import {
  actionCounts,
  ENRAGE_AFTER_TURN,
  ENRAGE_STEP,
  healMult,
  isStrongIntent,
  passiveHeal,
  skillOf,
  strike,
  type Action,
  type BattleEvent,
  type Combatant,
} from "./combat";
import { CLASSES, type Character, type ClassId } from "./characters";
import type { Element } from "./elements";
import type { Rng } from "./rng";
import { COUNTER_ROUNDS, SKILLS_BY_CLASS, type SkillId } from "./skills";

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

/** Balanced mode: pick a class, everyone gets the same plain hero of it. */
export function balancedHero(
  classId: ClassId,
  element: Element,
  skill: SkillId = SKILLS_BY_CLASS[classId][0],
): Character {
  const t = CLASSES[classId];
  return {
    name: t.name,
    classId,
    element,
    stats: { ...t.stats },
    traits: [],
    catchphrase: "",
    level: 1,
    xp: 0,
    skill,
  };
}

const fresh = (char: Character): Combatant => ({
  char,
  hp: char.stats.hp,
  cooldown: 0,
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
  if (act === "attack2") return c.cooldown <= 0;
  if (act === "attack3") return !!skillOf(c) && (c.cooldown3 ?? 0) <= 0;
  return true;
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
  const s: Record<DuelSide, Combatant> = { a: { ...d.a }, b: { ...d.b } };
  const pick: Record<DuelSide, Action> = {
    a: sanitize(d.a, pickA),
    b: sanitize(d.b, pickB),
  };
  const guard = { a: false, b: false };

  // Stances first: a perfect guard needs the rival's Ataque 2 in the same round.
  for (const x of ["a", "b"] as const) {
    const sk = pick[x] === "attack3" ? skillOf(s[x]) : undefined;
    if (pick[x] !== "defend" && !sk?.guard) continue;
    s[x].defending = true;
    if (pick[x] === "defend") log.push(`${s[x].char.name} se defiende.`);
    if (isStrongIntent(pick[other(x)])) {
      s[x].guard = true;
      s[x].riposte = true;
      guard[x] = true;
      log.push(
        `¡Guardia perfecta! ${s[x].char.name} resistirá el golpe fuerte y contraatacará.`,
      );
    }
  }

  // Initiative: faster side first, then alternate; extra actions are Ataque 1.
  const counts = actionCounts(
    d.a.char.stats.speed,
    d.b.char.stats.speed,
    d.carry,
  );
  const ra = d.a.char.stats.speed * (0.7 + 0.6 * rng.next());
  const rb = d.b.char.stats.speed * (0.7 + 0.6 * rng.next());
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
    const sk = key === "attack3" ? skillOf(s[x]) : undefined;
    let att = s[x];
    let def = s[y];
    if (sk && sk.power === 0) {
      const m = att.char.stats.hp;
      const bits: string[] = [];
      if (sk.heal) {
        const hp = Math.min(m, att.hp + Math.round(m * sk.heal * healMult(att)));
        bits.push(`recupera ${hp - att.hp} de vida`);
        att = { ...att, hp };
      }
      if (sk.shield) {
        const sh = Math.round(m * sk.shield);
        att = { ...att, shield: (att.shield ?? 0) + sh };
        bits.push(`gana un escudo de ${sh}`);
      }
      if (sk.counter) {
        att = { ...att, reflect: COUNTER_ROUNDS };
        bits.push("se prepara para devolver el próximo golpe");
      }
      if (sk.guard) bits.push("se protege");
      log.push(`${att.char.name} usa ${sk.name}: ${bits.join(" y ")}.`);
      events.push({
        actor,
        kind: "buff",
        classId: att.char.classId,
        move: "attack3",
        enemy: 0,
      });
      s[x] = { ...att, cooldown3: sk.cooldown + 1 };
      return;
    }
    let dealt = 0;
    for (let h = 0; h < (sk?.hits ?? 1) && def.hp > 0 && att.hp > 0; h++) {
      const r = strike(att, def, key, rng, log, events, actor, 0);
      att = r.attacker;
      def = r.defender;
      dealt += r.dmg;
    }
    if (sk) att = { ...att, cooldown3: sk.cooldown + 1 };
    if (dealt > 0) att = { ...att, riposte: false };
    s[x] = att;
    s[y] = def;
  };

  let status: DuelStatus = "ongoing";
  for (const { x, k } of slots) {
    // A pure Defender gives up the round; a guard skill still plays its slot 0.
    if (pick[x] === "defend") continue;
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
  const end = (c: Combatant): Combatant => {
    let n: Combatant = {
      ...c,
      defending: false,
      guard: false,
      cooldown: Math.max(0, c.cooldown - 1),
      cooldown3: Math.max(0, (c.cooldown3 ?? 0) - 1),
      reflect: Math.max(0, (c.reflect ?? 0) - 1),
    };
    n = passiveHeal(n, log);
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
  const a = end(s.a);
  const b = end(s.b);
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
