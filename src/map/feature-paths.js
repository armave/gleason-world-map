export function createFeaturePath(f,project,preserveAntarcticRim=false){
 const path=new Path2D(),g=f.geometry;if(!g)return path;
 const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
 for(const poly of polys){for(const ring of poly){
  if(!ring||ring.length<3)continue;
  const valid=ring.filter(c=>Array.isArray(c)&&Number.isFinite(+c[0])&&Number.isFinite(+c[1])&&+c[0]>=-180&&+c[0]<=180&&+c[1]>=-90&&+c[1]<=90);
  if(valid.length<3)continue;
  let lon0=+valid[0][0],lat0=+valid[0][1];
  const first=project(lon0,lat0);path.moveTo(first[0],first[1]);
  for(let i=1;i<valid.length;i++){
   const lon1=+valid[i][0],lat1=+valid[i][1],rawDelta=lon1-lon0;
   const southPoleSweep=preserveAntarcticRim&&Math.abs(lat0+90)<1e-7&&Math.abs(lat1+90)<1e-7&&Math.abs(rawDelta)>180;
   const dLon=southPoleSweep?rawDelta:((rawDelta+540)%360)-180,dLat=lat1-lat0;
   const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dLon),Math.abs(dLat))/2));
   for(let j=1;j<=steps;j++){const p=project(lon0+dLon*j/steps,lat0+dLat*j/steps);path.lineTo(p[0],p[1]);}
   lon0=lon1;lat0=lat1;
  }
  path.closePath();
 }}
 return path;
}
