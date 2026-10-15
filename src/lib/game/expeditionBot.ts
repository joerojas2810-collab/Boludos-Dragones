// Decision bots for the Torre expedition: pure "next action" pickers used by the simulation script and
// the tests. Combat always goes through autoPolicy (the shared bot policy); only the meta decisions
// (route, relics, shop, events, rests) differ between strategies.
import { autoPolicy } from "./auto";
import {
  eventOptions,
  routeOptions,
  maxHpOf,
  type ExpAction,
  type ExpState,
} from "./expedition";
import { MAX_RELICS, RELICS, upgradable, type OwnedRelic, type RelicId } from "./relics";
import type { Rng } from "./rng";

export type Strategy = "greedy" | "conservative" | "random";
export const STRATEGIES: readonly Strategy[] = ["greedy", "conservative", "random"];

// Static value of each relic per strategy (higher = preferred). Greedy chases damage, conservative defence.
const GREEDY: Partial<Record<RelicId, number>> = {
  whetstone: 8, vorpal_blade: 8, hunter_lens: 7, dragon_fang: 6, scholar_seal: 6, old_book: 6,
  duelist_glove: 6, plate_armor: 5, winged_boots: 5, runic_shield: 5, bear_heart: 4, broken_clock: 4,
  moss_amulet: 4, blood_ring: 3, thirsty_chalice: 3, phoenix_heart: 3, bronze_armor: 2, bottomless_purse: 1,
};
const SAFE: Partial<Record<RelicId, number>> = {
  phoenix_heart: 9, bear_heart: 8, bronze_armor: 8, thirsty_chalice: 6, runic_shield: 5, winged_boots: 5,
  moss_amulet: 4, plate_armor: 4, hunter_lens: 3, whetstone: 3, bottomless_purse: 2, blood_ring: 2,
  old_book: 2, duelist_glove: 2, dragon_fang: 2, scholar_seal: 2, broken_clock: 2, vorpal_blade: 0,
};
const value = (strat: Strategy, id: RelicId, rng: Rng) =>
  strat === "random" ? rng.next() : ((strat === "greedy" ? GREEDY : SAFE)[id] ?? 1);

const weakestSlot = (s: ExpState, strat: Strategy, rng: Rng): number => {
  let best = 0;
  let bv = Infinity;
  s.relics.forEach((o, i) => {
    const v = value(strat, o.id, rng) + (o.tier === 2 ? 10 : 0);
    if (v < bv) { bv = v; best = i; }
  });
  return best;
};

