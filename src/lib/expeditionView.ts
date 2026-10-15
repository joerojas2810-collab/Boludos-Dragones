// Pure view-model helpers of the expedition screens: texts, labels and derived facts that the
// components render. No React here (docs/torre/02): everything is testable.
import { CLASSES } from "./game/characters";
import { ELEMENT_LABEL } from "./game/elements";
import {
  absoluteNode,
  combatOrdinal,
  eventOptions,
  EVENT_IDS,
  maxHpOf,
  nodeInfo,
  NODES_PER_SECTOR,
  MAX_NODES,
  type EndReason,
  type EventId,
  type ExpState,
  type RouteOption,
  type ShopGood,
} from "./game/expedition";
import type { DoorKind } from "./game/room";
import {
  aggregateRelics,
  MAX_RELICS,
  RELICS,
  upgradable,
  valueOf,
  type OfferOption,
  type OwnedRelic,
  type RelicCategory,
  type RelicId,
} from "./game/relics";

/** The three kinds of duration/scope a number can have; always shown as text, never only by colour. */
export const SCOPE = {
  cuenta: "Cuenta",
  expedicion: "Esta expedición",
  proximo: "Próximo combate",
} as const;
export type Scope = keyof typeof SCOPE;

export const EVENT_ICON: Record<EventId, string> = {
  fountain: "event_shining_fountain",
  altar: "event_forgotten_altar",
  purse: "event_abandoned_bag",
  book: "event_whispering_book",
  statue: "event_ruby_statue",
  beggar: "event_suspicious_beggar",
};

export const ROUTE_DOOR: Record<RouteOption["kind"], DoorKind> = {
  combat: "easy",
  elite: "hard",
  boss: "boss",
  shop: "merchant",
  event: "event",
  rest: "rest",
  sanctuary: "chest",
};

export const ROUTE_KIND_LABEL: Record<RouteOption["kind"], string> = {
  combat: "Combate",
  elite: "Élite",
  boss: "Jefe",
  shop: "Tienda",
  event: "Evento",
  rest: "Descanso",
  sanctuary: "Santuario",
};
/** What a service is for (shown beside its symbol, docs/torre/04). */
export const ROUTE_PURPOSE: Record<RouteOption["kind"], string> = {
  combat: "Pelea contra un grupo de rivales.",
  elite: "Pelea difícil con rivales reforzados; premia con una oferta de reliquia.",
  boss: "Jefe del sector; premia con una oferta de reliquia.",
  shop: "Tres productos; puedes hacer una sola compra con fragmentos.",
  event: "Un suceso con dos respuestas y costos visibles antes de confirmar.",
  rest: "Curar un 25 % de tu PV o ganar 25 fragmentos.",
  sanctuary: "Un beneficio y cambio gratuito de habilidades antes de seguir.",
};

export const END_REASON_TEXT: Record<EndReason, string> = {
  death: "Caíste en combate.",
  draw: "Empate por el límite de turnos: la pelea cuenta como derrota.",
  retired: "Te retiraste de la expedición.",
  season: "La semana terminó: la expedición se cerró por cierre de temporada.",
  limit: `Límite de temporada alcanzado (${MAX_NODES} nodos). No es una derrota.`,
  engine: "La versión del juego cambió y la expedición se cerró. Lo ya confirmado se conserva.",
};

export const PHASE_TITLE: Record<ExpState["phase"], string> = {
  preparation: "Preparación",
  initial_relic: "Reliquia inicial",
  route: "Elige tu camino",
  combat: "Combate",
  event: "Evento",
  shop: "Tienda",
  rest: "Descanso",
  sanctuary: "Santuario",
  reward: "Recompensa",
  sector_summary: "Sector superado",
  suspended: "Expedición suspendida",
  ended: "Fin de la expedición",
};

/** "Sector 2 · piso 14 · combate 10". Piso = node number; combate = fight ordinal (or fights won in services). */
export function hudLine(s: Pick<ExpState, "sector" | "node" | "combats">): string {
  const ord = combatOrdinal(s.sector, s.node);
  return `Sector ${s.sector} · piso ${absoluteNode(s.sector, s.node)} · combate ${ord > 0 ? ord : s.combats}`;
}

export const hpPct = (s: Pick<ExpState, "hp" | "hero" | "relics">): number =>
  Math.max(0, Math.min(100, Math.round((s.hp / maxHpOf(s)) * 100)));

export const scoreLine = (nodes: number, turns: number): string =>
  `Nodo ${nodes} · ${turns} ${turns === 1 ? "turno" : "turnos"}`;

export const categoryLabel = (c: RelicCategory): string =>
  c === "global" ? "Global" : c === "riesgo" ? "Riesgo" : c in CLASSES ? CLASSES[c as keyof typeof CLASSES].name : ELEMENT_LABEL[c as keyof typeof ELEMENT_LABEL];

export const TIER_LABEL = { 1: "Nivel I", 2: "Nivel II" } as const;

export const relicEffect = (id: RelicId, tier: 1 | 2): string => RELICS[id].text(RELICS[id].values[tier - 1]);

export interface RelicRow {
  slot: number;
  relic: OwnedRelic | null;
  name: string;
  tier: string;
  category: string;
  effect: string;
  cap: string | null;
  capped: boolean;
}

