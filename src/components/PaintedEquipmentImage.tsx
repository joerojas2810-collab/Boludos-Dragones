import type { EquipmentImage } from "@/lib/art/painted-equipment";

// Crop only transparent canvas space. Fit the complete silhouette inside the box.
export function PaintedEquipmentImage({image,className=""}:{image:EquipmentImage;className?:string}) {
  const b=image.bounds ?? {x:0,y:0,width:image.width,height:image.height};
  return <svg viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={className}>
    <image href={image.src} width={image.width} height={image.height} />
  </svg>;
}

// Reserve real label bands; do not shrink the object by another arbitrary percent.
export function equipmentPortraitInsets(big:boolean,hasStatLine=false) {
  return {top:big?28:20,bottom:big?(hasStatLine?46:35):28,left:2,right:2};
}
