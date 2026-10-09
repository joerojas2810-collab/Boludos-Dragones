"use client";

import { ItemCard, type ItemView } from "@/components/ItemCard";
import { unitsOf, type Stack } from "@/lib/game/units";

// Units an item can give: the base only its copies; the rest its copies plus itself, unless `keep`
// says it must stay (a worn piece, one with +N): then only its copies.
export const limitOf = <T extends Stack>(c: T, baseId: string | null, keep?: (c: T) => boolean): number =>
  c.id === baseId || keep?.(c) ? (c.copies?.length ?? 0) : unitsOf(c);

// Grid of the items that can be material, each with a - / + stepper (units picked / available).
export function MaterialGrid<T extends Stack>({
  items,
  baseId,
  qty,
  keep,
  view,
  onStep,
}: {
  items: T[];
  baseId: string | null;
  qty: Record<string, number>;
  keep?: (c: T) => boolean;
  view: (c: T) => ItemView;
  onStep: (c: T, delta: number, limit: number) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-3">
      {items
        .map((c) => ({ c, limit: limitOf(c, baseId, keep) }))
        .filter((x) => x.limit > 0)
        .map(({ c, limit }) => (
          <div key={c.id} className="flex flex-col items-center gap-1">
            <ItemCard item={view(c)} size={72} selected={(qty[c.id] ?? 0) > 0} />
            <div className="flex items-center gap-1 text-sm">
              <button type="button" aria-label="Menos" className="btn btn-gray !min-h-7 !px-2 text-center" onClick={() => onStep(c, -1, limit)}>
                −
              </button>
              <span className="min-w-12 text-center">
                {qty[c.id] ?? 0}/{limit}
              </span>
              <button type="button" aria-label="Más" className="btn btn-gray !min-h-7 !px-2 text-center" onClick={() => onStep(c, 1, limit)}>
                +
              </button>
            </div>
            {c.id === baseId && <span className="text-[11px] opacity-70">solo sus copias</span>}
          </div>
        ))}
    </div>
  );
}

// Next quantity map after a +/- click (never above `limit` nor above `need` units in total).
export function stepQty(q: Record<string, number>, id: string, delta: number, limit: number, need: number): Record<string, number> {
  const total = Object.values(q).reduce((a, b) => a + b, 0);
  const n = Math.max(0, Math.min(limit, (q[id] ?? 0) + delta));
  return delta > 0 && total - (q[id] ?? 0) + n > need ? q : { ...q, [id]: n };
}
