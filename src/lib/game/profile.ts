// Player profile: persistent, versioned, JSON-serializable. All functions are
// pure and return new state. Every random function takes the Rng as a
// parameter: the client creates it now, the server will later (resolve pulls
// there; never trust a client-sent profile without migrate()).
import {
  CLASS_IDS,
  generateCharacter,
  type Character,
  type ClassId,
  type Stats,
} from "./characters";
import { ELEMENTS, type Element } from "./elements";
import {
  isRarity,
  MAX_STARS,
  PITY_THRESHOLD,
  RARITY_IDS,
  rollRarity,
  scaleStats,
  type RarityId,
} from "./rarity";
import type { Rng } from "./rng";
import { isDayKey, type DailyState } from "./streak";
import { TRAIT_IDS, type TraitId } from "./traits";
import {
  generateWeapon,
  isWeaponType,
  weaponAtk,
  weaponKey,
  weaponSecondary,
  type Weapon,
} from "./weapons";

export const PROFILE_VERSION = 3; // 3: added optional `daily` (claim streak)
export const PULL_COST_CHARACTER = 150;
export const PULL_COST_WEAPON = 150;
export const MULTI_PULL = 10;
export const MULTI_PULL_DISCOUNT = 0.1;
export const DUPLICATE_REFUND = 0.5; // of the single-pull cost, at max stars
export const FRAGMENTS_PER_STAR = 3;

export type OwnedCharacter = Character & {
  id: string; // = characterKey
  rarity: RarityId;
  stars: number;
};
export type OwnedWeapon = Weapon;

export type Banner = "character" | "weapon";

export interface Profile {
  version: number;
  coins: number;
  characters: OwnedCharacter[];
  weapons: OwnedWeapon[];
  equipped: Record<string, string>; // characterId -> weaponId
  pity: Record<Banner, number>; // pulls since last Legendario
  // Character fragments per `${classId}:${rarity}` (see fragmentKey).
  fragments: Record<string, number>;
  daily?: DailyState; // free daily pull streak (see streak.ts)
  lastBankedRunId?: string; // guard against banking the same run twice
  bestFloor: number;
  runsPlayed: number;
}

export const characterKey = (c: ClassId, e: Element, r: RarityId) =>
  `c-${c}-${e}-${r}`;

export const fragmentKey = (c: ClassId, r: RarityId) => `${c}:${r}`;

export const createProfile = (): Profile => ({
  version: PROFILE_VERSION,
  coins: 0,
  characters: [],
  weapons: [],
  equipped: {},
  pity: { character: 0, weapon: 0 },
  fragments: {},
  bestFloor: 0,
  runsPlayed: 0,
});

const UNIT_COST: Record<Banner, number> = {
  character: PULL_COST_CHARACTER,
  weapon: PULL_COST_WEAPON,
};

export function pullCost(banner: Banner, count: number): number {
  const unit = UNIT_COST[banner];
  return count === MULTI_PULL
    ? Math.round(unit * MULTI_PULL * (1 - MULTI_PULL_DISCOUNT))
    : unit * count;
}

export const canAfford = (p: Profile, banner: Banner, count = 1) =>
  p.coins >= pullCost(banner, count);

export interface PullResult {
  // new: added to collection; star: EXACT duplicate (same class+element+rarity
  // / same weapon key) gave +1 star; refund: exact duplicate already at max
  // stars, coins returned.
  status: "new" | "star" | "refund";
  banner: Banner;
  id: string;
  rarity: RarityId;
  stars: number; // after the pull
  refund: number;
  fragmentGain: number; // characters only: 1 when class+rarity was already owned (different element)
  fragmentKey?: string;
  pityTriggered: boolean;
  character?: OwnedCharacter;
  weapon?: OwnedWeapon;
}

