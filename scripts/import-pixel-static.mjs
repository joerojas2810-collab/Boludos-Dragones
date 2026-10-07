// Native pixel inventory/system icons and card frames; never resize the delivered PNGs.
// Usage: node scripts/import-pixel-static.mjs "<delivery root>" [items|icons|all]
import sharp from "sharp";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] && resolve(process.argv[2]);
const mode = process.argv[3] || "all";
if (!root || !["items", "icons", "all"].includes(mode)) throw new Error("usage: <delivery root> [items|icons|all]");
const repo = fileURLToPath(new URL("../", import.meta.url));
const ramps = JSON.parse(readFileSync(join(repo, "src/lib/art/pixel-palettes.json"), "utf8"));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const key = (r, g, b) => (r << 16) | (g << 8) | b;
const jobs = mode === "icons" ? [["icons", "icons-px"]] :
  [["weapons", "weapons-px"], ["equipment", "equipment-px"], ["icons", "icons-px"], ["ui", "frames-px"]];
let written = 0;

async function emit(data, info, out, file, from, to) {
  const buf = Buffer.from(data);
  if (from && to) {
    if (from.length !== 4 || to.length !== 4) throw new Error("an elemental ramp must have four tones");
    const map = new Map(from.map((hex, i) => {
      const [r, g, b] = rgb(hex);
      return [key(r, g, b), rgb(to[i])];
    }));
    for (let p = 0; p < buf.length; p += 4) {
      if (!buf[p + 3]) continue;
      const c = map.get(key(buf[p], buf[p + 1], buf[p + 2]));
      if (c) [buf[p], buf[p + 1], buf[p + 2]] = c;
    }
  }
  await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(join(out, file));
  written++;
}

for (const [folder, target] of jobs) {
  const source = join(root, folder);
  const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
  const out = join(repo, "public/art", target);
  mkdirSync(out, { recursive: true });
  for (const entry of manifest.files) {
    if (folder === "ui" && entry.kind !== "card_frame") continue;
    if (folder === "icons" && mode === "items" && !["forge_part", "forge_core"].includes(entry.kind)) continue;
    if (!/^[a-z0-9_]+\.png$/.test(entry.file) || entry.frames !== 1) throw new Error("invalid static asset: " + entry.file);
    const { data, info } = await sharp(join(source, entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== entry.frame_width || info.height !== entry.frame_height) throw new Error("manifest dimensions differ: " + entry.file);
    for (let p = 3; p < data.length; p += 4) if (data[p] !== 0 && data[p] !== 255) throw new Error("non-binary alpha: " + entry.file);
    if (folder === "weapons" || folder === "equipment") {
      if (!entry.file.endsWith("_fire.png")) throw new Error("expected the fire base: " + entry.file);
      for (const [element, ramp] of Object.entries(ramps)) {
        await emit(data, info, out, entry.file.replace(/_fire\.png$/, "_" + element + ".png"),
          manifest.recolor.exclusive_ramp_hex, ramp);
      }
    } else if (entry.kind === "forge_core") {
      const from = manifest.element_core_palettes_hex[entry.element];
      await emit(data, info, out, entry.file, from, ramps[entry.element]);
    } else {
      await emit(data, info, out, entry.file);
    }
  }
}

// Runtime membership guarantees that unavailable pixel families use their painted fallback.
const names = readdirSync(join(repo, "public/art/icons-px"))
  .filter((file) => /^icon_[a-z0-9_]+\.png$/.test(file))
  .map((file) => file.slice(5, -4)).sort();
writeFileSync(join(repo, "src/lib/art/pixel-icons.generated.json"), JSON.stringify(names, null, 2) + "\n");
console.log({ mode, written, registeredIcons: names.length });
