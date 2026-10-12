import catalog from "./painted-equipment.generated.json";
import type { Element } from "@/lib/game/elements";
import type { WeaponType } from "@/lib/game/weapons";

export type EquipmentImage = {src:string;width:number;height:number;bounds?:{x:number;y:number;width:number;height:number}};
export function paintedEquipment(type: WeaponType, element: Element): EquipmentImage | undefined {
  return (catalog as Record<string,Partial<Record<Element,EquipmentImage>>>)[type]?.[element];
}
