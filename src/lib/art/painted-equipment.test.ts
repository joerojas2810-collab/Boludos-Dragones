import { afterEach, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { paintedEquipment } from "./painted-equipment";
import { gearIconSrc, handIconSrc, GEAR_ART, HAND_ART, ELEMENT_ART } from "../art";
import { isPixel, setPixel } from "./pixel";
import { HAND_TYPES, GEAR_TYPES } from "../game/weapons";
import { ELEMENTS } from "../game/elements";

const initialPixel=isPixel();
afterEach(()=>setPixel(initialPixel));
it("routes all 75 painted equipment variants to distinct existing assets",()=>{
  setPixel(false);const urls=new Set<string>();
  for(const element of ELEMENTS){
    for(const type of [...HAND_TYPES,...GEAR_TYPES]){
      const image=paintedEquipment(type,element)!;
      expect(image.width).toBe(512);expect(image.height).toBe(512);
      expect(image.bounds).toBeDefined();
      expect(image.bounds!.x).toBeGreaterThanOrEqual(0);
      expect(image.bounds!.y).toBeGreaterThanOrEqual(0);
      expect(image.bounds!.width).toBeGreaterThan(0);
      expect(image.bounds!.height).toBeGreaterThan(0);
      expect(image.bounds!.x+image.bounds!.width).toBeLessThanOrEqual(512);
      expect(image.bounds!.y+image.bounds!.height).toBeLessThanOrEqual(512);
      expect(existsSync(path.join(process.cwd(),"public",image.src))).toBe(true);
      urls.add(image.src);
    }
    for(const type of HAND_TYPES)expect(handIconSrc(type,element)).toBe(paintedEquipment(type,element)?.src);
    for(const type of GEAR_TYPES)expect(gearIconSrc(type,element)).toBe(paintedEquipment(type,element)?.src);
  }
  expect(urls.size).toBe(75);
  expect(handIconSrc("mandoble","fuego")).not.toBe(handIconSrc("espada","fuego"));
  expect(handIconSrc("martillo","fuego")).not.toBe(handIconSrc("hacha","fuego"));
});
it("preserves every historical pixel icon route",()=>{
  setPixel(true);
  for(const e of ELEMENTS){
    for(const t of HAND_TYPES)expect(handIconSrc(t,e)).toBe(`/art/weapons-px/icon_weapon_${HAND_ART[t]}_${ELEMENT_ART[e]}.png`);
    for(const t of GEAR_TYPES)expect(gearIconSrc(t,e)).toBe(`/art/equipment-px/icon_equipment_${GEAR_ART[t]}_${ELEMENT_ART[e]}.png`);
  }
});
