import { statPower } from "./recommended";
// Player profile: persistent, versioned, JSON-serializable. All functions are
// pure and return new state. Every random function takes the Rng as a
// parameter: the client creates it now, the server will later (resolve pulls
// there; never trust a client-sent profile without migrate()).
import {
  CLASS_IDS,
  CLASSES,
  generateCharacter,
  type Character,
  type ClassId,
  type Stats,
} from "./characters";
import { ELEMENTS, type Element } from "./elements";
import {
  parseProgress,
  recordClear,
  type DungeonProgress,
} from "./dungeonProgress";
import { firstClearChest, levelCoins, levelDecay } from "./levelPay";
import { DADO_DAILY_MAX, type LevelLoot } from "./levelLoot";
import type { StageStatus } from "./stage";
import type { RunPiece } from "./loot";
import {
  activeSets,
  applyGear,
  combineGear,
  GEAR_CAP,
  plusFactor,
  gearBonus,
  LINE_BASE,
  LINE_GROUP,
  NO_GEAR,
  parseRoll,
  resonanceBonus,
  resonances,
  rollPiece,
  rollQuality,
  setBonus,
  SKILL_STYLE_GROUP,
  type BuildGroup,
  type GearLine,
  type WornPiece,
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
import { dayKey, isDayKey, type DailyState } from "./streak";
import { dayPayMult } from "./economy";
import { addHeroXp, gapMult, levelCap } from "./heroLevel";
import {
  heroSkill,
  isSkillId,
  SKILLS_BY_CLASS,
  type SkillId,
} from "./skills";
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

export const PROFILE_VERSION = 5; // 5: pieces have roll/lines, pre-v5 items are marked legacy (burn rate)
// Raised from 150: at ~11-22 pulls/day of income the old price made SSR pity reachable in
// ~2 weeks (cheaper than the forge). Keep in sync with game_constants (0017).
// Day-1 tutorial progress (tutorial.ts). Only brand-new local accounts carry it (see
// newAccountProfile); a profile without the field (existing or remote) counts as finished.
export const TUTORIAL_DONE = 7;
export const PULL_COST_CHARACTER = 250;
export const PULL_COST_WEAPON = 250;
export const MULTI_PULL = 10;
export const MULTI_PULL_DISCOUNT = 0.1;
export const DUPLICATE_REFUND = 0.5; // of the single-pull cost, at max stars
// Old saves still holding hero fragments (removed in 0039) are paid this much each, once.
export const FRAGMENT_REFUND = 40;

export type OwnedCharacter = Character & {
  id: string; // = characterKey
  rarity: RarityId;
  stars: number;
  legacy?: boolean; // existed before PROFILE_VERSION 5 (burns at LEGACY_BURN_RATE)
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
  daily?: DailyState; // free daily pull streak (see streak.ts)
  lastBankedRunId?: string; // guard against banking the same run twice
  runsDay?: { day: string; n: number }; // runs banked on that game day (pay decays, see economy.ts)
  bestFloor: number;
  runsPlayed: number;
  dungeons: DungeonProgress; // levels cleared per rank and ascension (dungeonProgress.ts)
  levelsDay?: { day: string; n: number }; // repeated levels cleared on that game day (pay decays)
  escamas: number; // Mejorar material (upgrade.ts); bound to the account
  dados: number; // Dado cargado (upgrade.ts); bound to the account
  dadosDay?: { day: string; n: number }; // dice found on that game day by last-level drops (max 2)
  tutorial?: number; // step 0..TUTORIAL_DONE; missing = done
}

export const characterKey = (c: ClassId, e: Element, r: RarityId) =>
  `c-${c}-${e}-${r}`;

export const createProfile = (): Profile => ({
  version: PROFILE_VERSION,
  coins: 0,
  characters: [],
  weapons: [],
  equipped: {},
  pity: { character: 0, weapon: 0 },
  pitySsr: { character: 0, weapon: 0 },
  bestFloor: 0,
  runsPlayed: 0,
  dungeons: {},
  escamas: 0,
  dados: 0,
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
    if (banner === "character") {
      const c = generateCharacter(rng, undefined, rarity);
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
      } else p = { ...p, characters: [...p.characters, item] };
      if (status === "refund") refund = refundAmount(banner);
      results.push({
        ...base,
        status,
        id,
        stars: item.stars,
        refund,
        character: item,
      });
    } else {
      const g = generateWeapon(rng, rarity);
      const rolled = rollPiece(rng, g.type, rarity);
      const w: OwnedWeapon = {
        ...g,
        ...rolled,
        atkBonus: weaponAtk(rarity, 0, g.type, rolled.roll),
      };
      const owned = p.weapons.find((x) => x.id === w.id);
      let item: OwnedWeapon = w;
      if (owned) {
        item = withStars(owned, Math.min(MAX_STARS, owned.stars + 1), w);
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

export type AutoMode = "poder" | "set" | "estilo";
export interface AutoPlanItem {
  slot: Slot;
  weaponId: string;
  fromHeroId?: string; // piece currently worn by another hero (takeFromOthers)
}

// How much of the hero's style group (LINE_GROUP) a piece carries: its stats as a share
// of the gear caps, so different stats are comparable. 0 for any piece without that stat.
function styleScore(w: WornPiece, group: BuildGroup): number {
  const b = gearBonus([w]);
  let sum = 0;
  for (const k of Object.keys(LINE_BASE) as (keyof typeof LINE_BASE)[])
    if (LINE_GROUP[k] === group) sum += b[k] / GEAR_CAP[k];
  return sum;
}

// Best piece for each slot of a hero. Modes: "poder" = greedy by the hero's resulting
// power (element sets count; two passes so a later piece can complete a set); "set" = per
// slot the piece of the hero's element, else the strongest; "estilo" = per slot the piece
// richest in the hero's style group (its third skill), ties by power. Pieces worn by OTHER
// heroes are only taken with takeFromOthers. Returns only the changes, in apply order.
// ponytail: greedy per slot, not an exhaustive search of combinations.
export function autoEquipPlan(
  p: Profile,
  heroId: string,
  mode: AutoMode = "poder",
  opts: { takeFromOthers?: boolean } = {},
): AutoPlanItem[] {
  const hero = p.characters.find((c) => c.id === heroId);
  if (!hero) return [];
  const group = SKILL_STYLE_GROUP[heroFromOwned(p, heroId)?.skill ?? ""];
  const eff: AutoMode = mode === "estilo" && !group ? "poder" : mode;
  const wornBy = (id: string) =>
    Object.entries(p.equipped).find(([, w]) => w === id)?.[0];
  const otherHolder = (id: string) => {
    const k = wornBy(id);
    return k && parseSlotKey(k)[0] !== heroId ? parseSlotKey(k)[0] : undefined;
  };
  let cur = p;
  for (let pass = 0; pass < (eff === "poder" ? 2 : 1); pass++)
    for (const slot of SLOTS) {
      const score = (w: OwnedWeapon) => {
        const power = heroPower(equipWeapon(cur, heroId, w.id), heroId);
        if (eff === "set") return (w.element === hero.element ? 1e9 : 0) + power;
        if (eff === "estilo" && group) return styleScore(w, group) * 1e9 + power;
        return power;
      };
      const curW = p.weapons.find(
        (w) => w.id === cur.equipped[slotKey(heroId, slot)],
      );
      let best = curW ? score(curW) : eff === "poder" ? heroPower(cur, heroId) : -1;
      let pick: string | null = null;
      for (const w of p.weapons) {
        if (slotOf(w.type) !== slot || w.id === curW?.id) continue;
        if (!canUseWeapon(hero.classId, w.type)) continue;
        if (!opts.takeFromOthers && otherHolder(w.id)) continue;
        const sc = score(w);
        if (sc > best) {
          best = sc;
          pick = w.id;
        }
      }
      if (pick) cur = equipWeapon(cur, heroId, pick);
    }
  return SLOTS.flatMap((slot) => {
    const id = cur.equipped[slotKey(heroId, slot)];
    if (!id || id === p.equipped[slotKey(heroId, slot)]) return [];
    const from = otherHolder(id);
    return [{ slot, weaponId: id, ...(from ? { fromHeroId: from } : {}) }];
  });
}

export const applyAutoPlan = (
  p: Profile,
  heroId: string,
  plan: readonly AutoPlanItem[],
): Profile => plan.reduce((q, x) => equipWeapon(q, heroId, x.weaponId), p);

// The mode whose plan leaves the hero strongest (ties favour "poder"). Never takes pieces
// from other heroes.
export function bestAutoMode(
  p: Profile,
  heroId: string,
): { mode: AutoMode; plan: AutoPlanItem[] } {
  let best = { mode: "poder" as AutoMode, plan: autoEquipPlan(p, heroId, "poder"), power: -1 };
  best.power = heroPower(applyAutoPlan(p, heroId, best.plan), heroId);
  for (const mode of ["set", "estilo"] as const) {
    const plan = autoEquipPlan(p, heroId, mode);
    const power = heroPower(applyAutoPlan(p, heroId, plan), heroId);
    if (power > best.power) best = { mode, plan, power };
  }
  return { mode: best.mode, plan: best.plan };
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

// A run piece that reached the collection: new, +1 star on a duplicate, or nothing when
// the duplicate is already at max stars: a coin refund for classic runs (as the server's
// bank_run), nothing for dungeon levels (drops are plentiful; migration 0034).
export function grantPiece(p: Profile, piece: RunPiece, refund = true): Profile {
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
          atkBonus: weaponAtk(piece.rarity, 0, piece.type, piece.roll),
          ...(piece.roll !== undefined ? { roll: piece.roll } : {}),
          ...(piece.lines ? { lines: piece.lines } : {}),
        },
      ],
    };
  if (owned.stars >= MAX_STARS)
    return refund ? { ...p, coins: p.coins + refundAmount("weapon") } : p;
  const next = withStars(owned, owned.stars + 1, piece);
  return { ...p, weapons: p.weapons.map((w) => (w.id === id ? next : w)) };
}

// Duplicate: +1 star and keep the better of the two rolls (automatic).
function withStars(
  owned: OwnedWeapon,
  stars: number,
  inc: { roll?: number; lines?: GearLine[] },
): OwnedWeapon {
  const better =
    inc.roll !== undefined && rollQuality(inc) > rollQuality(owned) ? inc : owned;
  return {
    ...owned,
    stars,
    roll: better.roll,
    lines: better.lines,
    atkBonus: weaponAtk(owned.rarity, stars, owned.type, better.roll),
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
): Profile {
  if (runId !== undefined && p.lastBankedRunId === runId) return p;
  const q = loot.reduce((acc, piece) => grantPiece(acc, piece), p);
  const today = dayKey();
  const prior = p.runsDay?.day === today ? p.runsDay.n : 0;
  const paid = Math.floor(
    Math.max(0, Math.floor(runCoins) || 0) * dayPayMult(prior + 1),
  );
  return {
    ...q,
    lastBankedRunId: runId ?? p.lastBankedRunId,
    runsDay: { day: today, n: prior + 1 },
    coins: q.coins + paid,
    bestFloor: Math.max(p.bestFloor, Math.floor(maxFloor) || 0),
    runsPlayed: p.runsPlayed + 1,
  };
}

// ---- Run v2: dungeon levels ----

export interface LevelResult {
  rank: RarityId;
  level: number; // 0-based index in the rank
  asc: number;
  heroId: string;
  status: StageStatus; // the finished stage
  xp: number; // stage.xp (raw, before the catch-up multiplier)
  loot: LevelLoot; // computed with levelLoot(..., lootOptions(...))
  attemptId?: string; // guard against banking one attempt twice
}

export interface LevelBank {
  profile: Profile;
  cleared: boolean; // counted as a clear (stage cleared and the level was unlocked)
  repeat: boolean;
  coins: number; // level coins
  chest: number; // dungeon first-clear chest
  xp: number; // hero EXP actually applied (after gapMult)
  levelsGained: number;
  newLevel: number;
}

// Repeat flag and daily pay multiplier the loot roll needs BEFORE banking.
export function lootOptions(
  p: Profile,
  rank: RarityId,
  level: number,
  asc: number,
): { repeat: boolean; payMult: number; dadoLeft: number } {
  const repeat = (p.dungeons[rank]?.[asc] ?? 0) > level;
  const today = dayKey();
  const n = (p.levelsDay?.day === today ? p.levelsDay.n : 0) + 1;
  const found = p.dadosDay?.day === today ? p.dadosDay.n : 0;
  return { repeat, payMult: repeat ? levelDecay(n) : 1, dadoLeft: Math.max(0, DADO_DAILY_MAX - found) };
}

// Pure. Call once per finished attempt. EXP is always kept; everything else only
// on a cleared, unlocked level.
export function bankLevel(p: Profile, r: LevelResult): LevelBank {
  const none = { cleared: false, repeat: false, coins: 0, chest: 0, xp: 0, levelsGained: 0, newLevel: 0 };
  if (r.attemptId !== undefined && p.lastBankedRunId === r.attemptId)
    return { profile: p, ...none };
  let q: Profile = {
    ...p,
    lastBankedRunId: r.attemptId ?? p.lastBankedRunId,
    runsPlayed: p.runsPlayed + 1,
  };
  let cleared = false;
  let repeat = false;
  let coins = 0;
  let chest = 0;
  if (r.status === "cleared") {
    const rec = recordClear(p.dungeons, r.rank, r.level, r.asc);
    if (rec) {
      cleared = true;
      repeat = !rec.firstTime;
      const today = dayKey();
      const n = (p.levelsDay?.day === today ? p.levelsDay.n : 0) + (repeat ? 1 : 0);
      coins = levelCoins(r.rank, r.asc, repeat, n);
      chest = rec.dungeonFirstClear ? firstClearChest(r.rank, r.asc) : 0;
      q = {
        ...q,
        dungeons: rec.progress,
        levelsDay: { day: today, n },
        coins: q.coins + coins + chest,
        escamas: Math.min(MAX_MATERIAL, q.escamas + r.loot.escamas),
        dados: Math.min(MAX_MATERIAL, q.dados + r.loot.dados),
        ...(r.loot.dados > 0
          ? { dadosDay: { day: today, n: (p.dadosDay?.day === today ? p.dadosDay.n : 0) + r.loot.dados } }
          : {}),
      };
      q = r.loot.pieces.reduce((acc, piece) => grantPiece(acc, piece, false), q);
    }
  }
  const hero = q.characters.find((c) => c.id === r.heroId);
  let xp = 0;
  let levelsGained = 0;
  let newLevel = hero?.level ?? 0;
  if (hero) {
    const top = Math.max(...q.characters.map((c) => c.level));
    xp = Math.round(r.xp * gapMult(hero.level, top));
    const res = addHeroXp(hero, hero.stars, xp);
    levelsGained = res.gained;
    newLevel = res.level;
    q = {
      ...q,
      characters: q.characters.map((c) =>
        c.id === hero.id ? { ...c, level: res.level, xp: res.xp } : c,
      ),
    };
  }
  return { profile: q, cleared, repeat, coins, chest, xp, levelsGained, newLevel };
}

// Saves the hero's third-skill pick. null when not allowed.
export function chooseHeroSkill(
  p: Profile,
  ownedId: string,
  skillId: SkillId,
): Profile | null {
  const c = p.characters.find((x) => x.id === ownedId);
  if (
    !c ||
    !SKILLS_BY_CLASS[c.classId].includes(skillId)
  )
    return null;
  return {
    ...p,
    characters: p.characters.map((x) =>
      x.id === ownedId ? { ...x, skill: skillId } : x,
    ),
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
  const level = Math.min(Math.max(1, c.level), levelCap(c.stars));
  const stats = scaleStats(c.stats, c.rarity, c.stars, level);
  const skill = heroSkill(c.classId, c.skill);
  const w = p.weapons.find((x) => x.id === p.equipped[c.id]);
  const worn = GEAR_TYPES.flatMap((t) => {
    const g = p.weapons.find((x) => x.id === p.equipped[slotKey(c.id, t)]);
    return g && g.type === t ? [g] : [];
  });
  const usableWeapon =
    w && !isGearType(w.type) && canUseWeapon(c.classId, w.type) ? w : null;
  const gear = combineGear(
    combineGear(
      gearBonus(worn),
      resonanceBonus(resonances(worn, skill ? SKILL_STYLE_GROUP[skill] : undefined)),
    ),
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
    return {
      ...c,
      level,
      skill,
      stats: geared,
      ...(hasGear ? { gear } : {}),
    };
  const sec = weaponSecondary(w.type);
  const wAtk = w.atkBonus * plusFactor(w.plus);
  return {
    ...c,
    level,
    skill,
    ...(hasGear ? { gear } : {}),
    stats: {
      ...geared,
      atk: Math.round((geared.atk + wAtk) * 10) / 10,
      accuracy: Math.round((geared.accuracy + sec.accuracy) * 100) / 100,
      crit:
        Math.round(Math.min(0.6, Math.max(0, geared.crit + sec.crit)) * 100) /
        100,
      speed: Math.round(geared.speed * sec.speedMult * 10) / 10,
    },
    weapon: { element: w.element, atkBonus: wAtk, type: w.type },
  };
}

// Single number to sort heroes by strength: effective stats (rank, stars, weapon
// and gear included). Higher is stronger.
export function heroPower(p: Profile, ownedId: string): number {
  const h = heroFromOwned(p, ownedId);
  if (!h) return 0;
  return statPower(h.stats);
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


// Stats saved before Run v2 have `flee` and no critDmg/regen/lifesteal: those are filled
// with the class defaults (the Pícaro already crit x2) instead of dropping the hero.
const REQUIRED_STATS: (keyof Stats)[] = ["hp", "atk", "def", "crit", "accuracy", "speed"];

function parseStats(v: unknown, classId: ClassId): Stats | null {
  if (!isObj(v)) return null;
  const out: Partial<Stats> = {};
  for (const k of REQUIRED_STATS) {
    const n = v[k];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out[k] = n;
  }
  const num = (x: unknown, d: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : d;
  out.critDmg = num(v.critDmg, CLASSES[classId].stats.critDmg);
  out.resist = num(v.resist, 0); // saved before v11: had dodge instead
  out.regen = num(v.regen, 0);
  out.lifesteal = num(v.lifesteal, 0);
  // ponytail: stat magnitudes are not range-checked; server must only store
  // characters it generated itself. Add per-class ranges if client saves are trusted.
  return out as Stats;
}

function parseCharacter(v: unknown, legacyAll: boolean): OwnedCharacter | null {
  if (!isObj(v)) return null;
  const classId = CLASS_IDS.find((c) => c === v.classId);
  const element = ELEMENTS.find((e) => e === v.element);
  const stats = classId ? parseStats(v.stats, classId) : null;
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
    ...(legacyAll || v.legacy === true ? { legacy: true } : {}),
    ...(typeof v.skill === "string" &&
    isSkillId(v.skill) &&
    SKILLS_BY_CLASS[classId].includes(v.skill)
      ? { skill: v.skill }
      : {}),
  };
}

function parseWeapon(v: unknown, legacyAll: boolean): OwnedWeapon | null {
  if (!isObj(v)) return null;
  const element = ELEMENTS.find((e) => e === v.element);
  const rarity = toRank(v.rarity);
  if (!element || !rarity) return null;
  // old saves: no type; the removed "lanza" became "espada" (v9)
  const type = v.type !== "lanza" && isWeaponType(v.type) ? v.type : "espada";
  const stars = nat(v.stars, MAX_STARS);
  const rolled = parseRoll(type, rarity, v.roll, v.lines);
  return {
    id: weaponKey(type, element, rarity),
    name: str(v.name, "Espada").replace(/^Lanza\b/, "Espada"),
    type,
    element,
    rarity,
    stars,
    atkBonus: weaponAtk(rarity, stars, type, rolled.roll), // never trusted
    ...rolled,
    ...(legacyAll || v.legacy === true ? { legacy: true } : {}),
    ...(nat(v.plus, 10) > 0 ? { plus: nat(v.plus, 10) } : {}),
    ...(nat(v.plusStreak, 1000) > 0 ? { plusStreak: nat(v.plusStreak, 1000) } : {}),
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

export const MAX_MATERIAL = 99999;
// Old forge stock (v8) paid out without loss: S/SS/SSR parts -> Escamas (1/2/4 each), F..A parts ->
// coins (5/8/12/20/35/60 each), every core -> 1 Dado cargado. Keep in sync with 0041_forge_v9.sql.
export const PART_TO_ESCAMAS: Partial<Record<RarityId, number>> = { s: 1, ss: 2, ssr: 4 };
export const PART_TO_COINS: Partial<Record<RarityId, number>> = { f: 5, e: 8, d: 12, c: 20, b: 35, a: 60 };
function convertOldParts(v: unknown): { coins: number; escamas: number; dados: number } {
  const out = { coins: 0, escamas: 0, dados: 0 };
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    const q = nat(n, 9999);
    if (/^core-(agua|fuego|viento|tierra|rayo)$/.test(k)) out.dados += q;
    else {
      const rank = /^p-[a-z]+-(f|e|d|c|b|a|s|ss|ssr)$/.exec(k)?.[1] as RarityId | undefined;
      if (!rank) continue;
      out.escamas += q * (PART_TO_ESCAMAS[rank] ?? 0);
      out.coins += q * (PART_TO_COINS[rank] ?? 0);
    }
  }
  return out;
}

export function migrate(json: unknown): Profile {
  if (!isObj(json)) return createProfile();
  // Anything saved before v5 is "legacy" (burns at a higher rate, see burn.ts).
  const legacyAll = !(typeof json.version === "number" && json.version >= 5);
  const rawChars = Array.isArray(json.characters) ? json.characters : [];
  const parsedChars = rawChars.map((c) => parseCharacter(c, legacyAll));
  const characters = uniqueById(parsedChars);
  // old id (legacy rarity) -> new id
  const charAlias = new Map<string, string>();
  rawChars.forEach((raw, i) => {
    const c = parsedChars[i];
    if (c && isObj(raw) && typeof raw.id === "string")
      charAlias.set(raw.id, c.id);
  });
  const rawWeapons = Array.isArray(json.weapons) ? json.weapons : [];
  const parsedWeapons = rawWeapons.map((w) => parseWeapon(w, legacyAll));
  // A converted lanza can collide with an espada of the same element and rank: +1 star.
  const weapons = uniqueById(parsedWeapons);
  parsedWeapons.forEach((w) => {
    const kept = w && weapons.find((x) => x.id === w.id);
    if (kept && kept !== w) {
      kept.stars = Math.min(MAX_STARS, Math.max(kept.stars, w.stars) + 1);
      kept.atkBonus = weaponAtk(kept.rarity, kept.stars, kept.type, kept.roll);
    }
  });
  // old id (no type) -> new id, so saved `equipped` entries survive
  const alias = new Map<string, string>();
  rawWeapons.forEach((raw, i) => {
    const w = parsedWeapons[i];
    if (w && isObj(raw) && typeof raw.id === "string") alias.set(raw.id, w.id);
  });
  // Hero fragments no longer exist: an old save's stock is paid out as coins.
  const oldParts = convertOldParts(json.parts);
  let fragmentCoins = 0;
  if (isObj(json.fragments))
    for (const c of CLASS_IDS)
      for (const raw of [...RARITY_IDS, ...Object.keys(LEGACY_RARITY)])
        fragmentCoins += nat(json.fragments[`${c}:${raw}`]) * FRAGMENT_REFUND;
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
    coins: nat(json.coins) + fragmentCoins + oldParts.coins,
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
    ...(isObj(json.daily) && isDayKey(json.daily.day)
      ? {
          daily: {
            day: json.daily.day,
            streak: Math.max(1, nat(json.daily.streak, 100000)),
          },
        }
      : {}),
    ...(isObj(json.runsDay) && isDayKey(json.runsDay.day)
      ? { runsDay: { day: json.runsDay.day, n: nat(json.runsDay.n, 100000) } }
      : {}),
    ...(typeof json.lastBankedRunId === "string"
      ? { lastBankedRunId: json.lastBankedRunId.slice(0, 100) }
      : {}),
    bestFloor: nat(json.bestFloor),
    runsPlayed: nat(json.runsPlayed),
    dungeons: parseProgress(json.dungeons),
    ...(isObj(json.levelsDay) && isDayKey(json.levelsDay.day)
      ? { levelsDay: { day: json.levelsDay.day, n: nat(json.levelsDay.n, 100000) } }
      : {}),
    escamas: Math.min(MAX_MATERIAL, nat(json.escamas, MAX_MATERIAL) + oldParts.escamas),
    dados: Math.min(MAX_MATERIAL, nat(json.dados, MAX_MATERIAL) + oldParts.dados),
    ...(isObj(json.dadosDay) && isDayKey(json.dadosDay.day)
      ? { dadosDay: { day: json.dadosDay.day, n: nat(json.dadosDay.n, 100) } }
      : {}),
    ...(typeof json.tutorial === "number" && json.tutorial < TUTORIAL_DONE
      ? { tutorial: nat(json.tutorial, TUTORIAL_DONE) }
      : {}),
  };
}
