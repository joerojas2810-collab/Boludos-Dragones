import { icon } from "@/lib/art";
import { MAX_STARS } from "@/lib/game/rarity";

export function StarRow({
  stars,
  className = "h-3",
}: {
  stars: number;
  className?: string;
}) {
  return (
    <span
      className="inline-flex"
      role="img"
      aria-label={`${stars} de ${MAX_STARS} estrellas`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={icon("system_star")}
          alt=""
          draggable={false}
          className={`aspect-square ${className} ${i < stars ? "" : "opacity-30 grayscale"}`}
        />
      ))}
    </span>
  );
}
