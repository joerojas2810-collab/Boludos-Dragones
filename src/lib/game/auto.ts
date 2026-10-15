// Auto-play ("Resolver rápido"): ONE pure policy shared by the quick-resolve button, the server
// replay ({t:"auto"}) and the simulation bots, so a quick fight replays to exactly the same result
// everywhere. It sees only legal public information (the committed intents, statuses, costs) and
// never the pending input or the RNG. Three policies exist so balance is never judged by one bot.
import {
  actionError,
  BURN_CONSUME_TICKS,
  equippedSkills,
  estimateDamage,
  FROST_DELAY,
  hitChance,
  isStrongIntent,
  livingEnemies,
  MAGE_CONSUME_MULT,
  RUPTURE_BYPASS_PER_CHARGE,
  skillBlockReason,
  SOBRECARGA_DISCHARGE,
  step,
  strongPending,
  WIND_ADVANCE,
  type Action,
  type Battle,
  type Combatant,
  type Intent,
  type MoveKey,
} from "./combat";
import { ACTIVE_HEAL_CAP, SKILLS, type SkillDef } from "./skills";
import type { Rng } from "./rng";
import { BURN_CAP, burnDamage, MAX_ELEMENT_CHARGES, stacksOf, STATUS_DATA } from "./statuses";

export const AUTO_STOP_HP = 0.3; // it gives control back below this hp fraction
export const AUTO_MAX_STEPS = 400;
// The contextual policy defends when announced strong hits would take this much of current hp.
export const AUTO_GUARD_FRAC = 0.3;

export interface AutoPick {
  action: Action;
  target?: number; // index into the LIVING enemies
}

export type AutoPolicyName = "contextual" | "naive" | "basic";
export interface AutoOptions {
  guard?: boolean; // use Defender against announced strong hits (default on)
  policy?: AutoPolicyName; // default "contextual"
}

const ev = (att: Combatant, def: Combatant, key: MoveKey | "charge") =>
  hitChance(att, key) * estimateDamage(att, def, key);

const isDamaging = (intent: Intent) => intent === "attack1" || intent === "attack2" || intent === "charge";

/** Expected damage of the committed intents (optionally only the strong ones). */
function incoming(b: Battle, onlyStrong = false): number {
  return b.enemies.reduce((s, e) => {
    if (e.hp <= 0 || !e.intent || !isDamaging(e.intent)) return s;
    if (onlyStrong && !isStrongIntent(e.intent)) return s;
    return s + ev(e, b.player, e.intent);
  }, 0);
}

/** Which living enemy to hit with `key`: biggest share of remaining hp removed, weighted by threat. */
export function bestTarget(b: Battle, key: MoveKey): number {
  const alive = livingEnemies(b);
  let best = 0;
  let bestScore = -1;
  alive.forEach((i, pos) => {
    const e = b.enemies[i];
    const left = Math.max(1, e.hp + (e.shield ?? 0));
    const threat = e.char.stats.atk * (e.intent && isStrongIntent(e.intent) ? 2 : 1);
    const score = Math.min(1, ev(b.player, e, key) / left) * threat;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = pos;
    }
  });
  return best;
}

/** Extra value of consuming the hero's elemental state against `foe`. */
function consumeValue(b: Battle, foe: Combatant, a1: number): number {
  const p = b.player;
  const mage = p.char.classId === "mago" ? MAGE_CONSUME_MULT : 1;
  switch (p.char.element) {
    case "fuego": {
      const burn = Math.min(burnDamage(foe.statuses) * BURN_CONSUME_TICKS * mage, foe.char.stats.hp * BURN_CAP);
      return burn;
    }
    case "agua": {
      const st = stacksOf(foe.statuses, "escarcha");
      return st && !foe.frostDelayed && foe.intent && isDamaging(foe.intent)
        ? ev(foe, p, foe.intent) * FROST_DELAY[st] * 3
        : 0;
    }
    case "tierra":
      return stacksOf(foe.statuses, "ruptura") * RUPTURE_BYPASS_PER_CHARGE * mage * a1;
    case "viento":
      return stacksOf(p.statuses, "impulso") * 0.1 * mage * a1;
    case "rayo":
      return (p.charge ?? 0) >= MAX_ELEMENT_CHARGES ? a1 * SOBRECARGA_DISCHARGE * mage : 0;
  }
}

interface Scored {
  pick: AutoPick;
  value: number;
}

