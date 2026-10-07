// Dungeon progress (Run v2): per rank, per ascension, how many levels have been
// cleared IN ORDER. A level unlocks when the previous one is cleared at that
// ascension; the next rank unlocks when the previous rank's last level is cleared
// at ascension 0; ascension N+1 of a rank opens when ALL its levels are cleared at N.
import { LEVELS_PER_RANK, MAX_ASCENSION } from "./levels";
import { RARITY_IDS, type RarityId } from "./rarity";

export type DungeonProgress = Partial<Record<RarityId, number[]>>;

export const clearedLevels = (p: DungeonProgress, rank: RarityId, asc = 0) =>
  p[rank]?.[asc] ?? 0;

export const isDungeonDone = (p: DungeonProgress, rank: RarityId, asc = 0) =>
  clearedLevels(p, rank, asc) >= LEVELS_PER_RANK[rank];

export function isRankUnlocked(p: DungeonProgress, rank: RarityId): boolean {
  const i = RARITY_IDS.indexOf(rank);
  return i === 0 || isDungeonDone(p, RARITY_IDS[i - 1]);
}

// Highest ascension the player may enter in a rank.
export function maxAscension(p: DungeonProgress, rank: RarityId): number {
  let a = 0;
  while (a < MAX_ASCENSION && isDungeonDone(p, rank, a)) a++;
  return a;
}

export function isLevelUnlocked(
  p: DungeonProgress,
  rank: RarityId,
  level: number,
  asc = 0,
): boolean {
  return (
    level >= 0 &&
    level < LEVELS_PER_RANK[rank] &&
    isRankUnlocked(p, rank) &&
    asc <= maxAscension(p, rank) &&
    level <= clearedLevels(p, rank, asc)
  );
}

export interface ClearRecord {
  progress: DungeonProgress;
  firstTime: boolean; // the level had never been cleared at this ascension
  dungeonFirstClear: boolean; // this clear finished the rank at this ascension for the first time
}

export function recordClear(
  p: DungeonProgress,
  rank: RarityId,
  level: number,
  asc = 0,
): ClearRecord | null {
  if (!isLevelUnlocked(p, rank, level, asc)) return null;
  const done = clearedLevels(p, rank, asc);
  if (level < done) return { progress: p, firstTime: false, dungeonFirstClear: false };
  const row = [...(p[rank] ?? [])];
  while (row.length <= asc) row.push(0);
  row[asc] = done + 1;
  return {
    progress: { ...p, [rank]: row },
    firstTime: true,
    dungeonFirstClear: row[asc] >= LEVELS_PER_RANK[rank],
  };
}

// Sanitizes saved/untrusted input.
export function parseProgress(v: unknown): DungeonProgress {
  const out: DungeonProgress = {};
  if (!v || typeof v !== "object") return out;
  for (const r of RARITY_IDS) {
    const row = (v as Record<string, unknown>)[r];
    if (!Array.isArray(row)) continue;
    out[r] = row
      .slice(0, MAX_ASCENSION + 1)
      .map((n) =>
        Math.min(LEVELS_PER_RANK[r], Math.max(0, Math.floor(Number(n) || 0))),
      );
  }
  return out;
}
