import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISK_RADIAL_SCALE_KM, DISK_RADIUS_KM,
  colatitudeRadians, radialDistanceFromNorthKm, radialFraction,
  latitudeFromRadialDistanceKm, project, unproject,
  flatDiskDistanceMeters, flatDiskLinePath,
  northSouthDistanceKm, eastWestDistanceKm, flatDiskSectorAreaKm2,
  flatDiskPolygonMetrics, flatDiskFeatureAreaM2
} from '../src/core/flat-disk.js';

const close = (actual, expected, tolerance, message='') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} != ${expected}`);
const point = (lat, lon) => ({lat, lon});

test('radial scale and full disk radius use the selected 6,371 km calibration', () => {
  assert.equal(DISK_RADIAL_SCALE_KM, 6371);
  close(DISK_RADIUS_KM, Math.PI * 6371, 1e-10);
  close(DISK_RADIUS_KM, 20015.086796, 1e-6);
});

test('radial calibration is r = R times colatitude', () => {
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

test('flat-disk projection round-trips and keeps Gleason eastward orientation', () => {
  const radius = 400;
  assert.ok(Math.hypot(...project(0, 90, radius)) < 1e-10);
  assert.ok(project(90, 0, radius)[1] < 0);
  const xy = project(44.8271, 41.7151, radius);
  const decoded = unproject(xy[0], xy[1], radius);
  close(decoded.lat, 41.7151, 1e-10);
  close(decoded.lon, 44.8271, 1e-10);
});

test('distance is the Euclidean straight segment between projected coordinates', () => {
  const a = point(0, 0), b = point(0, 90);
  const radius = radialDistanceFromNorthKm(0);
  close(flatDiskDistanceMeters(a, b), Math.SQRT2 * radius * 1000, 1e-6);
  const direct = flatDiskDistanceMeters(point(90, -170), point(90, 150));
  close(direct, 0, 1e-9);
});

test('direct connector contains only the two projected endpoints', () => {
  const a = point(40.17, 44.5), b = point(-8.0476, -34.877);
  const projector = (lon, lat) => project(lon, lat, 500);
  const path = flatDiskLinePath(a, b, projector);
  assert.equal(path.length, 2);
  assert.deepEqual(path[0], projector(a.lon, a.lat));
  assert.deepEqual(path[1], projector(b.lon, b.lat));
  assert.deepEqual(flatDiskLinePath(a, b, () => [NaN, 0]), []);
});

test('radial separation and same-latitude straight chord formulas are planar', () => {
  close(northSouthDistanceKm(90, 0), Math.PI * DISK_RADIAL_SCALE_KM / 2, 1e-10);
  const r = radialDistanceFromNorthKm(0);
  close(eastWestDistanceKm(0, Math.PI / 180),
    2 * r * Math.sin(Math.PI / 360), 1e-10);
});

test('sector area uses Euclidean disk geometry', () => {
  close(flatDiskSectorAreaKm2(0, DISK_RADIUS_KM, 2 * Math.PI),
    Math.PI * DISK_RADIUS_KM ** 2, 1e-7);
  close(flatDiskSectorAreaKm2(0, 100, Math.PI / 2), 2500 * Math.PI, 1e-10);
});

test('polygon uses shoelace area and straight-edge perimeter', () => {
  const triangle = [point(0, 0), point(0, 3), point(4, 0)];
  const result = flatDiskPolygonMetrics(triangle, (lon, lat) => [lon, lat], DISK_RADIUS_KM);
  assert.ok(result);
  close(result.areaM2, 6e6, 1e-6);
  close(result.perimeterM, 12e3, 1e-6);
  const reversed = flatDiskPolygonMetrics([...triangle].reverse(), (lon, lat) => [lon, lat], DISK_RADIUS_KM);
  close(reversed.areaM2, result.areaM2, 1e-6);
  close(reversed.perimeterM, result.perimeterM, 1e-6);
});

test('polygon closure is automatic and self-intersections are rejected', () => {
  const open = [point(0, 0), point(0, 4), point(4, 4), point(4, 0)];
  const closed = [...open, point(0, 0)];
  const measure = points => flatDiskPolygonMetrics(points, (lon, lat) => [lon, lat], DISK_RADIUS_KM);
  assert.deepEqual(measure(open), measure(closed));
  const bowTie = [point(0, 0), point(4, 4), point(0, 4), point(4, 0)];
  assert.equal(measure(bowTie), null);
});

test('GeoJSON Polygon subtracts holes and MultiPolygon sums components', () => {
  const identity = (lon, lat) => [lon, lat];
  const feature = {geometry:{type:'Polygon',coordinates:[
    [[0,0],[4,0],[4,4],[0,4],[0,0]],
    [[1,1],[3,1],[3,3],[1,3],[1,1]]
  ]}};
  close(flatDiskFeatureAreaM2(feature, identity, DISK_RADIUS_KM), 12e6, 1e-6);

  const multi = {geometry:{type:'MultiPolygon',coordinates:[
    [[[0,0],[2,0],[2,2],[0,2],[0,0]]],
    [[[5,0],[7,0],[7,2],[5,2],[5,0]]]
  ]}};
  close(flatDiskFeatureAreaM2(multi, identity, DISK_RADIUS_KM), 8e6, 1e-6);
});

test('canvas normalization keeps planar measurements stable across resize', () => {
  const a = point(12, 25), b = point(-34, 118);
  close(flatDiskDistanceMeters(a, b), flatDiskDistanceMeters(a, b), 0);
  const small = flatDiskPolygonMetrics(
    [a, b, point(-5, 80)],
    (lon, lat) => project(lon, lat, 300), 300
  );
  const large = flatDiskPolygonMetrics(
    [a, b, point(-5, 80)],
    (lon, lat) => project(lon, lat, 900), 900
  );
  close(small.areaM2, large.areaM2, 0.1);
  close(small.perimeterM, large.perimeterM, 1e-5);
});

test('invalid coordinates and invalid calibration fail safely', () => {
  assert.equal(flatDiskDistanceMeters(point(0, 0), point(NaN, 1)), null);
  assert.equal(flatDiskPolygonMetrics(
    [point(0, 0), point(1, 1)], (lon, lat) => [lon, lat], 0
  ), null);
  assert.equal(flatDiskFeatureAreaM2({geometry:{type:'Point',coordinates:[0,0]}},
    (lon, lat) => [lon, lat], DISK_RADIUS_KM), null);
});
