import type { DoorKind } from "@/lib/game/run";

// 8x8 pixel icons; letters index into the per-door color map.
const GRIDS: Record<DoorKind, string[]> = {
  easy: [
    ".......a",
    "......aa",
    ".....aa.",
    "a...aa..",
    "aa.aa...",
    ".aaa....",
    "..ba....",
    ".bb.....",
  ],
  hard: [
    ".aaaaaa.",
    "aaaaaaaa",
    "a.aaaa.a",
    "a.aaaa.a",
    "aaaaaaaa",
    ".aa..aa.",
    ".aaaaaa.",
    ".a.aa.a.",
  ],
  boss: [
    "a......a",
    "aa....aa",
    "aaaaaaaa",
    "aabaabaa",
    "aaaaaaaa",
    ".aaaaaa.",
    ".a.aa.a.",
    "..aaaa..",
  ],
  chest: [
    "........",
    ".aaaaaa.",
    "aaaaaaaa",
    "akkkkkka",
    "aaaabaaa",
    "aaaabaaa",
    "aaaaaaaa",
    "kkkkkkkk",
  ],
  merchant: [
    "..aaaa..",
    "...aa...",
    "..aaaa..",
    ".aaaaaa.",
    "aaabbaaa",
    "aabbbbaa",
    ".aabbaa.",
    "..aaaa..",
  ],
  rest: [
    "...a....",
    "...aa...",
    "..aaa...",
    ".aabaa..",
    ".aabba..",
    "aabbbaa.",
    "aabbbaa.",
    ".aaaaa..",
  ],
  event: [
    "..aaaa..",
    ".aa..aa.",
    ".....aa.",
    "....aa..",
    "...aa...",
    "...aa...",
    "........",
    "...aa...",
  ],
};
const COLORS: Record<DoorKind, Record<string, string>> = {
  easy: { a: "#b9c4cc", b: "#b8651f" },
  hard: { a: "#e6ded3" },
  boss: { a: "#c0392b", b: "#f4d03f" },
  chest: { a: "#b8651f", b: "#f4d03f", k: "#6b3a12" },
  merchant: { a: "#9b6b3c", b: "#f4d03f" },
  rest: { a: "#e67e22", b: "#f4d03f" },
  event: { a: "#a678d6" },
};

export function DoorIcon({
  kind,
  className = "h-12",
}: {
  kind: DoorKind;
  className?: string;
}) {
  const color = COLORS[kind];
  return (
    <svg
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={`aspect-square ${className}`}
    >
      {GRIDS[kind].flatMap((row, y) =>
        [...row].map(
          (ch, x) =>
            color[ch] && (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill={color[ch]}
              />
            ),
        ),
      )}
    </svg>
  );
}
