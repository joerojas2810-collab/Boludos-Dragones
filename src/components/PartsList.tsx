import { partIconSrc } from "@/lib/art";
import { isPixel } from "@/lib/art/pixel";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import {
  parsePartKey,
  partCount,
  partLabel,
  type Parts,
} from "@/lib/game/parts";
import { ELEMENTS } from "@/lib/game/elements";
import { coreKey } from "@/lib/game/parts";

// Icon + label (+ count) tile for a part or core stock key.
export function PartTile({ k, n, color }: { k: string; n: number; color?: string }) {
  const src = partIconSrc(k);
  return (
    <li
      className="parts-tile flex items-center gap-2"
      style={color ? { borderColor: color } : undefined}
      title={partLabel(k)}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-9 w-9 shrink-0"
          style={isPixel() ? { imageRendering: "pixelated" } : undefined}
        />
      )}
      <span>
        {partLabel(k)} <b>×{n}</b>
      </span>
    </li>
  );
}

// Forge stock grouped by rank.
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
              <PartTile key={e} k={coreKey(e)} n={parts[coreKey(e)]} />
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
                <PartTile key={k} k={k} n={n} color={RARITIES[rank].color} />
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
