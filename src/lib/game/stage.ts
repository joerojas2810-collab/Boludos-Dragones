// Stage engine (Run v2 / Modo Progreso): a stage is a short sequence of fights with
// ONE life and carried hp. Dungeon levels, tower floors and room rounds are all
// stages built from different fight lists. Pure and deterministic (serializable).
import {
  CLASS_IDS,
  generateCharacter,
  type Character,
} from "./characters";
import { ELEMENTS, type Element } from "./elements";
import { startBattle, type Battle, type EnemyMod } from "./combat";
import {
  DUNGEON_THEMES,
  dominantShare,
  levelElement,
  levelsOf,
  type LevelSpec,
} from "./levels";
import { RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { TRAITS, type Trait } from "./traits";
import { createRng, hashSeed, type Rng } from "./rng";
import type { EnemyFamily } from "./worlds";

// Replay engine version: bump on any change that alters a fight's outcome.
export const ENGINE_VERSION = 10;

export type FightRole = "normal" | "elite" | "final";

export interface FightSpec {
  role: FightRole;
  enemies: Character[];
  mods: EnemyMod[];
  battleSeed: number;
}

// ---- tuning (calibrated in phase 6 with scripts/run-sim.ts) ----
export const ENEMY_HP_MULT = 2;
export const KIND_POWER: Record<FightRole, number> = {
  normal: 0.4,
  elite: 0.55,
  final: 0.75,
};
// Per-rank difficulty tuning (scripts/stage-tune.ts bisects these to hit the target clear rates).
export const RANK_TUNE: Record<RarityId, number> = {
  f: 1.24,
  e: 1.26,
  d: 1.46,
  c: 1.59,
  b: 1.83,
  a: 1.98,
  s: 2.22,
  ss: 3.02,
  ssr: 4.14,
};
export const LEVEL_STEP = 0.05; // enemy power grows this much per level index
export const ASC_HP_STEP = 0.12; // per ascension level
export const ASC_ATK_STEP = 0.05;
export const GROUP_STAT_MULT = [1, 0.96, 0.82] as const; // atk and def by group size
export const GROUP_HP_MULT = [1, 0.55, 0.4] as const;
export const ESCORT_POWER = 0.7; // escort power relative to a normal fight
export const HEAL_BETWEEN = 0.1; // of max hp after each won fight
export const FIGHT_XP: Record<FightRole, number> = {
  normal: 100,
  elite: 250,
  final: 500,
};
export const CLEAR_XP_BONUS = 0.25;
export const SEDIENTO_HEAL = 0.1; // trait healOnWin: extra heal after a won fight
export const GAFE_LOSS_XP = 15; // trait xpOnLoss: EXP kept when the fight is lost

const hasTag = (hero: Character, tag: NonNullable<Trait["tag"]>) =>
  hero.traits.some((id) => (TRAITS[id] as Trait).tag === tag);

/** Share of max hp restored after a won fight (ascension rule + Sediento). */
export const winHeal = (hero: Character, asc = 0) =>
  healBetween(asc) + (hasTag(hero, "healOnWin") ? SEDIENTO_HEAL : 0);

const rankIdx = (r: RarityId) => RARITY_IDS.indexOf(r);

// Ascension rules (stack): L1 stats (see steps), L2 half heal, L3 bigger normal
// groups, L4 elites/bosses attack twice, L5 no heal between fights.
export const healBetween = (asc: number) =>
  asc >= 5 ? 0 : asc >= 2 ? HEAL_BETWEEN / 2 : HEAL_BETWEEN;
export const ASC_RULES: readonly string[] = [
  "Enemigos +12% vida y +5% ataque por nivel",
  "La curación entre peleas baja a la mitad",
  "Los grupos de peleas normales suman un enemigo más",
  "Los jefes atacan dos veces",
  "Sin curación entre peleas",
];

const FAMILY_LABEL: Record<EnemyFamily, string> = {
  limo: "Limo",
  diablillo: "Diablillo",
  arpia: "Arpía",
  golem: "Gólem",
  espectro: "Espectro",
};
const ROMAN = ["", " II", " III"];

function pickFamily(rng: ReturnType<typeof createRng>, rank: RarityId): EnemyFamily {
  const t = DUNGEON_THEMES[rank];
  const all: EnemyFamily[] = ["limo", "diablillo", "arpia", "golem", "espectro"];
  if (!t.guest) return rng.pick(all);
  const r = rng.next();
  return r < 0.4 ? t.families[0] : r < 0.8 ? t.families[1] : t.guest;
}

function groupSize(
  rng: ReturnType<typeof createRng>,
  role: FightRole,
  rank: RarityId,
  asc: number,
): number {
  const hi = rankIdx(rank) / (RARITY_IDS.length - 1); // 0..1
  let size = 1;
  if (role === "normal") {
    const r = rng.next();
    const p3 = 0.35 * hi;
    const p2 = 0.2 + 0.3 * hi;
    size = r < p3 ? 3 : r < p3 + p2 ? 2 : 1;
    if (asc >= 3) size = Math.min(3, size + 1);
  } else if (role === "elite") size = rng.chance(0.2 + 0.4 * hi) ? 2 : 1;
  else size = 1 + (hi > 0.3 ? 1 : 0) + (hi > 0.7 ? 1 : 0);
  return size;
}

function makeFight(
  spec: LevelSpec,
  asc: number,
  fightIdx: number,
  role: FightRole,
): FightSpec {
  const { rank } = spec;
  const rng = createRng(hashSeed(rankIdx(rank), spec.index, fightIdx, 9104));
  const dom = levelElement(spec, asc);
  const share = dominantShare(rank);
  const size = groupSize(rng, role, rank, asc);
  const hasBoss = role !== "normal";
  const levelPower = 1 + LEVEL_STEP * spec.index;
  const rankMult = RARITIES[rank].multiplier * RANK_TUNE[rank];
  const theme = DUNGEON_THEMES[rank];
  const made: Character[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < size; i++) {
    const isLead = hasBoss && i === 0;
    const base = generateCharacter(rng, rng.pick(CLASS_IDS), rank);
    const family = role === "final" && isLead ? theme.families[0] : pickFamily(rng, rank);
    const element: Element =
      role === "final" && isLead
        ? levelElement(spec, asc)
        : rng.chance(share)
          ? dom
          : rng.pick(ELEMENTS);
    const power = isLead
      ? KIND_POWER[role] * (size > 1 ? 0.85 : 1)
      : hasBoss
        ? KIND_POWER.normal * ESCORT_POWER
        : KIND_POWER.normal;
    const gs = hasBoss ? 1 : GROUP_STAT_MULT[size - 1];
    const gh = hasBoss ? 1 : GROUP_HP_MULT[size - 1];
    const mult = rankMult * levelPower * power * gs;
    const hpMult = rankMult * levelPower * power * gh * ENEMY_HP_MULT;
    const s = base.stats;
    const atkM = mult * (1 + ASC_ATK_STEP * asc);
    const hpM = hpMult * (1 + ASC_HP_STEP * asc);
    let name: string;
    if (role === "final" && isLead) name = theme.bossName;
    else {
      const label = FAMILY_LABEL[family];
      const n = seen.get(label) ?? 0;
      seen.set(label, n + 1);
      name = `${isLead ? "Élite: " : ""}${label}${ROMAN[Math.min(n, 2)]}`;
    }
    made.push({
      ...base,
      name,
      element,
      family,
      ...(role === "final" && isLead ? { bossId: theme.bossId } : {}),
      level: spec.index + 1,
      stats: {
        ...s,
        hp: Math.max(1, Math.round(s.hp * hpM)),
        atk: Math.round(s.atk * atkM * 10) / 10,
        def: Math.round(s.def * atkM * 10) / 10,
      },
    });
  }
  const mods: EnemyMod[] = asc >= 4 && hasBoss ? ["dobleAtaque"] : [];
  return {
    role,
    enemies: made,
    mods,
    battleSeed: hashSeed(rankIdx(rank), spec.index, fightIdx, 9105),
  };
}

// All fights of a dungeon level at an ascension. The last fight is an elite, or
// the named boss on the final level of the rank.
export function levelFights(spec: LevelSpec, asc = 0): FightSpec[] {
  return Array.from({ length: spec.length }, (_, i) =>
    makeFight(
      spec,
      asc,
      i,
      i < spec.length - 1 ? "normal" : spec.final ? "final" : "elite",
    ),
  );
}

export const levelAt = (rank: RarityId, index: number): LevelSpec | undefined =>
  levelsOf(rank)[index];

// ---- runtime ----
export type StageStatus = "playing" | "cleared" | "lost";

export interface Stage {
  seed: number; // per attempt: battle rolls vary, enemies do not
  asc: number;
  hero: Character;
  fights: FightSpec[];
  index: number; // current fight
  hp: number; // hero hp carried between fights
  status: StageStatus;
  xp: number; // EXP earned (kept even if the stage is lost)
  won: Record<FightRole, number>;
}

export function createStage(
  seed: number,
  hero: Character,
  fights: FightSpec[],
  asc = 0,
): Stage {
  return {
    seed,
    asc,
    hero,
    fights,
    index: 0,
    hp: hero.stats.hp,
    status: "playing",
    xp: 0,
    won: { normal: 0, elite: 0, final: 0 },
  };
}

export const currentFight = (st: Stage): FightSpec | undefined =>
  st.fights[st.index];

// The battle plus the rng that drives it (planning and every later step).
export function startFight(st: Stage): { battle: Battle; rng: Rng } {
  const f = st.fights[st.index];
  const rng = createRng(hashSeed(st.seed, st.index, f.battleSeed));
  const battle = startBattle(st.hero, f.enemies, rng, {
    playerHp: st.hp,
    mods: f.mods,
  });
  return { battle, rng };
}

// Abandoning counts as losing (EXP earned so far is kept).
export const abandonStage = (st: Stage): Stage =>
  st.status === "playing" ? { ...st, status: "lost", hp: 0 } : st;

// Applies a finished battle: a win heals a little and moves on (or clears the
// stage); a loss ends the attempt. Anything still ongoing is ignored.
export function finishFight(st: Stage, battle: Battle): Stage {
  if (st.status !== "playing" || battle.status === "ongoing") return st;
  const f = st.fights[st.index];
  if (battle.status === "lost")
    return {
      ...st,
      status: "lost",
      hp: 0,
      xp: st.xp + (hasTag(st.hero, "xpOnLoss") ? GAFE_LOSS_XP : 0),
    };
  const won = { ...st.won, [f.role]: st.won[f.role] + 1 };
  let xp = st.xp + FIGHT_XP[f.role];
  const max = st.hero.stats.hp;
  const hp = Math.min(
    max,
    battle.player.hp + Math.round(max * winHeal(st.hero, st.asc)),
  );
  if (st.index + 1 >= st.fights.length) {
    xp = Math.round(xp * (1 + CLEAR_XP_BONUS));
    return { ...st, status: "cleared", won, xp, hp: battle.player.hp };
  }
  return { ...st, index: st.index + 1, won, xp, hp };
}
