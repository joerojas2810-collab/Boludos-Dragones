// Layout metadata only: original artwork stays unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {visibleEquipmentBounds} from './equipment-color.mjs';

const root=path.resolve(import.meta.dirname,'..');
const names=['stat_attack','skill_double_strike','relic_titan_crown','system_chest','relic_bottomless_purse','event_abandoned_campfire','event_whispering_book'];
const out={};
for(const name of names){
  const src=`/art/icons/icon_${name}.webp`;
  const {data,info}=await sharp(path.join(root,'public',src)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  out[name]={src,width:info.width,height:info.height,bounds:visibleEquipmentBounds(data,info.width,info.height)};
}
await fs.writeFile(path.join(root,'src/lib/art/door-symbols.generated.json'),JSON.stringify(out,null,2)+'\n');
console.log(`Measured ${names.length} door symbols; original images unchanged.`);
