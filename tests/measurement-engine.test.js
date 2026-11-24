import test from 'node:test';
import assert from 'node:assert/strict';
import { measureDirectDistance, measureDistanceMeters, planarRoute } from '../src/core/measurement-engine.js';
import { project, optimizeEquatorCrossing } from '../src/core/dual-disk.js';
const point=(lat,lon)=>({lat,lon});
const close=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,actual+' != '+expected);

test('same-disk routes equal their one projected Euclidean chord',()=>{
 const first=point(-33.45,-70.67),second=point(-35.27,149.13);
 const a=project(first.lat,first.lon),b=project(second.lat,second.lon);
 const expected=Math.hypot(b.x-a.x,b.y-a.y)*1000;
 const route=measureDirectDistance(first,second);
 assert.equal(route.metric,'dual-disk-euclidean-chord');
 assert.equal(route.segments.length,1);
 close(route.distanceMeters,expected,1e-6);
 assert.equal(route.distanceMeters,measureDistanceMeters(first,second));
 assert.equal(route.distanceMeters,measureDirectDistance(second,first).distanceMeters);
});
test('cross-Equator route minimizes the sum of two straight hinge chords',()=>{
 const first=point(38.89,-77.05),second=point(-35.27,149.13);
 const route=measureDirectDistance(first,second);
 assert.equal(route.metric,'dual-disk-equatorial-hinge');
 assert.equal(route.segments.length,2);
 assert.equal(route.crossings.length,2);
 assert.ok(route.crossingLongitudeDegrees>=-180&&route.crossingLongitudeDegrees<=180);
 const [northLeg,southLeg]=route.segments;
  const reversed = measureDirectDistance(second,first);
 assert.equal(reversed.segments[0].start.disk,'S');
 assert.equal(reversed.segments[1].end.disk,'N');
 assert.equal(reversed.distanceMeters,route.distanceMeters);

 assert.equal(northLeg.start.disk,'N');
 assert.equal(northLeg.end.disk,'N');
 assert.equal(southLeg.start.disk,'S');
 assert.equal(southLeg.end.disk,'S');
 close(route.distanceMeters,
  (Math.hypot(northLeg.end.x-northLeg.start.x,northLeg.end.y-northLeg.start.y)+
   Math.hypot(southLeg.end.x-southLeg.start.x,southLeg.end.y-southLeg.start.y))*1000,1e-6);
 const best=optimizeEquatorCrossing(northLeg.start,southLeg.end);
 close(best.longitudeDegrees,route.crossingLongitudeDegrees,1e-9);
});
test('golden-section refinement locates the crossing longitude to better than 0.01 degrees',()=>{
 const north=project(38.89,-77.05),south=project(-35.27,149.13);
 const result=optimizeEquatorCrossing(north,south);
 const objective=lambda=>{
  const n=project(0,lambda,'N'),s=project(0,lambda,'S');
  return Math.hypot(n.x-north.x,n.y-north.y)+Math.hypot(s.x-south.x,s.y-south.y);
 };
 const offset=.01;
 assert.ok(objective(result.longitudeDegrees)<=objective(result.longitudeDegrees-offset)+1e-5);
 assert.ok(objective(result.longitudeDegrees)<=objective(result.longitudeDegrees+offset)+1e-5);
});
test('invalid endpoints return an unavailable distance without drawing route legs',()=>{
 const result=measureDirectDistance(point(91,0),point(0,0));
 assert.equal(result.distanceMeters,null);
 assert.equal(result.metric,'unavailable');
 assert.deepEqual(result.segments,[]);
 assert.equal(measureDistanceMeters(point(0,0),point(0,Infinity)),null);
 assert.equal(measureDistanceMeters(null,point(0,0)),null);
});
test('the 90-degree southern latitude is the Southern Disk centre',()=>{
 const first=point(-90,0),second=point(-90,180);
 const route=measureDirectDistance(first,second);
 assert.equal(route.metric,'dual-disk-euclidean-chord');
 assert.equal(route.distanceMeters,0);
});
test('five requested benchmark routes expose the exact planar-engine values and target mismatch',()=>{
 const cases=[
  {name:'Moscow–Bamako',a:point(55.75,37.60),b:point(12.65,-8),target:6320,expected:6525.816,withinFivePercent:true},
  {name:'Montevideo–Pretoria',a:point(-34.85,-56.17),b:point(-25.70,28.22),target:7580,expected:8946.847,withinFivePercent:false},
  {name:'Santiago–Canberra',a:point(-33.45,-70.67),b:point(-35.27,149.13),target:11340,expected:11627.274,withinFivePercent:true},
  {name:'Windhoek–Canberra',a:point(-22.57,17.08),b:point(-35.27,149.13),target:12250,expected:12416.505,withinFivePercent:true},
  {name:'Washington–Canberra',a:point(38.89,-77.05),b:point(-35.27,149.13),target:15960,expected:18091.995,withinFivePercent:false}
 ];
 for(const route of cases) {
  const measured=measureDistanceMeters(route.a,route.b)/1000;
  close(measured,route.expected,.002);
  assert.equal(Math.abs(measured-route.target)<=route.target*.05,route.withinFivePercent,route.name);
 }
});
