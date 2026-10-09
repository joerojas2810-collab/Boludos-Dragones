import type { ClassId } from "@/lib/game/characters";
import type { TraitId } from "@/lib/game/traits";
import { SPRITE_SIZE } from "./classes";

// [row, col, pixels] like the OVERLAYS in classes.ts; offsets may be negative.
type Patch = readonly [number, number, string];
type Anchor =
  | "tl" // crown, left
  | "tr" // crown, right
  | "sl" // floating, left of head
  | "sr" // floating, right of head
  | "eL"
  | "eR" // eye cells
  | "band" // forehead row, col 10
  | "neck"
  | "shL"
  | "shR"
  | "chest"
  | "bl"
  | "br" // torso, left/right
  | "belt"
  | "foot"
  | "ml" // floating, mid-height left of head
  | "mr" // floating, mid-height right of head
  | "ck" // cheek / forehead patch
  | "tmp" // temple (anger vein)
  | "wL"
  | "wR" // boot sides (wings)
  | "pL"
  | "pR"; // ground dust puffs

type Pos = readonly [number, number];
const ANCHORS_BASE: Record<Exclude<ClassId, "berserker">, Record<Anchor, Pos>> = {
  caballero: {
    tl: [7, 9],
    tr: [7, 22],
    sl: [1, 0],
    sr: [1, 23],
    eL: [12, 13],
    eR: [12, 18],
    band: [11, 10],
    neck: [14, 11],
    shL: [15, 4],
    shR: [15, 22],
    chest: [20, 14],
    bl: [19, 9],
    br: [19, 17],
    belt: [24, 10],
    foot: [31, 9],
    ml: [10, 0],
    mr: [12, 24],
    ck: [8, 9],
    tmp: [7, 19],
    wL: [27, 4],
    wR: [27, 24],
    pL: [27, 0],
    pR: [27, 26],
  },
  mago: {
    tl: [10, 7],
    tr: [10, 24],
    sl: [5, 3],
    sr: [5, 22],
    eL: [13, 13],
    eR: [13, 18],
    band: [12, 10],
    neck: [15, 11],
    shL: [16, 5],
    shR: [16, 22],
    chest: [19, 14],
    bl: [21, 6],
    br: [21, 20],
    belt: [23, 10],
    foot: [31, 9],
    ml: [12, 1],
    mr: [11, 24],
    ck: [12, 8],
    tmp: [12, 20],
    wL: [27, 0],
    wR: [28, 28],
    pL: [27, 0],
    pR: [27, 26],
  },
  picaro: {
    tl: [6, 10],
    tr: [6, 21],
    sl: [2, 3],
    sr: [2, 24],
    eL: [10, 13],
    eR: [10, 18],
    band: [9, 10],
    neck: [11, 11],
    shL: [13, 5],
    shR: [13, 22],
    chest: [16, 14],
    bl: [15, 8],
    br: [15, 18],
    belt: [19, 10],
    foot: [31, 9],
    ml: [6, 2],
    mr: [8, 25],
    ck: [5, 11],
    tmp: [7, 18],
    wL: [27, 4],
    wR: [27, 24],
    pL: [27, 0],
    pR: [27, 26],
  },
  clerigo: {
    tl: [5, 10],
    tr: [5, 21],
    sl: [3, 3],
    sr: [1, 23],
    eL: [9, 13],
    eR: [9, 18],
    band: [8, 10],
    neck: [12, 11],
    shL: [13, 4],
    shR: [13, 23],
    chest: [20, 14],
    bl: [20, 5],
    br: [20, 22],
    belt: [19, 10],
    foot: [31, 9],
    ml: [9, 2],
    mr: [12, 24],
    ck: [10, 10],
    tmp: [10, 20],
    wL: [27, 0],
    wR: [27, 28],
    pL: [27, 0],
    pR: [27, 26],
  },
};
// ponytail: provisional, the Berserker reuses the Knight anchors.
const ANCHORS: Record<ClassId, Record<Anchor, Pos>> = { ...ANCHORS_BASE, berserker: ANCHORS_BASE.caballero };

const pad = [
  [0, 0, ".hhh."],
  [1, 0, "hhhhh"],
  [2, 0, ".hhh."],
] as const;

