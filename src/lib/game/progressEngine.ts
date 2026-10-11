/** Isolated E2 feasibility prototype. This module is not connected to combat. */
export interface Runner {
  id: string;
  speed: number;
  progress: number;
}

export const THRESHOLD = 100;
export const DEFAULT_ACTIVATION_CAP = 3;

export function nextActivations(
  runners: Runner[],
  opts?: { cap?: number },
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
  const order: string[] = [];
  let iterations = 0;

  // A cycle ends once every runner has acted. Capped runners stop accumulating
  // whole activations; their fractional remainder is retained at the boundary.
  while (next.some(({ id }) => (counts.get(id) ?? 0) === 0)) {
    if (++iterations > next.length * cap + 1)
      throw new Error("progress scheduler exceeded its per-cycle activation bound");
    const eligible = next.filter(({ id }) => (counts.get(id) ?? 0) < cap);
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
      if ((counts.get(runner.id) ?? 0) >= cap) continue;
      runner.progress = Math.max(0, runner.progress - THRESHOLD);
      counts.set(runner.id, (counts.get(runner.id) ?? 0) + 1);
      order.push(runner.id);
    }
  }

  // Discard whole excess activations beyond the per-cycle cap, matching the
  // engine's discarded action overflow while preserving fractional carry.
  for (const runner of next) {
    runner.progress %= THRESHOLD;
    if (runner.progress < 1e-9) runner.progress = 0;
  }
  return { order, runners: next };
}
