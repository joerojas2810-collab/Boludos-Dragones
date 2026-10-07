// One-off importer: delivered art (PNG, @1x) -> public/art/*.webp. Usage:
//   node scripts/import-art.mjs "<downloads dir>"   (searches every "Proyecto de Juego*" and "phase_2_*" folder in it)
import sharp from "sharp";
import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2];
if (!base) throw new Error("pass the downloads directory");

// Every folder that may hold a piece of a lot (the Drive download was split in 5).
const roots = [];
for (const d of readdirSync(base)) {
  const p = join(base, d);
  if (!statSync(p).isDirectory()) continue;
  if (d.startsWith("Proyecto de Juego")) roots.push(join(p, "art"));
  if (d.startsWith("phase_2_")) roots.push(base); // standalone lot folder: resolved below
}

// [lot, subdir, output dir, target size]; size null = keep native, number = fit in a square, 0.5 = scale
const JOBS = [
  ["icons", "icons", "icons", 128],
  ["equipment", "icons", "equipment", 128],
  ["equipment", "rank_frames", "frames", 0.5],
  ["ui", "components", "ui", null],
  ["ui", "branding", "ui", null],
];

function dirsFor(lot, sub) {
  const out = [];
  for (const r of roots) {
    for (const c of [join(r, `phase_2_${lot}`, sub), join(r, "art", `phase_2_${lot}`, sub)]) {
      if (existsSync(c)) out.push(c);
    }
  }
  return [...new Set(out)];
}

let total = 0;
for (const [lot, sub, outName, size] of JOBS) {
  const out = join("public", "art", outName);
  mkdirSync(out, { recursive: true });
  const seen = new Set();
  for (const dir of dirsFor(lot, sub)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".png") || f.includes("_2x") || seen.has(f)) continue;
      seen.add(f);
      let img = sharp(join(dir, f));
      const { width, height } = await img.metadata();
      if (typeof size === "number" && size < 1) img = img.resize(Math.round(width * size), Math.round(height * size));
      else if (size) img = img.resize(size, size, { fit: "inside" });
      await img.webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(join(out, f.replace(".png", ".webp")));
      total++;
    }
  }
  console.log(`${lot}/${sub}: ${seen.size}`);
}
console.log("total", total);
