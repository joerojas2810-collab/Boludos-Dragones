// Auto-play ("Resolver rápido"): ONE pure policy shared by the quick-resolve
// button, the server replay ({t:"auto"}) and the simulation bots, so a quick
// fight replays to exactly the same result everywhere. No randomness here; the
// only RNG is the one `step` already consumes.
import {
  classHeal,
  BERSERKER_SKILL_FURY_THRESHOLD,
  BERSERKER_GOLPE_BONUS,
  BERSERKER_BARRIDO_BONUS,
  enemyIntents,
  estimateDamage,
  hitChance,
  isStrongIntent,
  livingEnemies,
  pendingIntents,
  step,
  strongPending,
  type Action,
  type Battle,
  type Combatant,
  type MoveKey,
} from "./combat";
import type { Rng } from "./rng";

// Quick resolve constants (see autoBlockReason).
export const AUTO_STOP_HP = 0.3; // it gives control back below this hp fraction
export const AUTO_MAX_STEPS = 200;
// The policy defends when the announced strong hits would take this much of
// the hero's current hp (perfect guard cuts them and powers the next attack).
export const AUTO_GUARD_FRAC = 0.3;

export interface AutoPick {
  action: Action;
  target?: number; // index into the LIVING enemies
}

export interface AutoOptions {
  guard?: boolean; // use Defender against announced strong hits (default on)
  useUniversalSkills?: boolean; // consider Golpe/Barrido (default on)
}

const ev = (att: Combatant, def: Combatant, key: MoveKey) =>
  hitChance(att, key) * estimateDamage(att, def, key);

// Expected damage per slot this enemy still has this round.
function incoming(b: Battle, only?: (k: string) => boolean): number {
  return pendingIntents(b).reduce(
    (s, slot) =>
      slot.intent === "defend" || (only && !only(slot.intent))
        ? s
        : s + ev(b.enemies[slot.e], b.player, slot.intent),
    0,
  );
}

// Which living enemy to hit with `key`: biggest share of its remaining hp
// removed, weighted by how much it hurts (finish dangerous, weak targets;
// elemental advantage is inside the damage estimate).
export function bestTarget(b: Battle, key: MoveKey): number {
  const alive = livingEnemies(b);
  let best = 0;
  let bestScore = -1;
  alive.forEach((i, pos) => {
    const e = b.enemies[i];
    const left = Math.max(1, e.hp + (e.shield ?? 0));
    const threat = e.char.stats.atk * Math.max(1, enemyIntents(b, i).length);
    const score = Math.min(1, ev(b.player, e, key) / left) * threat;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = pos;
    }
  });
  return best;
}

export function autoPolicy(b: Battle, opts: AutoOptions = {}): AutoPick {
  const p = b.player;
  const maxHp = p.char.stats.hp;
  const alive = livingEnemies(b);
  const useGuard = opts.guard ?? true;
  const useUniversalSkills = opts.useUniversalSkills ?? true;

  const strongEv = incoming(b, (k) => isStrongIntent(k as MoveKey));
  if (useGuard && strongPending(b) && strongEv >= p.hp * AUTO_GUARD_FRAC)
    return { action: "defend" };

  const t1 = bestTarget(b, "attack1");
  const e1 = b.enemies[alive[t1]];
  const a1 = ev(p, e1, "attack1");
  if (useUniversalSkills) {
    let bestSkill: AutoPick | null = null;
    let bestSkillValue = -1;
    const golpeTarget = bestTarget(b, "golpe");
    const golpeFoe = b.enemies[alive[golpeTarget]];
    const clericHealUtility = (fraction: number) =>
      p.char.classId === "clerigo"
        ? Math.max(0, classHeal(p, fraction).hp - p.hp)
        : 0;
    let golpeFactor = 1;
    if (p.char.classId === "caballero" && p.resolution) golpeFactor *= 1.15;
    if (p.char.classId === "mago" && golpeFoe.statuses?.length) golpeFactor *= 1.15;
    if (p.char.classId === "picaro" && golpeFoe.exposed) golpeFactor *= 1.2;
    if (p.char.classId === "berserker" && p.hp < maxHp * BERSERKER_SKILL_FURY_THRESHOLD) golpeFactor *= 1 + BERSERKER_GOLPE_BONUS;
    const golpeValue = ev(p, golpeFoe, "golpe") * golpeFactor + clericHealUtility(0.03);
    if ((p.universalCooldowns?.golpe ?? 0) <= 1e-9) {
      bestSkill = { action: "golpe", target: golpeTarget };
      bestSkillValue = golpeValue;
    }

    const barridoValue = alive.reduce((sum, i) => {
      const foe = b.enemies[i];
      let factor = 1;
      if (p.char.classId === "mago" && foe.statuses?.length) factor *= 1.1;
      if (p.char.classId === "picaro" && alive.length === 1) factor *= 1.1;
      if (p.char.classId === "berserker" && p.hp < maxHp * BERSERKER_SKILL_FURY_THRESHOLD) factor *= 1 + BERSERKER_BARRIDO_BONUS;
      return sum + ev(p, foe, "barrido") * factor;
    }, 0);
    const clericHealValue = clericHealUtility(0.03);
    const knightGuardValue = p.char.classId === "caballero" && alive.length >= 2
      ? incoming(b) * 0.1
      : 0;
    const barridoUtility = barridoValue + clericHealValue + knightGuardValue;
    if ((p.universalCooldowns?.barrido ?? 0) <= 1e-9 && barridoUtility > bestSkillValue) {
      bestSkill = { action: "barrido" };
      bestSkillValue = barridoUtility;
    }
    if (bestSkill && bestSkillValue > a1 * 1.05) return bestSkill;
  }
  return { action: "attack1", target: t1 };
}

// Expected fraction of the hero's current hp lost if the fight is played with
// the plain attack, killing the weakest enemy first.

// null when quick resolve is allowed, otherwise the reason (Spanish, for the UI).
// Any fight kind and hp is allowed (the risk is the player's); only mid-fight is blocked.
export function autoBlockReason(b: Battle): string | null {
  if (b.status !== "ongoing" || b.actions > 0)
    return "Solo al empezar la pelea.";
  return null;
}

// Plays the fight with autoPolicy. It never flees and hands control back
// (status stays "ongoing") if the hero drops under AUTO_STOP_HP.
export function autoResolve(b: Battle, rng: Rng): Battle {
  let cur = b;
  for (let i = 0; i < AUTO_MAX_STEPS && cur.status === "ongoing"; i++) {
    if (i > 0 && cur.player.hp < cur.player.char.stats.hp * AUTO_STOP_HP) break;
    const pick = autoPolicy(cur);
    const next = step(cur, pick.action, rng, pick.target);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}
