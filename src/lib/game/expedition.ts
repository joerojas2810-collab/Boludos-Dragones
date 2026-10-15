// Torre expedition (docs/torre/01-03): the endless tower as a sequence of sectors of 10 nodes
// (7 fights, 2 services, 1 sanctuary) with routes, temporary relics, shop, rests and events.
// Pure and deterministic: `applyExpeditionAction` is a reducer over a JSON-serializable state, so the
// client plays it locally and the server replays the very same fold. All randomness is derived from
// (seed, sector, node, purpose, index) except the combat stream, whose cursor lives in the state.
import { type Character } from "./characters";
import { step, startBattle, actionError, type Action, type Battle, type EnemyMod } from "./combat";
import { autoResolve } from "./auto";
import { floorFight } from "./floorFights";
import { DUNGEON_THEMES, ROUTE_IDS, type RouteId } from "./levels";
import { loadoutError, defaultLoadout, type Loadout } from "./skills";
import { hashSeed, createRng } from "./rng";
import { ENGINE_VERSION, SEDIENTO_HEAL, type FightRole, type FightSpec } from "./stage";
import { TRAITS, type Trait } from "./traits";
import {
  aggregateRelics,
  buildOffer,
  REPLACE_FRAGMENTS,
  RELICS,
  takeRelic,
  upgradable,
  isRelicId,
  type OfferOption,
  type OwnedRelic,
  type RelicId,
} from "./relics";

export const EXPEDITION_CATALOG_VERSION = 1;
export const NODES_PER_SECTOR = 10;
export const COMBATS_PER_SECTOR = 7;
export const MAX_NODES = 500; // operative season limit (docs/torre/01 §8)
export const START_FRAGMENTS = 20;
export const MAX_FRAGMENTS = 999;
export const FRAGMENTS = { normal: 10, elite: 20, boss: 30 } as const;
export const HARD_ROUTE_FRAGMENT_MULT = 1.5;
export const TOWER_WIN_HEAL = 0.02;
export const TOWER_WIN_HEAL_CAP = 0.06;
export const SHOP_PRICES = { relic: 40, upgrade: 60, heal: 20 } as const;
export const REST_HEAL = 0.25;
export const REST_FRAGMENTS = 25;
export const SANCTUARY_FRAGMENTS = 30;
export const PACT_DAMAGE = 0.1;
export const PACT_FRAGMENTS = 30;
export const MAX_RECENT = 16;
export const MAX_LOG = 60;

export type NodeType = "combat" | "service" | "elite" | "sanctuary" | "boss";
export const SCHEDULE: readonly { type: NodeType; relicReward: boolean }[] = [
  { type: "combat", relicReward: false },
  { type: "combat", relicReward: true },
  { type: "service", relicReward: false },
  { type: "combat", relicReward: false },
  { type: "elite", relicReward: true },
  { type: "combat", relicReward: false },
  { type: "service", relicReward: false },
  { type: "combat", relicReward: true },
  { type: "sanctuary", relicReward: false },
  { type: "boss", relicReward: true },
];
/** 1-based combat number inside a sector for a node position (null for services/sanctuary). */
const COMBAT_INDEX: Record<number, number> = { 1: 1, 2: 2, 4: 3, 5: 4, 6: 5, 8: 6, 10: 7 };

export type ExpMode = "nivelado" | "coleccion";
export type Phase =
  | "preparation" | "initial_relic" | "route" | "combat" | "event" | "shop" | "rest"
  | "sanctuary" | "reward" | "sector_summary" | "suspended" | "ended";
export type EndReason = "death" | "draw" | "retired" | "season" | "limit" | "engine";

export const EVENT_IDS = ["fountain", "altar", "purse", "book", "statue", "beggar"] as const;
export type EventId = (typeof EVENT_IDS)[number];

export interface ShopGood {
  id: string;
  kind: "relic" | "upgrade" | "heal";
  price: number;
  relicId?: RelicId;
}
export interface PendingOffer {
  id: string; // `${absoluteNode}:${seq}`
  source: "initial" | "combat" | "event" | "shop" | "sanctuary";
  options: OfferOption[];
  canDecline: boolean;
}
export interface LedgerEntry {
  node: number; // absolute node index (1-based)
  kind: "normal" | "elite" | "boss";
}
export interface ExpEnd {
  reason: EndReason;
  node: number; // nodes fully resolved
  killer?: string[]; // enemy names alive when the hero fell
}
export interface FightInfo {
  option: number;
  kind: "combat" | "elite" | "boss";
  role: FightRole;
  fragments: number;
  relicReward: boolean;
  pact: boolean;
  names: string[];
}

