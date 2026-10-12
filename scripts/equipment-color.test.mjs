import {expect,it} from 'vitest';
import {recolorEquipment} from './equipment-color.mjs';
it('preserves steel, gold, wood and transparency while recoloring red accents',()=>{
  const source=Buffer.from([128,130,140,255,250,180,30,255,100,65,30,128,220,40,30,64,220,40,30,0]);
  const blue=recolorEquipment(source,210);
  expect(blue.subarray(0,12)).toEqual(source.subarray(0,12));
  expect(blue[14]).toBeGreaterThan(blue[12]);
  for(let i=3;i<source.length;i+=4)expect(blue[i]).toBe(source[i]);
  expect(blue.subarray(16)).toEqual(source.subarray(16));
});
