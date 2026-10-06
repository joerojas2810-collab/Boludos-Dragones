import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import {
  parsePartKey,
  partCount,
  partLabel,
  type Parts,
} from "@/lib/game/parts";
import { ELEMENTS } from "@/lib/game/elements";
import { coreKey } from "@/lib/game/parts";

// Forge stock grouped by rank (placeholder tiles until the art arrives).
export function PartsList({ parts }: { parts: Parts }) {
  if (partCount(parts) === 0)
    return (
      <p className="py-6 text-center">
        Aún no tienes partes. Los jefes y cofres de los dungeons las sueltan.
      </p>
    );
  const cores = ELEMENTS.filter((e) => (parts[coreKey(e)] ?? 0) > 0);
  return (
    <div className="space-y-3">
      {cores.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold text-yellow-300">Núcleos</h3>
          <ul className="flex flex-wrap gap-2">
            {cores.map((e) => (
              <li key={e} className="parts-tile">
                {partLabel(coreKey(e))} <b>×{parts[coreKey(e)]}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      {[...RARITY_IDS].reverse().map((rank) => {
        const rows = Object.entries(parts)
          .filter(([k, n]) => {
            const i = parsePartKey(k);
            return n > 0 && i?.kind === "part" && i.rank === rank;
          })
          .sort(([a], [b]) => a.localeCompare(b));
        if (rows.length === 0) return null;
        return (
          <section key={rank}>
            <h3
              className="mb-1 font-semibold"
              style={{ color: RARITIES[rank].color }}
            >
              Rango {RARITIES[rank].label}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {rows.map(([k, n]) => (
                <li
                  key={k}
                  className="parts-tile"
                  style={{ borderColor: RARITIES[rank].color }}
                >
                  {partLabel(k)} <b>×{n}</b>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export const dropsText = (d: Parts) =>
  Object.entries(d)
    .map(([k, n]) => `${partLabel(k)}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ");
