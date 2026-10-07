import { Icon } from "@/components/Icon";
import { RARITIES, type RarityId } from "@/lib/game/rarity";

// Painted rank icon. The letter baked into the art was erased at import (scripts/import-art.mjs);
// when `letter` is set it is drawn here in the title font, scaled to the icon (container units).
export function RankIcon({
  rank,
  door = false,
  letter = false,
  className = "h-8 w-8",
}: {
  rank: RarityId;
  door?: boolean; // dungeon door icon instead of the plain badge
  letter?: boolean;
  className?: string;
}) {
  return (
    <span className={`rank-icon relative inline-block shrink-0 ${className}`}>
      <Icon
        name={door ? `dungeon_rank_${rank}` : `rank_${rank}`}
        className="h-full w-full"
      />
      {letter && (
        <span
          className="rank-icon-letter"
          style={{
            top: door ? "73%" : "79%",
            fontSize: door ? "19cqw" : "24cqw",
          }}
        >
          {RARITIES[rank].label}
        </span>
      )}
    </span>
  );
}