function pull(
  profile: Profile,
  rng: Rng,
  count: number,
  banner: Banner,
): { profile: Profile; results: PullResult[] } | null {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    !canAfford(profile, banner, count)
  )
    return null;
  let p: Profile = {
    ...profile,
    coins: profile.coins - pullCost(banner, count),
  };
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const { rarity, pityTriggered } = rollRarity(rng, p.pity[banner]);
    const pity = rarity === "legendario" ? 0 : p.pity[banner] + 1;
    p = { ...p, pity: { ...p.pity, [banner]: pity } };
    const base = { banner, rarity, pityTriggered };
    let status: PullResult["status"] = "new";
    let refund = 0;
    let fragmentGain = 0;
    let fKey: string | undefined;
    if (banner === "character") {
      const c = generateCharacter(rng);
      const id = characterKey(c.classId, c.element, rarity);
      const owned = p.characters.find((x) => x.id === id);
      let item: OwnedCharacter = { ...c, id, rarity, stars: 0 };
      if (owned) {
        item = { ...owned, stars: Math.min(MAX_STARS, owned.stars + 1) };
        status = owned.stars >= MAX_STARS ? "refund" : "star";
        p = {
          ...p,
          characters: p.characters.map((x) => (x.id === id ? item : x)),
        };
      } else {
        fKey = fragmentKey(c.classId, rarity);
        if (
          p.characters.some(
            (x) => x.classId === c.classId && x.rarity === rarity,
          )
        ) {
          fragmentGain = 1;
          p = {
            ...p,
            fragments: { ...p.fragments, [fKey]: (p.fragments[fKey] ?? 0) + 1 },
          };
        }
        p = { ...p, characters: [...p.characters, item] };
      }
      if (status === "refund") refund = refundAmount(banner);
      results.push({
        ...base,
        status,
        id,
        stars: item.stars,
        refund,
        fragmentGain,
        fragmentKey: fragmentGain ? fKey : undefined,
        character: item,
      });
    } else {
      const w = generateWeapon(rng, rarity);
      const owned = p.weapons.find((x) => x.id === w.id);
      let item: OwnedWeapon = w;
      if (owned) {
        const stars = Math.min(MAX_STARS, owned.stars + 1);
        item = { ...owned, stars, atkBonus: weaponAtk(rarity, stars, w.type) };
        status = owned.stars >= MAX_STARS ? "refund" : "star";
        p = {
          ...p,
          weapons: p.weapons.map((x) => (x.id === w.id ? item : x)),
        };
      } else p = { ...p, weapons: [...p.weapons, item] };
      if (status === "refund") refund = refundAmount(banner);
      results.push({
        ...base,
        status,
        id: w.id,
        stars: item.stars,
        refund,
        fragmentGain: 0,
        weapon: item,
      });
    }
    p = { ...p, coins: p.coins + refund };
  }
  return { profile: p, results };
}

const refundAmount = (banner: Banner) =>
  Math.round(UNIT_COST[banner] * DUPLICATE_REFUND);

// Return null when it cannot be afforded (or count is invalid). A count of
// MULTI_PULL (10) gets the discount. Pity counter is per banner.
export const pullCharacter = (p: Profile, rng: Rng, count = 1) =>
  pull(p, rng, count, "character");
export const pullWeapon = (p: Profile, rng: Rng, count = 1) =>
  pull(p, rng, count, "weapon");

// Spend FRAGMENTS_PER_STAR fragments of the character's class+rarity for +1
// star on it. null when it does not exist, is at max stars or lacks fragments.
export function spendFragments(p: Profile, ownedId: string): Profile | null {
  const c = p.characters.find((x) => x.id === ownedId);
  if (!c || c.stars >= MAX_STARS) return null;
  const key = fragmentKey(c.classId, c.rarity);
  const have = p.fragments[key] ?? 0;
  if (have < FRAGMENTS_PER_STAR) return null;
  return {
    ...p,
    fragments: { ...p.fragments, [key]: have - FRAGMENTS_PER_STAR },
    characters: p.characters.map((x) =>
      x.id === ownedId ? { ...x, stars: x.stars + 1 } : x,
    ),
  };
}