export const ACCESSORIES: Record<
  TraitId,
  readonly { at: Anchor; px: readonly Patch[] }[]
> = {
  // horns on the crown
  terco: [
    {
      at: "tl",
      px: [
        [0, 0, "w"],
        [-1, 0, "w"],
        [-2, -1, "w"],
        [-3, -1, "w"],
      ],
    },
    {
      at: "tr",
      px: [
        [0, 0, "w"],
        [-1, 0, "w"],
        [-2, 1, "w"],
        [-3, 1, "w"],
      ],
    },
  ],
  sediento: [
    {
      at: "br",
      px: [
        [0, 0, "yrrry"],
        [1, 1, "yyy"],
        [2, 2, "y"],
        [3, 1, "yyy"],
      ],
    },
  ],
  // rain cloud tethered to the head, with lightning
  gafe: [
    {
      at: "sr",
      px: [
        [0, 1, "mmm"],
        [1, 0, "mmmmm"],
        [2, 0, "nnnnn"],
        [3, 3, "y"],
        [4, 2, "y"],
        [5, 3, "y"],
        [3, -1, "n"],
        [4, -2, "n"],
      ],
    },
  ],
  // winged boots
  veloz: [
    {
      at: "wL",
      px: [
        [0, 0, "ww.."],
        [1, 0, "wcw."],
        [2, 1, ".wcc"],
      ],
    },
    {
      at: "wR",
      px: [
        [0, 0, "..ww"],
        [1, 0, ".wcw"],
        [2, 0, "ccw."],
      ],
    },
  ],
  // red glowing eyes + anger vein on the temple
  furioso: [
    {
      at: "eL",
      px: [
        [0, 0, "r"],
        [1, 0, "r"],
      ],
    },
    {
      at: "eR",
      px: [
        [0, 0, "r"],
        [1, 0, "r"],
      ],
    },
    {
      at: "tmp",
      px: [
        [0, 0, "r.r"],
        [1, 0, ".r."],
        [2, 0, "r.r"],
      ],
    },
  ],
  // four-leaf clover tied to the head
  afortunado: [
    {
      at: "ml",
      px: [
        [0, 0, "gg.gg"],
        [1, 0, "ggygg"],
        [2, 0, "gg.gg"],
        [3, 2, "g"],
        [4, 3, "g"],
        [5, 4, "n"],
      ],
    },
  ],
  // leather shoulder pads
  robusto: [
    { at: "shL", px: pad },
    { at: "shR", px: pad },
  ],
  // sweat drop stuck to the head
  cobarde: [
    {
      at: "sl",
      px: [
        [0, 2, "q"],
        [1, 1, "qqq"],
        [2, 0, "qqwqq"],
        [3, 0, "qqqqq"],
        [4, 1, "qqq"],
        [5, 4, "n"],
      ],
    },
  ],
  // golden monocle with chain
  certero: [
    {
      at: "eR",
      px: [
        [-1, -1, "yyy"],
        [0, -1, "y"],
        [0, 1, "y"],
        [1, -1, "yyy"],
        [2, 2, "y"],
        [3, 2, "y"],
      ],
    },
  ],
  // small floating drumstick
  glotón: [
    {
      at: "ml",
      px: [
        [0, 2, "..wwww"],
        [1, 1, ".wdddo"],
        [2, 0, "oddddo"],
        [3, 0, ".odddo"],
        [4, 0, "..ooo."],
        [2, 1, "..y"],
      ],
    },
  ],
  // bright bandage with a red center mark
  fragil: [
    {
      at: "ck",
      px: [
        [0, 0, ".ooo."],
        [1, 0, "okkk."],
        [2, 0, "okrro"],
        [3, 0, ".kkko"],
        [4, 0, ".ooo."],
        [2, 2, "w"],
      ],
    },
  ],
  // gold-rimmed chest badge
  blindado: [
    {
      at: "chest",
      px: [
        [0, 0, "yyyy"],
        [1, 0, "ynny"],
        [2, 1, "yy"],
      ],
    },
  ],
  // short elemental speed streaks at the feet
  escurridizo: [
    {
      at: "pL",
      px: [
        [0, 0, "..wcc"],
        [1, 0, ".ccccc"],
        [2, 0, "cc.."],
      ],
    },
    {
      at: "pR",
      px: [
        [0, 0, "ccw.."],
        [1, 0, "ccccc"],
        [2, 0, "..cc"],
      ],
    },
  ],
  // slashing scar with drops
  sanguinario: [
    {
      at: "eR",
      px: [
        [-2, 3, "r"],
        [-1, 2, "r"],
        [0, 1, "r"],
        [1, 0, "r"],
        [2, -1, "r"],
        [3, -1, "r"],
        [5, -1, "r"],
      ],
    },
  ],
  // hourglass hung beside the head
  paciente: [
    {
      at: "mr",
      px: [
        [0, 0, "yyy"],
        [1, 0, "www"],
        [2, 1, "w"],
        [3, 0, "www"],
        [4, 0, "yyy"],
        [-1, 1, "n"],
      ],
    },
  ],
  // compact lit bomb worn at the hip
  temerario: [
    {
      at: "br",
      px: [
        [0, 2, "y"],
        [1, 1, "yyy"],
        [2, 0, "onnno"],
        [3, 0, "onyyo"],
        [4, 0, "onnno"],
        [5, 1, ".ooo."],
      ],
    },
  ],
  // wide belt with gold buckle
  fornido: [
    {
      at: "belt",
      px: [
        [0, 0, "hhhhhyyhhhhh"],
        [1, 0, "hhhhhyyhhhhh"],
      ],
    },
  ],
  // scarf
  cauteloso: [
    {
      at: "neck",
      px: [
        [0, 0, "cccccccccc"],
        [1, 8, "cc"],
        [2, 8, "cc"],
      ],
    },
  ],
  // headband
  tenaz: [{ at: "band", px: [[0, 0, "cccccccccccc"]] }],
  // glowing eye gem
  lucido: [
    {
      at: "eL",
      px: [
        [-1, 0, "c"],
        [0, -1, "cwc"],
        [1, 0, "c"],
      ],
    },
  ],
  // red die floating beside the head
  filoAzar: [
    {
      at: "sr",
      px: [
        [0, 0, "wwwww"],
        [1, 0, "wrwrw"],
        [2, 0, "wwrww"],
        [3, 0, "wrwrw"],
        [4, 0, "wwwww"],
      ],
    },
  ],
  // small red heart on the chest
  ultimoAliento: [
    {
      at: "chest",
      px: [
        [0, 0, "rr.rr"],
        [1, 0, "rrrrr"],
        [2, 1, "rrr"],
        [3, 2, "r"],
      ],
    },
  ],
  // spikes on both shoulders
  espinas: [
    {
      at: "shL",
      px: [
        [-1, 0, "m"],
        [0, 0, "mm"],
      ],
    },
    {
      at: "shR",
      px: [
        [-1, 0, "m"],
        [0, 0, "mm"],
      ],
    },
  ],
  // gold coin on the cheek
  apostador: [
    {
      at: "ck",
      px: [
        [0, 0, "yyy"],
        [1, 0, "yoy"],
        [2, 0, "yyy"],
      ],
    },
  ],
};

export function accessoryPatches(trait: TraitId, classId: ClassId): Patch[] {
  return ACCESSORIES[trait].flatMap(({ at, px }) => {
    const [r, c] = ANCHORS[classId][at];
    return px.map(([dr, dc, s]) => [r + dr, c + dc, s] as const);
  });
}

// Returns a copy of the grid with the traits' accessories drawn on top.
export function applyAccessories(
  grid: readonly string[],
  classId: ClassId,
  traits: readonly TraitId[],
): string[] {
  const out = grid.map((r) => [...r]);
  for (const t of traits)
    for (const [row, col, px] of accessoryPatches(t, classId))
      [...px].forEach((ch, i) => {
        if (
          ch !== "." &&
          row >= 0 &&
          row < SPRITE_SIZE &&
          col + i >= 0 &&
          col + i < SPRITE_SIZE
        )
          out[row][col + i] = ch;
      });
  return out.map((r) => r.join(""));
}
