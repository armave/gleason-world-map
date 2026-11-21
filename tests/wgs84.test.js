import test from 'node:test';import assert from 'node:assert/strict';
import {rad,POLE_TO_POLE_KM,meridionalDistanceFromNorthKm,latitudeFromMeridionalDistanceKm,radialFraction,project,unproject,geodesicInverse,geodesicDirect,geodesicLinePath,getLocalWgs84ScaleFactors} from '../src/core/wgs84.js';
import {createMeasurementSegments} from '../src/map/measurements.js';
test('WGS84 pole-to-pole meridian distance',()=>{assert.ok(Math.abs(POLE_TO_POLE_KM-20003.93146)<.01);assert.equal(meridionalDistanceFromNorthKm(90),0);assert.ok(Math.abs(meridionalDistanceFromNorthKm(-90)-POLE_TO_POLE_KM)<1e-9);});
test('latitude and meridional radius invert',()=>{for(const lat of [90,60,30,0,-30,-60,-90])assert.ok(Math.abs(latitudeFromMeridionalDistanceKm(radialFraction(lat)*POLE_TO_POLE_KM)-lat)<1e-9);});
test('disk projection round trip and longitude orientation',()=>{const R=400;assert.ok(Math.hypot(...project(0,90,R))<1e-10);assert.ok(project(90,0,R)[1]<0);const p={lat:41.7151,lon:44.8271},xy=project(p.lon,p.lat,R),q=unproject(xy[0],xy[1],R);assert.ok(Math.abs(q.lat-p.lat)<1e-9);assert.ok(Math.abs(q.lon-p.lon)<1e-9);});
test('equatorial one-degree WGS84 distance',()=>{assert.ok(Math.abs(geodesicInverse({lat:0,lon:0},{lat:0,lon:1}).distanceMeters-111319.490793)<.01);});
test('WGS84 direct/inverse long route round trip',()=>{const a={lat:40.17,lon:44.5},b={lat:40.7,lon:-74},i=geodesicInverse(a,b),p=geodesicDirect(a,i.initialBearing,i.distanceMeters);assert.ok(geodesicInverse(p,b).distanceMeters<.01);});
test('radial/tangential scale diagnostics',()=>{const f=getLocalWgs84ScaleFactors(0);assert.equal(f.northSouthScale,1);assert.ok(Math.abs(f.eastWestStretch-1.56816)<.0001);assert.ok(Math.abs(f.eastWestStretch*f.eastWestDecoder-1)<1e-12);assert.equal(getLocalWgs84ScaleFactors(-90).eastWestStretch,Infinity);});


test('geodesic line path uses the map projector passed by the caller',()=>{
 const a={lat:-34.6037,lon:-58.3816},b={lat:-8.0476,lon:-34.877};
 const radius=400;
 const mapProjector=(lon,lat)=>project(lon,lat,radius);
 const path=geodesicLinePath(a,b,mapProjector);
 assert.ok(path.length>=3,'the route includes intermediate samples');
 assert.ok(path.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)),
  'every projected route coordinate is finite');
 const start=mapProjector(a.lon,a.lat),end=mapProjector(b.lon,b.lat);
 assert.ok(Math.hypot(path[0][0]-start[0],path[0][1]-start[1])<1e-8);
 assert.ok(Math.hypot(path.at(-1)[0]-end[0],path.at(-1)[1]-end[1])<1e-5);
});

test('real WGS84 paths produce drawable distance and area connector segments',()=>{
 const a={lat:-34.6037,lon:-58.3816},b={lat:-8.0476,lon:-34.877},c={lat:4.711,lon:-74.0721};
 const mapProjector=(lon,lat)=>project(lon,lat,400);
 const createPath=(from,to)=>geodesicLinePath(from,to,mapProjector);
 const distance=createMeasurementSegments([a,b],createPath);
 const area=createMeasurementSegments([a,b,c],createPath,true);
 assert.equal(distance.length,1);
 assert.equal(area.length,3);
 for(const segment of [...distance,...area]){
  assert.ok(segment.length>=3);
  assert.ok(segment.flat().every(Number.isFinite));
 }
});
