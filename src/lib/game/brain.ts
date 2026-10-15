// Enemy brains (docs/ideal/01 §8): deterministic utility scoring over legal actions, from public
// information only (never the pending human input nor future RNG). The choice is committed:
// it is announced and resolved on the enemy's next own turn. combat.ts supplies `ev` so this
// file has no runtime dependency on the engine.
import type { Combatant, Intent } from "./combat";
import { ruleOf } from "./bossRules";
import type { Rng } from "./rng";

export type Personality = "agresor" | "protector" | "ritualista";
export const PERSONALITIES: readonly Personality[] = ["agresor", "protector", "ritualista"];

/** Stable personality of a common enemy, derived from its name (no extra data to store). */
export function personalityOf(c: Combatant): Personality {
  let h = 0;
  for (const ch of c.char.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PERSONALITIES[h % PERSONALITIES.length];
}

export const SCORE_BAND = 10; // candidates within this many points of the best may be drawn
export const MEMORY = 3; // resolved intents remembered

export interface BrainView {
  self: Combatant;
  index: number;
  player: Combatant;
  allies: { index: number; c: Combatant }[]; // other living enemies
  strongCommitted: boolean; // another enemy already announced a strong threat
  ev: (att: Combatant, def: Combatant, intent: Intent) => number; // expected damage
  ritualDue: boolean; // boss ritual schedule reached
  rebuildDue: boolean; // colossus armor reconstruction announced this turn
  chargeReady: boolean; // golem: the Carga was prepared
  prepareCharge: boolean; // golem: should prepare its Carga first
}

export interface Candidate {
  intent: Intent;
  ally?: number;
  score: number;
  parts: Record<string, number>; // normalised contributions (development traces)
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/** Legal intents of an enemy, before scoring. */
export function legalIntents(v: BrainView): { intent: Intent; ally?: number }[] {
  const { self } = v;
  const rule = ruleOf(self);
  const out: { intent: Intent; ally?: number }[] = [{ intent: "attack1" }];
  const strongOk = self.cooldown <= 0 && !v.strongCommitted;
  if (v.rebuildDue) return [{ intent: "rebuild" }];
  if (v.chargeReady) return [{ intent: "charge" }];
  if (v.prepareCharge) return [{ intent: "defend" }];
  if (rule === "marchitar") {
    if (v.ritualDue) return [{ intent: "channeling" }];
    if (strongOk) out.push({ intent: "attack2" });
    out.push({ intent: "defend" });
    return out;
  }
  if (rule) {
    if (strongOk) out.push({ intent: "attack2" });
    out.push({ intent: "defend" });
    return out;
  }
  switch (personalityOf(self)) {
    case "agresor":
      if (strongOk) out.push({ intent: "attack2" });
      out.push({ intent: "defend" });
      break;
    case "protector": {
      out.push({ intent: "defend" });
      const hurt = v.allies
        .filter((a) => a.c.hp < a.c.char.stats.hp)
        .sort((a, b) => a.c.hp / a.c.char.stats.hp - b.c.hp / b.c.char.stats.hp)[0];
      if (hurt) out.push({ intent: "protect", ally: hurt.index });
      if (strongOk) out.push({ intent: "attack2" });
      break;
    }
    case "ritualista":
      if (strongOk) out.push({ intent: "charge" });
      if (!v.strongCommitted && self.cooldown <= 0 && (self.mem ?? []).slice(-2).every((m) => m !== "channeling"))
        out.push({ intent: "channeling" });
      out.push({ intent: "defend" });
      break;
  }
  return out;
}

/** Scores every legal intent in [0,100]; all contributions are inspectable. */
export function scoreIntents(v: BrainView): Candidate[] {
  const { self, player } = v;
  const playerHp = Math.max(1, player.hp + (player.shield ?? 0));
  const selfFrac = self.hp / self.char.stats.hp;
  const playerGuarding = !!player.defending;
  return legalIntents(v).map(({ intent, ally }) => {
    const parts: Record<string, number> = {};
    const strong = intent === "attack2" || intent === "charge" || intent === "channeling";
    if (intent === "attack1" || intent === "attack2" || intent === "charge") {
      let dmg = v.ev(self, player, intent) / playerHp * 100;
      if (playerGuarding) dmg *= intent === "attack2" || intent === "charge" ? 0.6 : 0.8;
      parts.damage = clamp100(dmg);
      parts.opportunity = strong ? -6 : 0;
    }
    if (intent === "channeling") {
      parts.objective = 55 + (player.statuses?.length ? 0 : 10);
      parts.opportunity = -4;
    }
    if (intent === "defend") {
      parts.survival = clamp100((0.6 - selfFrac) * 160);
      parts.opportunity = -12;
    }
    if (intent === "protect" && ally !== undefined) {
      const a = v.allies.find((x) => x.index === ally)!.c;
      parts.ally = clamp100((1 - a.hp / a.char.stats.hp) * 130);
      parts.opportunity = -8;
    }
    if (intent === "rebuild") parts.objective = 100;
    const repeats = (self.mem ?? []).filter((m) => m === intent).length;
    parts.repetition = -12 * repeats;
    const score = clamp100(Object.values(parts).reduce((s, x) => s + x, 0));
    return { intent, ...(ally !== undefined && { ally }), score, parts };
  });
}

/** Picks among candidates within SCORE_BAND of the best; a lone candidate costs no RNG draw. */
export function chooseIntent(v: BrainView, rng: Rng): Candidate {
  const all = scoreIntents(v).sort((a, b) => b.score - a.score);
  const best = all[0].score;
  const pool = all.filter((c) => best - c.score <= SCORE_BAND);
  return pool.length === 1 ? pool[0] : rng.pick(pool);
}
