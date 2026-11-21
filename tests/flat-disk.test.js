import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_CALIBRATION } from '../src/core/flight-calibration-parameters.js';
import {
  DISK_RADIAL_SCALE_KM, DISK_RADIUS_KM,
  colatitudeRadians, radialDistanceFromNorthKm, radialFraction,
  latitudeFromRadialDistanceKm, project, unproject,
  flatDiskDistanceMeters, flatDiskLinePath,
  northSouthDistanceKm, eastWestDistanceKm, flatDiskSectorAreaKm2,
  flatDiskPolygonMetrics, flatDiskFeatureAreaM2, projectGeoJSONRing,
  DISK_RADIUS_METERS
} from '../src/core/flat-disk.js';
import { radialWarpDerivative } from '../src/core/radial-warp.js';

const close = (actual, expected, tolerance, message='') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} != ${expected}`);
const point = (lat, lon) => ({lat, lon});

test('radial scale and disk radius use the fitted ADS-B flight-mileage parameters', () => {
  close(DISK_RADIAL_SCALE_KM, FLIGHT_CALIBRATION.radialScaleKm, 1e-12);
  close(DISK_RADIUS_KM, Math.PI * DISK_RADIAL_SCALE_KM, 1e-10);
  assert.equal(FLIGHT_CALIBRATION.target,
    'median observed ADS-B flight-track mileage from ground-speed × time integration');
  assert.equal(FLIGHT_CALIBRATION.trainingRouteCount, 33);
  assert.equal(FLIGHT_CALIBRATION.holdoutRouteCount, 4);
  assert.ok(FLIGHT_CALIBRATION.trainingExamples.length >= 10);
});

test('smooth radial warp preserves the pole and rim while recalibrating latitude-ring spacing', () => {
  assert.equal(FLIGHT_CALIBRATION.radialWarp.kind, 'regularized-power');
  assert.ok(FLIGHT_CALIBRATION.radialWarp.exponent > 0);
  assert.ok(FLIGHT_CALIBRATION.radialWarp.epsilon > 0);
  close(radialDistanceFromNorthKm(90), 0, 1e-12);
  close(radialDistanceFromNorthKm(-90), DISK_RADIUS_KM, 1e-8);
  assert.notEqual(radialFraction(0), colatitudeRadians(0) / Math.PI);

  let previous = -Infinity;
  for (let lat = 90; lat >= -90; lat -= 1) {
    const fraction = radialFraction(lat);
    assert.ok(fraction > previous);
    previous = fraction;
    close(latitudeFromRadialDistanceKm(radialDistanceFromNorthKm(lat)), lat, 1e-9);
  }
  assert.ok(radialWarpDerivative(0, FLIGHT_CALIBRATION.radialWarp) > 0);
  assert.ok(Number.isFinite(radialWarpDerivative(0, FLIGHT_CALIBRATION.radialWarp)));
  assert.ok(radialWarpDerivative(1, FLIGHT_CALIBRATION.radialWarp) > 0);
  assert.ok(Number.isFinite(radialWarpDerivative(1, FLIGHT_CALIBRATION.radialWarp)));
});

test('flat-disk projection round-trips, wraps longitude and keeps Gleason orientation', () => {
  const radius = 400;
  assert.ok(Math.hypot(...project(0, 90, radius)) < 1e-10);
  assert.ok(project(90, 0, radius)[1] < 0);
  const xy = project(44.8271, 41.7151, radius);
  const decoded = unproject(xy[0], xy[1], radius);
  close(decoded.lat, 41.7151, 1e-10);
  close(decoded.lon, 44.8271, 1e-10);
  assert.deepEqual(project(180, 0, radius), project(-180, 0, radius));
  assert.deepEqual(project(540, 0, radius), project(-180, 0, radius));
  assert.ok(Number.isNaN(project(0, 91, radius)[0]));
});

test('distance is the Euclidean straight segment between projected coordinates', () => {
  const a = point(0, 0), b = point(0, 90);
  const radius = radialDistanceFromNorthKm(0);
  close(flatDiskDistanceMeters(a, b), Math.SQRT2 * radius * 1000, 1e-6);
  const direct = flatDiskDistanceMeters(point(90, -170), point(90, 150));
  close(direct, 0, 1e-9);
  close(flatDiskDistanceMeters(point(0, 180), point(0, -180)), 0, 1e-8);
});

test('direct connector contains only the two projected endpoints', () => {
  const a = point(40.17, 44.5), b = point(-8.0476, -34.877);
  const projector = (lon, lat) => project(lon, lat, 500);
  const path = flatDiskLinePath(a, b, projector);
  assert.equal(path.length, 2);
  assert.deepEqual(path[0], projector(a.lon, a.lat));
  assert.deepEqual(path[1], projector(b.lon, b.lat));
  const renderedLineMeters = Math.hypot(
    path[1][0] - path[0][0], path[1][1] - path[0][1]
  ) * (DISK_RADIUS_KM * 1000 / 500);
  close(renderedLineMeters, flatDiskDistanceMeters(a, b), 1e-5);
  assert.deepEqual(flatDiskLinePath(a, b, () => [NaN, 0]), []);
});

test('radial separation and same-latitude straight chord formulas are planar', () => {
  close(northSouthDistanceKm(90, 0), radialDistanceFromNorthKm(0), 1e-10);
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

test('shoelace area remains accurate for a small polygon far from the coordinate origin', () => {
  const offsetProject = (lon, lat) => [10_000_000 + lon, 10_000_000 + lat];
  const square = [point(0, 0), point(0, 1), point(1, 1), point(1, 0)];
  const result = flatDiskPolygonMetrics(square, offsetProject, DISK_RADIUS_METERS);
  close(result.areaM2, 1, 1e-12);
  close(result.perimeterM, 4, 1e-12);
});

test('non-adjacent polygon edges that touch are rejected as self-intersections', () => {
  const touching = [
    point(0, 0), point(0, 4), point(4, 4), point(0, 2), point(4, 0)
  ];
  assert.equal(
    flatDiskPolygonMetrics(touching, (lon, lat) => [lon, lat], DISK_RADIUS_KM),
    null
  );
});

test('degenerate collinear polygons do not report a zero-area measurement', () => {
  const collinear = [point(0, 0), point(0, 2), point(0, 4)];
  assert.equal(
    flatDiskPolygonMetrics(collinear, (lon, lat) => [lon, lat], DISK_RADIUS_KM),
    null
  );
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

test('country area uses the same densified projected ring as the rendered boundary', () => {
  const projector = (lon, lat) => project(lon, lat, 600);
  const ring = [[0, 0], [24, 24], [48, 0], [0, 0]];
  const feature = {geometry:{type:'Polygon',coordinates:[ring]}};
  const projectedRing = projectGeoJSONRing(ring, projector);
  assert.ok(projectedRing.length > ring.length);

  let twiceArea = 0;
  for (let i = 0; i < projectedRing.length; i++) {
    const a = projectedRing[i], b = projectedRing[(i + 1) % projectedRing.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  const scale = DISK_RADIUS_METERS / 600;
  const expectedArea = Math.abs(twiceArea) / 2 * scale ** 2;
  close(
    flatDiskFeatureAreaM2(feature, projector, 600),
    expectedArea,
    expectedArea * 1e-14
  );
});

test('Antarctica area preserves the full southern rim sweep shown by the map', () => {
  const projector = (lon, lat) => project(lon, lat, 400);
  const ring = [
    [180, -60], [90, -60], [0, -60], [-90, -60], [-180, -60],
    [-180, -90], [180, -90], [180, -60]
  ];
  const feature = {geometry:{type:'Polygon',coordinates:[ring]}};
  const collapsed = projectGeoJSONRing(ring, projector);
  const rim = projectGeoJSONRing(ring, projector, {preserveAntarcticRim:true});
  assert.ok(rim.length > collapsed.length + 100);
  const withoutRim = flatDiskFeatureAreaM2(feature, projector, 400);
  const withRim = flatDiskFeatureAreaM2(feature, projector, 400, {preserveAntarcticRim:true});
  const mapRadius = 400;
  const scale = DISK_RADIUS_METERS / mapRadius;
  const southernBoundaryFraction = radialFraction(-60);
  const expectedAnnulusArea = Math.PI * (
    mapRadius ** 2 - (mapRadius * southernBoundaryFraction) ** 2
  ) * scale ** 2;
  close(withRim, expectedAnnulusArea, expectedAnnulusArea * 0.001);
  assert.ok(Math.abs(withRim - withoutRim) > expectedAnnulusArea * 0.05);
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
  assert.equal(flatDiskDistanceMeters(point(91, 0), point(0, 0)), null);
  assert.equal(northSouthDistanceKm(91, 0), null);
  assert.equal(eastWestDistanceKm(91, Math.PI / 3), null);
  assert.ok(Number.isNaN(colatitudeRadians(91)));
  assert.deepEqual(flatDiskLinePath(point(91, 0), point(0, 0),
    (lon, lat) => [lon, lat]), []);
  assert.equal(flatDiskPolygonMetrics(
    [point(0, 0), point(91, 1), point(1, 1)], (lon, lat) => [lon, lat], DISK_RADIUS_KM
  ), null);
  assert.equal(flatDiskPolygonMetrics(
    [point(0, 0), point(1, 1)], (lon, lat) => [lon, lat], 0
  ), null);
  assert.equal(flatDiskFeatureAreaM2({geometry:{type:'Point',coordinates:[0,0]}},
    (lon, lat) => [lon, lat], DISK_RADIUS_KM), null);
});
