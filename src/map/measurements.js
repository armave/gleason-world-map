// Shared geometry and drawing metrics for distance and area point connectors.
const CONNECTOR_STYLES = Object.freeze({
 distance: Object.freeze({
  color:'#b45c39',halo:'rgba(255,250,238,.96)',lineWidth:2.6,haloExtra:2.1,dash:Object.freeze([8,5])
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

// Returns one geodesic path per pair of successive points. A finished area
// adds its final-to-first segment; an unfinished area remains an open chain.
export function createMeasurementSegments(points,createGeodesicPath,closed=false){
 if(!Array.isArray(points)||points.length<2||typeof createGeodesicPath!=='function')return [];
 const segmentCount=closed&&points.length>=3?points.length:points.length-1;
 const segments=[];
 for(let i=0;i<segmentCount;i++){
  const a=points[i],b=points[(i+1)%points.length];
  const path=createGeodesicPath(a,b);
  if(Array.isArray(path)&&path.length>=2&&path.every(point=>
   Array.isArray(point)&&point.length>=2&&point.every(Number.isFinite)
  ))segments.push(path);
 }
 return segments;
}
