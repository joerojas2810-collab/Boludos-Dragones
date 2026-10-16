/** Keep columns near their desired positions while guaranteeing room between neighbours. */
export function statusColumnLayout(columns:readonly {left:number;width:number}[],left:number,right:number,gap=8):number[] {
  const sorted=columns.map((c,index)=>({left:c.left,width:c.width,index})).sort((a,b)=>a.left-b.left);
  const result:number[]=[];
  let cursor=left;
  for(const c of sorted){const x=Math.max(cursor,Math.min(c.left,right-c.width));result[c.index]=x;cursor=x+c.width+gap;}
  cursor=right;
  for(let i=sorted.length-1;i>=0;i--){const c=sorted[i];result[c.index]=Math.min(result[c.index],cursor-c.width);cursor=result[c.index]-gap;}
  return result;
}