// A weapon can be equipped by only one hero: equipping moves it.
export function equipWeapon(
  p: Profile,
  characterId: string,
  weaponId: string,
): Profile {
  if (
    !p.characters.some((c) => c.id === characterId) ||
    !p.weapons.some((w) => w.id === weaponId)
  )
    return p;
  const equipped = Object.fromEntries(
    Object.entries(p.equipped).filter(([, w]) => w !== weaponId),
  );
  return { ...p, equipped: { ...equipped, [characterId]: weaponId } };
}

export function unequipWeapon(p: Profile, characterId: string): Profile {
  const equipped = { ...p.equipped };
  delete equipped[characterId];
  return { ...p, equipped };
}

// Call EXACTLY ONCE per run, whenever it ends (completed, lost or abandoned).
// Pass a stable runId: a repeat call with the same id returns p unchanged, so a
// double click or re-render cannot double credit.
export function bankRun(
  p: Profile,
  runCoins: number,
  maxFloor: number,
  runId?: string,
): Profile {
  if (runId !== undefined && p.lastBankedRunId === runId) return p;
  return {
    ...p,
    lastBankedRunId: runId ?? p.lastBankedRunId,
    coins: p.coins + Math.max(0, Math.floor(runCoins) || 0),
    bestFloor: Math.max(p.bestFloor, Math.floor(maxFloor) || 0),
    runsPlayed: p.runsPlayed + 1,
  };
}

export const charactersOfClass = (p: Profile, classId: ClassId) =>
  p.characters.filter((c) => c.classId === classId);

// Effective hero for createRun: stats scaled by rarity x stars, weapon atk
// added flat, weapon snapshot attached (its element is the attack element).
// rarity/stars stay on the returned Character for display; do NOT scale it again.
export function heroFromOwned(p: Profile, ownedId: string): Character | null {
  const c = p.characters.find((x) => x.id === ownedId);
  if (!c) return null;
  const stats = scaleStats(c.stats, c.rarity, c.stars);
  const w = p.weapons.find((x) => x.id === p.equipped[c.id]);
  if (!w) return { ...c, stats };
  const sec = weaponSecondary(w.type);
  return {
    ...c,
    stats: {
      ...stats,
      atk: Math.round((stats.atk + w.atkBonus) * 10) / 10,
      accuracy: Math.round((stats.accuracy + sec.accuracy) * 100) / 100,
      crit:
        Math.round(Math.min(0.6, Math.max(0, stats.crit + sec.crit)) * 100) /
        100,
      speed: Math.round(stats.speed * sec.speedMult * 10) / 10,
    },
    weapon: { element: w.element, atkBonus: w.atkBonus },
  };
}

// Best owned character of the class: rarity, then stars. null when none.
export function bestOfClass(
  p: Profile,
  classId: ClassId,
): OwnedCharacter | null {
  return charactersOfClass(p, classId).reduce<OwnedCharacter | null>((b, c) => {
    if (!b) return c;
    const d = RARITY_IDS.indexOf(c.rarity) - RARITY_IDS.indexOf(b.rarity);
    return d > 0 || (d === 0 && c.stars > b.stars) ? c : b;
  }, null);
}

// Best owned character of the class; otherwise a fresh random Común.
export function heroFor(p: Profile, classId: ClassId, rng: Rng): Character {
  const best = bestOfClass(p, classId);
  return (best && heroFromOwned(p, best.id)) ?? generateCharacter(rng, classId);
}

// ---- migrate: defensive parsing of untrusted JSON ----

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(0, Math.floor(v)))
    : 0;
const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.length > 0 ? v.slice(0, 200) : fallback;

const STAT_KEYS: (keyof Stats)[] = [
  "hp",
  "atk",
  "def",
  "crit",
  "dodge",
  "accuracy",
  "flee",
  "speed",
];

function parseStats(v: unknown): Stats | null {
  if (!isObj(v)) return null;
  const out: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const n = v[k];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  // ponytail: stat magnitudes are not range-checked; server must only store
  // characters it generated itself. Add per-class ranges if client saves are trusted.
  return out as Stats;
}

