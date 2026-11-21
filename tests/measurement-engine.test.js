import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance,
  directLineCalibrationFactor,
  directLineCalibrationDiagnostics
} from '../src/core/measurement-engine.js';
import {
  DISK_RADIAL_SCALE_KM,
  DISK_RADIUS_KM,
  flatDiskDistanceMeters
} from '../src/core/flat-disk.js';
import { FLIGHT_CALIBRATION } from '../src/core/flight-calibration-parameters.js';

const point = (lat, lon) => ({ lat, lon });

const heldOutFlightMileageRoutes = [
  {
    route: 'Brisbane–Sydney (YBBN–YSSY)',
    first: point(-33.946666666667, 151.17611111111),
    second: point(-27.388888888889, 153.126111111111),
    medianTrackKm: 814.925394574103,
    telemetryCoverage: 1,
    expectedErrorPercent: -15.2
  },
  {
    route: 'Dubai–Singapore (OMDB–WSSS)',
    first: point(25.2528, 55.3644),
    second: point(1.3451159576023457, 103.99194013366014),
    medianTrackKm: 5699.2843254262025,
    telemetryCoverage: 0.3516,
    expectedErrorPercent: -2.0
  },
  {
    route: 'Doha–Tokyo (OTHH–RJAA)',
    first: point(25.275555555556, 51.618055555556),
    second: point(35.7647, 140.386),
    medianTrackKm: 8965.419707357165,
    telemetryCoverage: 0.3071,
    expectedErrorPercent: -3.5
  },
  {
    route: 'Istanbul–Amman (LTFM–OJAI)',
    first: point(41.275277777778, 28.751944444444),
    second: point(31.7226, 35.9932),
    medianTrackKm: 1424.4753475218993,
    telemetryCoverage: 0.5355,
    expectedErrorPercent: -1.6
  }
];

test('the radial scale is the fitted ADS-B flight-mileage median scale', () => {
  assert.equal(DISK_RADIAL_SCALE_KM, FLIGHT_CALIBRATION.radialScaleKm);
  assert.ok(DISK_RADIAL_SCALE_KM > 0);
  assert.equal(DISK_RADIUS_KM, Math.PI * DISK_RADIAL_SCALE_KM);
  assert.equal(FLIGHT_CALIBRATION.trainingRouteCount, 33);
  assert.equal(FLIGHT_CALIBRATION.holdoutRouteCount, 4);
});

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('A–B distance keeps the raw chord and adds the separate ADS-B flight-mileage estimate', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-flight-empirical');
  assert.equal(result.restricted, false);
  assert.equal(result.chordDistanceMeters, flatDiskDistanceMeters(a, b));
  assert.equal(result.rawDistanceMeters, result.chordDistanceMeters);
  assert.equal(result.flightEmpiricalDistanceMeters, result.distanceMeters);
  assert.equal(result.calibratedDistanceMeters, result.distanceMeters);
  assert.equal(result.distanceMeters, result.chordDistanceMeters * result.calibrationFactor);
  assert.ok(result.calibrationFactor >= 0.5 && result.calibrationFactor <= 2.5);
  assert.ok(result.distanceMeters > 0);
});

test('the flight-mileage factor is symmetric and longitude-wrap safe', () => {
  const a = point(12.5, 179.9), b = point(13.1, -179.8);
  assert.equal(directLineCalibrationFactor(a, b), directLineCalibrationFactor(b, a));
  assert.ok(Number.isFinite(directLineCalibrationFactor(a, point(12.5, 180.2))));
});

test('the same flat-disk flight correction applies to endpoints in the Antarctic band', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-flight-empirical');
  assert.equal(result.distanceMeters, result.chordDistanceMeters * directLineCalibrationFactor(a, b));
});

test('crossing the 60°S reference line does not switch the direct-line metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'flat-disk-flight-empirical');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, result.chordDistanceMeters * result.calibrationFactor);
});

test('opposite points on the 60°S parallel retain a straight, measurable connector', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'flat-disk-flight-empirical');
  assert.ok(result.distanceMeters > 0);
});

