import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance,
  directLineCalibrationFactor
} from '../src/core/measurement-engine.js';
import { flatDiskDistanceMeters } from '../src/core/flat-disk.js';

const point = (lat, lon) => ({ lat, lon });

const fittedCityPairs = [
  ['Helsinki–Wellington', point(60.17, 24.93), point(-41.3, 174.78), 17068],
  ['Suva–New Delhi', point(-18.13, 178.42), point(28.6, 77.2), 12028],
  ['Mexico City–Lisbon', point(19.43, -99.13), point(38.72, -9.13), 8686],
  ['Ankara–Washington, D.C.', point(39.93, 32.87), point(38.89, -77.05), 8746],
  ['Santiago–Paris', point(-33.45, -70.67), point(48.87, 2.33), 11627],
  ['Brasília–London', point(-15.79, -47.88), point(51.5, -0.08), 8772],
  ['Buenos Aires–Canberra', point(-34.58, -58.67), point(-35.27, 149.13), 11759],
  ['Tokyo–Madrid', point(35.68, 139.75), point(40.4, -3.68), 10789],
  ['Santiago–Canberra', point(-33.45, -70.67), point(-35.27, 149.13), 11345],
  ['Paris–Rome', point(48.87, 2.33), point(41.9, 12.48), 1109],
  ['Tokyo–Seoul', point(35.68, 139.75), point(37.55, 126.98), 1160],
  ['Yerevan–Moscow', point(40.17, 44.5), point(55.75, 37.6), 1804],
  ['Nairobi–Cairo', point(-1.28, 36.82), point(30.05, 31.25), 3518],
  ['London–Reykjavik', point(51.5, -0.08), point(64.15, -21.95), 1894],
  ['Mexico City–Washington, D.C.', point(19.43, -99.13), point(38.89, -77.05), 3030]
];

const heldOutAirportPairs = [
  ['SCL–SYD', point(-33.3929, -70.7858), point(-33.9461, 151.1772), 11363],
  ['LHR–SIN', point(51.47, -0.4543), point(1.3644, 103.9915), 10886],
  ['ORD–HKG', point(41.9742, -87.9073), point(22.308, 113.9185), 12543],
  ['HEL–NRT', point(60.3172, 24.9633), point(35.772, 140.3929), 7848],
  ['JFK–SIN', point(40.6413, -73.7781), point(1.3644, 103.9915), 15347]
];

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('A–B connector length starts with one straight projected flat-disk chord', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-empirical-direct');
  assert.equal(result.restricted, false);
  assert.equal(result.chordDistanceMeters, flatDiskDistanceMeters(a, b));
  assert.equal(result.distanceMeters, result.chordDistanceMeters * result.calibrationFactor);
  assert.ok(result.calibrationFactor >= 0.9 && result.calibrationFactor <= 2.5);
  assert.ok(result.distanceMeters > 0);
});

test('the empirical factor is symmetric and longitude-wrap safe', () => {
  const a = point(12.5, 179.9), b = point(13.1, -179.8);
  assert.equal(directLineCalibrationFactor(a, b), directLineCalibrationFactor(b, a));
  assert.ok(Number.isFinite(directLineCalibrationFactor(a, point(12.5, 180.2))));
});

test('the same flat-map correction applies to endpoints in the Antarctic band', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-empirical-direct');
  assert.equal(result.distanceMeters, result.chordDistanceMeters * directLineCalibrationFactor(a, b));
});

test('crossing the 60°S reference line does not switch the direct-line metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'flat-disk-empirical-direct');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, result.chordDistanceMeters * directLineCalibrationFactor(a, b));
});

test('opposite points on the 60°S parallel retain a straight, measurable connector', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-empirical-direct');
  assert.equal(result.restricted, false);
  assert.ok(result.distanceMeters > 0);
});

test('local Antarctic segments and one restricted-line touch remain measurable', () => {
  assert.equal(segmentCrossesRestrictedParallel(point(-70, 0), point(-70, 10)), false);
  assert.equal(segmentCrossesRestrictedParallel(point(-60, 0), point(-70, 0)), false);
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric,
    'flat-disk-empirical-direct');
});

for (const [name, a, b, referenceKm] of fittedCityPairs) {
  test(`fitted city-pair calibration: ${name}`, () => {
    const result = measureDirectDistance(a, b);
    const errorRatio = Math.abs(result.distanceMeters / 1000 - referenceKm) / referenceKm;
    assert.ok(errorRatio <= 0.07,
      `${name}: ${(result.distanceMeters / 1000).toFixed(1)} km vs ${referenceKm} km`);
  });
}

for (const [name, a, b, referenceKm] of heldOutAirportPairs) {
  test(`held-out airport-pair calibration: ${name}`, () => {
    const result = measureDirectDistance(a, b);
    const errorRatio = Math.abs(result.distanceMeters / 1000 - referenceKm) / referenceKm;
    assert.ok(errorRatio <= 0.09,
      `${name}: ${(result.distanceMeters / 1000).toFixed(1)} km vs ${referenceKm} km`);
  });
}

test('calibration is bounded for extreme polar endpoints', () => {
  for (const [a, b] of [
    [point(90, 0), point(80, 90)],
    [point(-90, 0), point(-80, 90)],
    [point(90, 0), point(-90, 180)]
  ]) {
    const factor = directLineCalibrationFactor(a, b);
    assert.ok(Number.isFinite(factor));
    assert.ok(factor >= 0.9 && factor <= 2.5);
  }
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
  assert.equal(result.chordDistanceMeters, null);
  assert.equal(result.calibrationFactor, null);
  assert.equal(result.metric, 'unavailable');
  assert.equal(directLineCalibrationFactor(point(91, 0), point(0, 0)), null);
  assert.equal(result.restricted, false);
});