function parseCharacter(v: unknown): OwnedCharacter | null {
  if (!isObj(v)) return null;
  const classId = CLASS_IDS.find((c) => c === v.classId);
  const element = ELEMENTS.find((e) => e === v.element);
  const stats = parseStats(v.stats);
  if (!classId || !element || !stats || !isRarity(v.rarity)) return null;
  const traits = (Array.isArray(v.traits) ? v.traits : [])
    .filter((t): t is TraitId => (TRAIT_IDS as readonly unknown[]).includes(t))
    .slice(0, 2);
  return {
    id: characterKey(classId, element, v.rarity),
    name: str(v.name, "Sin nombre"),
    classId,
    element,
    stats,
    traits,
    catchphrase: str(v.catchphrase, "..."),
    level: Math.max(1, nat(v.level, 999)),
    xp: nat(v.xp),
    rarity: v.rarity,
    stars: nat(v.stars, MAX_STARS),
  };
}

function parseWeapon(v: unknown): OwnedWeapon | null {
  if (!isObj(v)) return null;
  const element = ELEMENTS.find((e) => e === v.element);
  if (!element || !isRarity(v.rarity)) return null;
  const type = isWeaponType(v.type) ? v.type : "espada"; // old saves: no type
  const stars = nat(v.stars, MAX_STARS);
  return {
    id: weaponKey(type, element, v.rarity),
    name: str(v.name, "Espada"),
    type,
    element,
    rarity: v.rarity,
    stars,
    atkBonus: weaponAtk(v.rarity, stars, type), // never trusted
  };
}

function uniqueById<T extends { id: string }>(items: (T | null)[]): T[] {
  const seen = new Set<string>();
  return items.filter((x): x is T => {
    if (!x || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

export function migrate(json: unknown): Profile {
  if (!isObj(json)) return createProfile();
  const characters = uniqueById(
    (Array.isArray(json.characters) ? json.characters : []).map(parseCharacter),
  );
  const rawWeapons = Array.isArray(json.weapons) ? json.weapons : [];
  const parsedWeapons = rawWeapons.map(parseWeapon);
  const weapons = uniqueById(parsedWeapons);
  // old id (no type) -> new id, so saved `equipped` entries survive
  const alias = new Map<string, string>();
  rawWeapons.forEach((raw, i) => {
    const w = parsedWeapons[i];
    if (w && isObj(raw) && typeof raw.id === "string") alias.set(raw.id, w.id);
  });
  const fragments: Record<string, number> = {};
  if (isObj(json.fragments))
    for (const c of CLASS_IDS)
      for (const r of RARITY_IDS) {
        const n = nat(json.fragments[fragmentKey(c, r)]);
        if (n > 0) fragments[fragmentKey(c, r)] = n;
      }
  const equipped: Record<string, string> = {};
  const usedWeapons = new Set<string>();
  if (isObj(json.equipped))
    for (const [cid, rawWid] of Object.entries(json.equipped)) {
      const wid =
        typeof rawWid === "string" ? (alias.get(rawWid) ?? rawWid) : "";
      if (
        wid &&
        characters.some((c) => c.id === cid) &&
        weapons.some((w) => w.id === wid) &&
        !usedWeapons.has(wid)
      ) {
        equipped[cid] = wid;
        usedWeapons.add(wid);
      }
    }
  const pity = isObj(json.pity) ? json.pity : {};
  return {
    version: PROFILE_VERSION,
    coins: nat(json.coins),
    characters,
    weapons,
    equipped,
    pity: {
      character: nat(pity.character, PITY_THRESHOLD),
      weapon: nat(pity.weapon, PITY_THRESHOLD),
    },
    fragments,
    ...(isObj(json.daily) && isDayKey(json.daily.day)
      ? {
          daily: {
            day: json.daily.day,
            streak: Math.max(1, nat(json.daily.streak, 100000)),
          },
        }
      : {}),
    ...(typeof json.lastBankedRunId === "string"
      ? { lastBankedRunId: json.lastBankedRunId.slice(0, 100) }
      : {}),
    bestFloor: nat(json.bestFloor),
    runsPlayed: nat(json.runsPlayed),
  };
}
