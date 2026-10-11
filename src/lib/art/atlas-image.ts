import { getImageProps } from "next/image";
import type { SpriteAtlas } from "./atlas-frame";

export function sheetImageSource(anim: {src:string;atlas?:SpriteAtlas}) {
  if (!anim.atlas) return anim.src;
  const width=Math.min(anim.atlas.width,1024);
  return getImageProps({src:anim.src,alt:"",width,height:Math.round(width*anim.atlas.height/anim.atlas.width)}).props.src;
}
