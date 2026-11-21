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


/**
 * Keep capital markers legible in dense regions. Marker positions and radii
 * are supplied in screen pixels so the same spacing rule works at every zoom.
 * Selected markers win collisions; the remaining markers closest to the view
 * centre are preferred. Hidden markers remain available through search/click.
 */
export function selectNonOverlappingMarkers(candidates,reserved=[],minimumGap=1.25){
 if(!Array.isArray(candidates))return [];
 const gap=Number.isFinite(minimumGap)?Math.max(0,minimumGap):1.25;
 const cellSize=24,buckets=new Map(),accepted=[];
 const keysFor=box=>{
  const keys=[];
  const x0=Math.floor(box.left/cellSize),x1=Math.floor(box.right/cellSize);
  const y0=Math.floor(box.top/cellSize),y1=Math.floor(box.bottom/cellSize);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)keys.push(`${x},${y}`);
  return keys;
 };
 const ordered=[...candidates].filter(item=>
  item&&Number.isFinite(item.screenX)&&Number.isFinite(item.screenY)
 ).sort((a,b)=>
  Number(!!b.selected)-Number(!!a.selected)||
  (Number(a.centerDistance)||0)-(Number(b.centerDistance)||0)
 );
 for(const item of ordered){
  const radius=Math.max(0,Number.isFinite(item.radiusPx)?item.radiusPx:2.45);
  const box={left:item.screenX-radius-gap/2,top:item.screenY-radius-gap/2,
   right:item.screenX+radius+gap/2,bottom:item.screenY+radius+gap/2};
  if(reserved.some(other=>other&&overlaps(box,other,0)))continue;
  const nearby=new Set();
  for(const key of keysFor(box))for(const other of buckets.get(key)||[])nearby.add(other);
  let collision=false;
  for(const other of nearby){
   const dx=item.screenX-other.screenX,dy=item.screenY-other.screenY;
   const otherRadius=Number.isFinite(other.radiusPx)?Math.max(0,other.radiusPx):2.45;
   const separation=radius+otherRadius+gap;
   if(dx*dx+dy*dy<separation*separation){collision=true;break;}
  }
  if(collision)continue;
  accepted.push(item);
  for(const key of keysFor(box)){
   const bucket=buckets.get(key)||[];
   bucket.push(item);buckets.set(key,bucket);
  }
 }
 return accepted;
}
