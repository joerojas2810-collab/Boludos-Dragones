// Native desktop pixel backgrounds. Usage: node scripts/import-pixel-backgrounds.mjs "<delivery root>" [--partial]
import sharp from "sharp";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] && resolve(process.argv[2]);
const partial = process.argv.includes("--partial");
if (!root) throw new Error("usage: <delivery root>");
const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "backgrounds");
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const entries = manifest.files.filter((entry) => entry.phase === 6);
const expected = readdirSync(join(repo, "public/art/backgrounds")).filter((name) => name.endsWith(".webp") && name.includes("_desktop_")).map((name) => name.replace(/\.webp$/, ".png")).sort();
const names = entries.map((entry) => entry.file).sort();
if (expected.length !== 96 || new Set(names).size !== names.length || names.some((name) => !expected.includes(name))) throw new Error("Unknown or duplicate desktop background filenames");
if (!partial && (entries.length !== 96 || JSON.stringify(expected) !== JSON.stringify(names))) throw new Error("Expected the exact 96 desktop background filenames");
if (partial) {
  const partialExpected = expected.filter((name) => !name.endsWith("_composite.png") || name === "menu_desktop_composite.png");
  if (entries.length !== 91 || JSON.stringify(partialExpected) !== JSON.stringify(names)) throw new Error("Partial delivery must contain all 90 combat layers and the menu composite");
}
const factors = { sky: 0, far: 0.12, mid: 0.28, ground: 0, foreground: 0.5, composite: 0 };
const metadata = [];
const sceneSizes = new Map();
for (const entry of entries) {
  const parts = entry.file.match(/^([a-z0-9_]+)_desktop_(sky|far|mid|ground|foreground|composite)\.png$/);
  // Existing deliveries remain importable while combat scenes move to native HD.
  const expectedSize = entry.frame_width === 960 ? [960, 540] : [320, 180];
  if (!parts || entry.frames !== 1 || entry.fps !== 0 || entry.loop !== false || entry.frame_width !== expectedSize[0] || entry.frame_height !== expectedSize[1]) throw new Error("Invalid native static background: " + entry.file);
  const [, scene, layer] = parts;
  if (entry.scene !== scene || entry.layer !== layer || entry.parallax !== factors[layer]) throw new Error("Invalid scene/layer/parallax metadata: " + entry.file);
  if (sceneSizes.has(scene) && sceneSizes.get(scene) !== entry.frame_width) throw new Error("All layers must share their scene's native dimensions: " + entry.file);
  sceneSizes.set(scene, entry.frame_width);
  if (entry.anchor?.type !== "center" || entry.anchor.x !== expectedSize[0] / 2 || entry.anchor.y !== expectedSize[1] / 2) throw new Error("Invalid background center anchor: " + entry.file);
  if (!readFileSync(join(source, entry.file)).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Expected PNG: " + entry.file);
  const { data, info } = await sharp(join(source, entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== expectedSize[0] || info.height !== expectedSize[1]) throw new Error("Unexpected dimensions: " + entry.file);
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] !== 0 && data[p] !== 255) throw new Error("Non-binary alpha: " + entry.file);
    if ((layer === "sky" || layer === "composite") && data[p] !== 255) throw new Error("Sky/composite must be opaque: " + entry.file);
    if (!data[p] && (data[p - 3] || data[p - 2] || data[p - 1])) throw new Error("Transparent RGB must be zero: " + entry.file);
  }
  metadata.push({ file: entry.file, width: info.width, height: info.height, scene, layer, parallax: entry.parallax });
}
const target = join(repo, "public/art/backgrounds-px");
mkdirSync(target, { recursive: true });
for (const entry of entries) copyFileSync(join(source, entry.file), join(target, entry.file));
metadata.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(repo, "src/lib/art/pixel-backgrounds.generated.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log({ partial, written: entries.length, scenes: new Set(metadata.map((entry) => entry.scene)).size });
