// Auto-play ("Resolver rápido"): ONE pure policy shared by the quick-resolve
// button, the server replay ({t:"auto"}) and the simulation bots, so a quick
// fight replays to exactly the same result everywhere. No randomness here; the
// only RNG is the one `step` already consumes.
import {
  enemyIntents,
  estimateDamage,
  hitChance,
  isStrongIntent,
  livingEnemies,
  pendingIntents,
  skillOf,
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
  skill?: boolean; // use the class skill (default on)
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
  const useSkill = opts.skill ?? true;

  const strongEv = incoming(b, (k) => isStrongIntent(k as MoveKey));
  if (useGuard && strongPending(b) && strongEv >= p.hp * AUTO_GUARD_FRAC)
    return { action: "defend" };

  // Single-target moves aim at the target chosen for Ataque 1 / Ataque 2.
  const t1 = bestTarget(b, "attack1");
  const e1 = b.enemies[alive[t1]];
  const a1 = ev(p, e1, "attack1");
  const t2 = bestTarget(b, "attack2");
  const a2 = ev(p, b.enemies[alive[t2]], "attack2");

  const skill = skillOf(p);
  if (useSkill && skill && (p.cooldown3 ?? 0) === 0) {
    const deficit = maxHp - p.hp;
    const hurt = incoming(b);
    const top = pendingIntents(b).reduce(
      (m, s) =>
        s.intent === "defend"
          ? m
          : Math.max(m, ev(b.enemies[s.e], p, s.intent)),
      0,
    );
    const base = Math.max(a1, p.cooldown > 0 ? 0 : a2);
    let value = 0;
    let target: number | undefined;
    if (skill.power === 0) {
      value =
        (skill.counter ? top * 1.5 : 0) +
        (skill.shield ? Math.min(skill.shield * maxHp, hurt) : 0) +
        (skill.heal ? Math.min(skill.heal * maxHp, deficit) : 0) +
        (skill.guard ? hurt * 0.4 : 0);
      // Utility skills trade an attack for safety: only when it is needed.
      if (hurt < p.hp * 0.15 && deficit < maxHp * 0.3) value = 0;
    } else if (skill.area) {
      value = alive.reduce((s, i) => s + ev(p, b.enemies[i], "attack3"), 0);
    } else {
      const t3 = bestTarget(b, "attack3");
      target = t3;
      value =
        ev(p, b.enemies[alive[t3]], "attack3") * (skill.hits ?? 1) +
        (skill.lifesteal
          ? skill.lifesteal *
            ev(p, b.enemies[alive[t3]], "attack3") *
            Math.min(1, deficit / (maxHp * 0.5))
          : 0);
    }
    // Slightly above the plain attack: the skill has a cooldown, use it.
    if (value > base * 1.05) return { action: "attack3", target };
  }

  const heals = p.char.classId === "clerigo";
  if (p.cooldown === 0 && (heals ? p.hp < maxHp * 0.6 : a2 > a1))
    return { action: "attack2", target: t2 };
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
