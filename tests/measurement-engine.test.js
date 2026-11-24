import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measureDirectDistance,
  measureDistanceMeters
} from '../src/core/measurement-engine.js';
import {
  DISK_RADIUS_KM,
  flatDiskDistanceMeters,
  flatDiskLinePath,
  project
} from '../src/core/flat-disk.js';

const point = (lat, lon) => ({ lat, lon });

test('A–B returns the Euclidean chord in the visible Gleason disk plane', () => {
  const first = point(-33.45, -70.67);
  const second = point(-35.27, 149.13);
  const result = measureDirectDistance(first, second);
  const projectedA = project(first.lon, first.lat, DISK_RADIUS_KM);
  const projectedB = project(second.lon, second.lat, DISK_RADIUS_KM);
  const expected = Math.hypot(
    projectedB[0] - projectedA[0],
    projectedB[1] - projectedA[1]
  ) * 1000;

  assert.equal(result.metric, 'euclidean-flat-disk-chord');
  assert.ok(Number.isFinite(result.distanceMeters));
  assert.ok(Math.abs(result.distanceMeters - expected) < 1e-6);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(first, second));
  assert.equal(result.distanceMeters, measureDistanceMeters(first, second));
  assert.equal(result.distanceMeters,
    measureDirectDistance(second, first).distanceMeters);
});

test('same endpoints produce the same line length as the red connector', () => {
  const first = point(40.17, 44.5);
  const second = point(-8.0476, -34.877);
  const line = flatDiskLinePath(first, second, (longitude, latitude) =>
    project(longitude, latitude, 480)
  );
  assert.equal(line.length, 2);
  const lineKm = Math.hypot(
    line[1][0] - line[0][0],
    line[1][1] - line[0][1]
  ) * DISK_RADIUS_KM / 480;
  const result = measureDirectDistance(first, second);
  assert.ok(Math.abs(result.distanceMeters / 1000 - lineKm) < 1e-8);
});

test('moving an endpoint changes the Euclidean projected chord', () => {
  const destination = point(-48, -66);
  const firstStart = point(18, -70);
  const relocatedStart = point(65, -150);
  const firstDistance = measureDistanceMeters(firstStart, destination);
  const relocatedDistance = measureDistanceMeters(relocatedStart, destination);
  assert.notEqual(firstDistance, relocatedDistance);
  assert.ok(Math.abs(firstDistance - relocatedDistance) > 1000);
});

test('same-latitude distances increase with the visible angular separation', () => {
  const shorter = measureDirectDistance(point(40.17, 44.5), point(40.17, 45.5));
  const longer = measureDirectDistance(point(40.17, 44.5), point(40.17, 50.5));
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
});

test('longitude wrapping leaves the point and chord unchanged', () => {
  const first = point(-33.4489, -70.6693);
  const second = point(-35.2809, 149.13);
  const expected = measureDistanceMeters(first, second);
  assert.ok(Math.abs(expected -
    measureDistanceMeters(first, point(second.lat, second.lon + 720))) < 1e-6);
  assert.ok(Math.abs(expected -
    measureDistanceMeters(first, point(second.lat, second.lon - 1080))) < 1e-6);
});

test('the Antarctic rim retains separate longitude-indexed points', () => {
  const first = point(-90, 0), second = point(-90, 180);
  const result = measureDirectDistance(first, second);
  assert.equal(result.metric, 'euclidean-flat-disk-chord');
  assert.ok(result.distanceMeters > 39_000_000);
  assert.equal(result.distanceMeters,
    measureDirectDistance(second, first).distanceMeters);
});

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
  assert.equal(result.metric, 'unavailable');
  assert.equal(measureDistanceMeters(point(0, 0), point(0, Infinity)), null);
  assert.equal(measureDistanceMeters(null, point(0, 0)), null);
});