export interface ExpState {
  v: 1;
  mode: ExpMode;
  seed: number;
  weekKey: string;
  engineVersion: number;
  catalogVersion: number;
  revision: number;
  phase: Phase;
  resumePhase?: Phase;
  sector: number; // 1-based
  node: number; // 1..10 position being played / chosen
  nodes: number; // nodes fully resolved (the score)
  combats: number; // fights won
  turns: number; // resolved turns of the won fights (tiebreak)
  hero: Character; // base snapshot (relic effects are layered on top)
  loadout: Loadout;
  hp: number;
  relics: OwnedRelic[];
  fragments: number;
  phoenixSpent: boolean;
  pact: boolean;
  offer: PendingOffer | null;
  offerReturn?: "route" | "event" | "shop" | "sanctuary";
  offerSeq: number;
  shop: { goods: ShopGood[]; bought: boolean } | null;
  event: { id: EventId; stage: "choose" | "done"; taken?: "a" | "b"; note?: string } | null;
  serviceDone: boolean; // rest / sanctuary benefit already taken at this node
  fight: FightInfo | null;
  battle: Battle | null;
  rng: number;
  ledger: LedgerEntry[];
  seen: { relics: RelicId[]; events: EventId[] };
  history: { node: number; text: string }[];
  recent: string[];
  end?: ExpEnd;
}

// ---- weeks -------------------------------------------------------------------------------------

