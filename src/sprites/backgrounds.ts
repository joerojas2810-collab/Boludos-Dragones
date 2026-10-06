// Pixel-art arena scenes. The scene is split in two low-res grids so the
// ground top sits at exactly GROUND_TOP_PCT of any container:
// sky 160x63 (anchored to its bottom) + ground 160x27 (anchored to its top).
export const GROUND_TOP_PCT = 70;
export const SCENE_W = 160;
export const SKY_H = 63;
export const GROUND_H = 27;
export const WORLD_COUNT = 5;

// [x, y, w, h, fill, animated layer?]
export type Rect = readonly [number, number, number, number, string, string?];
export interface Scene {
  sky: Rect[];
  ground: Rect[];
}

// tiny deterministic hash -> [0,1)
const rnd = (i: number, s = 0) => {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(s + 7, 0x85ebca6b);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
};

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (sh: number) =>
    Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

interface Theme {
  bands: string[];
  far: string;
  near: string;
  ground: [string, string, string, string]; // edge, top, mid, bottom
}

const THEMES: Theme[] = [
  {
    bands: ["#0d1f22", "#12302f", "#1a4440", "#26584d", "#3b7160", "#5a8f75"],
    far: "#2c5a4d",
    near: "#17302b",
    ground: ["#5d7a52", "#2f4430", "#243424", "#1a261c"],
  },
  {
    bands: ["#1a0808", "#3a0f0a", "#6b1a0c", "#a3300f", "#d4571a", "#f08a2c"],
    far: "#6a1f10",
    near: "#2a0e0a",
    ground: ["#7a3a22", "#2e1713", "#221010", "#170b0b"],
  },
  {
    bands: ["#4a8be0", "#68a4ea", "#8cbcf0", "#b0d2f2", "#d6e4ee", "#f2e6c8"],
    far: "#c9a07a",
    near: "#a97a52",
    ground: ["#e0c487", "#c9a56a", "#b58f55", "#a07b45"],
  },
  {
    bands: ["#15121a", "#1f1a22", "#2c242b", "#3a2f33", "#4d3d3d", "#665046"],
    far: "#4a3b3b",
    near: "#1c1618",
    ground: ["#6a5848", "#3a3029", "#2e2621", "#241e1a"],
  },
  {
    bands: ["#07060f", "#0f0c1e", "#191530", "#251f40", "#33294f", "#46385e"],
    far: "#2b2447",
    near: "#14102a",
    ground: ["#566394", "#2b2f3d", "#222633", "#1a1d28"],
  },
];

class Canvas {
  out: Rect[] = [];
  constructor(
    private tint: (c: string) => string,
    private seed: number,
  ) {}
  r(x: number, y: number, w: number, h: number, c: string, layer?: string) {
    if (w <= 0 || h <= 0) return;
    this.out.push([x, y, w, h, this.tint(c), layer]);
  }
  n(i: number, s = 0) {
    return rnd(i, s + this.seed);
  }
}

function bands(cv: Canvas, cols: string[]) {
  const bh = Math.ceil(SKY_H / cols.length);
  cols.forEach((c, i) =>
    cv.r(0, i * bh, SCENE_W, Math.min(bh, SKY_H - i * bh), c),
  );
  for (let i = 1; i < cols.length; i++) {
    const y = i * bh;
    for (let x = 0; x < SCENE_W; x += 2) {
      cv.r(x, y - 1, 1, 1, cols[i]);
      cv.r(x + 1, y, 1, 1, cols[i - 1]);
    }
  }
}

// value-noise ridge, calmer behind the fighters (center)
function ridge(
  cv: Canvas,
  fill: string,
  base: number,
  amp: number,
  step: number,
  seed: number,
  mode: "smooth" | "jag" | "mesa",
) {
  let runX = 0;
  let runTop = -1;
  const top = (x: number) => {
    const k = Math.floor(x / step);
    const f = (x % step) / step;
    const a = cv.n(k, seed);
    const b = cv.n(k + 1, seed);
    let v: number;
    if (mode === "mesa") v = a;
    else if (mode === "jag") v = 0.15 + 0.85 * a * (1 - Math.abs(2 * f - 1));
    else v = a + (b - a) * f;
    const calm = 0.25 + 0.75 * Math.min(1, Math.abs(x - 80) / 55);
    return Math.round(base - amp * v * calm);
  };
  for (let x = 0; x <= SCENE_W; x++) {
    const t = x < SCENE_W ? top(x) : -2;
    if (t !== runTop) {
      if (runTop >= 0) cv.r(runX, runTop, x - runX, SKY_H - runTop, fill);
      runX = x;
      runTop = t;
    }
  }
}

