import type { ClassId } from "@/lib/game/characters";

export const SPRITE_SIZE = 32;
const HALF = SPRITE_SIZE / 2;

// Each row is the left half of the sprite, right-aligned to the center axis
// (leading transparent pixels are padded automatically); the right half is
// mirrored. Rows are bottom-aligned with a 1px margin.
// o outline, a/b/c element main/dark/light, m/n metal light/dark,
// s/d skin light/shadow, h hair, w white, y gold, . transparent
export const HALF_SPRITES: Record<ClassId, readonly string[]> = {
  caballero: [
    "..............oo",
    ".............oac",
    "............oaac",
    "............oaac",
    "..........ooaaac",
    ".........ommoaac",
    "........ommmoaac",
    "........ommmmoac",
    "........ommmmmmm",
    "........onnnnnnn",
    "........onoocwoo",
    "........onmmmmmm",
    ".........onmmomm",
    ".....oooooooonnn",
    "....oaccaaommmmm",
    "....oaaabbommmmm",
    "....obbbbonnmmmm",
    ".....onmmmommmmm",
    ".....onmmmommmmy",
    ".....onmmmommmya",
    ".....onnmmommmya",
    ".....onnmmommmmy",
    ".....onmmmollllp",
    "......ommmmmmmmm",
    "......onmmmmmmmn",
    "........ommmmmo.",
    "........ommammo.",
    ".......onnnnnno.",
    "......ooooooooo.",
  ],
  mago: [
    "...............o",
    "..............oa",
    "..............oa",
    ".............oaa",
    ".............oya",
    "............oaab",
    "............oaab",
    "...........oyyyp",
    "......oooaaaaaaa",
    ".....ooaabbbbbbb",
    ".........oddwwww",
    "........owsssoss",
    "........owsssssd",
    "........owwwwwww",
    ".....oaaaaawwwww",
    "....oaacaaawwkww",
    "....oaaaabbbwwww",
    "....oaaabbbbwwww",
    "....oyyyyyyyabww",
    "......oaaaaaaabw",
    ".......oaaaaaaaw",
    ".......oyyyyyypp",
    "......oaaaaaaaaa",
    "......oaabaaaaaa",
    ".....oaaaaacaaaa",
    ".....oaaabaaaaaa",
    "....oaaaaaaaabaa",
    "....oyyyyyyyyyyy",
    "....oooooooooooo",
  ],
  picaro: [
    "..............oo",
    ".............oaa",
    "............oaaa",
    "...........oaaaa",
    "..........oaaaaa",
    "..........oaaaaa",
    ".........oabbbbb",
    ".........obsssss",
    ".........obsswss",
    ".........obccccc",
    "........obbbbbbb",
    "......oooaaaaaaa",
    "......oaabllllll",
    "......oaaolleell",
    "......oaaollleel",
    "......oaaollllly",
    "......oaaollllll",
    "......oaaoeeeepp",
    ".....oaaaoeeeepp",
    ".....oaaaaabbbbb",
    ".....oaaabbbbbbb",
    "......oaabbbbbbo",
    "........oaaaaao.",
    "........oaabbao.",
    "........obbbbbo.",
    "........oeeeeeo.",
    "........occcccc.",
    ".......obeeeeeo.",
    "......ooooooooo.",
  ],
  clerigo: [
    "..........yyyyyy",
    ".........yy.....",
    "..........yyyyyy",
    "..........ohhhhh",
    ".........ohhhhhh",
    ".........ohhhhhh",
    "........ohhsssss",
    ".......ohssssoss",
    ".......ohsdssssd",
    "........ohssssdd",
    "..........oddddd",
    ".....ooowwwwwwww",
    "....owwwwwwwoaay",
    "....owwwwwwwoaay",
    "....owwwwwwwoyyy",
    "....owwwwwwwoaay",
    "....owwwwwwwoaay",
    "....owyyyyyyyyyp",
    "....owwwwwwwoaay",
    "....owwwwwwwoaay",
    "...owwwwwwwwoaaa",
    "...owwwwwwwwoaaa",
    "...owwkwwwwoaaa",
    "..owwwkwwwwwoaab",
    "..owwwwwwwwwoaab",
    "..owwwwwwwwwoaab",
    "..oyyyyyyyyyyyyy",
    "..oaaaaaaaaaaaab",
    "..oooooooooooooo",
  ],
};

const padLeft = (r: string) => ".".repeat(HALF - r.length) + r;
// Light comes from the top-left: element highlights (c) turn into the main
// tone (a) on the mirrored right half.
const mirror = (r: string) =>
  padLeft(r) +
  [...padLeft(r)]
    .reverse()
    .map((ch) => (ch === "c" ? "a" : ch))
    .join("");

