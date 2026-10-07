// One-off importer for "pedido de arte 2": ranks, card frames, ascensions, logos (PNG) -> public/art/*.webp. Usage:
//   node scripts/import-art2.mjs "<pedido_arte_2 dir>"
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const src = process.argv[2];
if (!src) throw new Error("pass the pedido_arte_2 directory");
const RANKS = ["f", "e", "d", "c", "b", "a", "s", "ss", "ssr"];
// [source name, output path, width] (height keeps the aspect ratio). logo_emblem_flat and logo_mono are not used.
const JOBS = [
  ...RANKS.map((r) => [`rank_${r}`, `icons/icon_rank_${r}`, 128]),
  ...RANKS.map((r) => [`frame_${r}`, `frames/card_${r}`, 384]),
  ...[0, 1, 2, 3, 4, 5].map((n) => [`asc_${n}`, `icons/icon_asc_${n}`, 128]),
  ["asc_max_star", "icons/icon_asc_max_star", 64],
  ["logo_emblem", "ui/logo_emblem", 512],
  ["logo_wordmark", "ui/logo_wordmark", 1024],
  ["logo_primary", "ui/logo_primary", 1024],
  ["logo_stacked", "ui/logo_stacked", 512],
];
for (const [name, out, w] of JOBS) {
  const dest = join("public", "art", `${out}.webp`);
  mkdirSync(join(dest, ".."), { recursive: true });
  await sharp(join(src, `${name}.png`)).resize({ width: w }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(dest);
}
console.log("imported", JOBS.length);
