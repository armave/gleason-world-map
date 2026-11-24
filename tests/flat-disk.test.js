import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KILOMETRES_PER_DEGREE, EQUATOR_RADIUS_KM, DISK_RADIUS_KM, DISK_RADIUS_METERS,
  project, unproject, radialFraction, radialDistanceFromNorthKm,
  latitudeFromRadialDistanceKm, colatitudeRadians, flatDiskDistanceMeters,
  flatDiskLinePath, northSouthDistanceKm, eastWestDistanceKm,
  flatDiskSectorAreaKm2, flatDiskPolygonMetrics, flatDiskFeatureAreaM2,
  projectGeoJSONRingParts
} from '../src/core/dual-disk.js';
import { measureDistanceMeters } from '../src/core/measurement-engine.js';
const point=(lat,lon)=>({lat,lon});
const close=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,actual+' != '+expected);

test('both equal planar disks use the specified 10,000.8 km Equator radius',()=>{
 assert.equal(KILOMETRES_PER_DEGREE,111.12);
 assert.equal(EQUATOR_RADIUS_KM,10000.8);
 assert.equal(DISK_RADIUS_KM,10000.8);
 assert.equal(DISK_RADIUS_METERS,10000800);
});
test('North and South Poles are disk centres and Greenwich hinge points coincide',()=>{
 const northPole=project(90,25),southPole=project(-90,-125);
 close(northPole.x,-EQUATOR_RADIUS_KM);close(northPole.y,0);
 close(southPole.x,EQUATOR_RADIUS_KM);close(southPole.y,0);
 const northHinge=project(0,0,'N'),southHinge=project(0,0,'S');
 assert.deepEqual(northHinge,{x:0,y:0,disk:'N'});
 assert.deepEqual(southHinge,{x:0,y:0,disk:'S'});
 assert.deepEqual(project(0,0),northHinge);
});
test('the two disks preserve the specified mirrored east-west orientation',()=>{
 const northEast=project(0,90,'N'),southEast=project(0,90,'S');
 close(northEast.x,-EQUATOR_RADIUS_KM);close(northEast.y,EQUATOR_RADIUS_KM);
 close(southEast.x,EQUATOR_RADIUS_KM);close(southEast.y,EQUATOR_RADIUS_KM);
 const northWest=project(0,-90,'N'),southWest=project(0,-90,'S');
 close(northWest.y,-EQUATOR_RADIUS_KM);close(southWest.y,-EQUATOR_RADIUS_KM);
 assert.equal(northEast.disk,'N');assert.equal(southEast.disk,'S');
});
test('projection and inverse projection round-trip ordinary points in both disks',()=>{
 for(const [lat,lon] of [[41.7151,44.8271],[75,-179.4],[32.5,151.2],[-32.5,151.2],[-75,-179.4],[-88,90]]) {
  const projected=project(lat,lon),decoded=unproject(projected.x,projected.y);
  close(decoded.lat,lat,1e-8);
  close(((decoded.lon-lon+540)%360)-180,0,1e-8);
  assert.equal(decoded.disk,lat>=0?'N':'S');
 }
 assert.deepEqual(project(10,540),project(10,180));
});
test('latitude rings use equal radial spacing independently on each disk',()=>{
 const latitudes=[90,75,60,45,30,15,0,-15,-30,-45,-60,-75,-90];
 const radii=latitudes.map(radialDistanceFromNorthKm);
 close(radii[0],0);close(radii[6],EQUATOR_RADIUS_KM);close(radii[12],0);
 for(let i=1;i<=6;i++)close(radii[i]-radii[i-1],1666.8);
 for(let i=7;i<latitudes.length;i++)close(radii[i-1]-radii[i],1666.8);
 for(const lat of [-90,-60,-15,0,15,60,90]) {
  close(radialFraction(lat),radialDistanceFromNorthKm(lat)/EQUATOR_RADIUS_KM);
 }
 close(latitudeFromRadialDistanceKm(1666.8,'N'),75);
 close(latitudeFromRadialDistanceKm(1666.8,'S'),-75);
 close(colatitudeRadians(90),0);close(colatitudeRadians(0),Math.PI/2);
 close(northSouthDistanceKm(90,75),1666.8);
});
test('same-disk distance is exactly the projected Euclidean chord',()=>{
 const first=point(55,30),second=point(22,-8);
 const a=project(first.lat,first.lon),b=project(second.lat,second.lon);
 const expected=Math.hypot(b.x-a.x,b.y-a.y)*1000;
 close(flatDiskDistanceMeters(first,second),expected,1e-6);
 close(measureDistanceMeters(first,second),expected,1e-6);
 assert.equal(project(0,180).x,project(0,-180).x);
 assert.equal(flatDiskDistanceMeters(point(91,0),second),null);
});
test('cross-Equator line path contains the two independent hinge chords',()=>{
 const first=point(38.89,-77.05),second=point(-35.27,149.13);
 const path=flatDiskLinePath(first,second);
 assert.equal(path.length,2);
 assert.notDeepEqual(path[0][1],path[1][0]);
 for(const segment of path)assert.equal(segment.length,2);
});
test('latitude helpers and planar sector area remain Euclidean',()=>{
 const radius=radialDistanceFromNorthKm(25);
 close(eastWestDistanceKm(25,Math.PI/3),2*radius*Math.sin(Math.PI/6));
 close(flatDiskSectorAreaKm2(0,EQUATOR_RADIUS_KM,2*Math.PI),Math.PI*EQUATOR_RADIUS_KM**2);
 assert.equal(eastWestDistanceKm(91,1),null);
});
test('GeoJSON rings crossing the Equator produce separate Northern and Southern parts',()=>{
 const ring=[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]];
 const parts=projectGeoJSONRingParts(ring,project,{maxStepDegrees:2});
 assert.deepEqual(parts.map(part=>part.disk),['N','S']);
 for(const part of parts) {
  assert.ok(part.points.length>3);
  assert.ok(part.points.every(pair=>pair.every(Number.isFinite)));
 }
});
test('dateline-crossing rings clip with short wrapped edges on both disks',()=>{
 const ring=[[170,10],[160,10],[160,-10],[-170,-10],[170,10]];
 const parts=projectGeoJSONRingParts(ring,project,{maxStepDegrees:1});
 assert.deepEqual(parts.map(part=>part.disk),['N','S']);
 const north=parts.find(part=>part.disk==='N');
 const south=parts.find(part=>part.disk==='S');
 assert.ok(north.points.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
 assert.ok(south.points.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
 assert.ok(north.points.every(([x])=>x < -EQUATOR_RADIUS_KM));
 assert.ok(south.points.every(([x])=>x > EQUATOR_RADIUS_KM));
});
test('planar polygon area and perimeter use clipped geometry and canonical edge routes',()=>{
 const vertices=[point(10,-10),point(10,10),point(25,10),point(25,-10)];
 const result=flatDiskPolygonMetrics(vertices,project,measureDistanceMeters);
 assert.ok(result&&result.areaM2>0&&result.perimeterM>0);
 const perimeter=vertices.reduce((sum,item,index)=>sum+
  measureDistanceMeters(item,vertices[(index+1)%vertices.length]),0);
 close(result.perimeterM,perimeter,1e-5);
 const crossed=[point(10,-10),point(-10,10),point(-10,-10),point(10,10)];
 const crossedResult=flatDiskPolygonMetrics(crossed,project,measureDistanceMeters);
 assert.ok(crossedResult&&crossedResult.areaM2>0);
});
test('GeoJSON feature area subtracts clipped holes and rejects unsupported geometry',()=>{
 const ring=[[-20,10],[20,10],[20,30],[-20,30],[-20,10]];
 const hole=[[-5,15],[-5,20],[5,20],[5,15],[-5,15]];
 const shell=flatDiskFeatureAreaM2({geometry:{type:'Polygon',coordinates:[ring]}},project);
 const withHole=flatDiskFeatureAreaM2({geometry:{type:'Polygon',coordinates:[ring,hole]}},project);
 assert.ok(shell>0&&withHole>0&&withHole<shell);
 assert.equal(flatDiskFeatureAreaM2({geometry:{type:'Point',coordinates:[0,0]}},project),null);
});
