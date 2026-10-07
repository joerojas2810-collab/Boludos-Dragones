// Builds public/og.png (1200x630) from the painted menu art. Run: node scripts/make-og.mjs
import sharp from "sharp";

const art = "public/art";
const bg = await sharp(`${art}/backgrounds/menu_desktop_composite.webp`)
  .resize(1200, 630, { fit: "cover" })
  .modulate({ brightness: 0.7 })
  .toBuffer();
const emblem = await sharp(`${art}/ui/logo_emblem.webp`).resize(300, 300).toBuffer();
const word = await sharp(`${art}/ui/logo_wordmark.webp`).resize(900).toBuffer();
const wordH = (await sharp(word).metadata()).height ?? 140;

await sharp(bg)
  .composite([
    { input: emblem, left: 450, top: 70 },
    { input: word, left: 150, top: 400 - Math.round(wordH / 2) + 60 },
  ])
  .png()
  .toFile("public/og.png");
console.log("public/og.png ok");
