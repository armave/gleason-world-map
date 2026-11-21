import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance
} from '../src/core/measurement-engine.js';
import { flatDiskDistanceMeters } from '../src/core/flat-disk.js';
import { geodesicDistanceMeters } from '../src/core/geodesic.js';

const point = (lat, lon) => ({ lat, lon });

test('the restricted circle is the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('ordinary northern A–B measurements still use WGS84', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'wgs84');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('measurements wholly within the ice-wall band use flat-disk distance', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
  assert.notEqual(result.distanceMeters, geodesicDistanceMeters(a, b));
});

test('a direct connector crossing 60°S remains measurable with the flat-disk metric', () => {
  const a = point(-55, 20), b = point(-65, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('a chord through the inner disk remains measurable when both points are south of 60°S', () => {
  const a = point(-70, 0), b = point(-70, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
  assert.ok(result.distanceMeters > 0);
});

test('local ice-wall segments and a single boundary touch are allowed', () => {
  assert.equal(segmentCrossesRestrictedParallel(point(-70, 0), point(-70, 10)), false);
  assert.equal(segmentCrossesRestrictedParallel(point(-60, 0), point(-70, 0)), false);
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric, 'flat-disk');
});

test('a chord joining opposite points on 60°S is measurable', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('polygon edges including closure are checked for crossings', () => {
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