// A deterministic stone chamber for Cavernas, drawn entirely with SVG rects.
function dungeonWall(cv: Canvas) {
  for (let row = 0; row < 9; row++) {
    const y = row * 7;
    let x = row % 2 ? 5 : 0;
    let col = 0;
    while (x < SCENE_W) {
      const width = 8 + Math.floor(cv.n(row * 20 + col, 32) * 7);
      const stone = ["#342b30", "#3a2f33", "#403438", "#30272c"][
        Math.floor(cv.n(row * 20 + col, 33) * 4)
      ];
      const visibleWidth = Math.min(width, SCENE_W - x);
      cv.r(x, y, visibleWidth, 6, stone);
      cv.r(x + 1, y, Math.max(1, visibleWidth - 3), 1, "#4d3d3d");
      x += width + 1;
      col++;
    }
  }

  // Deep arched gate centered behind the fighters, with chunky stone blocks.
  cv.r(76, 31, 8, 2, "#57464a");
  cv.r(73, 33, 14, 2, "#514147");
  cv.r(71, 35, 18, 2, "#514147");
  cv.r(70, 37, 20, 3, "#57464a");
  cv.r(72, 40, 16, 23, "#151116");
  cv.r(73, 40, 1, 23, "#6a5848");
  cv.r(86, 40, 1, 23, "#30262b");
  cv.r(76, 41, 1, 21, "#514147");
  cv.r(80, 41, 1, 21, "#514147");
  cv.r(84, 41, 1, 21, "#514147");
  cv.r(72, 47, 16, 1, "#30262b");
  cv.r(72, 55, 16, 1, "#30262b");
  cv.r(79, 49, 2, 3, "#b77926"); // small gate latch

  // Wall torches with warm cores, like the reference arena.
  for (const x of [8, 147]) {
    cv.r(x, 35, 4, 13, "#171216");
    cv.r(x + 1, 36, 2, 10, "#6b4423");
    cv.r(x - 2, 47, 8, 2, "#514147");
    cv.r(x - 1, 31, 6, 2, "#514147");
    cv.r(x, 27, 4, 5, "#ff6a1a", "flame");
    cv.r(x + 1, 25, 2, 4, "#ffd24d", "flame");
    cv.r(x + 1, 28, 1, 1, "#fff1b0", "flame");
  }

  // Small skull reliefs on the wall, kept dim so sprites stay readable.
  for (const x of [48, 107]) {
    cv.r(x + 1, 46, 5, 4, "#8b796c");
    cv.r(x, 47, 7, 2, "#8b796c");
    cv.r(x + 2, 47, 1, 1, "#21191e");
    cv.r(x + 5, 47, 1, 1, "#21191e");
    cv.r(x + 2, 50, 3, 1, "#6a5848");
  }
}

