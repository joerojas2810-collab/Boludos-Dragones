import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {visibleEquipmentBounds} from './equipment-color.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const file=path.join(repo,'src/lib/art/painted-equipment.generated.json');
const catalog=JSON.parse(await fs.readFile(file,'utf8'));
for(const variants of Object.values(catalog)){
  const first=variants.fuego;
  const {data,info}=await sharp(path.join(repo,'public',first.src)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bounds=visibleEquipmentBounds(data,info.width,info.height);
  for(const image of Object.values(variants))image.bounds=bounds;
}
await fs.writeFile(file,JSON.stringify(catalog,null,2)+'\n');
console.log('Visible bounds registered for all 75 equipment icons');
