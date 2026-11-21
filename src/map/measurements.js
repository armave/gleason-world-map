// Shared styles and straight projected segments for flat-disk distance and area tools.
const CONNECTOR_STYLES = Object.freeze({
 distance: Object.freeze({
  color:'#b45c39',halo:'rgba(255,250,238,.96)',lineWidth:2.8,haloExtra:2.1,dash:Object.freeze([8,5])
 }),
 area: Object.freeze({
  color:'#3f7285',halo:'rgba(255,250,238,.96)',lineWidth:2.4,haloExtra:2.1,dash:Object.freeze([7,4])
 })
});

export function measurementStrokeStyle(tool,zoom=1){
 const style=CONNECTOR_STYLES[tool];
 if(!style)throw new Error(`Unknown measurement connector: ${tool}`);
 const scale=Math.max(Number.isFinite(zoom)?zoom:1,.1);
 return {
  color:style.color,
  halo:style.halo,
  lineWidth:style.lineWidth/scale,
  haloWidth:(style.lineWidth+style.haloExtra)/scale,
  dash:style.dash.map(length=>length/scale)
 };
}

// Distance and area outlines use only straight segments between projected vertices.
export function createProjectedMeasurementSegments(points,projectPoint,closed=false){
 if(!Array.isArray(points)||points.length<2||typeof projectPoint!=='function')return [];
 const segmentCount=closed&&points.length>=3?points.length:points.length-1;
 const segments=[];
 for(let i=0;i<segmentCount;i++){
  const a=points[i],b=points[(i+1)%points.length];
  if(!a||!b||![a.lon,a.lat,b.lon,b.lat].every(Number.isFinite))continue;
  const start=projectPoint(a.lon,a.lat),end=projectPoint(b.lon,b.lat);
  if(Array.isArray(start)&&Array.isArray(end)&&start.length>=2&&end.length>=2&&
   start.slice(0,2).every(Number.isFinite)&&end.slice(0,2).every(Number.isFinite)){
   segments.push([start.slice(0,2),end.slice(0,2)]);
  }
 }
 return segments;
}

/**
 * Compute label anchors and measurements for straight projected polygon edges.
 * The supplied metric selects the displayed distance convention (the area tool
 * passes flatDiskDistanceMeters so labels match its planar perimeter).
 */
export function createProjectedSegmentLabels(points,projectPoint,measureDistanceMeters,closed=false){
 if(!Array.isArray(points)||points.length<2||
  typeof projectPoint!=='function'||typeof measureDistanceMeters!=='function')return [];
 const segmentCount=closed&&points.length>=3?points.length:points.length-1;
 const labels=[];
 for(let i=0;i<segmentCount;i++){
  const a=points[i],b=points[(i+1)%points.length];
  if(!a||!b||![a.lon,a.lat,b.lon,b.lat].every(Number.isFinite))continue;
  const start=projectPoint(a.lon,a.lat),end=projectPoint(b.lon,b.lat);
  if(!Array.isArray(start)||!Array.isArray(end)||start.length<2||end.length<2||
   !start.slice(0,2).every(Number.isFinite)||!end.slice(0,2).every(Number.isFinite))continue;
  const meters=measureDistanceMeters(a,b);
  if(!Number.isFinite(meters)||meters<0)continue;
  labels.push({
   x:(start[0]+end[0])/2,
   y:(start[1]+end[1])/2,
   meters,
   start:start.slice(0,2),
   end:end.slice(0,2)
  });
 }
 return labels;
}
