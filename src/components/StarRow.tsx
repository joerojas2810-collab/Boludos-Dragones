import { MAX_STARS } from "@/lib/game/rarity";

const STAR = ["..XX..", ".XXXX.", "XXXXXX", ".XXXX.", ".XX.XX"] as const;
// 6x5 pixel star
const PIXELS = STAR.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (ch === "X" ? [[x, y]] : [])),
);

export function StarRow({
  stars,
  className = "h-3",
}: {
  stars: number;
  className?: string;
}) {
  return (
    <span
      className="inline-flex gap-0.5"
      role="img"
      aria-label={`${stars} de ${MAX_STARS} estrellas`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 6 5"
          shapeRendering="crispEdges"
          className={`aspect-[6/5] ${className}`}
          fill={i < stars ? "#fbbf24" : "#4a4541"}
        >
          {PIXELS.map(([x, y]) => (
            <rect key={`${x}${y}`} x={x} y={y} width={1} height={1} />
          ))}
        </svg>
      ))}
    </span>
  );
}