/** Monday of the Buenos Aires (UTC-3) week containing `d`, as YYYY-MM-DD. One authority for the app. */
export function artWeekKey(d: Date = new Date()): string {
  const art = new Date(d.getTime() - 3 * 3_600_000);
  const day = (art.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

// ---- sector content ----------------------------------------------------------------------------

/** Boss route of a sector: the nine bosses in a seeded order per cycle, never repeating back to back. */
export function sectorBossRoute(seed: number, sector: number): RouteId {
  const order = (block: number): RouteId[] => {
    const rng = createRng(hashSeed(seed, 9001, block));
    const a = [...ROUTE_IDS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const block = Math.floor((sector - 1) / ROUTE_IDS.length);
  const pos = (sector - 1) % ROUTE_IDS.length;
  const cur = order(block);
  if (pos === 0 && block > 0 && cur[0] === order(block - 1)[ROUTE_IDS.length - 1]) {
    [cur[0], cur[1]] = [cur[1], cur[0]];
  }
  return cur[pos];
}

const SECTOR_MODS: readonly EnemyMod[] = ["dobleAtaque", "elementoCambiante", "escudo"];
/** One environmental modifier per sector from the second on; regeneration is out of v1. */
export function sectorMods(seed: number, sector: number): EnemyMod[] {
  if (sector < 2) return [];
  const rng = createRng(hashSeed(seed, 9002, sector));
  return [rng.pick(SECTOR_MODS)];
}

/** Mods allowed on a boss fight (incompatibility lists, docs/torre/01 §8). */
export function bossSafeMods(mods: readonly EnemyMod[], route: RouteId): EnemyMod[] {
  const bossId = DUNGEON_THEMES[route].bossId;
  return mods.filter((m) => {
    if (m === "dobleAtaque" && (bossId === "mother_hydra" || bossId === "great_devourer")) return false;
    if (m === "escudo" && bossId === "hollow_colossus") return false;
    return true;
  });
}

export const nodeInfo = (position: number) => SCHEDULE[position - 1];
export const absoluteNode = (sector: number, position: number) => (sector - 1) * NODES_PER_SECTOR + position;
export const combatOrdinal = (sector: number, position: number): number =>
  (sector - 1) * COMBATS_PER_SECTOR + (COMBAT_INDEX[position] ?? 0);

/** FightSpec of a combat node: both routes share the same difficulty ordinal (docs/torre/01 §4). */
export function expeditionFight(
  seed: number,
  sector: number,
  position: number,
  option: number,
): FightSpec & { relicReward: boolean; kind: "combat" | "elite" | "boss"; route: RouteId | null } {
  const info = nodeInfo(position);
  const ordinal = combatOrdinal(sector, position);
  const optSeed = hashSeed(seed, sector, position, 100 + option);
  const mods = sectorMods(seed, sector);
  if (info.type === "boss") {
    const route = sectorBossRoute(seed, sector);
    const spec = floorFight(optSeed, ordinal, {
      tower: true, kind: "boss", role: "final", route, worldFloor: (sector - 1) * 10 + 1, mods: bossSafeMods(mods, route),
    });
    return { ...spec, relicReward: true, kind: "boss", route };
  }
  const elite = info.type === "elite";
  const spec = floorFight(optSeed, ordinal, {
    tower: true,
    kind: elite ? "boss" : option === 1 ? "hard" : "easy",
    role: elite ? "elite" : "normal",
    worldFloor: (sector - 1) * 10 + 1,
    mods,
  });
  return { ...spec, relicReward: info.relicReward, kind: elite ? "elite" : "combat", route: null };
}

export interface RouteOption {
  id: string; // r0 | r1
  kind: "combat" | "elite" | "boss" | "shop" | "event" | "rest" | "sanctuary";
  label: string;
  enemies?: { name: string; element: Character["element"]; hp: number }[];
  mods?: EnemyMod[];
  fragments?: number;
  relicReward?: boolean;
  risk?: "normal" | "alto";
}

/** The routes available at the current node (derived, never stored). */
export function routeOptions(s: ExpState): RouteOption[] {
  const info = nodeInfo(s.node);
  const fight = (kind: "combat" | "elite" | "boss", i: number): RouteOption => {
    const spec = expeditionFight(s.seed, s.sector, s.node, i);
    const base = kind === "boss" ? FRAGMENTS.boss : kind === "elite" ? FRAGMENTS.elite : FRAGMENTS.normal;
    const hard = kind === "combat" && i === 1;
    return {
      id: `r${i}`,
      kind,
      label: kind === "boss" ? "Jefe del sector" : kind === "elite" ? (i === 0 ? "Élite · Variante A" : "Élite · Variante B") : hard ? "Camino exigente" : "Camino estándar",
      enemies: spec.enemies.map((e) => ({ name: e.name, element: e.element, hp: e.stats.hp })),
      mods: spec.mods,
      fragments: Math.round(base * (hard ? HARD_ROUTE_FRAGMENT_MULT : 1)),
      relicReward: spec.relicReward,
      risk: hard ? "alto" : "normal",
    };
  };
  switch (info.type) {
    case "combat": return [fight("combat", 0), fight("combat", 1)];
    case "elite": return [fight("elite", 0), fight("elite", 1)];
    case "boss": return [fight("boss", 0)];
    case "sanctuary": return [{ id: "r0", kind: "sanctuary", label: "Santuario" }];
    case "service":
      return s.node === 3
        ? [{ id: "r0", kind: "event", label: "Evento" }, { id: "r1", kind: "shop", label: "Tienda" }]
        : [{ id: "r0", kind: "rest", label: "Descanso" }, { id: "r1", kind: "event", label: "Evento" }];
  }
}

// ---- derived helpers ---------------------------------------------------------------------------

export const maxHpOf = (s: Pick<ExpState, "hero" | "relics">): number =>
  Math.max(1, Math.round(s.hero.stats.hp * aggregateRelics(s.relics).hpMult));

/** The hero as the engine plays it: base snapshot with the relic PV bonus. */
export const effectiveHero = (s: Pick<ExpState, "hero" | "relics">): Character => ({
  ...s.hero,
  stats: { ...s.hero.stats, hp: maxHpOf(s) },
});

const winHealOf = (hero: Character): number =>
  Math.min(
    TOWER_WIN_HEAL_CAP,
    TOWER_WIN_HEAL + (hero.traits.some((t) => (TRAITS[t] as Trait).tag === "healOnWin") ? SEDIENTO_HEAL : 0),
  );

const clampHp = (s: ExpState): ExpState => ({ ...s, hp: Math.max(1, Math.min(s.hp, maxHpOf(s))) });
const addFragments = (s: ExpState, n: number): ExpState => ({
  ...s,
  fragments: Math.max(0, Math.min(MAX_FRAGMENTS, s.fragments + n)),
});
const heal = (s: ExpState, fraction: number): ExpState => ({
  ...s,
  hp: Math.min(maxHpOf(s), s.hp + Math.round(maxHpOf(s) * fraction)),
});
const note = (s: ExpState, text: string): ExpState => ({
  ...s,
  history: [...s.history.slice(-49), { node: absoluteNode(s.sector, s.node), text }],
});
const see = (s: ExpState, relics: readonly RelicId[] = [], events: readonly EventId[] = []): ExpState => ({
  ...s,
  seen: {
    relics: [...new Set([...s.seen.relics, ...relics])],
    events: [...new Set([...s.seen.events, ...events])],
  },
});

// ---- lifecycle ---------------------------------------------------------------------------------

export interface ExpInit {
  mode: ExpMode;
  seed: number;
  weekKey: string;
  hero: Character;
  loadout?: Loadout;
  engineVersion?: number;
}

export function startExpedition(init: ExpInit): ExpState {
  return {
    v: 1,
    mode: init.mode,
    seed: init.seed,
    weekKey: init.weekKey,
    engineVersion: init.engineVersion ?? ENGINE_VERSION,
    catalogVersion: EXPEDITION_CATALOG_VERSION,
    revision: 0,
    phase: "preparation",
    sector: 1,
    node: 1,
    nodes: 0,
    combats: 0,
    turns: 0,
    hero: init.hero,
    loadout: init.loadout ?? defaultLoadout(init.hero.classId),
    hp: init.hero.stats.hp,
    relics: [],
    fragments: START_FRAGMENTS,
    phoenixSpent: false,
    pact: false,
    offer: null,
    offerSeq: 0,
    shop: null,
    event: null,
    serviceDone: false,
    fight: null,
    battle: null,
    rng: 0,
    ledger: [],
    seen: { relics: [], events: [] },
    history: [],
    recent: [],
  };
}

export type ExpAction = { actionId: string; expectedRevision: number } & (
  | { type: "begin" }
  | { type: "set_loadout"; loadout: readonly string[] }
  | { type: "choose_route"; optionId: string }
  | { type: "combat_action"; a: Action; target?: number }
  | { type: "combat_auto" }
  | { type: "choose_relic"; offerId: string; optionId: string; replaceSlot?: number }
  | { type: "decline_relic"; offerId: string }
  | { type: "buy"; itemId: string; replaceSlot?: number }
  | { type: "choose_event"; optionId: "a" | "b"; relicId?: string; replaceSlot?: number }
  | { type: "choose_rest"; optionId: "heal" | "fragments" }
  | { type: "choose_sanctuary"; optionId: "heal" | "upgrade" | "fragments"; relicId?: string }
  | { type: "continue" }
  | { type: "suspend" }
  | { type: "retire" }
);
export type ExpActionType = ExpAction["type"];
export const EXP_ACTION_TYPES: readonly ExpActionType[] = [
  "begin", "set_loadout", "choose_route", "combat_action", "combat_auto", "choose_relic", "decline_relic",
  "buy", "choose_event", "choose_rest", "choose_sanctuary", "continue", "suspend", "retire",
];

export interface ExpResult {
  state: ExpState;
  error?: string;
  duplicate?: boolean;
}

const fail = (s: ExpState, error: string): ExpResult => ({ state: s, error });
const finish = (s: ExpState): ExpResult => ({ state: { ...s, revision: s.revision + 1 } });

const newOffer = (
  s: ExpState,
  source: PendingOffer["source"],
  canDecline: boolean,
  count = 3,
): ExpState => {
  const seq = s.offerSeq + 1;
  const options = buildOffer(s.seed, s.hero.classId, s.hero.element, s.relics, [s.sector, s.node, seq], count);
  return see(
    {
      ...s,
      offerSeq: seq,
      offer: { id: `${absoluteNode(s.sector, s.node)}:${seq}`, source, options, canDecline },
    },
    options.map((o) => o.relicId),
  );
};

/** Moves to the next node (or the sector summary / season end). */
function moveOn(s: ExpState): ExpState {
  const cleared: ExpState = { ...s, offer: null, offerReturn: undefined, shop: null, event: null, serviceDone: false, fight: null, battle: null };
  if (cleared.nodes >= MAX_NODES) return { ...cleared, phase: "ended", end: { reason: "limit", node: cleared.nodes } };
  if (cleared.node >= NODES_PER_SECTOR) return { ...cleared, phase: "sector_summary" };
  return { ...cleared, node: cleared.node + 1, phase: "route" };
}

const resolveNode = (s: ExpState): ExpState => ({ ...s, nodes: s.nodes + 1 });

function beginFight(s: ExpState, option: number): ExpState {
  const spec = expeditionFight(s.seed, s.sector, s.node, option);
  const pact = s.pact;
  const enemies = pact
    ? spec.enemies.map((e) => ({ ...e, stats: { ...e.stats, atk: Math.round(e.stats.atk * (1 + PACT_DAMAGE) * 10) / 10 } }))
    : spec.enemies;
  const agg = aggregateRelics(s.relics);
  const rng = createRng(hashSeed(s.seed, s.sector, s.node, 300 + option, spec.battleSeed));
  const hero = effectiveHero(s);
  const battle = startBattle(hero, enemies, rng, {
    playerHp: Math.min(s.hp, hero.stats.hp),
    loadout: s.loadout,
    mods: spec.mods,
    enemyStatus: spec.role !== "normal",
    enemyAguante: spec.role !== "normal",
    relic: agg.mods,
    phoenixSpent: s.phoenixSpent,
  });
  const base = spec.kind === "boss" ? FRAGMENTS.boss : spec.kind === "elite" ? FRAGMENTS.elite : FRAGMENTS.normal;
  const hard = spec.kind === "combat" && option === 1;
  return {
    ...s,
    phase: "combat",
    pact: false,
    battle: trimBattle(battle),
    rng: rng.state?.() ?? 0,
    fight: {
      option,
      kind: spec.kind,
      role: spec.role,
      fragments: Math.round(base * (hard ? HARD_ROUTE_FRAGMENT_MULT : 1)) + (pact ? PACT_FRAGMENTS : 0),
      relicReward: spec.relicReward,
      pact,
      names: spec.enemies.map((e) => e.name),
    },
  };
}

const trimBattle = (b: Battle): Battle => (b.log.length > MAX_LOG ? { ...b, log: b.log.slice(-MAX_LOG) } : b);

/** Folds a finished battle (won | lost | draw) into the expedition. */
function settleFight(s: ExpState, battle: Battle): ExpState {
  const fight = s.fight!;
  const phoenixSpent = s.phoenixSpent || !!battle.player.phoenixUsed;
  if (battle.status !== "won") {
    const killer = battle.enemies.filter((e) => e.hp > 0).map((e) => e.char.name);
    return {
      ...s,
      phoenixSpent,
      hp: 0,
      battle,
      phase: "ended",
      end: { reason: battle.status === "draw" ? "draw" : "death", node: s.nodes, killer },
    };
  }
  const agg = aggregateRelics(s.relics);
  let next: ExpState = {
    ...s,
    phoenixSpent,
    combats: s.combats + 1,
    turns: s.turns + battle.turn,
    ledger: [
      ...s.ledger,
      { node: absoluteNode(s.sector, s.node), kind: fight.kind === "combat" ? "normal" : fight.kind },
    ],
  };
  const hpMax = maxHpOf(next);
  next = { ...next, hp: Math.min(hpMax, battle.player.hp + Math.round(hpMax * winHealOf(s.hero))), battle: null };
  next = addFragments(next, fight.fragments + agg.winFragments);
  next = resolveNode(next);
  next = note(next, `Combate ${next.combats} ganado`);
  if (fight.relicReward) {
    next = newOffer({ ...next, fight: null }, "combat", true);
    return { ...next, phase: "reward", offerReturn: "route" };
  }
  return moveOn(next);
}

/** After an offer is closed: back to where it came from. */
function afterOffer(s: ExpState): ExpState {
  const back = s.offerReturn ?? "route";
  const cleared = { ...s, offer: null, offerReturn: undefined };
  if (back === "event") return { ...cleared, phase: "event" };
  if (back === "shop") return { ...cleared, phase: "shop" };
  if (back === "sanctuary") return { ...cleared, phase: "sanctuary" };
  return moveOn(cleared);
}

// ---- shop / events -----------------------------------------------------------------------------

function buildShop(s: ExpState): ExpState {
  const goods: ShopGood[] = [];
  const first = buildOffer(s.seed, s.hero.classId, s.hero.element, s.relics, [s.sector, s.node, 71], 3)
    .filter((o) => o.tier === 1);
  if (first[0]) goods.push({ id: "g0", kind: "relic", price: SHOP_PRICES.relic, relicId: first[0].relicId });
  const ups = upgradable(s.relics);
  if (ups.length) {
    const pick = ups[createRng(hashSeed(s.seed, s.sector, s.node, 72)).int(0, ups.length - 1)];
    goods.push({ id: "g1", kind: "upgrade", price: SHOP_PRICES.upgrade, relicId: pick.id });
  } else if (first[1]) {
    goods.push({ id: "g1", kind: "relic", price: SHOP_PRICES.relic, relicId: first[1].relicId });
  }
  goods.push({ id: "g2", kind: "heal", price: SHOP_PRICES.heal });
  return see({ ...s, shop: { goods, bought: false } }, goods.flatMap((g) => (g.relicId ? [g.relicId] : [])));
}

export interface EventOption {
  id: "a" | "b";
  label: string;
  cost?: string;
  disabled?: string;
}
export const EVENT_TITLE: Record<EventId, string> = {
  fountain: "Fuente brillante", altar: "Altar olvidado", purse: "Bolsa abandonada",
  book: "Libro susurrante", statue: "Estatua de rubí", beggar: "Mendigo sospechoso",
};

export function eventOptions(s: ExpState): EventOption[] {
  const id = s.event?.id;
  const hpCost = Math.round(maxHpOf(s) * 0.1);
  const canUp = upgradable(s.relics).length > 0;
  switch (id) {
    case "fountain":
      return [{ id: "a", label: "Beber: curas 15 % de tu PV" }, { id: "b", label: "Recoger 20 fragmentos" }];
    case "altar":
      return [
        { id: "a", label: "Ofrenda: pierdes 10 % de tu PV máx. (no letal) y recibes una oferta de reliquia", cost: `−${hpCost} PV`,
          ...(s.hp <= 1 ? { disabled: "No tienes PV para pagar." } : {}) },
        { id: "b", label: "Irte sin costo" },
      ];
    case "purse":
      return [
        { id: "a", label: "Recibir 25 fragmentos" },
        { id: "b", label: "Gastar 20 fragmentos por una oferta de reliquia", cost: "−20 fragmentos",
          ...(s.fragments < 20 ? { disabled: "Te faltan fragmentos." } : {}) },
      ];
    case "book":
      return [
        { id: "a", label: canUp ? "Mejorar una reliquia de nivel I por 30 fragmentos" : "Comprar una oferta de reliquia por 30 fragmentos",
          cost: "−30 fragmentos", ...(s.fragments < 30 ? { disabled: "Te faltan fragmentos." } : {}) },
        { id: "b", label: "Recibir 10 fragmentos" },
      ];
    case "statue":
      return [
        { id: "a", label: "Pacto: el próximo combate los enemigos hacen +10 % de daño; si ganas, +30 fragmentos" },
        { id: "b", label: "Continuar sin pacto" },
      ];
    case "beggar":
      return [
        { id: "a", label: "Pagar 15 fragmentos y curar 20 % de tu PV", cost: "−15 fragmentos",
          ...(s.fragments < 15 ? { disabled: "Te faltan fragmentos." } : {}) },
        { id: "b", label: "Continuar sin costo" },
      ];
    default:
      return [];
  }
}

// ---- reducer -----------------------------------------------------------------------------------

const PHASES_WITH_SUSPEND: readonly Phase[] = [
  "preparation", "initial_relic", "route", "combat", "event", "shop", "rest", "sanctuary", "reward", "sector_summary",
];

export function applyExpeditionAction(s0: ExpState, a: ExpAction): ExpResult {
  if (s0.recent.includes(a.actionId)) return { state: s0, duplicate: true };
  if (a.expectedRevision !== s0.revision) return fail(s0, "revision");
  if (s0.engineVersion !== ENGINE_VERSION || s0.catalogVersion !== EXPEDITION_CATALOG_VERSION) {
    if (s0.phase !== "ended")
      return { state: { ...s0, phase: "ended", revision: s0.revision + 1, end: { reason: "engine", node: s0.nodes } }, error: "engine_outdated" };
    return fail(s0, "engine_outdated");
  }
  const r = reduce(s0, a);
  if (r.error) return r;
  return { state: { ...r.state, recent: [...s0.recent.slice(-(MAX_RECENT - 1)), a.actionId] } };
}

function reduce(s: ExpState, a: ExpAction): ExpResult {
  if (s.phase === "ended") return fail(s, "La expedición terminó.");
  // suspend / retire are valid almost anywhere
  if (a.type === "suspend") {
    if (s.phase === "suspended") return fail(s, "Ya está suspendida.");
    if (!PHASES_WITH_SUSPEND.includes(s.phase)) return fail(s, "No se puede suspender ahora.");
    return finish({ ...s, resumePhase: s.phase, phase: "suspended" });
  }
  if (a.type === "retire") {
    return finish({ ...s, phase: "ended", battle: null, end: { reason: "retired", node: s.nodes } });
  }
  if (s.phase === "suspended") {
    if (a.type !== "continue") return fail(s, "La expedición está suspendida: reanúdala.");
    return finish({ ...s, phase: s.resumePhase ?? "route", resumePhase: undefined });
  }
  switch (a.type) {
    case "set_loadout": {
      if (s.phase !== "preparation" && s.phase !== "sanctuary")
        return fail(s, "Las habilidades solo se cambian en la preparación o en el santuario.");
      const err = loadoutError(s.hero.classId, a.loadout, s.mode === "nivelado" ? null : 99);
      // collection mode: the caller (server) must pass a loadout it already validated against mastery;
      // here only shape/class/duplicates are checked (mastery 99 = unlock-agnostic).
      if (err) return fail(s, err);
      return finish({ ...s, loadout: [a.loadout[0], a.loadout[1]] as unknown as Loadout });
    }
    case "begin": {
      if (s.phase !== "preparation") return fail(s, "Ya empezó.");
      const withOffer = newOffer(s, "initial", false);
      return finish({ ...withOffer, phase: "initial_relic", offerReturn: "route" });
    }
    case "choose_relic":
    case "decline_relic": {
      if (s.phase !== "initial_relic" && s.phase !== "reward") return fail(s, "No hay ninguna oferta abierta.");
      const offer = s.offer;
      if (!offer || offer.id !== a.offerId) return fail(s, "La oferta ya no es válida.");
      if (a.type === "decline_relic") {
        if (!offer.canDecline) return fail(s, "Debes elegir una reliquia inicial.");
        return finish(afterOffer(note(addFragments(s, REPLACE_FRAGMENTS), "Oferta rechazada")));
      }
      const opt = offer.options.find((o) => o.id === a.optionId);
      if (!opt) return fail(s, "Opción desconocida.");
      const res = takeRelic(s.relics, opt, a.replaceSlot);
      if ("error" in res) return fail(s, res.error);
      let next = clampHp({ ...s, relics: res });
      next = note(next, `${opt.tier === 2 ? "Mejora" : "Reliquia"}: ${RELICS[opt.relicId].name}`);
      next = s.phase === "initial_relic" ? { ...next, offer: null, offerReturn: undefined, phase: "route" } : afterOffer(next);
      return finish(see(next, [opt.relicId]));
    }
    case "choose_route": {
      if (s.phase !== "route") return fail(s, "No hay ruta que elegir.");
      const opt = routeOptions(s).find((o) => o.id === a.optionId);
      if (!opt) return fail(s, "Ruta desconocida.");
      const option = Number(opt.id.slice(1));
      if (opt.kind === "combat" || opt.kind === "elite" || opt.kind === "boss") return finish(beginFight(s, option));
      if (opt.kind === "shop") return finish({ ...buildShop(s), phase: "shop" });
      if (opt.kind === "rest") return finish({ ...s, phase: "rest", serviceDone: false });
      if (opt.kind === "sanctuary") return finish({ ...s, phase: "sanctuary", serviceDone: false });
      const id = EVENT_IDS[createRng(hashSeed(s.seed, s.sector, s.node, 400)).int(0, EVENT_IDS.length - 1)];
      return finish(see({ ...s, phase: "event", event: { id, stage: "choose" } }, [], [id]));
    }
    case "combat_action":
    case "combat_auto": {
      if (s.phase !== "combat" || !s.battle || !s.fight) return fail(s, "No hay combate en curso.");
      const rng = createRng(s.rng);
      let battle: Battle;
      if (a.type === "combat_auto") {
        if (s.battle.actions > 0) return fail(s, "El combate rápido solo está al empezar la pelea.");
        battle = autoResolve(s.battle, rng);
        if (battle === s.battle) return fail(s, "Acción inválida.");
      } else {
        if (actionError(s.battle, a.a, a.target) !== null) return fail(s, "Acción inválida.");
        battle = step(s.battle, a.a, rng, a.target);
        if (battle === s.battle) return fail(s, "Acción inválida.");
      }
      const base: ExpState = { ...s, rng: rng.state?.() ?? 0, battle: trimBattle(battle) };
      if (battle.status === "ongoing") return finish(base);
      return finish(settleFight(base, battle));
    }
    case "buy": {
      if (s.phase !== "shop" || !s.shop) return fail(s, "No estás en la tienda.");
      if (s.shop.bought) return fail(s, "Solo una compra por visita.");
      const good = s.shop.goods.find((g) => g.id === a.itemId);
      if (!good) return fail(s, "Ese producto no existe.");
      if (s.fragments < good.price) return fail(s, "No te alcanzan los fragmentos.");
      let next: ExpState = s;
      if (good.kind === "heal") next = heal(s, 0.2);
      else {
        const res = takeRelic(s.relics, { relicId: good.relicId!, tier: good.kind === "upgrade" ? 2 : 1 }, a.replaceSlot);
        if ("error" in res) return fail(s, res.error);
        next = clampHp({ ...s, relics: res });
        next = note(next, `Compra: ${RELICS[good.relicId!].name}`);
      }
      next = addFragments(next, -good.price);
      return finish({ ...next, shop: { ...s.shop, bought: true } });
    }
    case "choose_event": {
      if (s.phase !== "event" || !s.event || s.event.stage !== "choose") return fail(s, "No hay evento abierto.");
      const opts = eventOptions(s);
      const opt = opts.find((o) => o.id === a.optionId);
      if (!opt) return fail(s, "Opción desconocida.");
      if (opt.disabled) return fail(s, opt.disabled);
      return finish(resolveEvent(s, a.optionId, a.relicId));
    }
    case "choose_rest": {
      if (s.phase !== "rest" || s.serviceDone) return fail(s, "El descanso ya se usó.");
      const next = a.optionId === "heal" ? heal(s, REST_HEAL) : addFragments(s, REST_FRAGMENTS);
      return finish({ ...next, serviceDone: true });
    }
    case "choose_sanctuary": {
      if (s.phase !== "sanctuary" || s.serviceDone) return fail(s, "El santuario ya se usó.");
      let next: ExpState = s;
      if (a.optionId === "heal") next = heal(s, REST_HEAL);
      else if (a.optionId === "fragments") next = addFragments(s, SANCTUARY_FRAGMENTS);
      else {
        const target = upgradable(s.relics).find((r) => r.id === a.relicId);
        if (!target) return fail(s, "Elige una reliquia de nivel I para mejorar.");
        next = clampHp({ ...s, relics: s.relics.map((r) => (r.id === target.id ? { ...r, tier: 2 as const } : r)) });
        next = note(next, `Santuario: mejora ${RELICS[target.id].name}`);
      }
      return finish({ ...next, serviceDone: true });
    }
    case "continue": {
      if (s.phase === "sector_summary") return finish({ ...s, phase: "route", sector: s.sector + 1, node: 1 });
      if (s.phase === "shop" || s.phase === "rest" || s.phase === "sanctuary") return finish(moveOn(resolveNode(s)));
      if (s.phase === "event") {
        if (s.event?.stage !== "done") return fail(s, "Elige una opción del evento.");
        return finish(moveOn(resolveNode(s)));
      }
      return fail(s, "Nada que continuar.");
    }
    default:
      return fail(s, "Acción desconocida.");
  }
}

function resolveEvent(s: ExpState, opt: "a" | "b", relicId?: string): ExpState {
  const ev = s.event!;
  const done = (state: ExpState, text: string): ExpState => ({
    ...state,
    event: { ...ev, stage: "done", taken: opt, note: text },
  });
  const toOffer = (state: ExpState, text: string): ExpState => {
    const withOffer = newOffer(state, "event", true);
    return { ...withOffer, event: { ...ev, stage: "done", taken: opt, note: text }, phase: "reward", offerReturn: "event" };
  };
  switch (ev.id) {
    case "fountain":
      return opt === "a" ? done(heal(s, 0.15), "Curaste el 15 % de tu PV.") : done(addFragments(s, 20), "Recogiste 20 fragmentos.");
    case "altar": {
      if (opt === "b") return done(s, "Te fuiste sin costo.");
      const cost = Math.min(s.hp - 1, Math.round(maxHpOf(s) * 0.1));
      return toOffer({ ...s, hp: s.hp - cost }, `Pagaste ${cost} PV.`);
    }
    case "purse":
      return opt === "a" ? done(addFragments(s, 25), "Recibiste 25 fragmentos.") : toOffer(addFragments(s, -20), "Gastaste 20 fragmentos.");
    case "book": {
      if (opt === "b") return done(addFragments(s, 10), "Recibiste 10 fragmentos.");
      const ups = upgradable(s.relics);
      if (ups.length) {
        const target = (isRelicId(relicId) ? ups.find((r) => r.id === relicId) : undefined) ?? ups[0];
        const paid = addFragments(s, -30);
        return done(
          clampHp({ ...paid, relics: paid.relics.map((r) => (r.id === target.id ? { ...r, tier: 2 as const } : r)) }),
          `Mejoraste ${RELICS[target.id].name}.`,
        );
      }
      return toOffer(addFragments(s, -30), "Pagaste 30 fragmentos.");
    }
    case "statue":
      return opt === "a" ? done({ ...s, pact: true }, "Pacto sellado: el próximo combate será más duro.") : done(s, "Seguiste sin pacto.");
    case "beggar":
      return opt === "a" ? done(heal(addFragments(s, -15), 0.2), "Pagaste 15 fragmentos y curaste el 20 %.") : done(s, "Seguiste tu camino.");
  }
}

// ---- replay ------------------------------------------------------------------------------------

export interface ExpReplay {
  state: ExpState;
  applied: number;
  rejectedAt: number | null;
  error?: string;
}

/** Folds an action log over a fresh expedition (used by tests, sims and for audits). */
export function replayExpedition(init: ExpInit, actions: readonly ExpAction[]): ExpReplay {
  let state = startExpedition(init);
  for (let i = 0; i < actions.length; i++) {
    const r = applyExpeditionAction(state, actions[i]);
    if (r.error) return { state, applied: i, rejectedAt: i, error: r.error };
    state = r.state;
  }
  return { state, applied: actions.length, rejectedAt: null };
}

/** Score of an expedition for ranking: nodes resolved, then fewer turns (docs/torre/01 §10). */
export const expeditionScore = (s: Pick<ExpState, "nodes" | "turns">) => ({ nodes: s.nodes, turns: s.turns });

/** Weekly payout of a won combat node (docs/torre/01 §10), first 3 sectors; services pay nothing. */
export const TOWER_PAY = { normal: 5, elite: 150, boss: 300 } as const;
export const TOWER_PAID_SECTORS = 3;
export const nodePay = (e: LedgerEntry): number =>
  e.node <= TOWER_PAID_SECTORS * NODES_PER_SECTOR ? TOWER_PAY[e.kind] : 0;
