// Importer: fire strips (64x96 or native HD 128x192) -> public/art/<heroes|enemies>-px/ in 5 elements.
// Usage: node scripts/import-pixel.mjs "<dir>" <heroes|enemies>   (dir has manifest.json + the strips)
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const lot = process.argv[3];
if (!dir || !["heroes", "enemies"].includes(lot)) throw new Error("usage: <dir> <heroes|enemies>");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const FW = manifest.frame_width;
const FH = manifest.frame_height;
if (!(FW === 64 && FH === 96) && !(FW === 128 && FH === 192))
  throw new Error("unsupported native frame dimensions");
const PAD = FW / 64 * 3;
const hd = FW === 128;
if (lot === "heroes") {
  const expected = Object.fromEntries([...readFileSync("src/lib/art/heroes.ts", "utf8").matchAll(/^  (\w+): \{ frames: (\d+), fps: (\d+), loop: (true|false), hold: (true|false) \},$/gm)]
    .map((m) => [m[1], { frames: +m[2], fps: +m[3], loop: m[4] === "true", hold: m[5] === "true" }]));
  const required = new Set(["knight", "mage", "rogue", "cleric"].flatMap((c) => Object.keys(expected).map((a) => `hero_${c}_${a}.png`)));
  if (Object.keys(expected).length !== 10 || manifest.files.length !== required.size) throw new Error("heroes require four classes and ten actions");
  for (const entry of manifest.files) {
    const action = entry.file.match(/^hero_(?:knight|mage|rogue|cleric)_(.+)\.png$/)?.[1];
    if (!required.delete(entry.file) || !expected[action]) throw new Error(`unexpected or duplicate hero: ${entry.file}`);
    for (const field of ["frames", "fps", "loop", "hold"])
      if (entry[field] !== expected[action][field]) throw new Error(`invalid ${field}: ${entry.file}`);
    if (entry.frame_width !== FW || entry.frame_height !== FH || entry.anchor?.x !== FW / 2 || entry.anchor?.y !== FH * 15 / 16)
      throw new Error(`invalid hero dimensions or feet anchor: ${entry.file}`);
  }
}
if (lot === "enemies") {
  const expected = Object.fromEntries([...readFileSync("src/lib/art/enemies.generated.ts", "utf8").matchAll(/^  ([a-z0-9_]+_fire_(?:idle|attack|hit|defeat|entrance)): \{\s*frames: (\d+),\s*fps: (\d+),\s*loop: (true|false),\s*cell: (\d+),\s*\},/gm)]
    .map((m) => [m[1] + ".png", { frames: +m[2], fps: +m[3], loop: m[4] === "true" }]));
  const required = new Set(Object.keys(expected));
  if (required.size !== 110 || manifest.files.length !== required.size) throw new Error("enemies require the exact 110 fire strips from the catalog");
  for (const entry of manifest.files) {
    const meta = expected[entry.file];
    if (!required.delete(entry.file) || !meta) throw new Error(`unexpected or duplicate enemy: ${entry.file}`);
    for (const field of ["frames", "fps", "loop"])
      if (entry[field] !== meta[field]) throw new Error(`invalid ${field}: ${entry.file}`);
    const action = entry.file.match(/_fire_(idle|attack|hit|defeat|entrance)\.png$/)?.[1];
    const hold = action === "defeat";
    if (entry.action !== action || entry.hold !== hold || entry.end_behavior !== (hold ? "hold" : meta.loop ? "loop" : "return_to_idle"))
      throw new Error(`invalid enemy action/end behavior: ${entry.file}`);
    if (entry.frame_width !== FW || entry.frame_height !== FH || entry.anchor?.x !== FW / 2 || entry.anchor?.y !== FH * 15 / 16)
      throw new Error(`invalid enemy dimensions or feet anchor: ${entry.file}`);
  }
}
// Validate every header before replacing any runtime asset.
for (const entry of manifest.files) {
  if (!/^[a-z0-9_]+\.png$/.test(entry.file)) throw new Error(`invalid filename: ${entry.file}`);
  const info = await sharp(join(dir, entry.file)).metadata();
  if (info.width !== FW * entry.frames || info.height !== FH || !info.hasAlpha)
    throw new Error(`invalid strip header: ${entry.file}`);
}

