// Weapon sprites (32x32): 9 weapon types x 5 elements, all vertical.
// Swords: one blade profile per element.
// Built from per-element blade profiles so length, width and shape differ.
// o outline, a/b/c element main/dark/light, m/n metal, h grip, p pommel gem
// (p is coloured by rarity in WeaponSprite).
import type { Element } from "../lib/game/elements";
import type { WeaponType } from "../lib/game/weapons";

export const WEAPON_SIZE = 32;
const GUARD_Y = 23; // first guard row; blade ends at GUARD_Y - 1

interface Profile {
  top: number; // tip row
  width: (i: number) => number; // i = rows below the tip
  shift: (i: number) => number; // horizontal offset per row
  guard: readonly string[]; // 2 rows, centred, 'n'/'m' metal
}

const taper = (full: number) => (i: number) => Math.min(full, 2 + 2 * i);

export const WEAPON_PROFILES: Record<Element, Profile> = {
  fuego: {
    top: 3,
    width: (i) => (i === 0 ? 2 : 4),
    shift: (i) => [0, 1, 1, 0, -1, -1][i % 6],
    guard: ["n..............n", "nmmmmmmmmmmmmmmn"],
  },
  agua: {
    top: 1,
    width: (i) => (i > 18 ? 4 : 2),
    shift: () => 0,
    guard: ["..nnnnnnnnnnnn..", ".nmmmmmmmmmmmmn."],
  },
  tierra: {
    top: 9,
    width: taper(8),
    shift: () => 0,
    guard: ["nnnnnnnnnnnnnnnn", "nmmmmmmmmmmmmmmn"],
  },
  rayo: {
    top: 4,
    width: (i) => (i === 0 ? 2 : 4),
    shift: (i) => (Math.floor(i / 3) % 2) * 2,
    guard: ["nn............nn", ".nmmmmmmmmmmmmn."],
  },
  viento: {
    top: 3,
    width: (i) => (i === 0 ? 2 : i > 17 ? 4 : 3),
    shift: (i) => Math.round(3 * (1 - i / 20) ** 2),
    guard: ["..n...........nn.", "..nmmmmmmmmmmmn."],
  },
};

type Grid = string[][];
const blank = (): Grid =>
  Array.from({ length: WEAPON_SIZE }, () =>
    Array<string>(WEAPON_SIZE).fill("."),
  );
const put = (g: Grid, x: number, y: number, ch: string) => {
  if (g[y]?.[x] !== undefined) g[y][x] = ch;
};
const stamp = (g: Grid, x0: number, y0: number, rows: readonly string[]) =>
  rows.forEach((r, k) =>
    [...r].forEach((ch, i) => ch !== "." && put(g, x0 + i, y0 + k, ch)),
  );
// 2px-wide vertical shaft at cols 15-16
const shaft = (g: Grid, y0: number, y1: number, ch = "h") => {
  for (let y = y0; y < y1; y++) {
    put(g, 15, y, ch);
    put(g, 16, y, ch);
  }
};
const gem = (g: Grid, y: number) => {
  // A cut, rarity-coloured pommel stone with a tiny fixed white glint.
  put(g, 15, y, "p");
  put(g, 14, y + 1, "p");
  put(g, 15, y + 1, "w");
  put(g, 16, y + 1, "p");
  put(g, 15, y + 2, "p");
};

// Gold ferrules and leather highlights make the grip read as a crafted handle.
const gripDetails = (g: Grid, rows: readonly number[]) => {
  for (const y of rows) {
    put(g, 14, y, "y");
    put(g, 17, y, "y");
  }
};

