import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {recolorEquipment,visibleEquipmentBounds} from './equipment-color.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const concepts=path.resolve(repo,'../art_concepts/painted_equipment');
const drafts=JSON.parse(await fs.readFile(path.join(repo,'src/app/galeria-px/actualizacion-equipamiento/equipment-drafts.generated.json'),'utf8'));
const types={sword:'espada',axe:'hacha',bow:'arco',staff:'baston',dagger:'daga',mace:'maza',wand:'varita',book:'libro',greatsword:'mandoble',hammer:'martillo',helmet:'casco',chest:'peto',legs:'piernas',boots:'zapatos',necklace:'collar'};
const elements={fuego:['fire',null,1,1],agua:['water',210,1,1],tierra:['earth',36,.70,.75],rayo:['lightning',52,1,1],viento:['wind',162,.85,1]};
const output=path.join(repo,'public/art/equipment-painted-v2');
await fs.mkdir(output,{recursive:true});
const catalog={};let bytes=0;
assert.equal(drafts.length,15);
for(const draft of drafts){
  assert.ok(draft.src);
  const {data,info}=await sharp(path.join(concepts,`${draft.id}-fire-pilot-01.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  catalog[types[draft.id]]={};
  let bounds;
  for(const [element,[suffix,hue,s,l]] of Object.entries(elements)){
    const rgba=hue===null?data:recolorEquipment(data,hue,s,l);
    for(let i=3;i<data.length;i+=4)assert.equal(rgba[i],data[i],'alpha must stay unchanged');
    const filename=`${draft.id}_${suffix}.webp`;
    const saved=await sharp(rgba,{raw:info}).resize(512,512,{fit:'contain'}).webp({quality:92,alphaQuality:100,effort:6}).toFile(path.join(output,filename));
    const stats=await sharp(path.join(output,filename)).stats();assert.equal(stats.channels[3].min,0);
    if(!bounds){const raw=await sharp(path.join(output,filename)).ensureAlpha().raw().toBuffer();bounds=visibleEquipmentBounds(raw,saved.width,saved.height);}
    bytes+=saved.size;catalog[types[draft.id]][element]={src:`/art/equipment-painted-v2/${filename}`,width:saved.width,height:saved.height,bounds};
  }
}
await fs.writeFile(path.join(repo,'src/lib/art/painted-equipment.generated.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({types:15,variants:75,width:512,height:512,bytes,transparent:true}));
