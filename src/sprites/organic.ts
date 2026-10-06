// Procedural, deliberately asymmetric 32x32 enemies (Gólem and Espectro).
// Deterministic (no RNG): shapes come from noisy ellipses and fixed sine
// strata, so the output is always the same grid.
// o outline/cracks, a/b/c element main/dark/light, y gold, w white, r red, g moss
export const ORGANIC_SIZE = 32;
type G = string[][];

const blank = (): G =>
  Array.from({ length: ORGANIC_SIZE }, () =>
    Array<string>(ORGANIC_SIZE).fill("."),
  );
const hash = (x: number, y: number) => {
  let h = (Math.imul(x + 31, 374761393) ^ Math.imul(y + 17, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) % 100;
};
const inside = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < ORGANIC_SIZE && y < ORGANIC_SIZE;
const put = (g: G, x: number, y: number, ch: string) => {
  if (inside(x, y)) g[y][x] = ch;
};
const stamp = (g: G, x0: number, y0: number, rows: readonly string[]) =>
  rows.forEach((r, k) =>
    [...r].forEach((ch, i) => ch !== "." && put(g, x0 + i, y0 + k, ch)),
  );

function outline(g: G): string[] {
  const out = g.map((r) => [...r]);
  g.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch !== ".") return;
      const near = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => (g[ny]?.[nx] ?? ".") !== ".");
      if (near) out[y][x] = "o";
    }),
  );
  return out.map((r) => r.join(""));
}

// Golem silhouette: [row, [left, right][]] spans. Gaps between spans become
// dark seams (joints); jittered per row so the rock edges stay irregular.
type Span = readonly [number, number];
const GOLEM_ROWS: readonly (readonly Span[])[] = [
  /* 3 */ [[14, 17]],
  /* 4 */ [[12, 19]],
  /* 5 */ [[11, 20]],
  /* 6 */ [[11, 20]],
  /* 7 */ [[11, 20]],
  /* 8 */ [[12, 19]],
  /* 9 */ [
    [5, 12],
    [13, 18],
    [20, 27],
  ],
  /* 10 */ [[3, 28]],
  /* 11 */ [[2, 29]],
  /* 12 */ [[2, 29]],
  /* 13 */ [[2, 29]],
  /* 14 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 15 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 16 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 17 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 18 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 19 */ [
    [2, 8],
    [11, 20],
    [23, 29],
  ],
  /* 20 */ [
    [1, 8],
    [11, 20],
    [23, 30],
  ],
  /* 21 */ [
    [1, 8],
    [11, 20],
    [23, 30],
  ],
  /* 22 */ [
    [0, 8],
    [11, 20],
    [24, 31],
  ],
  /* 23 */ [
    [0, 8],
    [11, 20],
    [24, 31],
  ],
  /* 24 */ [
    [0, 8],
    [10, 15],
    [17, 22],
    [24, 31],
  ],
  /* 25 */ [
    [1, 7],
    [9, 15],
    [17, 23],
    [24, 31],
  ],
  /* 26 */ [
    [1, 7],
    [9, 15],
    [17, 23],
    [25, 30],
  ],
  /* 27 */ [
    [9, 15],
    [17, 24],
    [25, 29],
  ],
  /* 28 */ [
    [8, 15],
    [17, 25],
  ],
  /* 29 */ [
    [7, 15],
    [17, 26],
  ],
  /* 30 */ [
    [7, 15],
    [17, 26],
  ],
];

