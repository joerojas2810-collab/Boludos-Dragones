// Floor fights for the non-dungeon modes (weekly tower, room rounds, coop boss):
// one fight per floor, generated from (seed, floor) only. Difficulty is exponential
// in the depth (FLOOR_SCALE^depth) with a small step every 5 floors; every 5th floor
// is a boss and every 10th a named boss room. Also the "climb": one life, hp carried
// between floors with a small heal, shared by the tower and the room rounds.
import {
  CLASS_IDS,
  generateCharacter,
  type Character,
} from "./characters";
import type { EnemyMod } from "./combat";
import { ELEMENTS, type Element } from "./elements";
import { DUNGEON_THEMES } from "./levels";
import { makePow } from "./powTable";
import { DUNGEON_IDS, type DungeonId } from "./rarity";
import { createRng, hashSeed } from "./rng";
import {
  createStage,
  ENGINE_VERSION,
  ENEMY_HP_MULT,
  GROUP_HP_MULT,
  GROUP_STAT_MULT,
  winHeal,
  type FightRole,
  type FightSpec,
  type Stage,
} from "./stage";
import {
  WORLD_ELEMENT_BIAS,
  worldOf,
  type EnemyFamily,
} from "./worlds";

export type FloorKind = "easy" | "hard" | "boss";

export const BOSS_EVERY = 5;
export const BOSS_ROOM_EVERY = 10;
// Tuning (calibrated with scripts/tower-sim.ts).
export const FLOOR_POWER = { easy: 0.2, hard: 0.27, boss: 0.2 } as const;
export const ROOM_POWER = 0.75; // rooms are gentler: almost everybody should reach floor 10
export const BOSS_ROOM_MULT = 1.25; // named boss rooms hit harder than a plain boss
export const STEP_EVERY = 5;
export const STEP_BONUS = 0.04; // per completed block of STEP_EVERY floors
export const EARLY_EASE_START = 0.6;
export const EARLY_EASE_FLOORS = 9;
export const BOSS_ESCORT_MULT = [1, 0.85, 0.75] as const;
export const BOSS_MINION_POWER = 0.7;
// First depth where each enemy modifier appears (all stay on afterwards).
export const MODIFIER_FLOORS: Readonly<Record<EnemyMod, number>> = {
  regeneracion: 12,
  escudo: 20,
  dobleAtaque: 28,
  elementoCambiante: 36,
};

// The hero no longer grows inside a climb, so the curve is gentler than the old 1.21.
export const CLIMB_SCALE = 1.12;
const floorPow = makePow(CLIMB_SCALE);
// Only the weekly tower (opts.tower) climbs gentler than rooms: the bot median is floor ~13 (nivelado), 16 (F colección).
export const TOWER_SCALE = 1.065;
const towerPow = makePow(TOWER_SCALE);
const stepPow = makePow(1 + STEP_BONUS);

const FAMILY_LABEL: Record<EnemyFamily, string> = {
  limo: "Limo",
  diablillo: "Diablillo",
  arpia: "Arpía",
  golem: "Gólem",
  espectro: "Espectro",
};
const FAMILY_BOSS_LABEL: Record<EnemyFamily, string> = {
  limo: "Limo Supremo",
  diablillo: "Diablillo Mayor",
  arpia: "Arpía Matriarca",
  golem: "Gólem Colosal",
  espectro: "Espectro Ancestral",
};
const ROMAN = ["", " II", " III"];
const SALT = { easy: 1, hard: 2, boss: 3 } as const;

/** Default kind of a floor: a boss every BOSS_EVERY floors, plain fights otherwise. */
export const kindOfFloor = (floor: number): FloorKind =>
  floor % BOSS_EVERY === 0 ? "boss" : "easy";

export const isBossRoom = (floor: number) => floor % BOSS_ROOM_EVERY === 0;

// Room / tower difficulty shift per rank (found by simulation, see scripts/run-sim.ts).
export const RANK_DEPTH_OFFSET: Readonly<Record<DungeonId, number>> = {
  f: 0,
  e: 1,
  d: 1,
  c: 2,
  b: 3,
  a: 4,
  s: 5,
  ss: 6,
  ssr: 8,
};