// Tone order: dark, main, light, highlight. Fire comes from the manifest; the rest are ours.
const RAMPS = {
  fire: manifest.recolor.exclusive_ramp_hex,
  water: ["#1F4E8C", "#2F86D9", "#5CC0F0", "#B8EEFF"],
  earth: ["#2F5A34", "#4F9448", "#8CCB5A", "#D4F08A"],
  lightning: ["#7A5412", "#D9A621", "#F8D84A", "#FFF7B0"],
  wind: ["#1F6F6A", "#33B5A0", "#7BE0C0", "#D2FFEA"],
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const key = ([r, g, b]) => (r << 16) | (g << 8) | b;
const src = RAMPS.fire.map(rgb);

// Enemies glow too much: pull the light tones toward the dark one and desaturate a bit (heroes untouched).
const DIM = [0, 0.12, 0.3, 0.45];
const SAT = 0.8;
const dim = (ramp) => ramp.map((h, i) => {
  const c = rgb(h), d = rgb(ramp[0]);
  const mixed = c.map((v, k) => v * (1 - DIM[i]) + d[k] * DIM[i]);
  const gray = mixed.reduce((a, b) => a + b, 0) / 3;
  return "#" + mixed.map((v) => Math.round(gray + (v - gray) * SAT).toString(16).padStart(2, "0")).join("");
});
// No shine at all: the two light tones collapse into one close to the base colour.
const flat = (ramp) => {
  const [a, b] = [rgb(ramp[1]), rgb(ramp[2])];
  const m = "#" + a.map((v, k) => Math.round(v * 0.6 + b[k] * 0.4).toString(16).padStart(2, "0")).join("");
  return [ramp[0], ramp[1], m, m];
};
if (lot === "enemies" && !hd) for (const k of Object.keys(RAMPS)) RAMPS[k] = dim(flat(RAMPS[k]));

const out = `public/art/${lot}-px`;
mkdirSync(out, { recursive: true });
let n = 0;
for (const { file } of manifest.files) {
  const { data, info } = await sharp(join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Enemy shine: isolated bright non-ramp pixels sitting on the body colour (teeth and horns are clusters, so they stay).
  const sparkle = new Set();
  if (lot === "enemies" && !hd) {
    const work = Buffer.from(data); // removed sparkles are painted as body colour so a second pass can take the rest of a "+"
    const at = (x, y) => (y * info.width + x) * 4;
    const isRamp = (p) => work[p + 3] > 0 && src.some((c) => c[0] === work[p] && c[1] === work[p + 1] && c[2] === work[p + 2]);
    const isBright = (p) => work[p + 3] > 0 && !isRamp(p) && (work[p] + work[p + 1] + work[p + 2]) / 3 >= 190;
    for (let pass = 0; pass < 2; pass++) {
      const found = [];
      for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) {
        const p = at(x, y);
        if (!isBright(p)) continue;
        let ramp = 0, bright = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const q = at(x + dx, y + dy);
          if (isRamp(q)) ramp++; else if (isBright(q)) bright++;
        }
        if (ramp >= 5 || (ramp >= 3 && bright <= 1)) found.push(p);
      }
      for (const p of found) { sparkle.add(p); [work[p], work[p + 1], work[p + 2]] = src[1]; }
    }
  }
  for (const [el, ramp] of Object.entries(RAMPS)) {
    const map = new Map(src.map((c, i) => [key(c), rgb(ramp[i])]));
    const buf = Buffer.from(data);
    for (const p of sparkle) [buf[p], buf[p + 1], buf[p + 2]] = rgb(ramp[2]);
    for (let p = 0; p < buf.length; p += 4) {
      const to = map.get(key([buf[p], buf[p + 1], buf[p + 2]]));
      if (to) [buf[p], buf[p + 1], buf[p + 2]] = to;
    }
    // PAD transparent columns around every frame so scaling never bleeds the neighbour frame in.
    const cells = info.width / FW;
    const frames = await Promise.all(Array.from({ length: cells }, (_, i) =>
      sharp(buf, { raw: info }).extract({ left: i * FW, top: 0, width: FW, height: info.height })
        .extend({ left: PAD, right: PAD, top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
    await sharp({ create: { width: cells * (FW + 2 * PAD), height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(frames.map((input, i) => ({ input, left: i * (FW + 2 * PAD), top: 0 })))
      .png({ compressionLevel: 9 })
      .toFile(join(out, file.includes("_fire_") ? file.replace("_fire_", `_${el}_`) : file.replace(/^(hero_[a-z]+)_/, `$1_${el}_`)));
    n++;
  }
}
writeFileSync(`src/lib/art/pixel-${lot}.generated.json`, JSON.stringify({
  frame_width: FW, frame_height: FH, padding: PAD,
  runtime_frame_width: FW + 2 * PAD,
  anchor: { x: FW / 2 + PAD, y: FH * 15 / 16 },
}, null, 2) + "\n");
console.log({ written: n });