// 1px outline around every filled pixel
function outline(g: Grid): string[] {
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

function buildSword(element: Element): string[] {
  const g = blank();
  const p = WEAPON_PROFILES[element];
  for (let y = p.top; y < GUARD_Y; y++) {
    const i = y - p.top;
    const w = p.width(i);
    const l = 15 - Math.floor((w - 1) / 2) + p.shift(i);
    for (let x = l; x < l + w; x++)
      g[y][x] =
        x === l
          ? "c"
          : x === l + w - 1
            ? "b"
            : x === l + 1 && w >= 4 && i % 4 === 0
              ? "w"
              : "a";
  }
  // guard: 16 px centred
  p.guard.forEach((row, k) =>
    [...row.padEnd(16, ".")].forEach((ch, x) => {
      if (ch !== ".") g[GUARD_Y + k][8 + x] = ch;
    }),
  );
  shaft(g, GUARD_Y + 2, 29);
  gripDetails(g, [26, 28]);
  gem(g, 29);
  return outline(g);
}

// Axe: head extends left of the shaft by ext[row] px (rows 3..14); double-bit
// axes mirror it to the right, single-bit ones get a metal back spike.
const AXE: Record<Element, { ext: readonly number[]; double: boolean }> = {
  fuego: { ext: [3, 6, 9, 7, 11, 8, 11, 8, 9, 6, 4, 2], double: false },
  agua: { ext: [2, 4, 6, 7, 8, 8, 8, 8, 7, 6, 4, 2], double: true },
  tierra: { ext: [4, 8, 10, 11, 11, 11, 11, 11, 10, 8, 6, 3], double: false },
  rayo: { ext: [3, 7, 4, 9, 5, 10, 5, 9, 4, 7, 3, 2], double: true },
  viento: { ext: [1, 3, 5, 6, 7, 7, 7, 6, 5, 4, 2, 1], double: true },
};
function buildAxe(element: Element): string[] {
  const g = blank();
  const { ext, double } = AXE[element];
  shaft(g, 2, 29);
  gripDetails(g, [23, 26]);
  ext.forEach((e, k) => {
    const y = 3 + k;
    for (const side of double ? [-1, 1] : [-1]) {
      for (let d = 1; d <= e; d++) {
        const x = side < 0 ? 15 - d : 16 + d;
        put(
          g,
          x,
          y,
          d === e ? "c" : d === e - 2 && k % 3 === 0 ? "w" : d <= 2 ? "b" : "a",
        );
      }
    }
    put(g, 15, y, "m");
    put(g, 16, y, "n");
  });
  if (!double) stamp(g, 17, 5, ["mm", "mmm", "nmm", "nnm", "nn"]);
  put(g, 15, 2, "m");
  put(g, 16, 2, "n");
  put(g, 15, 15, "n");
  put(g, 16, 15, "n");
  gem(g, 29);
  return outline(g);
}

// Spear head widths (even, centred) from the tip down.
const SPEAR: Record<Element, readonly number[]> = {
  fuego: [2, 2, 4, 4, 6, 4, 6, 6, 4, 4],
  agua: [2, 4, 6, 6, 8, 8, 6, 6, 4, 2],
  tierra: [2, 2, 4, 4, 6, 6, 8, 8, 10, 10],
  rayo: [2, 4, 2, 6, 4, 8, 6, 10, 4, 2],
  viento: [2, 2, 2, 4, 4, 4, 4, 6, 4, 2],
};
function buildSpear(element: Element): string[] {
  const g = blank();
  const head = SPEAR[element].flatMap((w, k) => (k % 3 === 2 ? [w, w] : [w]));
  head.forEach((w, k) => {
    const l = 16 - w / 2;
    for (let x = l; x < l + w; x++)
      put(
        g,
        x,
        1 + k,
        x === l
          ? "c"
          : x === l + w - 1
            ? "b"
            : x === l + 1 && k % 4 === 1
              ? "w"
              : "a",
      );
  });
  const cy = 1 + head.length;
  if (element === "viento")
    stamp(g, 9, cy, ["n..............n", "nnmmmmmmmmmmnnn"]);
  else stamp(g, 12, cy, ["nmmmmmmm", ".nnnnnn"]);
  shaft(g, cy + 2, 29);
  gripDetails(g, [cy + 8, cy + 12]);
  for (const y of [cy + 7, cy + 13]) {
    put(g, 15, y, "b");
    put(g, 16, y, "b");
  }
  stamp(g, 14, cy + 2, ["bb", "bb"]); // tassel
  gem(g, 29);
  return outline(g);
}

// Bow: bulging left, string on the right, arrow nocked across the grip.
function buildBow(element: Element): string[] {
  const g = blank();
  const thick = element === "tierra" ? 3 : 2;
  for (let y = 2; y <= 29; y++) {
    const t = (y - 15.5) / 13.5;
    let x = 22 - Math.round(10 * (1 - t * t));
    if (element === "rayo" && (y < 9 || y > 22)) x += y % 4 < 2 ? 0 : 1;
    if (element === "fuego" && (y < 7 || y > 24)) x += y % 3 === 0 ? 1 : 0;
    for (let k = 0; k < thick; k++)
      put(g, x + k, y, k === 0 ? "c" : k === thick - 1 ? "b" : "a");
  }
  if (element === "viento") for (const y of [1, 30]) stamp(g, 22, y, ["cc"]);
  for (let y = 3; y <= 28; y++) put(g, 24, y, "w");
  for (let y = 13; y <= 18; y++) stamp(g, 11, y, ["hhh"]);
  stamp(g, 11, 13, ["yhy", "hhh", "hhh", "yhy"]);
  // arrow: shaft, head, fletching
  for (let x = 12; x <= 28; x++) {
    put(g, x, 15, "m");
    put(g, x, 16, "n");
  }
  stamp(g, 27, 13, ["m", "mm", "mmm", "mmmm"]);
  stamp(g, 27, 18, ["mmmm", "mmm", "mm", "m"]);
  stamp(g, 12, 13, ["cc", "ccc"]);
  stamp(g, 12, 17, ["ccc", "cc"]);
  put(g, 12, 15, "p");
  put(g, 12, 16, "p");
  put(g, 12, 14, "p");
  put(g, 12, 17, "p");
  return outline(g);
}

// Staff: orb/crystal head with element-specific adornments.
function buildStaff(element: Element): string[] {
  const g = blank();
  const cx = 15.5;
  const cy = 9;
  const inside = (x: number, y: number) => {
    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);
    return element === "tierra" ? dx + dy <= 7 : dx * dx + dy * dy <= 28;
  };
  for (let y = 0; y < 18; y++)
    for (let x = 6; x < 26; x++) {
      if (!inside(x, y)) continue;
      const light = x + y < cx + cy - 2;
      const dark = x + y > cx + cy + 2;
      put(g, x, y, light ? "c" : dark ? "b" : "a");
    }
  if (element === "agua") stamp(g, 14, 1, ["cb", "ab"]);
  if (element === "fuego") {
    stamp(g, 11, 2, ["a", "aa", "ca"]);
    stamp(g, 20, 2, ["a", "aa", "ac"]);
    stamp(g, 15, 1, ["cb"]);
    stamp(g, 14, 8, ["yy", "yy"]);
  }
  if (element === "rayo") {
    stamp(g, 8, 6, ["c", "cc", ".cc", "..c"]);
    stamp(g, 23, 6, ["..c", ".cc", "cc", "c"]);
    stamp(g, 14, 8, ["ww", "ww"]);
  }
  if (element === "viento") {
    stamp(g, 14, 5, ["ww", "w"]);
    stamp(g, 8, 11, ["cccc"]);
    stamp(g, 20, 4, ["cccc"]);
  }
  if (element === "tierra") stamp(g, 14, 6, ["ww", "w"]);
  // claws + collar + shaft
  stamp(g, 11, 14, ["n", "nn"]);
  stamp(g, 20, 14, ["n", "nn"]);
  stamp(g, 12, 16, ["nmmmmmmm", ".nnnnnn"]);
  shaft(g, 18, 29);
  gripDetails(g, [23, 27]);
  for (const y of [22, 26]) {
    put(g, 15, y, "b");
    put(g, 16, y, "b");
  }
  gem(g, 29);
  return outline(g);
}