test('southern local segments and one restricted-line touch remain measurable', () => {
  const a = point(-70, 10), b = point(-70, 20);
  assert.equal(segmentCrossesRestrictedParallel(a, b), false);
  assert.equal(measureDirectDistance(a, b).metric, 'flat-disk-flight-empirical');
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric,
    'flat-disk-flight-empirical');
});

for (const route of heldOutFlightMileageRoutes) {
  test(`independent ADS-B holdout mileage: ${route.route}`, () => {
    const result = measureDirectDistance(route.first, route.second);
    const predictedKm = result.distanceMeters / 1000;
    const errorPercent = (predictedKm / route.medianTrackKm - 1) * 100;
    assert.ok(Math.abs(errorPercent) <= 20,
      `${route.route}: ${predictedKm.toFixed(1)} km vs observed median ${route.medianTrackKm.toFixed(1)} km (${errorPercent.toFixed(1)}%)`);
    assert.equal(result.metric, 'flat-disk-flight-empirical');
    assert.ok(Number.isFinite(route.telemetryCoverage));
  });
}

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
  assert.equal(result.chordDistanceMeters, null);
  assert.equal(result.calibrationFactor, null);
  assert.equal(result.metric, 'unavailable');
  assert.equal(directLineCalibrationFactor(point(91, 0), point(0, 0)), null);
  assert.equal(result.restricted, false);
});

test('calibration diagnostics identify endpoint features outside the sampled route domain', () => {
  const diagnostics = directLineCalibrationDiagnostics(
    point(-80, 10), point(-80, 100)
  );
  assert.ok(diagnostics);
  assert.equal(diagnostics.outsideTrainingRange, true);
  assert.ok(diagnostics.warnings.includes('outside-training-range'));
  assert.equal(diagnostics.status, 'caution');
});

test('near-south-rim endpoints warn about longitude sensitivity without changing the chord', () => {
  const first = point(-89.99, 0), second = point(-89.99, 180);
  const result = measureDirectDistance(first, second);
  assert.ok(result.rawDistanceMeters > 17_000_000);
  assert.equal(result.rawDistanceMeters, flatDiskDistanceMeters(first, second));
  assert.equal(result.calibration.nearSouthRim, true);
  assert.ok(result.warnings.includes('near-south-rim'));
  assert.ok(Number.isFinite(result.calibratedDistanceMeters));
  assert.ok(result.calibrationFactor >= 0.5 && result.calibrationFactor <= 2.5);
});

test('longitude-separated South Pole coordinates remain distinct in the disk and are flagged', () => {
  const result = measureDirectDistance(point(-90, 0), point(-90, 180));
  assert.ok(result.rawDistanceMeters > 17_000_000);
  assert.equal(result.calibration.nearSouthRim, true);
  assert.ok(result.warnings.includes('near-south-rim'));
});

test('ordinary training-domain endpoints are not flagged as out of range', () => {
  const diagnostics = directLineCalibrationDiagnostics(
    point(40.17, 44.5), point(55.75, 37.6)
  );
  assert.ok(diagnostics);
  assert.equal(diagnostics.outsideTrainingRange, false);
  assert.equal(diagnostics.nearSouthRim, false);
  assert.equal(diagnostics.status, 'within-fit-range');
});

test('opposite-side longitude separation is flagged as outside the sampled angular range', () => {
  const diagnostics = directLineCalibrationDiagnostics(
    point(0, 0), point(0, 180)
  );
  assert.ok(diagnostics);
  assert.equal(diagnostics.outsideTrainingRange, true);
  assert.ok(diagnostics.warnings.includes('outside-training-range'));
});

test('the correction-bound diagnostic reports when the empirical factor is capped', () => {
  const result = measureDirectDistance(point(30, 0), point(90, 180));
  assert.equal(result.calibration.factorWasClamped, true);
  assert.ok(result.warnings.includes('factor-clamped'));
  assert.equal(result.calibrationFactor, 2.5);
});

test('polygon edges including closure are still checked for restricted-line crossings', () => {
  assert.equal(polylineCrossesRestrictedParallel([point(10, 0), point(20, 20)]), false);
  const ring = [point(-70, 0), point(-70, 120), point(-70, -120)];
  assert.equal(polylineCrossesRestrictedParallel(ring, true), true);
  assert.equal(polylineCrossesRestrictedParallel([point(-70, 0), point(-70, 10)]), false);
});
