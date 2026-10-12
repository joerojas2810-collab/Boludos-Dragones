// Recolor only saturated red accents; gold and neutral steel stay unchanged.
export function visibleEquipmentBounds(data,width,height) {
  let x0=width,y0=height,x1=0,y1=0;
  // Ignore near-invisible generated specks; retain a small antialiasing margin.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(width-1,x1+3);y1=Math.min(height-1,y1+3);
  return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
}
export function recolorEquipment(rgba, hue, saturationScale = 1, lightnessScale = 1) {
  const output = Buffer.from(rgba);
  for (let i=0;i<rgba.length;i+=4) {
    const r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
    if (!rgba[i+3] || !d || max!==r) continue;
    const h=((g-b)/d*60+360)%360;
    const s=d/(1-Math.abs(2*l-1));
    const distance=Math.min(h,360-h);
    const weight=Math.max(0,Math.min(1,(22-distance)/8))*Math.max(0,Math.min(1,(s-.35)/.2));
    if (!weight || r<g*1.6 || r<b*1.4) continue;
    const ns=Math.min(1,s*saturationScale),nl=Math.min(1,l*lightnessScale);
    const c=(1-Math.abs(2*nl-1))*ns,x=c*(1-Math.abs((hue/60)%2-1)),m=nl-c/2;
    const rgb=hue<60?[c,x,0]:hue<120?[x,c,0]:hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];
    for(let k=0;k<3;k++) output[i+k]=Math.round(rgba[i+k]*(1-weight)+(rgb[k]+m)*255*weight);
  }
  return output;
}
