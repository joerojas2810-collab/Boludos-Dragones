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
import type { Ascensions, Clears } from "./dungeons";
import type { RunPiece } from "./loot";
import { addParts, isPartKey, MAX_STACK, type Parts } from "./parts";
import {
  activeSets,
  applyGear,
  combineGear,
  gearBonus,
  NO_GEAR,
  setBonus,
} from "./gear";
import {
  MAX_STARS,
  PITY_SSR_THRESHOLD,
  PITY_THRESHOLD,
  LEGACY_RARITY,
  RARITY_IDS,
  toRank,
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
  GEAR_TYPES,
  SLOTS,
  canUseWeapon,
  isGearType,
  slotOf,
  type Slot,
  weaponAtk,
  weaponKey,
  weaponSecondary,
  type Weapon,
} from "./weapons";

export const PROFILE_VERSION = 3; // 3: added optional `daily` (claim streak)
// Raised from 150: at ~11-22 pulls/day of income the old price made SSR pity reachable in
// ~2 weeks (cheaper than the forge). Keep in sync with game_constants (0017).
export const PULL_COST_CHARACTER = 250;
export const PULL_COST_WEAPON = 250;
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
  pity: Record<Banner, number>; // pulls since last SS or better
  pitySsr: Record<Banner, number>; // pulls since last SSR
  // Character fragments per `${classId}:${rarity}` (see fragmentKey).
  fragments: Record<string, number>;
  daily?: DailyState; // free daily pull streak (see streak.ts)
  lastBankedRunId?: string; // guard against banking the same run twice
  bestFloor: number;
  runsPlayed: number;
  dungeons: Clears; // dungeon rank -> most lives left in a clear (see dungeons.ts)
  ascensions: Ascensions; // dungeon rank -> highest ascension level cleared
  parts: Parts; // forge parts and cores (see parts.ts)
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
  pitySsr: { character: 0, weapon: 0 },
  fragments: {},
  bestFloor: 0,
  runsPlayed: 0,
  dungeons: {},
  ascensions: {},
  parts: {},
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
    const { rarity, pityTriggered } = rollRarity(
      rng,
      p.pity[banner],
      p.pitySsr[banner],
    );
    const topRank = RARITY_IDS.indexOf(rarity) >= RARITY_IDS.indexOf("ss");
    p = {
      ...p,
      pity: { ...p.pity, [banner]: topRank ? 0 : p.pity[banner] + 1 },
      pitySsr: {
        ...p.pitySsr,
        [banner]: rarity === "ssr" ? 0 : p.pitySsr[banner] + 1,
      },
    };
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

// `equipped` keys: the hero id for the weapon slot, `${heroId}|${slot}` for gear.
export const slotKey = (characterId: string, slot: Slot) =>
  slot === "arma" ? characterId : `${characterId}|${slot}`;
const parseSlotKey = (k: string): [string, Slot | null] => {
  const [cid, slot = "arma"] = k.split("|");
  return [
    cid,
    (SLOTS as readonly string[]).includes(slot) ? (slot as Slot) : null,
  ];
};

// A piece can be equipped by only one hero: equipping moves it; one piece per slot.
export function equipWeapon(
  p: Profile,
  characterId: string,
  weaponId: string,
): Profile {
  const c = p.characters.find((x) => x.id === characterId);
  const w = p.weapons.find((x) => x.id === weaponId);
  if (!c || !w || !canUseWeapon(c.classId, w.type)) return p;
  const equipped = Object.fromEntries(
    Object.entries(p.equipped).filter(([, w]) => w !== weaponId),
  );
  return {
    ...p,
    equipped: { ...equipped, [slotKey(characterId, slotOf(w.type))]: weaponId },
  };
}

// Best free piece for each slot of a hero, chosen greedily by the hero's resulting power
// (so element sets count). Pieces worn by OTHER heroes are never taken. Returns only the
// changes, in the order to apply them (two passes: a later piece can complete a set).
// ponytail: greedy, not an exhaustive search of set combinations.
export function autoEquipPlan(
  p: Profile,
  heroId: string,
): { slot: Slot; weaponId: string }[] {
  const hero = p.characters.find((c) => c.id === heroId);
  if (!hero) return [];
  const takenByOthers = new Set(
    Object.entries(p.equipped)
      .filter(([k]) => parseSlotKey(k)[0] !== heroId)
      .map(([, id]) => id),
  );
  let cur = p;
  for (let pass = 0; pass < 2; pass++)
    for (const slot of SLOTS) {
      let best = heroPower(cur, heroId);
      let pick: string | null = null;
      for (const w of p.weapons) {
        if (slotOf(w.type) !== slot || takenByOthers.has(w.id)) continue;
        if (cur.equipped[slotKey(heroId, slot)] === w.id) continue;
        if (!canUseWeapon(hero.classId, w.type)) continue;
        const power = heroPower(equipWeapon(cur, heroId, w.id), heroId);
        if (power > best) {
          best = power;
          pick = w.id;
        }
      }
      if (pick) cur = equipWeapon(cur, heroId, pick);
    }
  return SLOTS.flatMap((slot) => {
    const id = cur.equipped[slotKey(heroId, slot)];
    return id && id !== p.equipped[slotKey(heroId, slot)]
      ? [{ slot, weaponId: id }]
      : [];
  });
}

