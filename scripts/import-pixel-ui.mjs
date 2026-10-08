// Final native UI PNGs only. Usage: node scripts/import-pixel-ui.mjs "<delivery root>"
import sharp from "sharp";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] && resolve(process.argv[2]);
if (!root) throw new Error("usage: <delivery root>");
const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "ui");
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const entries = manifest.files.filter((entry) => entry.phase === 5);
const expected = readdirSync(join(repo, "public/art/ui")).filter((name) => name.endsWith(".webp")).map((name) => name.replace(/\.webp$/, ".png")).sort();
const actual = entries.map((entry) => entry.file).sort();
if (expected.length !== 130 || actual.length !== 130 || JSON.stringify(expected) !== JSON.stringify(actual)) {
  throw new Error("Phase 5 must contain the exact 130 existing UI filenames");
}
const metadata = [];
// Validate all entries before copying any assets.
for (const entry of entries) {
  if (!/^[a-z0-9_]+\.png$/.test(entry.file) || entry.frames !== 1 || entry.fps !== 0 || entry.loop !== false) throw new Error("Invalid static UI entry: " + entry.file);
  if (!readFileSync(join(source, entry.file)).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Expected PNG bytes: " + entry.file);
  const { data, info } = await sharp(join(source, entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== entry.frame_width || info.height !== entry.frame_height) throw new Error("Manifest dimensions differ: " + entry.file);
  const scrim = entry.file === "modal_scrim.png" && entry.alpha === "uniform_192";
  for (let p = 3; p < data.length; p += 4) {
    if (scrim ? data[p] !== 192 : data[p] !== 0 && data[p] !== 255) throw new Error("Unexpected alpha: " + entry.file);
    if (!data[p] && (data[p - 3] || data[p - 2] || data[p - 1])) throw new Error("Transparent RGB must be zero: " + entry.file);
  }
  const cuts = entry.nine_slice;
  if (cuts && (![cuts.top, cuts.right, cuts.bottom, cuts.left].every((value) => Number.isInteger(value) && value >= 0) || cuts.left + cuts.right >= info.width || cuts.top + cuts.bottom >= info.height)) {
    throw new Error("Invalid 9-slice cuts: " + entry.file);
  }
  metadata.push({ file: entry.file, width: info.width, height: info.height, ...(cuts ? { nine_slice: cuts } : {}) });
}
const target = join(repo, "public/art/ui-px");
mkdirSync(target, { recursive: true });
for (const entry of entries) copyFileSync(join(source, entry.file), join(target, entry.file));
metadata.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(repo, "src/lib/art/pixel-ui.generated.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log({ written: entries.length, registeredUi: metadata.length });