function sky(w: number, boss: boolean): Rect[] {
  const th = THEMES[w];
  const tint = (c: string) =>
    boss ? mix(mix(c, "#000000", 0.35), "#7a0a1c", 0.28) : c;
  const cv = new Canvas(tint, w * 31);
  bands(cv, th.bands);

  if (w === 0) {
    // swamp: pale moon, ridge, dead trees, mushrooms, fog
    cv.r(118, 8, 9, 9, "#c8e6d0");
    cv.r(120, 7, 5, 1, "#c8e6d0");
    cv.r(120, 17, 5, 1, "#c8e6d0");
    cv.r(121, 10, 2, 2, "#9fc4ae");
    ridge(cv, th.far, 52, 18, 9, 1, "smooth");
    for (const [x, h] of [
      [10, 30],
      [30, 20],
      [132, 26],
      [150, 34],
    ] as const) {
      cv.r(x, SKY_H - h, 2, h, th.near);
      cv.r(x - 3, SKY_H - h + 4, 3, 1, th.near);
      cv.r(x - 4, SKY_H - h + 2, 1, 3, th.near);
      cv.r(x + 2, SKY_H - h + 8, 4, 1, th.near);
      cv.r(x + 5, SKY_H - h + 6, 1, 3, th.near);
      cv.r(x - 1, SKY_H - h - 2, 1, 2, th.near);
    }
    ridge(cv, th.near, 62, 10, 7, 2, "smooth");
    for (const x of [22, 44, 118, 140]) {
      cv.r(x, 57, 2, 5, "#9fb89a");
      cv.r(x - 2, 55, 6, 2, "#5de0b0", "twinkle");
      cv.r(x - 1, 54, 4, 1, "#9ff5d0", "twinkle");
    }
    for (let i = 0; i < 4; i++)
      cv.r(-20 + i * 55, 36 + i * 6, 70, 3, "#8fb5a8", i % 2 ? "fog" : "fog2");
  } else if (w === 1) {
    cv.r(70, 40, 24, 12, "#ffb347"); // low sun
    cv.r(74, 38, 16, 2, "#ffb347");
    ridge(cv, th.far, 56, 34, 6, 3, "jag");
    ridge(cv, th.near, 63, 24, 5, 4, "jag");
    for (const x of [8, 20, 138, 150]) {
      cv.r(x, 50, 1, 13, "#ff7a1a");
      cv.r(x + 1, 55, 1, 8, "#ff4d12");
    }
    for (let i = 0; i < 14; i++)
      cv.r(
        Math.floor(cv.n(i, 9) * 155),
        20 + Math.floor(cv.n(i, 10) * 40),
        1,
        1,
        i % 3 ? "#ffa94d" : "#fff1b0",
        i % 2 ? "ember" : "ember2",
      );
  } else if (w === 2) {
    cv.r(30, 8, 8, 8, "#fff7d6");
    cv.r(32, 6, 4, 12, "#fff7d6");
    cv.r(28, 10, 12, 4, "#fff7d6");
    for (const [x, y, l] of [
      [90, 14, 18],
      [110, 24, 24],
      [20, 30, 14],
      [128, 36, 16],
    ] as const)
      cv.r(x, y, l, 1, "#ffffff", "wind");
    ridge(cv, th.far, 54, 24, 14, 5, "mesa");
    ridge(cv, th.near, 63, 20, 11, 6, "mesa");
  } else if (w === 3) {
    dungeonWall(cv);
    // Stalactites break the wall silhouette without crowding the arena center.
    for (let i = 0; i < 16; i++) {
      const x = i * 10 + Math.floor(cv.n(i, 3) * 6);
      const l =
        6 + Math.floor(cv.n(i, 4) * 14) * (Math.abs(x - 80) > 40 ? 1 : 0.4);
      for (let d = 0; d < l; d += 2)
        cv.r(
          x + Math.floor(d / 4),
          d,
          Math.max(1, 5 - Math.floor(d / 3)),
          2,
          th.near,
        );
    }
    for (const [x, h, c] of [
      [12, 14, "#7ad1ff"],
      [26, 9, "#b48cff"],
      [136, 16, "#b48cff"],
      [148, 10, "#7ad1ff"],
      [52, 6, "#7ad1ff"],
      [112, 7, "#b48cff"],
    ] as const)
      for (let d = 0; d < h; d++)
        cv.r(
          x - Math.min(d, h - d, 3) + 1,
          SKY_H - d - 1,
          Math.min(d, h - d, 3) * 2 || 1,
          1,
          c,
          d === h - 1 ? "twinkle" : undefined,
        );
  } else {
    // storm: cloud blobs, bolts, rain
    for (let i = 0; i < 9; i++) {
      const x = i * 20 - 6;
      const y = 4 + Math.floor(cv.n(i, 1) * 14);
      cv.r(x, y, 26, 8, "#1c1733");
      cv.r(x + 4, y - 3, 16, 3, "#1c1733");
      cv.r(x + 2, y + 8, 22, 3, "#2a2347");
    }
    ridge(cv, th.far, 58, 14, 10, 9, "smooth");
    ridge(cv, th.near, 63, 8, 8, 10, "smooth");
    for (const [x, ph] of [
      [24, "bolt"],
      [130, "bolt2"],
    ] as const) {
      const pts = [
        [0, 14],
        [3, 20],
        [-2, 26],
        [2, 34],
        [-1, 42],
      ];
      pts.forEach(([dx, y], i) =>
        cv.r(x + dx, y, 2, (pts[i + 1]?.[1] ?? 50) - y + 1, "#fff6a8", ph),
      );
    }
    for (let i = 0; i < 40; i++)
      cv.r(
        Math.floor(cv.n(i, 20) * 160),
        Math.floor(cv.n(i, 21) * 58),
        1,
        3,
        "#8aa0d8",
        i % 2 ? "rain" : "rain2",
      );
  }

  if (boss) {
    for (const x of [5, 143]) {
      cv.r(x, 30, 12, 33, "#3a2a33");
      cv.r(x, 30, 2, 33, "#5a4552");
      cv.r(x + 10, 30, 2, 33, "#241821");
      cv.r(x - 2, 28, 16, 3, "#4a3642");
      cv.r(x + 3, 38, 6, 2, "#ff3b2e");
      cv.r(x + 5, 44, 2, 5, "#ff3b2e");
      cv.r(x + 1, 22, 10, 6, "#241821"); // brazier bowl
      cv.r(x + 3, 14, 6, 8, "#ff6a1a", "flame");
      cv.r(x + 4, 11, 4, 6, "#ffd24d", "flame");
    }
  }
  return cv.out;
}