/** Always six rows: the owned relics then empty slots. `capped` = a global cap limits the benefit right now. */
export function relicRows(owned: readonly OwnedRelic[]): RelicRow[] {
  const capped = new Set<RelicId>(aggregateRelics(owned).capped);
  return Array.from({ length: MAX_RELICS }, (_, slot): RelicRow => {
    const r = owned[slot] ?? null;
    if (!r)
      return { slot, relic: null, name: "Espacio libre", tier: "", category: "", effect: "Una reliquia nueva ocupa este espacio.", cap: null, capped: false };
    const d = RELICS[r.id];
    return {
      slot,
      relic: r,
      name: d.name,
      tier: TIER_LABEL[r.tier],
      category: categoryLabel(d.category),
      effect: d.text(valueOf(r)),
      cap: d.cap ?? null,
      capped: capped.has(r.id),
    };
  });
}

export const slotsFull = (owned: readonly OwnedRelic[]): boolean => owned.length >= MAX_RELICS;

export interface OfferView {
  id: string;
  relicId: RelicId;
  title: string;
  tier: string; // "Nivel I" or "Mejora a nivel II"
  category: string;
  effect: string;
  upgrade: boolean;
}
export function offerView(o: OfferOption): OfferView {
  const d = RELICS[o.relicId];
  return {
    id: o.id,
    relicId: o.relicId,
    title: d.name,
    tier: o.tier === 2 ? "Mejora a nivel II" : "Nivel I",
    category: categoryLabel(d.category),
    effect: relicEffect(o.relicId, o.tier),
    upgrade: o.tier === 2,
  };
}
/** A new (tier I) relic with full slots needs the player to pick which one to replace. */
export const needsReplace = (owned: readonly OwnedRelic[], o: Pick<OfferOption, "tier">): boolean =>
  o.tier === 1 && slotsFull(owned);

export interface GoodView {
  id: string;
  title: string;
  text: string;
  price: number;
  disabled: string | null;
  replace: boolean;
  relicId: RelicId | null;
}
export function goodView(s: Pick<ExpState, "fragments" | "relics" | "shop" | "hp" | "hero">, g: ShopGood): GoodView {
  const base = { id: g.id, price: g.price, relicId: g.relicId ?? null };
  const bought = s.shop?.bought ? "Ya hiciste tu compra en esta visita." : null;
  const poor = s.fragments < g.price ? `Te faltan ${g.price - s.fragments} fragmentos.` : null;
  if (g.kind === "heal")
    return { ...base, title: "Poción de curación", text: "Cura un 20 % de tu PV máximo.", disabled: bought ?? poor, replace: false };
  const d = RELICS[g.relicId!];
  const up = g.kind === "upgrade";
  return {
    ...base,
    title: up ? `Mejora: ${d.name}` : d.name,
    text: `${up ? "Pasa a nivel II. " : "Nivel I. "}${relicEffect(g.relicId!, up ? 2 : 1)}`,
    disabled: bought ?? poor,
    replace: !up && slotsFull(s.relics),
    relicId: g.relicId ?? null,
  };
}

export interface ChoiceView {
  id: string;
  label: string;
  cost?: string;
  disabled?: string;
}

export function restOptionsView(s: Pick<ExpState, "hero" | "relics" | "hp">): ChoiceView[] {
  const max = maxHpOf(s);
  const heal = Math.min(max - s.hp, Math.round(max * 0.25));
  return [
    { id: "heal", label: `Curar un 25 % de tu PV (+${heal} PV)`, ...(heal <= 0 ? { disabled: "Ya tienes la vida completa." } : {}) },
    { id: "fragments", label: "Ganar 25 fragmentos" },
  ];
}
export function sanctuaryOptionsView(s: Pick<ExpState, "hero" | "relics" | "hp">): ChoiceView[] {
  const base = restOptionsView(s);
  return [
    base[0],
    {
      id: "upgrade",
      label: "Mejorar una reliquia de nivel I a nivel II",
      ...(upgradable(s.relics).length ? {} : { disabled: "No tienes reliquias de nivel I para mejorar." }),
    },
    { id: "fragments", label: "Ganar 30 fragmentos" },
  ];
}

export const eventChoices = (s: ExpState): ChoiceView[] =>
  eventOptions(s).map((o) => ({ id: o.id, label: o.label, cost: o.cost, disabled: o.disabled }));

/** Both answers of every event, readable before ever finding it (the codex never hides mechanics). */
export function eventMechanics(id: EventId): ChoiceView[] {
  // eventOptions only reads hp, fragments, relics and the event id: a rich enough stub is enough here.
  const stub = {
    event: { id, stage: "choose" },
    hero: { stats: { hp: 100 } },
    relics: [] as OwnedRelic[],
    hp: 100,
    fragments: 999,
  } as unknown as ExpState;
  return eventChoices(stub).map((o) => ({ id: o.id, label: o.label }));
}
export { EVENT_IDS };

/** Letters shown by the discovered/undiscovered state of the codex. */
export const discovered = <T,>(list: readonly T[], id: T): boolean => list.includes(id);

/** Position summary of the current node for the route screen. */
export function nodeSummary(s: Pick<ExpState, "node">): { type: string; sectorEnd: boolean } {
  const info = nodeInfo(s.node);
  return { type: info.type, sectorEnd: s.node === NODES_PER_SECTOR };
}

/** Compact enemy list of a route card: "Limo (Agua) · Espectro (Rayo)". */
export const compositionText = (o: Pick<RouteOption, "enemies">): string =>
  (o.enemies ?? []).map((e) => `${e.name} (${ELEMENT_LABEL[e.element]})`).join(" · ");

export const riskText = (o: Pick<RouteOption, "risk" | "kind">): string =>
  o.risk === "alto" ? "Riesgo alto: rivales más duros, más fragmentos." : o.kind === "elite" || o.kind === "boss" ? "Riesgo alto: rivales reforzados." : "Riesgo normal.";