/** Depth used for scaling: the floor plus the room rank's offset (rooms only). */
export const depthOf = (floor: number, rank?: DungeonId | null) =>
  floor + (rank ? RANK_DEPTH_OFFSET[rank] : 0);

export const earlyEase = (depth: number) =>
  Math.min(
    1,
    EARLY_EASE_START + ((1 - EARLY_EASE_START) * (depth - 1)) / EARLY_EASE_FLOORS,
  );

export function modsAtDepth(depth: number): EnemyMod[] {
  return (Object.keys(MODIFIER_FLOORS) as EnemyMod[]).filter(
    (m) => depth >= MODIFIER_FLOORS[m],
  );
}

// Odds of 1, 2 and 3 enemies by depth: the last row with from <= depth applies.
const GROUPS: Record<
  FloorKind,
  readonly { from: number; w: readonly [number, number, number] }[]
> = {
  easy: [
    { from: 1, w: [1, 0, 0] },
    { from: 3, w: [0.7, 0.3, 0] },
    { from: 10, w: [0.5, 0.5, 0] },
    { from: 20, w: [0.3, 0.5, 0.2] },
  ],
  hard: [
    { from: 1, w: [0, 1, 0] },
    { from: 6, w: [0, 0.65, 0.35] },
    { from: 15, w: [0, 0.4, 0.6] },
  ],
  boss: [
    { from: 1, w: [1, 0, 0] },
    { from: 15, w: [0.5, 0.5, 0] },
    { from: 30, w: [0.3, 0.4, 0.3] },
  ],
};

export function groupSize(
  seed: number,
  floor: number,
  kind: FloorKind,
  depth: number,
): number {
  const rows = GROUPS[kind].filter((r) => depth >= r.from);
  const w = rows[rows.length - 1].w;
  const rng = createRng(hashSeed(seed, floor, 70 + SALT[kind]));
  let r = rng.next() * (w[0] + w[1] + w[2]);
  return w.findIndex((x) => (r -= x) < 0) + 1 || 1;
}

export interface FloorOpts {
  rank?: DungeonId | null; // room difficulty: shifts depth, picks the boss room's boss
  kind?: FloorKind; // default: kindOfFloor(floor)
  tower?: boolean; // weekly tower: gentler depth curve (TOWER_SCALE)
  power?: number; // overall multiplier; default ROOM_POWER in rooms (rank set), 1 otherwise
}

/** The named boss of a boss room: by room rank in rooms, cycling through the nine in the tower. */
function bossTheme(floor: number, rank: DungeonId | null | undefined) {
  if (rank) return DUNGEON_THEMES[rank];
  const k = Math.floor(floor / BOSS_ROOM_EVERY) - 1;
  return DUNGEON_THEMES[DUNGEON_IDS[k % DUNGEON_IDS.length]];
}

/** Doors of a room floor: a boss floor has only the boss; otherwise easy or hard. */
export const roomDoors = (floor: number): { kind: FloorKind }[] =>
  kindOfFloor(floor) === "boss"
    ? [{ kind: "boss" }]
    : [{ kind: "easy" }, { kind: "hard" }];

/** Rank whose named boss has this art id (the sprites are looked up by rank). */
export const bossRankOf = (bossId?: string): DungeonId | null =>
  DUNGEON_IDS.find((r) => DUNGEON_THEMES[r].bossId === bossId) ?? null;

