// Torre expedition relics (docs/torre/01 §5). Temporary: they live only for one expedition and
// only tweak existing rules (no new actions). Pure data + aggregation with the global caps; the
// engine reads the result as `RelicMods` (combat.ts) and never knows about relics themselves.
import type { ClassId } from "./characters";
import type { Element } from "./elements";
import type { RelicMods } from "./combat";
import { createRng, hashSeed } from "./rng";

export type RelicTier = 1 | 2;
export type RelicCategory = "global" | ClassId | Element | "riesgo";

export const RELIC_IDS = [
  "bear_heart", "bronze_armor", "hunter_lens", "whetstone", "winged_boots", "bottomless_purse",
  "runic_shield", "old_book", "duelist_glove", "thirsty_chalice", "blood_ring",
  "dragon_fang", "moss_amulet", "broken_clock", "plate_armor", "scholar_seal",
  "vorpal_blade", "phoenix_heart",
] as const;
export type RelicId = (typeof RELIC_IDS)[number];

export interface RelicDef {
  id: RelicId; // also the art id (artIds.json)
  name: string;
  category: RelicCategory;
  values: readonly [number, number]; // tier I / II
  text: (v: number) => string; // effect text for a tier value
  cap?: string; // note shown when a global cap limits the benefit
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const pts = (v: number) => `${Math.round(v * 100)} puntos`;

export const RELICS: Record<RelicId, RelicDef> = {
  bear_heart: { id: "bear_heart", name: "Corazón del oso", category: "global", values: [0.08, 0.12],
    text: (v) => `+${pct(v)} de PV máximos (no cura al obtenerlo o mejorarlo).`, cap: "Tope total +30 % PV máx." },
  bronze_armor: { id: "bronze_armor", name: "Coraza", category: "global", values: [0.04, 0.06],
    text: (v) => `Los golpes enemigos hacen ${pct(v)} menos daño.`, cap: "Tope total −18 % de daño recibido." },
  hunter_lens: { id: "hunter_lens", name: "Lente", category: "global", values: [0.04, 0.06],
    text: (v) => `+${pts(v)} de crítico.`, cap: "Tope total +12 puntos." },
  whetstone: { id: "whetstone", name: "Piedra de afilar", category: "global", values: [0.08, 0.12],
    text: (v) => `+${pct(v)} de daño del Básico.`, cap: "Tope total +30 %." },
  winged_boots: { id: "winged_boots", name: "Botas aladas", category: "global", values: [0.08, 0.12],
    text: (v) => `Empiezas cada combate con ${pct(v)} de progreso de turno.` },
  bottomless_purse: { id: "bottomless_purse", name: "Bolsa sin fondo", category: "global", values: [5, 8],
    text: (v) => `+${v} fragmentos al ganar un combate (solo esta expedición).` },
  runic_shield: { id: "runic_shield", name: "Escudo rúnico", category: "caballero", values: [1, 2],
    text: (v) => `Empiezas cada combate con ${v} de Resolución.` },
  old_book: { id: "old_book", name: "Libro antiguo", category: "mago", values: [0.1, 0.15],
    text: (v) => `Inscribir hace +${pct(v)} de daño.` },
  duelist_glove: { id: "duelist_glove", name: "Guante de duelista", category: "picaro", values: [0.12, 0.18],
    text: (v) => `Tu primer golpe de cada turno contra un objetivo Expuesto hace +${pct(v)}.` },
  thirsty_chalice: { id: "thirsty_chalice", name: "Cáliz sediento", category: "clerigo", values: [0.02, 0.03],
    text: (v) => `Tu primera cura activa de cada combate añade un escudo del ${pct(v)} de tu PV.` },
  blood_ring: { id: "blood_ring", name: "Anillo de sangre", category: "berserker", values: [0.25, 0.4],
    text: (v) => `Embestida te cuesta ${pct(v)} menos vida (sigue sin ser letal).` },
  dragon_fang: { id: "dragon_fang", name: "Colmillo de dragón", category: "fuego", values: [0.1, 0.15],
    text: (v) => `+${pct(v)} de daño de tu Quemadura (sin superar su tope).` },
  moss_amulet: { id: "moss_amulet", name: "Amuleto de musgo", category: "agua", values: [0.02, 0.04],
    text: (v) => `Consumir Escarcha retrasa ${pts(v)} más el turno rival.`, cap: "Tope total 25 % por consumo." },
  broken_clock: { id: "broken_clock", name: "Reloj roto", category: "viento", values: [0.03, 0.05],
    text: (v) => `Consumir Impulso adelanta ${pts(v)} más tu turno (sin acción gratis).`, cap: "Tope total 40 % por consumo." },
  plate_armor: { id: "plate_armor", name: "Placas de tierra", category: "tierra", values: [0.06, 0.1],
    text: (v) => `El ataque que aprovecha una penetración preparada hace +${pct(v)}.` },
  scholar_seal: { id: "scholar_seal", name: "Sello sabio", category: "rayo", values: [0.08, 0.12],
    text: (v) => `La descarga de Sobrecarga hace +${pct(v)} (no el resto de ataques).` },
  vorpal_blade: { id: "vorpal_blade", name: "Filo vorpal", category: "riesgo", values: [0.12, 0.18],
    text: (v) => `Tus habilidades dañinas hacen +${pct(v)}, pero recibes +${pct(v / 2)} de daño de golpes enemigos.` },
  phoenix_heart: { id: "phoenix_heart", name: "Corazón fénix", category: "riesgo", values: [0.15, 0.25],
    text: (v) => `Una vez por expedición, al morir revives con ${pct(v)} de tu PV.` },
};

export interface OwnedRelic {
  id: RelicId;
  tier: RelicTier;
}

export const MAX_RELICS = 6;
export const REPLACE_FRAGMENTS = 10; // refusing an offer with full slots

// Global caps of temporary bonuses (docs/torre/01 §5), applied over the aggregated total.
export const RELIC_CAPS = { hp: 0.3, basic: 0.3, skill: 0.3, crit: 0.12, hitReduction: 0.18 } as const;

export const isRelicId = (v: unknown): v is RelicId =>
  typeof v === "string" && (RELIC_IDS as readonly string[]).includes(v);

export const valueOf = (r: OwnedRelic): number => RELICS[r.id].values[r.tier - 1];

export interface RelicAggregate {
  mods: RelicMods; // engine modifiers (hp and fragment effects excluded)
  hpMult: number; // multiplicative PV max factor (1 + capped bonus)
  winFragments: number; // extra fragments per won combat
  capped: RelicId[]; // relics whose benefit a cap is currently limiting
}

export function aggregateRelics(owned: readonly OwnedRelic[]): RelicAggregate {
  const sum: Record<string, number> = {};
  const add = (k: string, v: number) => (sum[k] = (sum[k] ?? 0) + v);
  const capped: RelicId[] = [];
  const v = (id: RelicId) => {
    const r = owned.find((o) => o.id === id);
    return r ? valueOf(r) : 0;
  };
  const cap = (key: string, total: number, limit: number, ids: RelicId[]) => {
    if (total > limit + 1e-9) capped.push(...ids.filter((id) => owned.some((o) => o.id === id)));
    add(key, Math.min(total, limit));
  };
  cap("hp", v("bear_heart"), RELIC_CAPS.hp, ["bear_heart"]);
  cap("hit", v("bronze_armor"), RELIC_CAPS.hitReduction, ["bronze_armor"]);
  cap("crit", v("hunter_lens"), RELIC_CAPS.crit, ["hunter_lens"]);
  cap("basic", v("whetstone"), RELIC_CAPS.basic, ["whetstone"]);
  cap("skill", v("vorpal_blade"), RELIC_CAPS.skill, ["vorpal_blade"]);
  const mods: RelicMods = {};
  const set = <K extends keyof RelicMods>(k: K, x: number) => { if (x > 0) mods[k] = x as RelicMods[K]; };
  set("basicDmg", sum.basic ?? 0);
  set("skillDmg", sum.skill ?? 0);
  set("hitReduction", sum.hit ?? 0);
  set("hitExtra", v("vorpal_blade") / 2);
  set("critPts", sum.crit ?? 0);
  set("startProgress", v("winged_boots"));
  set("startRes", v("runic_shield"));
  set("inscribeDmg", v("old_book"));
  set("exposedFirst", v("duelist_glove"));
  set("chaliceShield", v("thirsty_chalice"));
  set("recklessCut", v("blood_ring"));
  set("burnDmg", v("dragon_fang"));
  set("frostBonus", v("moss_amulet"));
  set("windBonus", v("broken_clock"));
  set("pierceBonus", v("plate_armor"));
  set("dischargeBonus", v("scholar_seal"));
  set("phoenix", v("phoenix_heart"));
  return { mods, hpMult: 1 + (sum.hp ?? 0), winFragments: v("bottomless_purse"), capped };
}

// ---- offers --------------------------------------------------------------------------------

export interface OfferOption {
  id: string; // server-style option id, e.g. "o0"
  relicId: RelicId;
  tier: RelicTier; // 1 = new relic, 2 = upgrade of an owned tier-I relic
}

/** Relics a hero can be offered: global, its class, its element and the two risk relics. */
export const eligibleRelics = (classId: ClassId, element: Element): RelicId[] =>
  RELIC_IDS.filter((id) => {
    const c = RELICS[id].category;
    return c === "global" || c === "riesgo" || c === classId || c === element;
  });

/**
 * Up to three unique options: at least one global and one class/element relic when eligible, at most
 * one risk relic. Tier-I relics already owned are offered as an upgrade; tier-II ones never are.
 */
export function buildOffer(
  seed: number,
  classId: ClassId,
  element: Element,
  owned: readonly OwnedRelic[],
  salt: readonly number[],
  count = 3,
): OfferOption[] {
  const rng = createRng(hashSeed(seed, 5151, ...salt));
  const have = new Map(owned.map((o) => [o.id, o.tier]));
  const usable = eligibleRelics(classId, element).filter((id) => have.get(id) !== 2);
  const cat = (id: RelicId) => RELICS[id].category;
  const globals = usable.filter((id) => cat(id) === "global");
  const own = usable.filter((id) => cat(id) === classId || cat(id) === element);
  const picked: RelicId[] = [];
  const take = (pool: RelicId[]) => {
    const rest = pool.filter((id) => !picked.includes(id));
    if (rest.length) picked.push(rng.pick(rest));
  };
  take(globals);
  take(own);
  while (picked.length < count) {
    const hasRisk = picked.some((id) => cat(id) === "riesgo");
    const rest = usable.filter((id) => !picked.includes(id) && !(hasRisk && cat(id) === "riesgo"));
    if (!rest.length) break;
    picked.push(rng.pick(rest));
  }
  // stable display order by catalog order so the UI does not reshuffle on re-render
  picked.sort((a, b) => RELIC_IDS.indexOf(a) - RELIC_IDS.indexOf(b));
  return picked.slice(0, count).map((relicId, i) => ({
    id: `o${i}`,
    relicId,
    tier: have.get(relicId) === 1 ? 2 : 1,
  }));
}

/** Applies a relic pick to the build; `replaceSlot` is required when the slots are full. */
export function takeRelic(
  owned: readonly OwnedRelic[],
  pick: { relicId: RelicId; tier: RelicTier },
  replaceSlot?: number,
): OwnedRelic[] | { error: string } {
  const idx = owned.findIndex((o) => o.id === pick.relicId);
  if (pick.tier === 2) {
    if (idx < 0 || owned[idx].tier !== 1) return { error: "Solo se mejora una reliquia de nivel I que ya tengas." };
    return owned.map((o, i) => (i === idx ? { ...o, tier: 2 as RelicTier } : o));
  }
  if (idx >= 0) return { error: "Ya tienes esta reliquia." };
  if (owned.length < MAX_RELICS) return [...owned, { id: pick.relicId, tier: 1 }];
  if (replaceSlot === undefined || !Number.isInteger(replaceSlot) || replaceSlot < 0 || replaceSlot >= owned.length)
    return { error: "Tienes seis reliquias: elige cuál reemplazar o rechaza la oferta." };
  return owned.map((o, i) => (i === replaceSlot ? { id: pick.relicId, tier: 1 as RelicTier } : o));
}

export const upgradable = (owned: readonly OwnedRelic[]): OwnedRelic[] => owned.filter((o) => o.tier === 1);