function ground(w: number, boss: boolean): Rect[] {
  const th = THEMES[w];
  const tint = (c: string) =>
    boss ? mix(mix(c, "#000000", 0.35), "#7a0a1c", 0.28) : c;
  const cv = new Canvas(tint, w * 17 + 5);
  const [edge, top, mid, bot] = th.ground;
  cv.r(0, 0, SCENE_W, 1, edge);
  cv.r(0, 1, SCENE_W, 8, top);
  cv.r(0, 9, SCENE_W, 9, mid);
  cv.r(0, 18, SCENE_W, 9, bot);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(cv.n(i, 1) * 158);
    const y = 2 + Math.floor(cv.n(i, 2) * 24);
    const c = y < 9 ? mid : y < 18 ? top : mid;
    cv.r(x, y, 2 + Math.floor(cv.n(i, 3) * 3), 1, c);
  }
  if (w === 3) {
    // Staggered stone floor joints and top-edge glints.
    for (let row = 0; row < 3; row++) {
      const y = 8 + row * 9;
      const offset = row % 2 ? 10 : 0;
      cv.r(0, y, SCENE_W, 1, "#1a1418");
      if (y + 1 < GROUND_H)
        for (let x = offset; x < SCENE_W; x += 20) {
          const remaining = GROUND_H - (y + 1);
          cv.r(x, y + 1, 1, Math.min(7, remaining), "#1a1418");
          cv.r(x + 1, y + 1, Math.min(6, remaining), 1, "#514147");
        }
    }
  }
  if (w === 0)
    for (const x of [14, 60, 104, 138]) {
      cv.r(x, 4, 14, 2, "#3f7f7c");
      cv.r(x + 2, 4, 6, 1, "#7fc4bc");
    }
  if (w === 1)
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 26;
      cv.r(x, 3, 3, 1, "#ff7a1a", "lava");
      cv.r(x + 3, 4, 3, 1, "#ff7a1a", "lava");
      cv.r(x + 5, 5, 2, 2, "#ffd24d", "lava");
    }
  if (w === 2)
    for (let i = 0; i < 8; i++) cv.r(6 + i * 20, 6 + (i % 3) * 7, 10, 1, edge);
  if (w === 3)
    for (let i = 0; i < 10; i++) {
      const x = 5 + i * 16;
      cv.r(x, 5 + (i % 3) * 6, 4, 2, edge);
      cv.r(x, 7 + (i % 3) * 6, 4, 1, bot);
    }
  if (w === 4)
    for (const x of [10, 52, 100, 140]) {
      cv.r(x, 4, 16, 2, "#3a4a7a");
      cv.r(x + 3, 4, 8, 1, "#8aa0d8");
    }
  if (boss) {
    for (let i = 0; i < 5; i++) {
      const x = 22 + i * 26;
      cv.r(x, 1, 1, 6, "#ff3b2e");
      cv.r(x + 1, 6, 3, 1, "#ff3b2e");
      cv.r(x + 4, 7, 1, 8, "#ff3b2e");
      cv.r(x + 4, 14, 4, 1, "#ff3b2e");
    }
    for (let i = 0; i < 4; i++) {
      const x = 36 + i * 30;
      cv.r(x, 16, 7, 7, "#3a0a14");
      cv.r(x + 3, 17, 1, 5, "#7a1626");
      cv.r(x + 1, 19, 5, 1, "#7a1626");
    }
    cv.r(0, 0, 14, 3, "#4a3642");
    cv.r(146, 0, 14, 3, "#4a3642");
  }
  return cv.out;
}

export function buildScene(world: number, boss = false): Scene {
  const w = ((world % WORLD_COUNT) + WORLD_COUNT) % WORLD_COUNT;
  return { sky: sky(w, boss), ground: ground(w, boss) };
}
