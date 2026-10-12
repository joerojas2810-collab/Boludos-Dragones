// Dungeon clears: step unlocks are shared across all routes; level order is stored
// independently for each route and step.
import { DIFFICULTIES, type Difficulty } from "./rarity";
import { LEVELS_PER_ROUTE, MAX_ASCENSION, ROUTE_IDS, type RouteId, type Step } from "./levels";

export interface DungeonProgress {
  steps: Record<string, true>;
  routes: Record<string, number>;
}
export const emptyDungeonProgress = (): DungeonProgress => ({ steps: {}, routes: {} });
export const stepKey = (difficulty: Difficulty, asc: number) => `${difficulty}:${asc}`;
export const routeKey = (route: RouteId, difficulty: Difficulty, asc: number) => `${route}:${difficulty}:${asc}`;
export const stepCleared = (p: DungeonProgress, difficulty: Difficulty, asc: number) =>
  p.steps[stepKey(difficulty, asc)] === true;
export const clearedLevels = (p: DungeonProgress, route: RouteId, difficulty: Difficulty, asc = 0) =>
  p.routes[routeKey(route, difficulty, asc)] ?? 0;
export const levelAlreadyCleared = (p: DungeonProgress, difficulty: Difficulty, asc: number, level: number) =>
  Object.entries(p.routes).some(([key, levels]) => {
    const [, rank, step] = key.split(":");
    return rank === difficulty && Number(step) === asc && levels > level;
  });
export const isRouteDone = (p: DungeonProgress, route: RouteId, difficulty: Difficulty, asc = 0) =>
  clearedLevels(p, route, difficulty, asc) >= LEVELS_PER_ROUTE;

const difficultyIndex = (difficulty: Difficulty) => DIFFICULTIES.indexOf(difficulty);
export function isStepUnlocked(p: DungeonProgress, step: Step): boolean {
  if (!Number.isInteger(step.asc) || step.asc < 0 || step.asc > MAX_ASCENSION || !DIFFICULTIES.includes(step.difficulty)) return false;
  const rank = difficultyIndex(step.difficulty);
  if (rank === 0 && step.asc === 0) return true;
  if (step.asc > 0) return stepCleared(p, step.difficulty, step.asc - 1);
  const previous = DIFFICULTIES[rank - 1];
  return previous !== undefined && stepCleared(p, previous, 0);
}
export const maxAscension = (p: DungeonProgress, difficulty: Difficulty): number => {
  let asc = 0;
  while (asc < MAX_ASCENSION && stepCleared(p, difficulty, asc)) asc++;
  return asc;
}
export function isLevelUnlocked(p: DungeonProgress, route: RouteId, difficulty: Difficulty, level: number, asc = 0): boolean {
  return ROUTE_IDS.includes(route) && DIFFICULTIES.includes(difficulty) && Number.isInteger(asc) && asc >= 0 && asc <= MAX_ASCENSION &&
    Number.isInteger(level) && level >= 0 && level < LEVELS_PER_ROUTE &&
    isStepUnlocked(p, { difficulty, asc: asc as Step["asc"] }) &&
    level <= clearedLevels(p, route, difficulty, asc);
}
export interface ClearRecord {
  progress: DungeonProgress;
  firstTime: boolean;
  routeFirstClear: boolean;
  stepFirstClear: boolean;
}
export function recordClear(p: DungeonProgress, route: RouteId, difficulty: Difficulty, level: number, asc = 0): ClearRecord | null {
  if (!isLevelUnlocked(p, route, difficulty, level, asc)) return null;
  const done = clearedLevels(p, route, difficulty, asc);
  if (level < done) return { progress: p, firstTime: false, routeFirstClear: false, stepFirstClear: false };
  const key = routeKey(route, difficulty, asc);
  const nextCount = done + 1;
  const routes = { ...p.routes, [key]: nextCount };
  const routeFirstClear = nextCount === LEVELS_PER_ROUTE;
  const stepFirstClear = routeFirstClear && !stepCleared(p, difficulty, asc);
  return {
    progress: {
      steps: stepFirstClear ? { ...p.steps, [stepKey(difficulty, asc)]: true } : p.steps,
      routes,
    },
    firstTime: !levelAlreadyCleared(p, difficulty, asc, level),
    routeFirstClear,
    stepFirstClear,
  };
}

export function parseProgress(value: unknown): DungeonProgress {
  const out = emptyDungeonProgress();
  if (!value || typeof value !== "object") return out;
  const input = value as Record<string, unknown>;
  const steps = input.steps;
  if (steps && typeof steps === "object") {
    for (const [key, flag] of Object.entries(steps)) {
      const [difficulty, ascText, ...extra] = key.split(":");
      const asc = Number(ascText);
      if (!extra.length && DIFFICULTIES.includes(difficulty as Difficulty) && Number.isInteger(asc) && asc >= 0 && asc <= MAX_ASCENSION && flag === true)
        out.steps[key] = true;
    }
  }
  const routes = input.routes;
  if (routes && typeof routes === "object") {
    for (const [key, count] of Object.entries(routes)) {
      const [route, difficulty, ascText, ...extra] = key.split(":");
      const asc = Number(ascText);
      if (!extra.length && ROUTE_IDS.includes(route as RouteId) && DIFFICULTIES.includes(difficulty as Difficulty) && Number.isInteger(asc) && asc >= 0 && asc <= MAX_ASCENSION && Number.isFinite(count))
        out.routes[key] = Math.min(LEVELS_PER_ROUTE, Math.max(0, Math.floor(Number(count))));
    }
  }
  return out;
}