export function floorFight(
  seed: number,
  floor: number,
  opts: FloorOpts = {},
): FightSpec {
  const kind = opts.kind ?? kindOfFloor(floor);
  const depth = depthOf(floor, opts.rank);
  const size = groupSize(seed, floor, kind, depth);
  const room = kind === "boss" && isBossRoom(floor);
  const role: FightRole = room ? "final" : kind === "boss" ? "elite" : "normal";
  const world = worldOf(floor);
  const theme = room ? bossTheme(floor, opts.rank) : null;
  const ease = earlyEase(depth);
  const step = stepPow(Math.floor(depth / STEP_EVERY));
  const scale = (opts.tower ? towerPow : floorPow)(depth) * ease * step * (opts.power ?? (opts.rank ? ROOM_POWER : 1));
  const made: Character[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < size; i++) {
    const rng = createRng(
      i === 0
        ? hashSeed(seed, floor, 10 + SALT[kind])
        : hashSeed(seed, floor, 10 + SALT[kind], i),
    );
    const base = generateCharacter(rng, rng.pick(CLASS_IDS));
    const themed = rng.chance(WORLD_ELEMENT_BIAS);
    const other = rng.pick(ELEMENTS);
    const suffix = rng.pick(world.enemySuffixes);
    const lead = kind === "boss" && i === 0;
    let element: Element = themed ? world.element : other;
    let family: EnemyFamily = world.family;
    let name = `${FAMILY_LABEL[family]} ${suffix}`;
    if (lead && theme) {
      name = theme.bossName;
      family = theme.families[0];
      element = theme.bossElement;
    } else if (lead) name = FAMILY_BOSS_LABEL[family];
    let power: number;
    let hpPower: number;
    if (kind === "boss") {
      power = lead
        ? FLOOR_POWER.boss * BOSS_ESCORT_MULT[size - 1] * (room ? BOSS_ROOM_MULT : 1)
        : FLOOR_POWER.easy * BOSS_MINION_POWER;
      hpPower = power;
    } else {
      power = FLOOR_POWER[kind] * GROUP_STAT_MULT[size - 1];
      hpPower = FLOOR_POWER[kind] * GROUP_HP_MULT[size - 1];
    }
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) name += ROMAN[Math.min(n, 2)];
    const s = base.stats;
    made.push({
      ...base,
      name,
      element,
      family,
      ...(lead && theme ? { bossId: theme.bossId } : {}),
      level: depth,
      stats: {
        ...s,
        hp: Math.max(1, Math.round(s.hp * scale * hpPower * ENEMY_HP_MULT)),
        atk: Math.round(s.atk * scale * power * 10) / 10,
        def: Math.round(s.def * scale * power * 10) / 10,
      },
    });
  }
  return {
    role,
    enemies: made,
    mods: modsAtDepth(depth),
    battleSeed: hashSeed(seed, floor, 20 + SALT[kind]),
  };
}

// ---- the climb: one life, hp carried floor to floor ----
export interface Climb {
  seed: number;
  hero: Character;
  hp: number;
  floor: number; // floor to play next (1-based)
  status: "active" | "over";
  rank: DungeonId | null; // room difficulty (null in the tower)
  wins: number;
  bossWins: number;
  rounds: number; // battle rounds fought so far (tower tiebreak)
  engineVersion: number;
}

export const newClimb = (
  seed: number,
  hero: Character,
  rank: DungeonId | null = null,
): Climb => ({
  seed,
  hero,
  hp: hero.stats.hp,
  floor: 1,
  status: "active",
  rank,
  wins: 0,
  bossWins: 0,
  rounds: 0,
  engineVersion: ENGINE_VERSION,
});

/** Floors cleared so far (the score). */
export const climbScore = (c: Climb) => c.floor - 1;

/** One-fight stage of the climb's current floor; `spec` lets callers boost the enemies. */
export function floorStage(
  c: Climb,
  spec: FightSpec = floorFight(c.seed, c.floor, { rank: c.rank }),
): Stage {
  return { ...createStage(hashSeed(c.seed, 1), c.hero, [spec]), hp: c.hp };
}

/** Folds a finished floor stage (cleared | lost) into the climb. Unfinished: unchanged. */
export function advanceClimb(
  c: Climb,
  stage: Stage,
  role: FightRole,
  rounds = 0,
): Climb {
  if (stage.status === "lost")
    return { ...c, status: "over", hp: 0 }; // the lost floor does not count, nor its rounds
  if (stage.status !== "cleared") return c;
  const max = c.hero.stats.hp;
  return {
    ...c,
    hp: Math.min(max, stage.hp + Math.round(max * winHeal(c.hero))),
    floor: c.floor + 1,
    wins: c.wins + 1,
    bossWins: c.bossWins + (role === "normal" ? 0 : 1),
    rounds: c.rounds + rounds,
  };
}

/** Brings a climb to the START of `floor` (a late joiner skips ahead; never goes back). */
export const alignClimb = (c: Climb, floor: number): Climb =>
  c.status === "active" && c.floor < floor ? { ...c, floor } : c;

/** Server-applied loss (no submission / illegal log / unfinished fight). */
export const timeoutClimb = (c: Climb): Climb => ({ ...c, status: "over", hp: 0 });