// Dagger: short curved blade (profile like the sword but half the length).
interface Blade {
  w: (i: number) => number;
  s: (i: number) => number;
}
const BLADE: Record<Element, Blade> = {
  fuego: { w: (i) => (i < 2 ? 2 : 4), s: (i) => [2, 1, 0, -1, 0, 1][i % 6] },
  agua: {
    w: (i) => (i < 2 ? 2 : 4),
    s: (i) => Math.round(5 * (1 - i / 15) ** 2),
  },
  tierra: {
    w: (i) => Math.min(6, 2 + i),
    s: (i) => Math.round(2 * (1 - i / 14)),
  },
  rayo: { w: (i) => (i < 2 ? 2 : 4), s: (i) => (i % 4 < 2 ? 0 : 2) },
  viento: {
    w: (i) => (i < 3 ? 2 : 3),
    s: (i) => Math.round(6 * (1 - i / 15) ** 2),
  },
};
function buildDagger(element: Element): string[] {
  const g = blank();
  const b = BLADE[element];
  const top = 9;
  for (let y = top; y < 23; y++) {
    const i = y - top;
    const w = b.w(i);
    const l = 15 - Math.floor((w - 1) / 2) + b.s(i);
    for (let x = l; x < l + w; x++)
      put(
        g,
        x,
        y,
        x === l
          ? "c"
          : x === l + w - 1
            ? "b"
            : x === l + 1 && w >= 4 && i % 4 === 1
              ? "w"
              : "a",
      );
  }
  stamp(g, 11, 23, ["nmmmmmmmmm", ".nnnnnnnn"]);
  shaft(g, 25, 28);
  put(g, 14, 28, "h");
  put(g, 17, 28, "h");
  gripDetails(g, [26]);
  gem(g, 28);
  return outline(g);
}

