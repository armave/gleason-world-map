import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance
} from '../src/core/measurement-engine.js';
import { geodesicDistanceMeters } from '../src/core/geodesic.js';

const point = (lat, lon) => ({ lat, lon });

test('the restricted line is the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('ordinary northern A–B measurements use WGS84', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('A–B distances remain WGS84 when both endpoints are in the Antarctic band', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('crossing the 60°S line never changes the A–B metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('long Antarctic-band segments use the shortest WGS84 route, not a disk chord', () => {
  const a = point(-65.59, -5.78), b = point(-74.88, -176.24);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
  assert.ok(Math.abs(result.distanceMeters / 1000 - 4398.260680) < 0.01);
});

test('a straight projected connector through the inner disk remains measurable', () => {
  const a = point(-70, 0), b = point(-70, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
  assert.ok(result.distanceMeters > 0);
});

test('local ice-wall segments and a single boundary touch remain measurable', () => {
  assert.equal(segmentCrossesRestrictedParallel(point(-70, 0), point(-70, 10)), false);
  assert.equal(segmentCrossesRestrictedParallel(point(-60, 0), point(-70, 0)), false);
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric, 'wgs84');
});

test('opposite points on 60°S use WGS84 even when the projected connector crosses the disk', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('polygon edges including closure are checked for restricted-line crossings', () => {
  assert.equal(polylineCrossesRestrictedParallel([point(10, 0), point(20, 20)]), false);
  const ring = [point(-70, 0), point(-70, 120), point(-70, -120)];
  assert.equal(polylineCrossesRestrictedParallel(ring, true), true);
  assert.equal(polylineCrossesRestrictedParallel([point(-70, 0), point(-70, 10)]), false);
});

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
  assert.equal(result.metric, 'unavailable');
  assert.equal(result.restricted, false);
});
