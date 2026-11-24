import { measureDirectDistance } from '../core/measurement-engine.js';

const CONNECTOR_STYLES = Object.freeze({
 distance: Object.freeze({
  color:'#c0392b',halo:'rgba(255,250,238,.96)',lineWidth:2.8,haloExtra:2.1,dash:Object.freeze([])
 }),
 area: Object.freeze({
  color:'#3f7285',halo:'rgba(255,250,238,.96)',lineWidth:2.4,haloExtra:2.1,dash:Object.freeze([7,4])
 })
});
export function measurementStrokeStyle(tool,zoom=1){
 const style=CONNECTOR_STYLES[tool];
 if(!style)throw new Error('Unknown measurement connector: '+tool);
 const scale=Math.max(Number.isFinite(zoom)&&zoom>0?zoom:1,.001);
 return {color:style.color,halo:style.halo,lineWidth:style.lineWidth/scale,
  haloWidth:(style.lineWidth+style.haloExtra)/scale,dash:style.dash.map(length=>length/scale)};
}
function pointXY(point) { return [point.x, point.y]; }
function routeSegments(a,b) {
 return measureDirectDistance(a,b).segments.map(segment=>[
  pointXY(segment.start), pointXY(segment.end)
 ]);
}
/** Area edges use the same one- or two-leg planar route as the distance engine. */
export function createProjectedMeasurementSegments(points,projectPoint,closed=false){
 if(!Array.isArray(points)||points.length<2)return [];
 const count=closed&&points.length>=3?points.length:points.length-1;
 const result=[];
 for(let index=0;index<count;index++)result.push(...routeSegments(points[index],points[(index+1)%points.length]));
 return result;
}
function routeMidpoint(segments) {
 const lengths=segments.map(segment=>Math.hypot(
  segment.end.x-segment.start.x,segment.end.y-segment.start.y
 ));
 const total=lengths.reduce((sum,value)=>sum+value,0);
 if(!total)return segments[0]?pointXY(segments[0].start):null;
 let remaining=total/2;
 for(let index=0;index<segments.length;index++){
  const segment=segments[index],length=lengths[index];
  if(remaining<=length||index===segments.length-1){
   const t=length?Math.max(0,Math.min(1,remaining/length)):0;
   return [segment.start.x+(segment.end.x-segment.start.x)*t,
    segment.start.y+(segment.end.y-segment.start.y)*t];
  }
  remaining-=length;
 }
 return null;
}
/** Each edge label's value and anchor follow its canonical route path. */
export function createProjectedSegmentLabels(points,projectPoint,measureDistanceMeters,closed=false){
 if(!Array.isArray(points)||points.length<2)return [];
 const count=closed&&points.length>=3?points.length:points.length-1;
 const labels=[];
 for(let index=0;index<count;index++){
  const a=points[index],b=points[(index+1)%points.length];
  const route=measureDirectDistance(a,b);
  const anchor=routeMidpoint(route.segments);
  if(!anchor||!Number.isFinite(route.distanceMeters))continue;
  labels.push({x:anchor[0],y:anchor[1],meters:route.distanceMeters,
   segments:route.segments.map(segment=>[pointXY(segment.start),pointXY(segment.end)])});
 }
 return labels;
}