// Mace: spiked flanged head; element changes the flange count and spikes.
const MACE: Record<Element, readonly number[]> = {
  fuego: [2, 6, 8, 8, 6, 8, 6, 2],
  agua: [4, 6, 8, 8, 8, 8, 6, 4],
  tierra: [6, 10, 10, 10, 10, 10, 10, 6],
  rayo: [2, 8, 4, 8, 4, 8, 4, 2],
  viento: [2, 4, 6, 8, 8, 6, 4, 2],
};
function buildMace(element: Element): string[] {
  const g = blank();
  MACE[element].forEach((w, k) => {
    const y = 3 + k * 2;
    for (const yy of [y, y + 1])
      for (let x = 16 - w / 2; x < 16 + w / 2; x++)
        put(
          g,
          x,
          yy,
          x < 16 - w / 2 + 2 ? "c" : x >= 16 + w / 2 - 2 ? "b" : "a",
        );
  });
  if (element === "fuego" || element === "rayo")
    for (const x of [9, 22]) stamp(g, x, 10, ["n", "nn", "n"]);
  stamp(g, 12, 19, ["nmmmmmmm", ".nnnnnn"]);
  shaft(g, 21, 29);
  gripDetails(g, [23, 26]);
  gem(g, 29);
  return outline(g);
}

// Wand: thin shaft, star tip; element picks the tip shape.
const WAND_TIP: Record<Element, readonly string[]> = {
  fuego: ["..cc..", ".caac.", "caaaab", ".abba.", "..bb.."],
  agua: ["..cc..", ".caab.", ".caab.", ".caab.", "..bb.."],
  tierra: ["cccccc", "caaaab", "caaaab", "caaaab", "bbbbbb"],
  rayo: ["c...cc", ".c.cc.", "..cc..", ".cc.c.", "cc...b"],
  viento: ["cc....", ".ccc..", "..aaab", "...abb", "....bb"],
};
function buildWand(element: Element): string[] {
  const g = blank();
  stamp(g, 13, 6, WAND_TIP[element]);
  if (element !== "tierra") put(g, 15, 8, "w");
  for (let y = 11; y < 29; y++) put(g, 15 + (y % 2), y, y < 21 ? "h" : "h");
  for (const y of [12, 20]) {
    put(g, 14, y, "y");
    put(g, 17, y, "y");
  }
  stamp(g, 13, 21, ["nmmn", ".nn."]);
  gem(g, 29);
  return outline(g);
}

