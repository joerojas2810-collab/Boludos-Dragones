// Additive art registration. Usage: node scripts/import-art-extension.mjs "<package root>"
// Validates the extension's runtime/manifest.json against the files already copied into public/art and
// MERGES (never replaces) the new ids into effects.generated.ts, pixel-effects.generated.json and
// pixel-icons.generated.json. Existing entries are only checked, so accumulated manifests survive.
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] && resolve(process.argv[2]);
if (!root) throw new Error("usage: <package root>");
const repo = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "runtime/manifest.json"), "utf8"));
const effectsTs = join(repo, "src/lib/art/effects.generated.ts");
const pixelFx = join(repo, "src/lib/art/pixel-effects.generated.json");
const pixelIcons = join(repo, "src/lib/art/pixel-icons.generated.json");
let ts = readFileSync(effectsTs, "utf8");
const fx = JSON.parse(readFileSync(pixelFx, "utf8"));
const icons = JSON.parse(readFileSync(pixelIcons, "utf8"));
const fail = (m) => { throw new Error(m); };
const dims = async (path) => { const i = await sharp(path).metadata(); return [i.width, i.height]; };
const painted = { effects: "public/art/effects", icons: "public/art/icons" };
const pixel = { effects: "public/art/effects-px", icons: "public/art/icons-px" };
const added = { effects: [], icons: [] };

for (const e of manifest.files) {
  const m = /^(painted|pixel)\/(effects|icons)\/(reduced\/)?([a-z0-9_]+)\.(webp|png)$/.exec(e.file);
  if (!m) fail("Unexpected path: " + e.file);
  const [, style, kind, reduced, id] = m;
  const rel = join((style === "painted" ? painted : pixel)[kind], reduced ?? "", `${id}.${m[5]}`);
  if (!existsSync(join(repo, rel))) fail("Missing file: " + rel);
  if (e.anchor?.type !== "center" || e.anchor.x !== e.frame_width / 2 || e.anchor.y !== e.frame_height / 2) fail("Anchor: " + e.file);
  const want = [e.frame_width * (reduced ? 1 : e.frames), e.frame_height * e.rows];
  if (JSON.stringify(await dims(join(repo, rel))) !== JSON.stringify(want)) fail("Sheet size differs from manifest: " + rel);
  if (kind === "effects") {
    if (reduced ? e.frames !== 1 || e.fps !== 0 || e.loop : e.frames !== (id.startsWith("hit_") ? 4 : 6) || e.loop || e.finish !== "remove") fail("Timing: " + e.file);
    if (reduced || style === "painted") {
      if (style === "painted" && !reduced) {
        if (!new RegExp(`^  ${id}: \\{`, "m").test(ts)) {
          ts = ts.replace(/\n\};\n$/, `\n  ${id}: {\n    frames: ${e.frames},\n    fps: ${e.fps},\n    loop: false,\n    finish: "remove",\n    cell: [${e.frame_width}, ${e.frame_height}],\n    rows: 1,\n  },\n};\n`);
          added.effects.push(id);
        }
      }
      continue;
    }
    // pixel, full sheet: binary alpha, transparent RGB zeroed, <= 96 colours
    const { data } = await sharp(join(repo, rel)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let p = 3; p < data.length; p += 4) {
      if (data[p] !== 0 && data[p] !== 255) fail("Non-binary alpha: " + rel);
      if (data[p]) colors.add((data[p - 3] << 16) | (data[p - 2] << 8) | data[p - 1]);
      else if (data[p - 3] || data[p - 2] || data[p - 1]) fail("Transparent RGB must be zero: " + rel);
    }
    if (colors.size > 96) fail("Palette exceeds 96 colours: " + rel);
    if (!fx[id]) { fx[id] = { frames: e.frames, fps: e.fps, loop: false, finish: "remove", cell: [e.frame_width, e.frame_height], rows: 1, label: id }; added.effects.push(id); }
    else if (fx[id].frames !== e.frames || fx[id].cell[0] !== e.frame_width) fail("Changed existing pixel effect: " + id);
  } else if (style === "pixel") {
    if (e.frame_width !== 64 || e.frame_height !== 64) fail("Icon must be 64px: " + e.file);
    const name = id.replace(/^icon_/, "");
    if (!icons.some((i) => i.name === name)) { icons.push({ name, width: 64, height: 64 }); added.icons.push(name); }
  }
}
icons.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
writeFileSync(effectsTs, ts);
writeFileSync(pixelFx, JSON.stringify(fx, null, 2) + "\n");
writeFileSync(pixelIcons, JSON.stringify(icons, null, 2) + "\n");
console.log({ added, effects: Object.keys(fx).length, icons: icons.length });