// Asymmetric details drawn over the mirrored body: [row, col, pixels].
type Patch = readonly [number, number, string];

const vertical = (
  row0: number,
  row1: number,
  col: number,
  px: string,
): Patch[] =>
  Array.from(
    { length: row1 - row0 + 1 },
    (_, i) => [row0 + i, col, px] as const,
  );

export const OVERLAYS: Record<ClassId, readonly Patch[]> = {
  // sword (right), round shield (left), plume tail (behind the helm)
  caballero: [
    [5, 8, "ooaa"],
    [6, 6, "oabbo"],
    [7, 4, "oabbbo"],
    [8, 3, "oabbbo"],
    [9, 3, "obbo"],
    [10, 3, "oo"],
    [5, 28, "o"],
    ...vertical(6, 20, 28, "omo").map(([r, c, p]) => [r, c - 1, p] as const),
    [21, 25, "oyyyyyo"],
    ...vertical(22, 24, 27, "oho"),
    [25, 27, "oyo"],
    // enamel crest on the breastplate
    [18, 15, ".y."],
    [19, 14, "oycyo"],
    [20, 15, ".y."],
    [18, 0, "..ooooooo.."],
    [19, 0, ".oyyyyyyyo."],
    [20, 0, "oyaccaaaayo"],
    [21, 0, "oyaapppaayo"],
    [22, 0, "oyaapppaayo"],
    [23, 0, "oyabbbbbbyo"],
    [24, 0, ".oybbbbbyo."],
    [25, 0, "..oybbbyo.."],
    [26, 0, "...oyyyo..."],
    [27, 0, "....ooo...."],
  ],
  // staff with orb (right)
  mago: [
    [1, 27, "ooo"],
    [2, 26, "occco"],
    [3, 26, "ocwco"],
    [4, 26, "occco"],
    [5, 27, "ooo"],
    ...vertical(6, 30, 27, "oho"),
    [20, 26, "s"],
    [21, 26, "s"],
    // elemental crystal brooch on the chest
    [17, 15, ".y."],
    [18, 14, "oycyo"],
    [19, 15, ".y."],
    // arcane stitches framing the crystal
    [16, 14, "y...y"],
    [20, 14, "y...y"],
  ],
  // dagger up (right), dagger down (left)
  picaro: [
    [11, 29, "o"],
    ...vertical(12, 18, 28, "omo"),
    [19, 27, "oyyyo"],
    ...vertical(20, 21, 28, "oho"),
    [22, 28, "oyo"],
    [20, 27, "s"],
    [21, 27, "s"],
    [12, 1, "oyo"],
    ...vertical(13, 14, 1, "oho"),
    [13, 4, "s"],
    [14, 4, "s"],
    [15, 0, "oyyyo"],
    ...vertical(16, 22, 1, "omo"),
    [23, 2, "o"],
    // jade-and-gold guild pin on the leather vest
    [15, 15, ".y."],
    [16, 14, "oygyo"],
    [17, 15, ".y."],
  ],
  // mace (right) and holy book (left)
  clerigo: [
    [8, 28, "ooo"],
    [9, 27, "oyyyo"],
    [10, 27, "oywyo"],
    [11, 27, "oyyyo"],
    [12, 28, "ooo"],
    ...vertical(13, 26, 28, "oho"),
    [19, 27, "s"],
    [20, 27, "s"],
    [17, 0, ".ooooooo"],
    [18, 0, "oaaayaao"],
    [19, 0, "oaayyyao"],
    [20, 0, "oaaayaao"],
    [21, 0, "oaaayaao"],
    [22, 0, "owwwwwwo"],
    [23, 0, ".oooooo."],
    // small gold-and-element sunburst on the robe
    [16, 15, "..y.."],
    [17, 14, ".ycy."],
    [18, 15, "..y.."],
  ],
};

export const FULL_SPRITES = Object.fromEntries(
  Object.entries(HALF_SPRITES).map(([k, rows]) => {
    const blank = ".".repeat(SPRITE_SIZE);
    const top = SPRITE_SIZE - 1 - rows.length;
    const grid = [...Array(top).fill(blank), ...rows.map(mirror), blank].map(
      (r) => [...r],
    );
    for (const [row, col, px] of OVERLAYS[k as ClassId]) {
      [...px].forEach((ch, i) => {
        if (ch !== ".") grid[row][col + i] = ch;
      });
    }
    return [k, grid.map((r) => r.join(""))];
  }),
) as Record<ClassId, string[]>;