// Tome: closed book with an element-coloured cover, metal corners and clasp.
function buildTome(element: Element): string[] {
  const g = blank();
  for (let y = 5; y < 27; y++)
    for (let x = 8; x < 24; x++)
      put(g, x, y, x < 10 ? "b" : y < 7 ? "c" : y > 24 ? "b" : "a");
  for (let y = 7; y < 25; y++) put(g, 23, y, "w"); // page edge
  for (const [x, y] of [
    [8, 5],
    [21, 5],
    [8, 24],
    [21, 24],
  ])
    stamp(g, x, y, ["nn", "nm"]);
  stamp(
    g,
    13,
    11,
    element === "tierra"
      ? ["cccc", "caab", "cbbb"]
      : ["..c.", ".cac", "cabb", ".bb."],
  );
  put(g, 15, 18, "p");
  put(g, 14, 19, "p");
  put(g, 16, 19, "p");
  put(g, 15, 19, "w");
  put(g, 15, 20, "p");
  stamp(g, 10, 22, ["yyyy"]);
  if (element === "fuego") stamp(g, 13, 8, ["c", "ca"]);
  if (element === "rayo") stamp(g, 18, 9, ["c", "cc", ".c"]);
  if (element === "viento") stamp(g, 17, 22, ["cccc"]);
  return outline(g);
}

// ---- gear (one sprite per slot; the element shows in trim and an ornament) ----
const ORNAMENT: Record<Element, readonly string[]> = {
  fuego: ["..c..", "c.a.c", ".aba."],
  agua: [".ccc.", "caaab", ".bbb."],
  tierra: ["c.c.c", "aaaaa", "bbbbb"],
  rayo: ["..cc.", ".cc..", "cc..."],
  viento: ["cc...", ".ccc.", "...cc"],
};
const ornament = (g: Grid, e: Element, x: number, y: number) =>
  stamp(g, x, y, ORNAMENT[e]);
const shade = (x: number, y: number, cx: number, cy: number) =>
  x + y < cx + cy - 3 ? "m" : x + y > cx + cy + 3 ? "n" : "m";

function buildHelm(e: Element): string[] {
  const g = blank();
  for (let y = 6; y <= 24; y++)
    for (let x = 5; x <= 26; x++) {
      const dx = (x - 15.5) / 10.5;
      const dy = (y - 15) / 9;
      if (
        y <= 20
          ? dx * dx + dy * dy <= 1
          : Math.abs(dx) <= 0.62 - (y - 20) * 0.05
      )
        put(g, x, y, shade(x, y, 15, 15));
    }
  for (let x = 6; x <= 25; x++) put(g, x, 14, "a");
  for (let y = 16; y <= 18; y++)
    for (let x = 10; x <= 21; x++) put(g, x, y, "b");
  for (let y = 20; y <= 24; y++) put(g, 15 + (y % 2), y, "n");
  stamp(g, 14, 9, ["p", "pp"]);
  ornament(g, e, 13, 2);
  return outline(g);
}

function buildChest(e: Element): string[] {
  const g = blank();
  for (let y = 5; y <= 27; y++) {
    const half = y < 11 ? 11 : Math.max(6, 11 - Math.floor((y - 11) / 3));
    for (let x = 16 - half; x < 16 + half; x++)
      put(g, x, y, shade(x, y, 15, 16));
  }
  stamp(g, 4, 5, ["mmmm", "mmmmm", "nmmm"]);
  stamp(g, 24, 5, ["mmmm", "mmmmm", "nmmm"]);
  for (let y = 9; y <= 24; y++)
    for (let x = 12; x <= 19; x++)
      put(g, x, y, x < 14 ? "c" : x > 17 ? "b" : "a");
  for (let x = 8; x <= 23; x++) put(g, x, 26, "y");
  stamp(g, 14, 13, ["p", "pp", "p"]);
  ornament(g, e, 13, 20);
  return outline(g);
}

