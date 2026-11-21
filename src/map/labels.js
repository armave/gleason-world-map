// Screen-space label thresholds and decluttering for the canvas map.
export const CAPITAL_LABEL_MIN_ZOOM=1.25;
export const COUNTY_BOUNDARY_MIN_ZOOM=2.25;
export const COUNTY_LABEL_MIN_ZOOM=2.7;
export function countyLabelText(name){
 return String(name||'').replace(/\s+(?:City and Borough|County|Parish|Borough|Census Area|Municipality|Municipio|City)$/i,'');
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


// Ray-casting test used to keep county labels strictly inside their own
// Census polygon. Polygon holes are excluded; MultiPolygon islands are supported.
function pointInRing(lon, lat, ring) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  const ax=Number(a?.[0]),ay=Number(a?.[1]),bx=Number(b?.[0]),by=Number(b?.[1]);
  if(![ax,ay,bx,by].every(Number.isFinite))continue;
  const cross=(lon-ax)*(by-ay)-(lat-ay)*(bx-ax);
  if(Math.abs(cross)<1e-10&&lon>=Math.min(ax,bx)-1e-10&&lon<=Math.max(ax,bx)+1e-10&&
     lat>=Math.min(ay,by)-1e-10&&lat<=Math.max(ay,by)+1e-10)return true;
  if((ay>lat)!==(by>lat)&&lon<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}

export function pointInCountyGeometry(lon,lat,geometry) {
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||!geometry)return false;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:
  geometry.type==='MultiPolygon'?geometry.coordinates:[];
 for(const rings of polygons){
  if(!Array.isArray(rings)||!rings.length||!pointInRing(lon,lat,rings[0]))continue;
  if(rings.slice(1).some(hole=>pointInRing(lon,lat,hole)))continue;
  return true;
 }
 return false;
}

export function countyAnchorForFeature(feature) {
 const p=feature?.properties||{};
 const lat=Number(p.INTPTLAT),lon=Number(p.INTPTLON);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||
    !pointInCountyGeometry(lon,lat,feature?.geometry))return null;
 return {lat,lon};
}
