// Enemy sprites (32x32). Same language as classes.ts: each row is the LEFT half
// (16 px, col 15 = center axis), mirrored to the right; OVERLAYS add asymmetric
// patches [row, col, pixels] in final 32x32 coordinates.
// Bottom-aligned with a 1px margin.
// o outline, a/b/c element main/dark/light, m/n metal, y gold, r red, w white
import type { EnemyFamily } from "../lib/game/worlds";
import { ORGANIC_SPRITES } from "./organic";

export const ENEMY_SIZE = 32;
const HALF = ENEMY_SIZE / 2;

type Patch = readonly [row: number, col: number, px: string];
interface EnemyArt {
  half: readonly string[];
  overlays: readonly Patch[];
}

const art = (half: readonly string[], overlays: readonly Patch[] = []) => ({
  half,
  overlays,
});

const mirror = (r: string) => {
  const left = r.padStart(HALF, ".");
  return left + [...left].reverse().join("");
};

// golem and espectro are procedural (organic.ts)
export const ENEMY_ART: Record<
  Exclude<EnemyFamily, "golem" | "espectro">,
  { normal: EnemyArt; boss: EnemyArt }
> = {
  limo: {
    normal: art([
      //0123456789abcdef
      "........oooooooo",
      "......ooaaaaaaaa",
      "....ooaccaaaaaaa",
      "...oaaccaaaaaaaa",
      "..oaacaaaaaaaaaa",
      "..oaaaabbbbbaaaa",
      ".oaaaaaoooooaaaa",
      ".oaaaaowwwoooaaa",
      ".oaaaaowwwoooaaa",
      ".oaaaaaoooooaaaa",
      ".oaaaaaaaaaaaaaa",
      ".oaaaooooooooooo",
      ".oaaaowowowowowo",
      ".oaaaooooooooooo",
      ".oabbbbbbbbbbbbb",
      ".oabbbbbbbbbbbbb",
      ".oobbbbbbbbbbbbb",
      "..oooooooooooooo",
    ]),
    boss: art([
      //0123456789abcdef
      ".........y..y..y",
      ".........yy.yy.y",
      "........oyyyyyyy",
      "........oyyyryyr",
      "........oooooooo",
      "......ooaaaaaaaa",
      "....ooaccaaaaaaa",
      "..ooaaccaaaaaaaa",
      ".oaaaccaaaaaaaaa",
      ".oaaacaaaaaaaooo",
      "oaaaaaaaaaaaaowr",
      "oaaaooooooaaaooo",
      "oaaowwwwrroaaaaa",
      "oaaowwwwrroaaaaa",
      "oaaaooooooaaaaaa",
      "oaaaaaaaaaaaaaaa",
      "oaaooooooooooooo",
      "oaaowowowowowowo",
      "oaaoowoowoowoowo",
      "oaaooooooooooooo",
      "oabbbbbbbbbbbbbb",
      "oabbbcbbbbbbbbbb",
      "oabbbbbbbbbbbbbb",
      "oabbbbbbbbbbbbbb",
      "oobbbbbbbbbbbbbb",
      ".ooooooooooooooo",
    ]),
  },
  diablillo: {
    normal: art(
      [
        //0123456789abcdef
        "....oo..........",
        "....oao.........",
        ".....oao........",
        ".....oaao.......",
        "......oaaooooooo",
        ".....oaaaaaaaaaa",
        ".....oaaaaaaaaac",
        "..o..oaabbbbbbaa",
        "..oo.oaaayyoaaaa",
        "..oaooaaayyoaaaa",
        "...oooaaaaaaaaaa",
        ".....oaaaaoooooo",
        ".....oaaaaowowow",
        ".....ooaaaoooooo",
        "......oooooooooo",
        "........obbaaaaa",
        "........obaaaaaa",
        "........obaaaccc",
        "........obaaaccc",
        "........obbaaaaa",
        "........oooooooo",
        "........oaaaaoo.",
        "........oaaaaoo.",
        "........oaaaaoo.",
        "......ooabbbbbo.",
        "......ooooooooo.",
      ],
      [
        // left arm
        [15, 5, "oaao"],
        [16, 5, "oaao"],
        [17, 5, "oaao"],
        [18, 5, "oooo"],
        // tail with spade tip
        [18, 3, "o"],
        [19, 2, "oao"],
        [20, 1, "oaaao"],
        [21, 2, "oao"],
        [22, 2, "obo"],
        [23, 2, "obooooo"],
        [24, 2, "obbbbb"],
        [25, 2, "oooooo"],
        // right arm + trident
        [4, 26, "o.o.o"],
        [5, 25, "omomomo"],
        [6, 25, "ommmmmo"],
        [7, 27, "ooo"],
        ...Array.from({ length: 19 }, (_, i): Patch => [8 + i, 27, "oho"]),
        [21, 24, "ooooo"],
        [22, 24, "aaaaa"],
        [23, 24, "ooooo"],
      ],
    ),
    boss: art(
      [
        //0123456789abcdef
        ".o..............",
        ".oo.............",
        ".oao............",
        "..oao...........",
        "..oaao..........",
        "...oaao.........",
        "...oaaaooooooooo",
        "..oaaaaaaaaaaacc",
        "..oaaaaaaaaaaaaa",
        ".ooaaabbbbbbbbaa",
        ".oaaaaaoyyyyoaaa",
        ".oaaaaaoyrrroaaa",
        ".oaaaaaooooooaaa",
        ".oaaaaaaaaaaaaaa",
        ".oaaaaaaoooooooo",
        ".oaaaaaaowowowow",
        ".oaaaaaaoooooooo",
        "..oooooooooooooo",
        "..o...oooooooooo",
        ".oao.ooaaaaaaaaa",
        ".oaaaooaabaaaaaa",
        ".oabaooaaaaaaccc",
        ".ooboobaaaaacccc",
        "......ooabaaaacc",
        "......ooaaaaaaaa",
        "......ooobbbbbbb",
        ".......ooooooooo",
        "........oaaaaoo.",
        "........oaaaaoo.",
        ".......ooooooooo",
      ],
      [
        // flame-tipped tail
        [19, 3, "o"],
        [20, 2, "oyo"],
        [21, 1, "oyyro"],
        [22, 2, "orro"],
        [23, 2, "obo"],
        [24, 2, "obo"],
        [25, 2, "obo"],
        [26, 2, "oboooo"],
        [27, 2, "obbbbb"],
        [28, 2, "oooooo"],
        // fireball in hand
        [20, 25, "ooooo"],
        [21, 24, "oryyro"],
        [22, 23, "orrryyro"],
        [23, 24, "oryyro"],
        [24, 25, "ooooo"],
        [19, 27, "y"],
      ],
    ),
  },
  arpia: {
    normal: art([
      //0123456789abcdef
      "..............oo",
      "............ooaa",
      "o.........oaacaa",
      "oo........oaaaaa",
      "oao.......oassss",
      "oaao......oayyos",
      "obaao.....oassyy",
      "obbaao....oassyy",
      "obbbaao...oaasoo",
      "obbbbaao...ooooo",
      "obbbbbaao.oaaaaa",
      "obbbbbbbaoaaaaaa",
      "obbbbbbbboacacac",
      "obbbbbbbboaacaca",
      "obbobbobboacacac",
      "occoccoccobaaaaa",
      "oo.oo.oo.obbbaaa",
      "........oobbbbbb",
      ".........obbbbbb",
      "...........oyyo.",
      "...........oyyo.",
      "........oyyyyyo.",
      "........ooooooo.",
    ]),
    boss: art([
      //0123456789abcdef
      "o...............",
      "oo..............",
      "oao........y.y.y",
      "oaao......oyyyyy",
      "obaao.....oyyryy",
      "obbaao....oaaaaa",
      "obbbaao...oassss",
      "obbbbaao..oarros",
      "obbbbbaao.oarros",
      "obbbbbbaa.oassyy",
      "obbbbbbbb.oaasoo",
      "obbbbbbbb..ooooo",
      "obbbbbbbbommmmmm",
      "obbbbbbbbommmnmm",
      "obbbbbbbbomnmmyy",
      "obbbbbbbbommmnmm",
      "obbbbbbbbomnmmyy",
      "obbobbobbommmmmm",
      "occoccoccobnnnnn",
      "oo.oo.oo.obbbbbb",
      "........oobbbbbb",
      ".........obbbbbb",
      "...........oyyo.",
      "...........oyyo.",
      "...........oyyo.",
      "........oyyyyyo.",
      "........ooooooo.",
    ]),
  },
};

function build({ half, overlays }: EnemyArt): string[] {
  const blank = ".".repeat(ENEMY_SIZE);
  const top = ENEMY_SIZE - 1 - half.length;
  const grid = [...Array(top).fill(blank), ...half.map(mirror), blank].map(
    (r) => [...r],
  );
  for (const [row, col, px] of overlays) {
    [...px].forEach((ch, i) => {
      if (ch !== ".") grid[row][col + i] = ch;
    });
  }
  return grid.map((r) => r.join(""));
}

export const ENEMY_SPRITES = {
  ...(Object.fromEntries(
    Object.entries(ENEMY_ART).map(([k, v]) => [
      k,
      { normal: build(v.normal), boss: build(v.boss) },
    ]),
  ) as Record<
    Exclude<EnemyFamily, "golem" | "espectro">,
    { normal: string[]; boss: string[] }
  >),
  ...ORGANIC_SPRITES,
} satisfies Record<EnemyFamily, { normal: string[]; boss: string[] }>;