export function unequipWeapon(
  p: Profile,
  characterId: string,
  slot: Slot = "arma",
): Profile {
  const equipped = { ...p.equipped };
  delete equipped[slotKey(characterId, slot)];
  return { ...p, equipped };
}

// A run piece that reached the collection: new, +1 star on a duplicate, or a
// coin refund when the duplicate is already at max stars (same as the gacha).
export function grantPiece(p: Profile, piece: RunPiece): Profile {
  const id = weaponKey(piece.type, piece.element, piece.rarity);
  const owned = p.weapons.find((w) => w.id === id);
  if (!owned)
    return {
      ...p,
      weapons: [
        ...p.weapons,
        {
          id,
          name: piece.name,
          type: piece.type,
          element: piece.element,
          rarity: piece.rarity,
          stars: 0,
          atkBonus: weaponAtk(piece.rarity, 0, piece.type),
        },
      ],
    };
  if (owned.stars >= MAX_STARS)
    return { ...p, coins: p.coins + refundAmount("weapon") };
  const stars = owned.stars + 1;
  return {
    ...p,
    weapons: p.weapons.map((w) =>
      w.id === id
        ? { ...w, stars, atkBonus: weaponAtk(piece.rarity, stars, piece.type) }
        : w,
    ),
  };
}

// Call EXACTLY ONCE per run, whenever it ends (completed, lost or abandoned).
// Pass a stable runId: a repeat call with the same id returns p unchanged, so a
// double click or re-render cannot double credit.
export function bankRun(
  p: Profile,
  runCoins: number,
  maxFloor: number,
  runId?: string,
  loot: readonly RunPiece[] = [],
  clear?: { rank: RarityId; lives: number; asc?: number },
  parts: Parts = {},
): Profile {
  if (runId !== undefined && p.lastBankedRunId === runId) return p;
  const q = loot.reduce(grantPiece, p);
  return {
    ...q,
    lastBankedRunId: runId ?? p.lastBankedRunId,
    coins: q.coins + Math.max(0, Math.floor(runCoins) || 0),
    bestFloor: Math.max(p.bestFloor, Math.floor(maxFloor) || 0),
    runsPlayed: p.runsPlayed + 1,
    parts: addParts(q.parts, parts),
    dungeons: clear
      ? {
          ...p.dungeons,
          [clear.rank]: Math.max(p.dungeons[clear.rank] ?? 0, clear.lives),
        }
      : p.dungeons,
    ascensions: clear
      ? {
          ...p.ascensions,
          [clear.rank]: Math.max(p.ascensions[clear.rank] ?? 0, clear.asc ?? 0),
        }
      : p.ascensions,
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
  const worn = GEAR_TYPES.flatMap((t) => {
    const g = p.weapons.find((x) => x.id === p.equipped[slotKey(c.id, t)]);
    return g && g.type === t ? [g] : [];
  });
  const usableWeapon =
    w && !isGearType(w.type) && canUseWeapon(c.classId, w.type) ? w : null;
  const gear = combineGear(
    gearBonus(worn),
    setBonus(
      activeSets(
        [...worn, ...(usableWeapon ? [usableWeapon] : [])].map(
          (x) => x.element,
        ),
        c.element,
      ),
    ),
  );
  const geared = applyGear(stats, gear);
  const hasGear = JSON.stringify(gear) !== JSON.stringify(NO_GEAR);
  if (!w || isGearType(w.type) || !canUseWeapon(c.classId, w.type))
    return { ...c, stats: geared, ...(hasGear ? { gear } : {}) };
  const sec = weaponSecondary(w.type);
  return {
    ...c,
    ...(hasGear ? { gear } : {}),
    stats: {
      ...geared,
      atk: Math.round((geared.atk + w.atkBonus) * 10) / 10,
      accuracy: Math.round((geared.accuracy + sec.accuracy) * 100) / 100,
      crit:
        Math.round(Math.min(0.6, Math.max(0, geared.crit + sec.crit)) * 100) /
        100,
      speed: Math.round(geared.speed * sec.speedMult * 10) / 10,
    },
    weapon: { element: w.element, atkBonus: w.atkBonus },
  };
}

// Single number to sort heroes by strength: effective stats (rank, stars, weapon
// and gear included). Higher is stronger.
export function heroPower(p: Profile, ownedId: string): number {
  const h = heroFromOwned(p, ownedId);
  if (!h) return 0;
  const s = h.stats;
  return Math.round((s.hp * (s.atk + s.def * 0.5)) / 50);
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
  const rarity = toRank(v.rarity);
  if (!classId || !element || !stats || !rarity) return null;
  const traits = (Array.isArray(v.traits) ? v.traits : [])
    .filter((t): t is TraitId => (TRAIT_IDS as readonly unknown[]).includes(t))
    .slice(0, 2);
  return {
    id: characterKey(classId, element, rarity),
    name: str(v.name, "Sin nombre"),
    classId,
    element,
    stats,
    traits,
    catchphrase: str(v.catchphrase, "..."),
    level: Math.max(1, nat(v.level, 999)),
    xp: nat(v.xp),
    rarity,
    stars: nat(v.stars, MAX_STARS),
  };
}

function parseWeapon(v: unknown): OwnedWeapon | null {
  if (!isObj(v)) return null;
  const element = ELEMENTS.find((e) => e === v.element);
  const rarity = toRank(v.rarity);
  if (!element || !rarity) return null;
  const type = isWeaponType(v.type) ? v.type : "espada"; // old saves: no type
  const stars = nat(v.stars, MAX_STARS);
  return {
    id: weaponKey(type, element, rarity),
    name: str(v.name, "Espada"),
    type,
    element,
    rarity,
    stars,
    atkBonus: weaponAtk(rarity, stars, type), // never trusted
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

const canEquipPair = (
  characters: OwnedCharacter[],
  weapons: OwnedWeapon[],
  cid: string,
  wid: string,
  slot: Slot,
) => {
  const c = characters.find((x) => x.id === cid);
  const w = weapons.find((x) => x.id === wid);
  return (
    !!c && !!w && slotOf(w.type) === slot && canUseWeapon(c.classId, w.type)
  );
};

const parseParts = (v: unknown): Parts => {
  const out: Parts = {};
  if (isObj(v))
    for (const [k, n] of Object.entries(v)) {
      const q = nat(n, MAX_STACK);
      if (q > 0 && isPartKey(k)) out[k] = q;
    }
  return out;
};

const parseClears = (v: unknown): Clears => {
  const out: Clears = {};
  if (isObj(v))
    for (const r of RARITY_IDS) {
      const n = nat(v[r], 5);
      if (n > 0) out[r] = n;
    }
  return out;
};

export function migrate(json: unknown): Profile {
  if (!isObj(json)) return createProfile();
  const rawChars = Array.isArray(json.characters) ? json.characters : [];
  const parsedChars = rawChars.map(parseCharacter);
  const characters = uniqueById(parsedChars);
  // old id (legacy rarity) -> new id
  const charAlias = new Map<string, string>();
  rawChars.forEach((raw, i) => {
    const c = parsedChars[i];
    if (c && isObj(raw) && typeof raw.id === "string")
      charAlias.set(raw.id, c.id);
  });
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
      for (const raw of [...RARITY_IDS, ...Object.keys(LEGACY_RARITY)]) {
        const n = nat(json.fragments[`${c}:${raw}`]);
        const r = toRank(raw);
        if (n > 0 && r)
          fragments[fragmentKey(c, r)] =
            (fragments[fragmentKey(c, r)] ?? 0) + n;
      }
  const equipped: Record<string, string> = {};
  const usedWeapons = new Set<string>();
  if (isObj(json.equipped))
    for (const [rawKey, rawWid] of Object.entries(json.equipped)) {
      const [rawCid, slot] = parseSlotKey(rawKey);
      if (!slot) continue;
      const cid = charAlias.get(rawCid) ?? rawCid;
      const wid =
        typeof rawWid === "string" ? (alias.get(rawWid) ?? rawWid) : "";
      if (
        wid &&
        canEquipPair(characters, weapons, cid, wid, slot) &&
        !usedWeapons.has(wid)
      ) {
        equipped[slotKey(cid, slot)] = wid;
        usedWeapons.add(wid);
      }
    }
  const pity = isObj(json.pity) ? json.pity : {};
  const pitySsr = isObj(json.pitySsr) ? json.pitySsr : {};
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
    pitySsr: {
      character: nat(pitySsr.character, PITY_SSR_THRESHOLD),
      weapon: nat(pitySsr.weapon, PITY_SSR_THRESHOLD),
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
    dungeons: parseClears(json.dungeons),
    ascensions: parseClears(json.ascensions),
    parts: parseParts(json.parts),
  };
}