function skillValue(b: Battle, def: SkillDef, a1: number): Scored | null {
  const p = b.player;
  const alive = livingEnemies(b);
  const maxHp = p.char.stats.hp;
  const resValue = a1 * 0.35;
  let value = def.gen * resValue;
  let target: number | undefined;
  if (def.power > 0) {
    if (def.target === "all") {
      for (const i of alive) {
        const foe = b.enemies[i];
        value += ev(p, foe, def.id) * (foe.exposed && def.exposedPower ? def.exposedPower / def.power : 1);
        if (def.consume) value += consumeValue(b, foe, a1);
      }
    } else {
      target = bestTarget(b, def.id);
      const foe = b.enemies[alive[target]];
      let dmg = ev(p, foe, def.id);
      if (foe.exposed && def.exposedPower) dmg *= def.exposedPower / def.power;
      value += dmg;
      if (def.consume) value += consumeValue(b, foe, a1);
      if (foe.aguante !== undefined && def.aguante > 0.25) {
        const wouldBreak = (foe.quiebreResist ?? 0) === 0 && foe.aguante <= Math.round(dmg * def.aguante);
        if (wouldBreak) value += a1 * 0.8 + (def.cancels === "break" && foe.intent === "charge" ? ev(foe, p, "charge") : 0);
      }
      if (def.cancels === "interruptible" && foe.intent === "channeling") value += maxHp * 0.12;
    }
    if (def.selfDamage) value -= maxHp * def.selfDamage;
    if (def.healIfDamage) value += Math.min(maxHp - p.hp, maxHp * Math.min(def.healIfDamage, ACTIVE_HEAL_CAP));
  }
  const strong = incoming(b, true);
  const all = incoming(b);
  if (def.shield) value += Math.min(maxHp * def.shield, all) * 0.9;
  if (def.heal) value += Math.min(maxHp - p.hp, maxHp * def.heal);
  if (def.cleanse) {
    const negative = (p.statuses ?? []).filter((s) => STATUS_DATA[s.id].negative).length;
    value += negative * maxHp * 0.04;
  }
  if (def.reduceNextHit) value += all * def.reduceNextHit * 0.5 + strong * 0.1;
  if (def.power === 0 && value <= 0) return null;
  return { pick: { action: def.id, ...(target !== undefined && { target }) }, value };
}

export function autoPolicy(b: Battle, opts: AutoOptions = {}): AutoPick {
  const p = b.player;
  const policy = opts.policy ?? "contextual";
  const alive = livingEnemies(b);
  const t1 = bestTarget(b, "attack1");
  const a1 = ev(p, b.enemies[alive[t1]], "attack1");
  const basic: AutoPick = { action: "attack1", target: t1 };
  if (policy === "basic") return basic;
  const usable = equippedSkills(p).map((id) => SKILLS[id]).filter((d) => skillBlockReason(p, d.id) === null);

  if (policy === "naive") {
    // strongest affordable damaging skill, otherwise the basic
    const strongest = usable.filter((d) => d.power > 0).sort((x, y) => y.cost * 10 + y.power - (x.cost * 10 + x.power))[0];
    if (!strongest) return basic;
    return { action: strongest.id, ...(strongest.target === "single" && { target: bestTarget(b, strongest.id) }) };
  }

  const useGuard = opts.guard ?? true;
  const strongEv = incoming(b, true);
  if (useGuard && strongPending(b) && strongEv >= p.hp * AUTO_GUARD_FRAC) return { action: "defend" };

  let best: Scored = { pick: basic, value: a1 + 1 * a1 * 0.35 };
  for (const d of usable) {
    const s = skillValue(b, d, a1);
    if (s && s.value > best.value * 1.05) best = s;
  }
  // a safe, cheap guard also beats a weak attack when a strong hit is coming and nothing better exists
  if (useGuard && strongPending(b) && best.pick.action === "attack1" && strongEv >= p.hp * 0.15)
    return { action: "defend" };
  if (actionError(b, best.pick.action, best.pick.target) !== null) return basic;
  return best.pick;
}

// null when quick resolve is allowed, otherwise the reason (Spanish, for the UI).
export function autoBlockReason(b: Battle): string | null {
  if (b.status !== "ongoing" || b.actions > 0) return "Solo al empezar la pelea.";
  return null;
}

// Plays the fight with autoPolicy. It never flees and hands control back
// (status stays "ongoing") if the hero drops under AUTO_STOP_HP.
export function autoResolve(b: Battle, rng: Rng, opts: AutoOptions = {}): Battle {
  let cur = b;
  for (let i = 0; i < AUTO_MAX_STEPS && cur.status === "ongoing"; i++) {
    if (i > 0 && cur.player.hp < cur.player.char.stats.hp * AUTO_STOP_HP) break;
    const pick = autoPolicy(cur, opts);
    const next = step(cur, pick.action, rng, pick.target);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}
