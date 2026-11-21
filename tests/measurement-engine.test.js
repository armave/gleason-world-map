import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance
} from '../src/core/measurement-engine.js';
import { flatDiskDistanceMeters } from '../src/core/flat-disk.js';

const point = (lat, lon) => ({ lat, lon });

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('A–B distance equals the Euclidean length of its straight projected chord', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
  assert.ok(result.distanceMeters > 0);
});

test('Canberra–Santiago direct-line measurement uses the 11,340 km flat-map anchor', () => {
  const canberra = point(-35.27, 149.13);
  const santiago = point(-33.45, -70.67);
  const result = measureDirectDistance(canberra, santiago);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.ok(Math.abs(result.distanceMeters / 1000 - 11340) < 1e-7);
});

test('the same direct-line metric applies to endpoints in the Antarctic band', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('crossing the 60°S reference line does not change the direct-line metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('a long Antarctic-band segment is measured as one straight projected chord', () => {
  const a = point(-65.59, -5.78), b = point(-74.88, -176.24);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('opposite points on the 60°S parallel measure their straight map chord', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-direct');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
  assert.ok(result.distanceMeters > 0);
});

test('local Antarctic segments and a single restricted-line touch remain measurable', () => {
  assert.equal(segmentCrossesRestrictedParallel(point(-70, 0), point(-70, 10)), false);
  assert.equal(segmentCrossesRestrictedParallel(point(-60, 0), point(-70, 0)), false);
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric, 'flat-disk-direct');
});

test('polygon edges including closure are still checked for restricted-line crossings', () => {
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
