// Mission reward chests from the gacha opening sheets: closed chest, then open chests with a rank glow.
// The corner rank badge baked into each frame is erased. Output: public/art/ui/chest_tier{1,2,3}.webp
import sharp from "sharp";

const SRC = "public/art/effects";
const FRAME = 512;
// [sheet, frame index]
const TIERS = [["f", 0], ["c", 4], ["s", 4]];
const BADGE = { left: 360, top: 60, width: 100, height: 110 }; // erased (dest-out)

for (const [i, [rank, frame]] of TIERS.entries()) {
  const cell = await sharp(`${SRC}/gacha_open_${rank}.webp`)
    .extract({ left: frame * FRAME, top: 0, width: FRAME, height: FRAME })
    .png()
    .toBuffer();
  // sharp resizes before compositing, so erase on the full-size cell first.
  const erased = await sharp(cell)
    .composite([{ input: { create: { width: BADGE.width, height: BADGE.height, channels: 4, background: "#fff" } }, left: BADGE.left, top: BADGE.top, blend: "dest-out" }])
    .png()
    .toBuffer();
  await sharp(erased)
    .resize(192, 192)
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(`public/art/ui/chest_tier${i + 1}.webp`);
}
console.log("chests ok");
