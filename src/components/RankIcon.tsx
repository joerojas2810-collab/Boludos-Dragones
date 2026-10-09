import { Icon } from "@/components/Icon";
import { DUNGEON_INFO, type DungeonId, type RarityId } from "@/lib/game/rarity";

// Painted rank icon. Badges (scripts/import-art2.mjs) come with a blank plate; door icons had their baked letter erased (scripts/import-art.mjs);
// when `letter` is set it is drawn here in the title font, scaled to the icon (container units).
export function RankIcon({
  rank,
  door = false,
  letter = false,
  className = "h-8 w-8",
  style,
}: {
  rank: RarityId | DungeonId;
  door?: boolean; // dungeon door icon instead of the plain badge
  letter?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`rank-icon relative inline-block shrink-0 ${className}`}
      style={style}
    >
      <Icon
        name={door ? `dungeon_rank_${rank}` : `rank_${rank}`}
        className="h-full w-full"
      />
      {letter && (
        <span
          className="rank-icon-letter"
          style={{
            top: door ? "73%" : "50%",
            fontSize: door ? "19cqw" : "26cqw",
          }}
        >
          {DUNGEON_INFO[rank].label}
        </span>
      )}
    </span>
  );
}