function golem(boss: boolean): string[] {
  const g = blank();
  GOLEM_ROWS.forEach((spans, i) => {
    const y = i + 3;
    const grow = boss && y >= 9 && y <= 13 ? 1 : 0;
    spans.forEach(([l0, r0], k) => {
      // jitter outer ends only on the outside of the figure (y < 27)
      const jl = y < 27 ? (hash(y, k * 7) % 3) - 1 : 0;
      const jr = y < 27 ? (hash(y + 9, k * 5) % 3) - 1 : 0;
      for (let x = l0 + jl - grow; x <= r0 + jr + grow; x++) {
        const cell = hash(x >> 2, y >> 2);
        put(g, x, y, cell < 9 ? "b" : cell < 17 ? "c" : "a");
      }
    });
  });
  // moss: left shoulder, head, right fist, left foot
  const moss: [number, number, string][] = [
    [5, 9, "gggggg"],
    [4, 10, "ggg.gg"],
    [13, 3, "gg"],
    [12, 4, "g"],
    [24, 22, "ggg"],
    [27, 23, "g"],
    [7, 29, "gg"],
    [8, 28, "g"],
  ];
  for (const [x, y, px] of moss) stamp(g, x, y, [px]);
  // dark cracks radiating from the core
  const cracks: [number, number][] = [
    [13, 17],
    [12, 18],
    [11, 19],
    [19, 13],
    [20, 12],
    [21, 12],
    [18, 19],
    [17, 20],
    [26, 17],
    [25, 18],
  ];
  for (const [x, y] of cracks) if (g[y][x] !== ".") g[y][x] = "o";
  // crystals on the right shoulder, one on the left arm
  stamp(g, 24, 2, ["w", "c", "cb", "cb", "cb", "cb"]);
  stamp(g, 21, 5, ["w", "c", "cb", "cb"]);
  stamp(g, 27, 6, ["w", "cb", "cb"]);
  stamp(g, 3, 6, ["w", "cb", "cb"]);
  if (boss) {
    stamp(g, 6, 3, ["w", "c", "cb", "cb"]);
    stamp(g, 13, 0, ["w", "c", "cb"]);
    stamp(g, 18, 1, ["w", "cb", "cb"]);
    stamp(g, 29, 5, ["w", "cb"]);
  }
  // face: heavy brow, glowing eyes
  const eye = boss ? "r" : "y";
  stamp(g, 13, 5, ["oo..oo"]);
  stamp(g, 13, 6, [`${eye}${eye}..${eye}${eye}`]);
  // glowing core (cracks light up on the boss)
  stamp(g, 15, 15, [".y.", "ywy", ".y."]);
  stamp(g, 13, 14, ["y"]);
  stamp(g, 19, 17, ["y"]);
  if (boss) {
    stamp(g, 13, 18, ["y.y"]);
    stamp(g, 16, 19, ["y"]);
    stamp(g, 12, 16, ["y"]);
  }
  return outline(g);
}

// Ghost: pointed hood, shoulders, long S-shaped tapered tail that fades out.
function ghost(boss: boolean): string[] {
  const g = blank();
  const top = boss ? 3 : 4;
  for (let y = top; y <= 30; y++) {
    const t = y - top;
    let w: number;
    let c = 16;
    if (t < 9)
      w = 2 + t * 1.5; // hood cone
    else if (t < 13)
      w = 15 + (t - 9) * 0.5; // shoulders
    else {
      const u = (t - 13) / (30 - top - 13);
      w = 16 * (1 - u) ** 1.3 + 1.2; // tail
      c = 16 + Math.round(5 * Math.sin(u * 5) * u);
    }
    const wob = ((hash(y, 3) % 3) - 1) * (t > 13 ? 1 : 0);
    const l = Math.round(c - w / 2 + wob);
    const r = Math.round(c + w / 2 + wob * 0.5);
    for (let x = l; x <= r; x++) {
      // torn, fading hem: dither the last rows of the tail
      if (y > 24 && (x + y) % 2 === 1 && hash(x, y) < 70) continue;
      put(g, x, y, y > 20 ? "b" : x - l < 2 ? "c" : "a");
    }
  }
  // hollow eye sockets with a glowing pupil
  const ey = top + 8;
  stamp(g, 11, ey, ["ooo", "oyo", "ooo"]);
  stamp(g, 18, ey, ["ooo", "oyo", "ooo"]);
  stamp(g, 16, ey + 1, ["o"]);
  // shadowed hood opening above the eyes
  stamp(g, 12, ey - 2, ["bbbbbbbb"]);
  // skeletal arms: left hangs, right reaches with claws
  stamp(g, 4, 17, ["wwww", "w..w", "w..."]);
  stamp(g, 3, 16, ["w"]);
  stamp(g, 24, 15, ["wwwwwww", ".....ww", "......w"]);
  stamp(g, 29, 13, ["w", "w"]);
  stamp(g, 31, 14, ["w"]);
  // trailing wisps
  stamp(g, 25, 24, ["c", "c"]);
  stamp(g, 6, 27, ["c", ".c"]);
  if (boss) {
    stamp(g, 12, 0, ["y.y.y"]);
    stamp(g, 11, 1, ["yyyyyyy"]);
    stamp(g, 5, 7, ["oco", "oco"]);
    stamp(g, 26, 6, ["oco", "oco"]);
    stamp(g, 4, 22, ["wwwwwww", ".wcc..."]);
  }
  return outline(g);
}

export const ORGANIC_SPRITES = {
  golem: { normal: golem(false), boss: golem(true) },
  espectro: { normal: ghost(false), boss: ghost(true) },
};