function buildGreaves(e: Element): string[] {
  const g = blank();
  for (const x0 of [7, 17]) {
    for (let y = 4; y <= 28; y++)
      for (let x = x0; x < x0 + 8; x++)
        put(g, x, y, y > 24 ? "n" : x < x0 + 2 ? "m" : x > x0 + 5 ? "n" : "m");
    for (let x = x0; x < x0 + 8; x++) put(g, x, 12, "a");
    stamp(g, x0 + 2, 13, ["cc", "ab", "bb"]);
  }
  for (let x = 7; x < 25; x++) put(g, x, 4, "y");
  stamp(g, 15, 4, ["pp"]);
  ornament(g, e, 4, 18);
  return outline(g);
}

function buildBoot(e: Element): string[] {
  const g = blank();
  for (let y = 5; y <= 19; y++)
    for (let x = 9; x <= 18; x++)
      put(g, x, y, x < 11 ? "h" : x > 16 ? "n" : "h");
  for (let y = 19; y <= 25; y++)
    for (let x = 9; x <= 28 - (y - 19); x++) put(g, x, y, y === 25 ? "n" : "h");
  for (let x = 8; x <= 22; x++) put(g, x, 26, "n");
  for (let x = 9; x <= 18; x++) put(g, x, 7, "a");
  stamp(g, 11, 8, ["cc", "ab"]);
  stamp(g, 13, 20, ["pp", "p"]);
  stamp(g, 9, 5, ["yyyyyyyyyy"]);
  ornament(g, e, 20, 12);
  return outline(g);
}

function buildAmulet(e: Element): string[] {
  const g = blank();
  for (let x = 5; x <= 26; x++) {
    const t = (x - 15.5) / 10.5;
    const y = 4 + Math.round(13 * t * t);
    put(g, x, y, x % 3 === 0 ? "m" : "n");
    put(g, x, y + 1, "m");
  }
  stamp(g, 12, 19, [
    "..aaaa..",
    ".caaaab.",
    "caapaabb",
    "caappabb",
    ".cabbbb.",
    "..bbbb..",
  ]);
  put(g, 14, 18, "y");
  put(g, 17, 18, "y");
  ornament(g, e, 13, 26);
  return outline(g);
}

export const WEAPON_TYPES = [
  "espada",
  "hacha",
  "lanza",
  "arco",
  "baston",
  "daga",
  "maza",
  "varita",
  "libro",
  "casco",
  "peto",
  "piernas",
  "zapatos",
  "collar",
] as const satisfies readonly WeaponType[];

const BUILDERS: Record<WeaponType, (e: Element) => string[]> = {
  espada: buildSword,
  hacha: buildAxe,
  lanza: buildSpear,
  arco: buildBow,
  baston: buildStaff,
  daga: buildDagger,
  maza: buildMace,
  varita: buildWand,
  libro: buildTome,
  casco: buildHelm,
  peto: buildChest,
  piernas: buildGreaves,
  zapatos: buildBoot,
  collar: buildAmulet,
};
const ELEMENTS = Object.keys(WEAPON_PROFILES) as Element[];

export const WEAPON_SPRITES_BY_TYPE = Object.fromEntries(
  WEAPON_TYPES.map((t) => [
    t,
    Object.fromEntries(ELEMENTS.map((e) => [e, BUILDERS[t](e)])),
  ]),
) as unknown as Record<WeaponType, Record<Element, readonly string[]>>;

// Backward compatible: swords by element.
export const WEAPON_SPRITES = WEAPON_SPRITES_BY_TYPE.espada;
