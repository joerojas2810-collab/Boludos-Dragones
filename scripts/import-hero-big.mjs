// Hi-res idle frame 0 of every hero (+ trait accessory) for large static displays (hub).
// Usage: node scripts/import-hero-big.mjs "<downloads dir>"  -> public/art/heroes/big/
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { finder } from "./lib/art-sources.mjs";

const find = finder(process.argv[2], "heroes");
const OUT = "public/art/heroes/big";
const SIZE = 640;
mkdirSync(OUT, { recursive: true });

// Frame 0 of a 768px-cell horizontal sheet, reduced to SIZE.
const frame0 = (src, out) =>
  sharp(src).extract({ left: 0, top: 0, width: 768, height: 768 }).resize(SIZE, SIZE).webp({ quality: 88, alphaQuality: 100 }).toFile(out);

const classes = ["knight", "mage", "rogue", "cleric"];
const elements = ["fire", "water", "earth", "lightning", "wind"];
let n = 0;
for (const c of classes) {
  for (const e of elements) {
    const f = find(`heroes/hero_${c}_${e}_idle.png`);
    if (f) { await frame0(f, `${OUT}/${c}_${e}.webp`); n++; }
  }
}
// Accessories: every trait layer found for idle.
const { readdirSync } = await import("node:fs");
const { lotRoots } = await import("./lib/art-sources.mjs");
const seen = new Set();
for (const root of lotRoots(process.argv[2], "heroes")) {
  let files = [];
  try { files = readdirSync(`${root}/accessory_layers`); } catch { continue; }
  for (const f of files) {
    const m = f.match(/^hero_(\w+?)_trait_(.+)_idle\.png$/);
    if (!m || seen.has(f)) continue;
    seen.add(f);
    await frame0(`${root}/accessory_layers/${f}`, `${OUT}/acc_${m[1]}_${m[2]}.webp`);
    n++;
  }
}
console.log("big hero files:", n);