export function nextAction(s: ExpState, strat: Strategy, rng: Rng): ExpAction | null {
  const base = { actionId: `a${s.revision}`, expectedRevision: s.revision };
  const hpFrac = s.hp / maxHpOf(s);
  switch (s.phase) {
    case "ended":
      return null;
    case "preparation":
      return { ...base, type: "begin" };
    case "suspended":
    case "sector_summary":
      return { ...base, type: "continue" };
    case "initial_relic":
    case "reward": {
      const offer = s.offer!;
      const scored = offer.options
        .map((o) => ({ o, v: value(strat, o.relicId, rng) + (o.tier === 2 ? 2 : 0) }))
        .sort((a, b) => b.v - a.v);
      const pick = scored[0].o;
      if (pick.tier === 1 && s.relics.length >= MAX_RELICS) {
        const slot = weakestSlot(s, strat, rng);
        const worst = value(strat, s.relics[slot].id, rng);
        if (offer.canDecline && scored[0].v <= worst) return { ...base, type: "decline_relic", offerId: offer.id };
        return { ...base, type: "choose_relic", offerId: offer.id, optionId: pick.id, replaceSlot: slot };
      }
      return { ...base, type: "choose_relic", offerId: offer.id, optionId: pick.id };
    }
    case "route": {
      const opts = routeOptions(s);
      const hard = opts.find((o) => o.risk === "alto");
      let pick = opts[0];
      if (strat === "random") pick = opts[rng.int(0, opts.length - 1)];
      else if (opts.length > 1) {
        const combat = opts[0].kind === "combat";
        if (combat && strat === "greedy" && hard && hpFrac > 0.5) pick = hard;
        else if (!combat && strat === "greedy") pick = opts[opts[0].kind === "event" ? 1 : 0]; // shop / rest first
        else if (!combat && strat === "conservative") pick = opts.find((o) => o.kind === "rest") ?? opts[0];
      }
      return { ...base, type: "choose_route", optionId: pick.id };
    }
    case "combat": {
      // core bug guard: a fight that finished before the hero's first turn leaves no legal action (reported)
      if (s.battle!.status !== "ongoing") return { ...base, type: "retire" };
      const p = autoPolicy(s.battle!);
      return { ...base, type: "combat_action", a: p.action, ...(p.target !== undefined && { target: p.target }) };
    }
    case "event": {
      if (s.event!.stage === "done") return { ...base, type: "continue" };
      const opts = eventOptions(s).filter((o) => !o.disabled);
      let pick = opts[0];
      if (strat === "random") pick = opts[rng.int(0, opts.length - 1)];
      else {
        const id = s.event!.id;
        const wantHeal = hpFrac < (strat === "conservative" ? 0.75 : 0.5);
        const prefer: "a" | "b" =
          id === "fountain" ? (wantHeal ? "a" : "b")
          : id === "altar" ? (strat === "greedy" && hpFrac > 0.6 ? "a" : "b")
          : id === "purse" ? (strat === "greedy" ? "b" : "a")
          : id === "book" ? (strat === "greedy" ? "a" : "b")
          : id === "statue" ? (strat === "greedy" ? "a" : "b")
          : wantHeal ? "a" : "b";
        pick = opts.find((o) => o.id === prefer) ?? opts[opts.length - 1];
      }
      return { ...base, type: "choose_event", optionId: pick.id };
    }
    case "shop": {
      if (s.shop!.bought) return { ...base, type: "continue" };
      const goods = s.shop!.goods.filter(
        (g) => s.fragments >= g.price && !(g.kind === "relic" && s.relics.length >= MAX_RELICS),
      );
      if (!goods.length) return { ...base, type: "continue" };
      let pick = goods[0];
      if (strat === "random") pick = goods[rng.int(0, goods.length - 1)];
      else if (strat === "conservative") pick = (hpFrac < 0.7 ? goods.find((g) => g.kind === "heal") : undefined) ?? goods.find((g) => g.kind !== "heal") ?? goods[0];
      else pick = goods.find((g) => g.kind === "upgrade") ?? goods.find((g) => g.kind === "relic") ?? goods[0];
      return { ...base, type: "buy", itemId: pick.id };
    }
    case "rest": {
      if (s.serviceDone) return { ...base, type: "continue" };
      const heal = strat === "random" ? rng.chance(0.5) : hpFrac < (strat === "conservative" ? 0.85 : 0.6);
      return { ...base, type: "choose_rest", optionId: heal ? "heal" : "fragments" };
    }
    case "sanctuary": {
      if (s.serviceDone) return { ...base, type: "continue" };
      const ups = upgradable(s.relics);
      const heal = hpFrac < (strat === "conservative" ? 0.8 : 0.5);
      if (strat === "random") {
        const r = rng.int(0, ups.length ? 2 : 1);
        if (r === 2) return { ...base, type: "choose_sanctuary", optionId: "upgrade", relicId: ups[0].id };
        return { ...base, type: "choose_sanctuary", optionId: r === 0 ? "heal" : "fragments" };
      }
      if (heal) return { ...base, type: "choose_sanctuary", optionId: "heal" };
      if (ups.length) {
        const top = [...ups].sort((a: OwnedRelic, b: OwnedRelic) => value(strat, b.id, rng) - value(strat, a.id, rng))[0];
        return { ...base, type: "choose_sanctuary", optionId: "upgrade", relicId: top.id };
      }
      return { ...base, type: "choose_sanctuary", optionId: "fragments" };
    }
  }
  return null;
}

/** Display name of a relic for reports. */
export const relicName = (id: RelicId) => RELICS[id].name;
