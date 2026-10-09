// Native pixel effects. Usage: node scripts/import-pixel-effects.mjs "<delivery root>"
import sharp from "sharp";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EFFECTS } from "../src/lib/art/effects.generated.ts";

const root = process.argv[2] && resolve(process.argv[2]);
if (!root) throw new Error("usage: <delivery root>");
const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "effects");
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const entries = manifest.files.filter((entry) => entry.phase === 7);
const expected = ["", "reduced"].flatMap((folder) => readdirSync(join(repo, "public/art/effects", folder)).filter((name) => name.endsWith(".webp")).map((name) => (folder ? folder + "/" : "") + name.replace(/\.webp$/, ".png"))).sort();
if (expected.length !== 142 || entries.length !== 142 || JSON.stringify(expected) !== JSON.stringify(entries.map((entry) => entry.file).sort())) throw new Error("Expected the exact 142 effect filenames");
const metadata = {};
for (const entry of entries) {
  if (!/^(reduced\/)?[a-z0-9_]+\.png$/.test(entry.file)) throw new Error("Invalid filename: " + entry.file);
  const reduced = entry.file.startsWith("reduced/");
  const id = entry.file.replace(/^reduced\//, "").slice(0, -4);
  const reference = EFFECTS[id];
  if (!reference || entry.rows !== reference.rows) throw new Error("Unknown effect or changed atlas rows: " + entry.file);
  if (reduced ? entry.frames !== 1 || entry.fps !== 0 || entry.loop !== false : entry.frames !== reference.frames || entry.fps !== reference.fps || entry.loop !== reference.loop || entry.finish !== reference.finish) throw new Error("Changed effect timing: " + entry.file);
  if (reference.glyphRow && JSON.stringify(entry.glyphRow) !== JSON.stringify(reference.glyphRow)) throw new Error("Changed glyph atlas mapping: " + entry.file);
  if (!Number.isInteger(entry.frame_width) || !Number.isInteger(entry.frame_height) || entry.frame_width < 1 || entry.frame_height < 1) throw new Error("Invalid cell size: " + entry.file);
  if (entry.anchor?.type !== "center" || entry.anchor.x !== entry.frame_width / 2 || entry.anchor.y !== entry.frame_height / 2) throw new Error("Invalid center anchor: " + entry.file);
  if (reduced && (entry.finish !== "hold" || !["static_signal", "static_marker", "suppress_decorative"].includes(entry.reduced_policy))) throw new Error("Invalid reduced lifecycle: " + entry.file);
  if (!readFileSync(join(source, entry.file)).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Expected PNG: " + entry.file);
  const { data, info } = await sharp(join(source, entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== entry.frame_width * entry.frames || info.height !== entry.frame_height * entry.rows) throw new Error("Invalid sheet dimensions: " + entry.file);
  let visible = false;
  const colors = new Set();
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] !== 0 && data[p] !== 255) throw new Error("Non-binary alpha: " + entry.file);
    if (!data[p] && (data[p - 3] || data[p - 2] || data[p - 1])) throw new Error("Transparent RGB must be zero: " + entry.file);
    visible ||= data[p] > 0;
    if (data[p]) colors.add((data[p - 3] << 16) | (data[p - 2] << 8) | data[p - 1]);
  }
  if (colors.size > 96) throw new Error("Palette exceeds 96 colors: " + entry.file);
  const palette = [...colors].map((color) => "#" + color.toString(16).padStart(6, "0").toUpperCase()).sort();
  if (!Array.isArray(entry.palette_hex) || JSON.stringify(entry.palette_hex.map((hex) => hex.toUpperCase()).sort()) !== JSON.stringify(palette)) throw new Error("Palette differs from pixels: " + entry.file);
  if (reduced && entry.reduced_policy === "suppress_decorative" ? visible : !visible) throw new Error("Unexpected empty/suppressed effect: " + entry.file);
  if (reference.glyphRow && (!Number.isInteger(entry.advance) || entry.advance < 1 || entry.advance > entry.frame_width)) throw new Error("Invalid glyph advance: " + entry.file);
  if (!reduced) metadata[id] = { frames: entry.frames, fps: entry.fps, loop: entry.loop, finish: entry.finish, cell: [entry.frame_width, entry.frame_height], rows: entry.rows, label: entry.label ?? id, ...(reference.glyphRow ? { glyphRow: entry.glyphRow, advance: entry.advance } : {}) };
}
for (const entry of entries.filter((entry) => entry.file.startsWith("reduced/"))) {
  const m = metadata[entry.file.slice(8, -4)];
  if (entry.frame_width !== m.cell[0] || entry.frame_height !== m.cell[1]) throw new Error("Reduced cell differs: " + entry.file);
}
const target = join(repo, "public/art/effects-px");
mkdirSync(join(target, "reduced"), { recursive: true });
for (const entry of entries) copyFileSync(join(source, entry.file), join(target, entry.file));
writeFileSync(join(repo, "src/lib/art/pixel-effects.generated.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log({ written: entries.length, effects: Object.keys(metadata).length });
