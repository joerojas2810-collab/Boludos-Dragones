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
const weaponTypes = ["sword", "axe", "spear", "bow", "staff", "dagger", "mace", "wand", "book"];
const equipmentTypes = ["helmet", "chest", "legs", "boots", "necklace"];
const elements = ["fire", "water", "earth", "lightning", "wind"];
const ranks = ["f", "e", "d", "c", "b", "a", "s", "ss", "ssr"];
const phase3Names = {
  weapons: weaponTypes.map((type) => `icon_weapon_${type}_fire.png`),
  equipment: equipmentTypes.map((type) => `icon_equipment_${type}_fire.png`),
  icons: [...weaponTypes, ...equipmentTypes].map((type) => `icon_part_${type}.png`).concat(elements.map((el) => `icon_core_${el}.png`)),
  ui: ranks.map((rank) => `card_${rank}.png`),
};
const prepared = [];
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
  const selected = manifest.files.filter((entry) => (folder !== "ui" || entry.kind === "card_frame") &&
    (folder !== "icons" || mode !== "items" || ["forge_part", "forge_core"].includes(entry.kind)));
  if (mode !== "icons") {
    const phase3 = selected.filter((entry) => folder !== "icons" || ["forge_part", "forge_core"].includes(entry.kind));
    const expected = phase3Names[folder].slice().sort();
    const actual = phase3.map((entry) => entry.file).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Expected the exact phase 3 names in " + folder);
  }
  for (const entry of selected) {
    if (!/^[a-z0-9_]+\.png$/.test(entry.file) || entry.frames !== 1) throw new Error("invalid static asset: " + entry.file);
    const { data, info } = await sharp(join(source, entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== entry.frame_width || info.height !== entry.frame_height) throw new Error("manifest dimensions differ: " + entry.file);
    const phase3 = phase3Names[folder].includes(entry.file);
    if (phase3) {
      const sizes = folder === "ui" ? [[60, 80], [120, 160]] : [[32, 32], [64, 64]];
      if (!sizes.some(([width, height]) => info.width === width && info.height === height)) throw new Error("unsupported native phase 3 size: " + entry.file);
      if (entry.fps !== 0 || entry.loop !== false || entry.anchor?.type !== "center" || entry.anchor.x !== info.width / 2 || entry.anchor.y !== info.height / 2) throw new Error("invalid static center anchor: " + entry.file);
    } else if (["forge_part", "forge_core", "card_frame"].includes(entry.kind)) throw new Error("unknown phase 3 asset: " + entry.file);
    for (let p = 3; p < data.length; p += 4) if (data[p] !== 0 && data[p] !== 255) throw new Error("non-binary alpha: " + entry.file);
    if (phase3) for (let p = 3; p < data.length; p += 4) if (data[p] === 0 && (data[p - 1] || data[p - 2] || data[p - 3])) throw new Error("transparent RGB must be zero: " + entry.file);
    if (folder === "weapons" || folder === "equipment" || entry.kind === "forge_core") {
      const from = entry.kind === "forge_core" ? manifest.element_core_palettes_hex?.[entry.element] : manifest.recolor?.exclusive_ramp_hex;
      if (!Array.isArray(from) || from.length !== 4 || new Set(from).size !== 4 || from.some((hex) => !/^#[0-9a-f]{6}$/i.test(hex))) throw new Error("invalid source elemental ramp: " + entry.file);
      if (entry.kind === "forge_core" && !elements.includes(entry.element)) throw new Error("unknown core element: " + entry.file);
    }
    prepared.push({ folder, out, manifest, entry, data, info });
  }
}

// All selected headers and manifests must pass before replacing any asset.
for (const { folder, out, manifest, entry, data, info } of prepared) {
    mkdirSync(out, { recursive: true });
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

// Register only the 98 phase 3 runtime paths; system icons keep their own size.
const inventory = {};
for (const [folder, target] of [["weapons", "weapons-px"], ["equipment", "equipment-px"], ["icons", "icons-px"], ["ui", "frames-px"]]) {
  const filenames = folder === "weapons" || folder === "equipment"
    ? phase3Names[folder].flatMap((file) => elements.map((el) => file.replace(/_fire\.png$/, `_${el}.png`)))
    : phase3Names[folder];
  for (const file of filenames) {
    const info = await sharp(join(repo, "public/art", target, file)).metadata();
    inventory[`${target}/${file.slice(0, -4)}`] = { width: info.width, height: info.height };
  }
}
writeFileSync(join(repo, "src/lib/art/pixel-items.generated.json"), JSON.stringify(inventory, null, 2) + "\n");

// Runtime membership guarantees that unavailable pixel families use their painted fallback.
const names = readdirSync(join(repo, "public/art/icons-px"))
  .filter((file) => /^icon_[a-z0-9_]+\.png$/.test(file))
  .map((file) => file.slice(5, -4)).sort();
writeFileSync(join(repo, "src/lib/art/pixel-icons.generated.json"), JSON.stringify(names, null, 2) + "\n");
console.log({ mode, written, registeredIcons: names.length });
