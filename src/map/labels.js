// Screen-space label thresholds are tied to the local scale-bar reading, not raw zoom.
export const COUNTRY_LABEL_MAX_SCALE_KM=16000;
export const COUNTRY_LABEL_MIN_SCALE_KM=500;
export const CAPITAL_LABEL_MAX_SCALE_KM=2500;

export function shouldShowCountryLabels(localScaleBarKm){
 return Number.isFinite(localScaleBarKm)&&localScaleBarKm>COUNTRY_LABEL_MIN_SCALE_KM&&localScaleBarKm<=COUNTRY_LABEL_MAX_SCALE_KM;
}
export function shouldShowCapitalLabels(localScaleBarKm){
 return Number.isFinite(localScaleBarKm)&&localScaleBarKm>0&&localScaleBarKm<=CAPITAL_LABEL_MAX_SCALE_KM;
}

function overlaps(a,b,gap){return a.left<b.right+gap&&a.right+gap>b.left&&a.top<b.bottom+gap&&a.bottom+gap>b.top;}
function cellKeys(box){
 const size=36,x0=Math.floor(box.left/size),x1=Math.floor(box.right/size),y0=Math.floor(box.top/size),y1=Math.floor(box.bottom/size),keys=[];
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)keys.push(`${x},${y}`);
 return keys;
}
export function selectNonOverlappingLabels(candidates,reserved=[],gap=3){
 const buckets=new Map(),accepted=[];
 const register=box=>{for(const key of cellKeys(box)){const bucket=buckets.get(key)||[];bucket.push(box);buckets.set(key,bucket);}};
 for(const box of reserved)register(box);
 for(const candidate of candidates){
  const box=candidate.box;if(!box||![box.left,box.top,box.right,box.bottom].every(Number.isFinite))continue;
  const expanded={left:box.left-gap/2,top:box.top-gap/2,right:box.right+gap/2,bottom:box.bottom+gap/2};
  const conflicts=new Set();for(const key of cellKeys(expanded))for(const other of buckets.get(key)||[])conflicts.add(other);
  if([...conflicts].some(other=>overlaps(expanded,other,gap/2)))continue;
  accepted.push(candidate);register(expanded);
 }
 return accepted;
}
