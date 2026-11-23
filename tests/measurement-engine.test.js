import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance,
  measureDistanceMeters
} from '../src/core/measurement-engine.js';
import {
  DISK_RADIAL_SCALE_KM,
  DISK_BASE_RADIUS_KM,
  DISK_RADIUS_KM,
  flatDiskDistanceMeters,
  flatDiskLinePath,
  project
} from '../src/core/flat-disk.js';
import { FLIGHT_PATH_CALIBRATION } from '../src/core/flight-path-calibration-parameters.js';
import { RADIAL_DISTANCE_PROFILE_MEAN, radialDistanceCorrectionFactor } from '../src/core/visual-radial-calibration.js';

const point = (lat, lon) => ({ lat, lon });

test('A–B distance is the visible projected chord, not a base-geometry or flight-mileage estimate', () => {
  const first = point(-33.45, -70.67);
  const second = point(-35.27, 149.13);
  const result = measureDirectDistance(first, second);
  const line = flatDiskLinePath(first, second, (longitude, latitude) =>
    project(longitude, latitude, 480)
  );
  const drawnSegmentMeters = Math.hypot(
    line[1][0] - line[0][0],
    line[1][1] - line[0][1]
  ) * DISK_RADIUS_KM / 480 * 1000;

  assert.equal(result.metric, 'anisotropic-planar-segment');
  assert.equal(result.restricted, false);
  assert.ok(Number.isFinite(result.distanceMeters));
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(first, second));
  assert.equal(result.distanceMeters, drawnSegmentMeters);
  assert.equal(result.distanceMeters, measureDistanceMeters(first, second));
  assert.equal(result.distanceMeters, measureDirectDistance(second, first).distanceMeters);
});

test('moving an endpoint to a different part of the disk changes the distance by the visible chord amount', () => {
  const destination = point(-48, -66);
  const firstStart = point(18, -70);
  const relocatedStart = point(65, -150);

  const firstDistance = measureDistanceMeters(firstStart, destination);
  const relocatedDistance = measureDistanceMeters(relocatedStart, destination);

  assert.ok(Math.abs(firstDistance - relocatedDistance) > 1_000_000,
    'moving A from the western/central disk to Alaska should materially change the connector length');
  assert.equal(firstDistance, flatDiskDistanceMeters(firstStart, destination));
  assert.equal(relocatedDistance, flatDiskDistanceMeters(relocatedStart, destination));
});

test('same-circle distances increase with the visible separation of the endpoints', () => {
  const shorter = measureDirectDistance(point(40.17, 44.5), point(40.17, 45.5));
  const longer = measureDirectDistance(point(40.17, 44.5), point(40.17, 50.5));
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
  assert.equal(shorter.distanceMeters,
    flatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 45.5)));
  assert.equal(longer.distanceMeters,
    flatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 50.5)));
});

test('same-longitude intervals measure the radial chord in the visible disk', () => {
  for (const [latitudeA, latitudeB] of [
    [90, 75], [75, 60], [60, 45], [45, 30],
    [30, 15], [15, 0], [0, -15], [-15, -30],
    [-30, -45], [-45, -60], [-60, -75], [-75, -90]
  ]) {
    const first = point(latitudeA, 23), second = point(latitudeB, 23);
    const result = measureDirectDistance(first, second);
    assert.equal(result.metric, 'anisotropic-planar-segment');
    assert.equal(result.distanceMeters, flatDiskDistanceMeters(first, second));
    assert.ok(result.distanceMeters > 0);
  }
});

test('the Antarctic rim preserves longitude-indexed positions under the anisotropic planar metric', () => {
  const first = point(-90, 0), second = point(-90, 180);
  const result = measureDirectDistance(first, second);
  assert.equal(result.metric, 'anisotropic-planar-segment');
  assert.ok(result.distanceMeters > 17_000_000);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(first, second));
  assert.equal(result.distanceMeters,
    measureDirectDistance(second, first).distanceMeters);
});

test('longitude wrapping does not change the anisotropic flat-disk metric', () => {
  const first = point(-33.4489, -70.6693);
  const second = point(-35.2809, 149.13);
  const expected = measureDistanceMeters(first, second);
  assert.equal(expected, measureDistanceMeters(second, first));
  assert.ok(Math.abs(expected - measureDistanceMeters(first, point(second.lat, second.lon + 720))) < 1e-6);
  assert.ok(Math.abs(expected - measureDistanceMeters(first, point(second.lat, second.lon - 1080))) < 1e-6);
});

test('the visible map geometry retains its fitted display scale and 12-circle profile', () => {
  assert.equal(DISK_RADIAL_SCALE_KM, FLIGHT_PATH_CALIBRATION.radialScaleKm);
  assert.ok(DISK_RADIAL_SCALE_KM > 0);
  assert.equal(DISK_BASE_RADIUS_KM, Math.PI * DISK_RADIAL_SCALE_KM);
  assert.equal(DISK_RADIUS_KM, DISK_BASE_RADIUS_KM * RADIAL_DISTANCE_PROFILE_MEAN);
  assert.equal(radialDistanceCorrectionFactor(0), 1);
  assert.equal(radialDistanceCorrectionFactor(1), 0.5);
});

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('crossing the 60°S reference line does not switch the direct-line metric', () => {
  const first = point(-59.9, 20), second = point(-60.1, 110);
  assert.equal(segmentCrossesRestrictedParallel(first, second), true);
  assert.equal(measureDirectDistance(first, second).metric, 'anisotropic-planar-segment');
});

test('opposite points on the 60°S parallel retain a straight, measurable connector', () => {
  const first = point(-60, 0), second = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(first, second), true);
  assert.ok(measureDirectDistance(first, second).distanceMeters > 0);
});

test('restricted-line crossing checks use the displayed longitude-deformed endpoints', () => {
  const first = point(-65, -180);
  const second = point(-75, -145);
  assert.equal(segmentCrossesRestrictedParallel(first, second), true);
});

test('southern local segments and one restricted-line touch remain measurable', () => {
  const first = point(-70, 10), second = point(-70, 20);
  assert.equal(segmentCrossesRestrictedParallel(first, second), false);
  assert.equal(measureDirectDistance(first, second).metric, 'anisotropic-planar-segment');
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric,
    'anisotropic-planar-segment');
});

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
  assert.equal(result.metric, 'unavailable');
  assert.equal(result.restricted, false);
  assert.equal(measureDistanceMeters(point(0, 0), point(0, Infinity)), null);
});

test('closed polygons still check every edge, including the closing segment', () => {
  assert.equal(polylineCrossesRestrictedParallel([point(10, 0), point(20, 20)]), false);
  const ring = [point(-70, 0), point(-70, 120), point(-70, -120)];
  assert.equal(polylineCrossesRestrictedParallel(ring, true), true);
  assert.equal(polylineCrossesRestrictedParallel([point(-70, 0), point(-70, 10)]), false);
});
