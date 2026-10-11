/** Isolated E2 feasibility prototype. This module is not connected to combat. */
export interface Runner {
  id: string;
  speed: number;
  progress: number;
}

export const THRESHOLD = 100;
export const DEFAULT_ACTIVATION_CAP = 3;
export const DEFAULT_TIMER_CONVERSIONS = {
  cooldown: 0.65,
  status: 0.65,
  reflect: 0.65,
  defending: 1,
  burn: 0.65,
} as const;

export type TimerConversions = Record<keyof typeof DEFAULT_TIMER_CONVERSIONS, number>;

export function advanceActivationTimer(
  remaining: number,
  activations: number,
  conversion: number,
): number {
  if (!Number.isFinite(remaining) || remaining < 0)
    throw new RangeError("timer must be finite and nonnegative");
  if (!Number.isInteger(activations) || activations < 0)
    throw new RangeError("activations must be a nonnegative integer");
  if (!Number.isFinite(conversion) || conversion < 0)
    throw new RangeError("conversion must be finite and nonnegative");
  return Math.max(0, remaining - activations * conversion);
}

export function activationTicks(
  remainder: number,
  activations: number,
  conversion: number,
): { ticks: number; remainder: number } {
  if (!Number.isFinite(remainder) || remainder < 0 || remainder >= 1)
    throw new RangeError("tick remainder must be in [0, 1)");
  if (!Number.isInteger(activations) || activations < 0)
    throw new RangeError("activations must be a nonnegative integer");
  if (!Number.isFinite(conversion) || conversion < 0)
    throw new RangeError("conversion must be finite and nonnegative");
  const total = remainder + activations * conversion;
  const ticks = Math.floor(total + 1e-9);
  return { ticks, remainder: Math.max(0, total - ticks) };
}

/** Converts ENGINE 13's initiative roll into a starting progress lead.
 * `roll = speed * (0.7 + 0.6 * rng)`; the mapping makes time-to-threshold
 * inversely proportional to that roll, preserving its ordering for the first
 * activation while allowing later activations to follow accumulated progress.
 */
export function initialProgressFromRoll(speed: number, roll: number): number {
  if (!Number.isFinite(speed) || speed <= 0)
    throw new RangeError("speed must be finite and positive");
  if (!Number.isFinite(roll) || roll <= 0)
    throw new RangeError("roll must be finite and positive");
  const factor = roll / speed;
  if (factor < 0.7 || factor > 1.3)
    throw new RangeError("roll must use the ENGINE 13 initiative range");
  return THRESHOLD * (1 - 0.7 / factor);
}

export function nextActivations(
  runners: Runner[],
  opts?: { cap?: number; activations?: Record<string, number> },
): { order: string[]; runners: Runner[] } {
  const cap = opts?.cap ?? DEFAULT_ACTIVATION_CAP;
  if (!Number.isInteger(cap) || cap < 1)
    throw new RangeError("cap must be a positive integer");
  if (runners.length === 0) return { order: [], runners: [] };

  const ids = new Set<string>();
  const next = runners.map((runner) => {
    if (!runner.id || ids.has(runner.id))
      throw new Error("runner ids must be nonempty and unique");
    ids.add(runner.id);
    if (!Number.isFinite(runner.speed) || runner.speed <= 0)
      throw new RangeError("runner speed must be finite and positive");
    if (
      !Number.isFinite(runner.progress) ||
      runner.progress < 0 ||
      runner.progress >= THRESHOLD
    )
      throw new RangeError("runner progress must be in [0, THRESHOLD)");
    return { ...runner };
  });
  const counts = new Map(next.map(({ id }) => [id, 0]));
  const hasQuotas = opts?.activations !== undefined;
  const quotas = new Map(
    next.map(({ id }) => {
      const requested = opts?.activations?.[id];
      if (requested !== undefined && (!Number.isInteger(requested) || requested < 1))
        throw new RangeError("activation quotas must be positive integers");
      return [id, requested ?? 1] as const;
    }),
  );
  const order: string[] = [];
  let iterations = 0;

  // A cycle ends once every runner has acted. Capped runners stop accumulating
  // whole activations; their fractional remainder is retained at the boundary.
  const unfinished = (id: string) =>
    hasQuotas
      ? (counts.get(id) ?? 0) < (quotas.get(id) ?? 1)
      : (counts.get(id) ?? 0) === 0;
  while (next.some(({ id }) => unfinished(id))) {
    if (++iterations > next.length * cap + [...quotas.values()].reduce((a, b) => a + b, 0))
      throw new Error("progress scheduler exceeded its per-cycle activation bound");
    const eligible = next.filter(({ id }) =>
      hasQuotas
        ? (counts.get(id) ?? 0) < (quotas.get(id) ?? 1)
        : (counts.get(id) ?? 0) < cap,
    );
    const delta = Math.min(
      ...eligible.map(({ speed, progress }) => (THRESHOLD - progress) / speed),
    );
    for (const runner of next) runner.progress += runner.speed * delta;

    const ready = eligible
      .filter(({ progress }) => progress + 1e-9 >= THRESHOLD)
      .sort((a, b) => a.speed - b.speed || next.indexOf(a) - next.indexOf(b));
    if (ready.length === 0)
      throw new Error("progress scheduler failed to reach an activation");
    for (const runner of ready) {
      if (
        hasQuotas
          ? (counts.get(runner.id) ?? 0) >= (quotas.get(runner.id) ?? 1)
          : (counts.get(runner.id) ?? 0) >= cap
      ) continue;
      runner.progress = Math.max(0, runner.progress - THRESHOLD);
      counts.set(runner.id, (counts.get(runner.id) ?? 0) + 1);
      order.push(runner.id);
    }
  }

  // Discard whole excess activations beyond the cycle quota, preserving only
  // the fractional carry. Explicit quotas let the adapter retain motor-13's
  // `actionCounts` while progress and initiative determine the order.
  for (const runner of next) {
    runner.progress %= THRESHOLD;
    if (runner.progress < 1e-9) runner.progress = 0;
  }
  return { order, runners: next };
}
