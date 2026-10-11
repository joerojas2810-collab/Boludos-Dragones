// Auto-play ("Resolver rápido"): ONE pure policy shared by the quick-resolve
// button, the server replay ({t:"auto"}) and the simulation bots, so a quick
// fight replays to exactly the same result everywhere. No randomness here; the
// only RNG is the one `step` already consumes.
import {
  classHeal,
  BERSERKER_SKILL_FURY_THRESHOLD,
  BERSERKER_GOLPE_BONUS,
  BERSERKER_BARRIDO_BONUS,
  attackElementMultiplier,
  critMultiplier,
  enemyIntents,
  estimateDamage,
  EXPLOIT_BERSERKER_BURN_MULT,
  EXPLOIT_BASIC_DAMAGE_FRACTION,
  EXPLOIT_MAGE_EFFECT_MULT,
  EXPLOIT_OVERLOAD_DAMAGE_FRACTION,
  EXPLOIT_RUPTURE_DEFENSE_PER_STACK,
  exploitableState,
  hitChance,
  isStrongIntent,
  livingEnemies,
  pendingIntents,
  step,
  strongPending,
  type Action,
  type Battle,
  type Combatant,
  type EnemySlot,
  type MoveKey,
} from "./combat";
import type { Rng } from "./rng";
import { BURN_CAP, burnDamage } from "./statuses";

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
  useUniversalSkills?: boolean; // consider enabled universal actions (default on)
}

const ev = (att: Combatant, def: Combatant, key: MoveKey | "charge" | "channeling") =>
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
  const clericHealUtility = (fraction: number) =>
    p.char.classId === "clerigo"
      ? Math.max(0, classHeal(p, fraction).hp - p.hp)
      : 0;
  if (useUniversalSkills) {
    const interruptTarget = alive.find((i) =>
      b.enemies[i].channelingState === "announced" &&
      b.queue.some((slot) => slot !== "player" && slot.e === i && slot.intent === "channeling"),
    );
    if (
      interruptTarget !== undefined &&
      (p.universalCooldowns?.interrumpir ?? 0) <= 1e-9
    )
      return { action: "interrumpir", target: alive.indexOf(interruptTarget) };

    if ((p.universalCooldowns?.explotar ?? 0) <= 1e-9) {
      let bestExploit: AutoPick | null = null;
      let bestExploitValue = -1;
      const effectMult = p.char.classId === "mago" ? EXPLOIT_MAGE_EFFECT_MULT : 1;
      alive.forEach((enemyIndex, pos) => {
        const foe = b.enemies[enemyIndex];
        const state = exploitableState(p, foe);
        if (!state) return;
        let value = ev(p, foe, "attack1") * EXPLOIT_BASIC_DAMAGE_FRACTION;
        if (state.id === "sobrecarga")
          value += ev(p, foe, "attack1") * EXPLOIT_OVERLOAD_DAMAGE_FRACTION * effectMult;
        if (state.id === "quemadura") {
          let burnMult = effectMult;
          if (p.char.classId === "berserker" && p.hp < maxHp * BERSERKER_SKILL_FURY_THRESHOLD)
            burnMult *= EXPLOIT_BERSERKER_BURN_MULT;
          value += Math.min(burnDamage(foe.statuses) * burnMult, foe.char.stats.hp * BURN_CAP);
        }
        if (state.id === "ruptura") {
          const bypass = Math.min(0.9, state.stacks * EXPLOIT_RUPTURE_DEFENSE_PER_STACK * effectMult);
          value += ev(p, foe, "attack1") * bypass;
        }
        if (state.id === "escarcha") {
          const current = b.queue.indexOf("player");
          const nextPlayer = b.queue.findIndex((slot, i) => i > current && slot === "player");
          if (current >= 0 && nextPlayer > current) {
            const threatened = b.queue.slice(current + 1, nextPlayer).filter(
              (slot): slot is EnemySlot => slot !== "player" && slot.intent !== "defend" && slot.e === enemyIndex &&
                !(isStrongIntent(slot.intent) && slot.warningWaited),
            ).slice(0, state.stacks >= 3 ? 2 : 1);
            // Delaying damage creates a window for one more player response, so
            // value the threat it moves behind that activation.
            value += threatened.reduce(
              (sum, slot) => sum + (slot.intent === "defend" ? 0 : ev(b.enemies[slot.e], p, slot.intent)),
              0,
            );
          }
        }
        if (state.id === "impulso") {
          if (state.stacks >= 2 && !b.impulseGranted && b.playerActions < 3)
            value += a1;
          if (p.char.classId === "picaro")
            value += a1 * 0.15 * (critMultiplier(p) - 1);
        }
        if (p.char.classId === "clerigo") value += clericHealUtility(0.03);
        if (p.char.classId === "caballero") value += maxHp * 0.03 * 0.2;
        if (value > bestExploitValue) {
          bestExploit = { action: "explotar", target: pos };
          bestExploitValue = value;
        }
      });
      if (bestExploit && bestExploitValue > a1 * 1.05) return bestExploit;
    }

    let bestSkill: AutoPick | null = null;
    let bestSkillValue = -1;
    const golpeTarget = bestTarget(b, "golpe");
    const golpeFoe = b.enemies[alive[golpeTarget]];
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
    const quebrarTarget = bestTarget(b, "quebrar");
    const quebrarFoe = b.enemies[alive[quebrarTarget]];
    if (
      quebrarFoe.aguante !== undefined &&
      (p.universalCooldowns?.quebrar ?? 0) <= 1e-9
    ) {
      let aguanteFactor = 1;
      if (p.char.classId === "caballero" && p.resolution) aguanteFactor *= 1.25;
      if (p.char.classId === "mago" && attackElementMultiplier(p, quebrarFoe) > 1) aguanteFactor *= 1.2;
      if (p.char.classId === "picaro" && quebrarFoe.statuses?.length) aguanteFactor *= 1.2;
      if (p.char.classId === "berserker" && p.hp < maxHp * BERSERKER_SKILL_FURY_THRESHOLD) aguanteFactor *= 1.25;
      const quebrarDamage = ev(p, quebrarFoe, "quebrar");
      const wouldBreak =
        (quebrarFoe.quiebreResist ?? 0) === 0 &&
        quebrarFoe.aguante <= Math.max(1, Math.round(quebrarDamage * aguanteFactor));
      const chargeValue =
        wouldBreak && quebrarFoe.chargePending
          ? ev(quebrarFoe, p, "charge") * 1.25
          : 0;
      const clericValue = clericHealUtility(0.03);
      const breakValue = wouldBreak ? Math.max(a1 * 0.8, quebrarDamage * 0.8) : 0;
      const quebrarValue = quebrarDamage + breakValue + chargeValue + clericValue;
      if (quebrarValue > bestSkillValue) {
        bestSkill = { action: "quebrar", target: quebrarTarget };
        bestSkillValue = quebrarValue;
      }
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
