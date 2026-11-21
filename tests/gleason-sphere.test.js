import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_KM, DISK_RADIUS_KM,
  colatitudeRadians, radialDistanceFromNorthKm, radialFraction,
  latitudeFromRadialDistanceKm, project, unproject,
  greatCircleDistanceMeters, greatCircleLinePath, sphericalDistanceMeters,
  northSouthDistanceKm, eastWestDistanceKm, sphericalSectorAreaKm2,
  areaDecodeFactorFromRadiusKm, getLocalScaleFactors,
  sphericalPolygonMetrics, sphericalFeatureAreaM2
} from '../src/core/gleason-sphere.js';

const close = (actual, expected, tolerance, message='') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} != ${expected}`);

test('sphere and full disk radius match the specified R = 6371 km model', () => {
  assert.equal(EARTH_RADIUS_KM, 6371);
  close(DISK_RADIUS_KM, Math.PI * 6371, 1e-10);
  close(DISK_RADIUS_KM, 20015.086796, 1e-6);
});

test('radial calibration is r = R * colatitude', () => {
  for (const [lat, radius] of [
    [90, 0], [60, 6371 * Math.PI / 6], [30, 6371 * Math.PI / 3],
    [0, 6371 * Math.PI / 2], [-30, 6371 * 2 * Math.PI / 3],
    [-60, 6371 * 5 * Math.PI / 6], [-90, DISK_RADIUS_KM]
  ]) close(radialDistanceFromNorthKm(lat), radius, 1e-9);
  for (const lat of [90, 60, 30, 0, -30, -60, -90]) {
    close(latitudeFromRadialDistanceKm(radialDistanceFromNorthKm(lat)), lat, 1e-10);
    close(radialFraction(lat), colatitudeRadians(lat) / Math.PI, 1e-15);
  }
});

test('spherical projection round-trips and preserves Gleason longitude orientation', () => {
  const radius = 400;
  assert.ok(Math.hypot(...project(0, 90, radius)) < 1e-10);
  const east = project(90, 0, radius);
  assert.ok(east[1] < 0);
  const point = { lat: 41.7151, lon: 44.8271 };
  const xy = project(point.lon, point.lat, radius);
  const decoded = unproject(xy[0], xy[1], radius);
  close(decoded.lat, point.lat, 1e-10);
  close(decoded.lon, point.lon, 1e-10);
});

test('north-south and same-latitude east-west formulas', () => {
  close(northSouthDistanceKm(90, 0), Math.PI * EARTH_RADIUS_KM / 2, 1e-10);
  close(eastWestDistanceKm(0, Math.PI / 180), EARTH_RADIUS_KM * Math.PI / 180, 1e-10);
  close(eastWestDistanceKm(60, Math.PI / 180), EARTH_RADIUS_KM * 0.5 * Math.PI / 180, 1e-10);
});

test('great-circle distance matches the spherical law of cosines', () => {
  const a = { lat: 12, lon: 25 }, b = { lat: -34, lon: 118 };
  const theta1 = Math.PI / 2 - a.lat * Math.PI / 180;
  const theta2 = Math.PI / 2 - b.lat * Math.PI / 180;
  const deltaLambda = (b.lon - a.lon) * Math.PI / 180;
  const cosine = Math.cos(theta1) * Math.cos(theta2) +
    Math.sin(theta1) * Math.sin(theta2) * Math.cos(deltaLambda);
  const expected = EARTH_RADIUS_KM * Math.acos(Math.max(-1, Math.min(1, cosine))) * 1000;
  close(greatCircleDistanceMeters(a, b), expected, 1e-6);
  assert.equal(sphericalDistanceMeters(a, b), greatCircleDistanceMeters(a, b));
});

test('great-circle distance handles coincident, antipodal and polar points', () => {
  assert.equal(greatCircleDistanceMeters({lat:0,lon:0},{lat:0,lon:0}), 0);
  close(greatCircleDistanceMeters({lat:90,lon:0},{lat:-90,lon:0}), Math.PI * EARTH_RADIUS_KM * 1000, 1e-6);
  close(greatCircleDistanceMeters({lat:90,lon:0},{lat:90,lon:125}), 0, 1e-6);
});

test('great-circle connector starts and ends at projected coordinates', () => {
  const a={lat:40.17,lon:44.5}, b={lat:-8.0476,lon:-34.877};
  const projector=(lon,lat)=>project(lon,lat,500);
  const path=greatCircleLinePath(a,b,projector,0.5);
  assert.ok(path.length>2);
  const start=projector(a.lon,a.lat), end=projector(b.lon,b.lat);
  close(Math.hypot(path[0][0]-start[0],path[0][1]-start[1]),0,1e-8);
  close(Math.hypot(path.at(-1)[0]-end[0],path.at(-1)[1]-end[1]),0,1e-8);
});

test('area correction m(theta) and stretch k(theta) match the quick-reference table', () => {
  const expected = [
    [90, 1, 1],
    [60, 0.9549296586, 1.0471975512],
    [30, 0.8269933431, 1.2091995762],
    [0, 0.6366197724, Math.PI / 2],
    [-30, 0.4134966716, 2.4183991523],
    [-60, 0.1909859317, 5.235987756],
    [-90, 0, Infinity]
  ];
  for (const [lat, decoder, stretch] of expected) {
    const actual = getLocalScaleFactors(lat);
    close(actual.eastWestDecoder, decoder, 5e-10);
    if (stretch === Infinity) {
      assert.equal(actual.eastWestStretch, Infinity);
      assert.equal(actual.areaStretch, Infinity);
    } else {
      close(actual.eastWestStretch, stretch, 5e-9);
      close(actual.areaStretch, stretch, 5e-9);
    }
    close(areaDecodeFactorFromRadiusKm(radialDistanceFromNorthKm(lat)), decoder, 5e-10);
  }
});

test('sector area formula returns the full sphere area for the full disk', () => {
  close(sphericalSectorAreaKm2(0, DISK_RADIUS_KM, 2 * Math.PI),
    4 * Math.PI * EARTH_RADIUS_KM ** 2, 1e-7);
  close(sphericalSectorAreaKm2(0, EARTH_RADIUS_KM * Math.PI / 2, 2 * Math.PI),
    2 * Math.PI * EARTH_RADIUS_KM ** 2, 1e-7);
});

test('surface polygon integrator evaluates radial Jacobian and corrected boundary length', () => {
  const baseRadius = DISK_RADIUS_KM;
  const projectKm = (lon, lat) => [lon, lat];
  const triangle = [
    {lon: 0, lat: 0}, {lon: 100, lat: 0}, {lon: 0, lat: 100}
  ];
  const result = sphericalPolygonMetrics(triangle, projectKm, baseRadius);
  assert.ok(result && result.areaM2 > 0 && result.perimeterM > 0);
  const reversed = sphericalPolygonMetrics([...triangle].reverse(), projectKm, baseRadius);
  close(result.areaM2, reversed.areaM2, 1e-5);
  close(result.perimeterM, reversed.perimeterM, 1e-5);
});

test('polygon integrator rejects self-intersecting click polygons', () => {
  const bowTie = [
    {lon: 0, lat: 0}, {lon: 100, lat: 100},
    {lon: 0, lat: 100}, {lon: 100, lat: 0}
  ];
  assert.equal(sphericalPolygonMetrics(bowTie, (x,y)=>[x,y], DISK_RADIUS_KM), null);
});

test('GeoJSON surface area subtracts holes and sums multipart geometry', () => {
  const identity = (lon, lat) => [lon, lat];
  const feature = { geometry: { type: 'Polygon', coordinates: [
    [[0,0],[80,0],[80,80],[0,80],[0,0]],
    [[20,20],[40,20],[40,40],[20,40],[20,20]]
  ]}};
  const outer = sphericalFeatureAreaM2({geometry:{type:'Polygon',coordinates:[feature.geometry.coordinates[0]]}}, identity, DISK_RADIUS_KM);
  const hole = sphericalFeatureAreaM2({geometry:{type:'Polygon',coordinates:[feature.geometry.coordinates[1]]}}, identity, DISK_RADIUS_KM);
  close(sphericalFeatureAreaM2(feature, identity, DISK_RADIUS_KM), outer-hole, 1e-5);

  const multi = { geometry: { type: 'MultiPolygon', coordinates: [
    [[[0,0],[40,0],[40,40],[0,40],[0,0]]],
    [[[100,0],[140,0],[140,40],[100,40],[100,0]]]
  ]}};
  const one = sphericalFeatureAreaM2({geometry:{type:'Polygon',coordinates:[multi.geometry.coordinates[0][0]]}}, identity, DISK_RADIUS_KM);
  close(sphericalFeatureAreaM2(multi, identity, DISK_RADIUS_KM), 2*one, 1e-5);
});

test('canvas radius normalization keeps physical measurements stable after resizing', () => {
  const a = {lat:12,lon:25}, b={lat:-34,lon:118};
  const d = greatCircleDistanceMeters(a,b);
  const p1=project(b.lon,b.lat,300), p2=project(b.lon,b.lat,900);
  close(p1[0]/300,p2[0]/900,1e-14);
  assert.ok(d>0);
});
