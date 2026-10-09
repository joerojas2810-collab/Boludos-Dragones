// Units of material (heroes and pieces share the model, see heroFusion.ts / pieceGrowth.ts): one item of
// the right rank is 1 unit and every spare copy it holds is 1 more, so an item with c copies holds
// c + 1 units. Copies go first; the item itself only leaves when all its units are used, and the
// base can only give its copies. Pure helpers, no profile access.
import type { RarityId } from "./rarity";

// `n` units taken from item `id`.
export interface Material {
  id: string;
  n: number;
}
export interface Stack {
  id: string;
  rarity: RarityId;
  copies?: readonly unknown[];
}
export const unitsOf = (c: Stack): number => 1 + (c.copies?.length ?? 0);

export type Spent<T> = { ok: true; items: T[]; units: number } | { ok: false; error: string };

export interface SpendRules<T> {
  msg: { notYours: string; otherRank: string; repeated: string; badAmount: string; baseCopies: string; tooMany: string };
  trim: (item: T, copies: unknown[]) => T; // the item with its remaining copies
  // Why this item cannot leave the collection entirely (worn, upgraded...), or null.
  cannotLeave?: (item: T) => string | null;
}

// Takes the materials out of `items` (base = the item being improved) and counts their units.
export function spendUnits<T extends Stack>(items: T[], base: T, mats: Material[], rules: SpendRules<T>): Spent<T> {
  const fail = (error: string) => ({ ok: false as const, error });
  if (new Set(mats.map((m) => m.id)).size !== mats.length) return fail(rules.msg.repeated);
  let out = items;
  let units = 0;
  for (const m of mats) {
    const h = out.find((c) => c.id === m.id);
    if (!h) return fail(rules.msg.notYours);
    if (h.rarity !== base.rarity) return fail(rules.msg.otherRank);
    if (!Number.isInteger(m.n) || m.n < 1) return fail(rules.msg.badAmount);
    const copies = [...(h.copies ?? [])];
    if (m.n > (h.id === base.id ? copies.length : copies.length + 1))
      return fail(h.id === base.id ? rules.msg.baseCopies : rules.msg.tooMany);
    if (m.n > copies.length) {
      const why = rules.cannotLeave?.(h);
      if (why) return fail(why);
    }
    units += m.n;
    out =
      m.n > copies.length
        ? out.filter((c) => c.id !== h.id)
        : out.map((c) => (c.id === h.id ? rules.trim(c, copies.slice(0, copies.length - m.n)) : c));
  }
  return { ok: true, items: out, units };
}

// The cheapest `need` units (UI "elegir lo más barato"): copies first (free), then whole items by
// ascending `cost` (an item whose cost is Infinity only offers its copies). The base only offers its copies.
export function cheapestUnits<T extends Stack>(items: T[], baseId: string, need: number, cost: (item: T) => number): Material[] {
  const units = items.flatMap((c) => {
    const copies = Array.from({ length: c.copies?.length ?? 0 }, () => ({ id: c.id, cost: 0 }));
    const own = cost(c);
    return c.id === baseId || !Number.isFinite(own) ? copies : [...copies, { id: c.id, cost: 1 + own }];
  });
  const out: Record<string, number> = {};
  for (const u of units.sort((a, b) => a.cost - b.cost).slice(0, need)) out[u.id] = (out[u.id] ?? 0) + 1;
  return Object.entries(out).map(([id, n]) => ({ id, n }));
}
