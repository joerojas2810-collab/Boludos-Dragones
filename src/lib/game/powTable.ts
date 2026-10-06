// Deterministic integer powers. `**` / Math.pow are implementation-approximated
// and may differ in the last bit between engines (V8 vs JavaScriptCore), which
// can flip a Math.round. Square-and-multiply uses only IEEE multiplication,
// which is exactly rounded everywhere; results are memoized per base.
export function makePow(base: number): (n: number) => number {
  const cache = new Map<number, number>([[0, 1]]);
  const compute = (n: number): number => {
    const hit = cache.get(n);
    if (hit !== undefined) return hit;
    const half = compute(n >> 1);
    const v = n & 1 ? half * half * base : half * half;
    cache.set(n, v);
    return v;
  };
  return (n) => compute(Math.max(0, Math.floor(n)));
}
