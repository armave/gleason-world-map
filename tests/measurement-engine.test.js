import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance,
  radialDistanceCorrectionFactor,
  radialDistanceCorrectionDiagnostics,
  directLineCalibrationFactor,
  directLineCalibrationDiagnostics
} from '../src/core/measurement-engine.js';
import {
  DISK_RADIAL_SCALE_KM,
  DISK_RADIUS_KM,
  flatDiskDistanceMeters,
  baseFlatDiskDistanceMeters
} from '../src/core/flat-disk.js';
import { FLIGHT_CALIBRATION } from '../src/core/flight-calibration-parameters.js';
import { greatCircleDistanceMeters } from '../src/core/great-circle.js';

const point = (lat, lon) => ({ lat, lon });

const heldOutFlightMileageRoutes = [
  {
    route: 'Brisbane–Sydney (YBBN–YSSY)',
    first: point(-33.946666666667, 151.17611111111),
    second: point(-27.388888888889, 153.126111111111),
    medianTrackKm: 814.925394574103,
    telemetryCoverage: 1,
    expectedErrorPercent: -9.0
  },
  {
    route: 'Dubai–Singapore (OMDB–WSSS)',
    first: point(25.2528, 55.3644),
    second: point(1.3451159576023457, 103.99194013366014),
    medianTrackKm: 5699.2843254262025,
    telemetryCoverage: 0.3516,
    expectedErrorPercent: 5.3
  },
  {
    route: 'Doha–Tokyo (OTHH–RJAA)',
    first: point(25.275555555556, 51.618055555556),
    second: point(35.7647, 140.386),
    medianTrackKm: 8965.419707357165,
    telemetryCoverage: 0.3071,
    expectedErrorPercent: 1.5
  },
  {
    route: 'Istanbul–Amman (LTFM–OJAI)',
    first: point(41.275277777778, 28.751944444444),
    second: point(31.7226, 35.9932),
    medianTrackKm: 1424.4753475218993,
    telemetryCoverage: 0.5355,
    expectedErrorPercent: 0.6
  }
];

test('the map geometry retains its fitted display scale (distance readout is independently spherical)', () => {
  assert.equal(DISK_RADIAL_SCALE_KM, FLIGHT_CALIBRATION.radialScaleKm);
  assert.ok(DISK_RADIAL_SCALE_KM > 0);
  assert.equal(DISK_RADIUS_KM, Math.PI * DISK_RADIAL_SCALE_KM);
  assert.equal(FLIGHT_CALIBRATION.trainingRouteCount, 33);
  assert.equal(FLIGHT_CALIBRATION.holdoutRouteCount, 4);
});

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('12-circle radial factors taper linearly from 1.00× at the centre to 0.50× at the Ice Wall', () => {
  const expected = [1.00, 0.95, 0.91, 0.86, 0.82, 0.77, 0.73, 0.68, 0.64, 0.59, 0.55, 0.50];
  expected.forEach((factor, index) => {
    assert.ok(Math.abs(radialDistanceCorrectionFactor(index / 11) - factor) <= 0.005);
  });
  assert.equal(radialDistanceCorrectionFactor(0), 1);
  assert.equal(radialDistanceCorrectionFactor(1), 0.5);
});

test('A–B primary readout uses great-circle coordinates while retaining separate map and ADS-B diagnostics', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'spherical-great-circle');
  assert.equal(result.restricted, false);
  assert.equal(result.chordDistanceMeters, baseFlatDiskDistanceMeters(a, b));
  assert.equal(result.visualChordDistanceMeters, flatDiskDistanceMeters(a, b));
  assert.equal(result.rawDistanceMeters, result.chordDistanceMeters);
  assert.equal(result.radiallyCorrectedDistanceMeters,
    result.chordDistanceMeters * result.radialCorrectionFactor);
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
  assert.notEqual(result.visualChordDistanceMeters, result.chordDistanceMeters);
  assert.equal(result.radialCorrectionFactor, radialDistanceCorrectionDiagnostics(a, b).factor);
  assert.equal(result.radialCirclePosition, radialDistanceCorrectionDiagnostics(a, b).circlePosition);
  assert.equal(result.flightEmpiricalDistanceMeters,
    result.chordDistanceMeters * result.calibrationFactor);
  assert.equal(result.calibratedDistanceMeters, result.flightEmpiricalDistanceMeters);
  assert.ok(result.radialCorrectionFactor >= 0.5 && result.radialCorrectionFactor <= 1);
  assert.ok(result.calibrationFactor >= 0.5 && result.calibrationFactor <= 2.5);
  assert.ok(result.distanceMeters > 0);
  assert.ok(result.flightEmpiricalDistanceMeters > 0);
});

test('same-circle chord measurements use the same smoothly interpolated radial factor', () => {
  const shorter = measureDirectDistance(point(40.17, 44.5), point(40.17, 45.5));
  const longer = measureDirectDistance(point(40.17, 44.5), point(40.17, 50.5));
  assert.equal(shorter.radialCorrectionFactor, longer.radialCorrectionFactor);
  assert.ok(shorter.chordDistanceMeters < longer.chordDistanceMeters);
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
});

test('outer-rim endpoint pairs receive the full 0.50× correction', () => {
  const result = measureDirectDistance(point(-90, 0), point(-90, 180));
  assert.equal(result.radialCorrectionFactor, 0.5);
  assert.equal(result.radialCorrection.circlePosition, 12);
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
});

test('the flight-mileage factor is symmetric and longitude-wrap safe', () => {
  const a = point(12.5, 179.9), b = point(13.1, -179.8);
  assert.equal(directLineCalibrationFactor(a, b), directLineCalibrationFactor(b, a));
  assert.ok(Number.isFinite(directLineCalibrationFactor(a, point(12.5, 180.2))));
});

test('the separate flight-mileage estimate remains available in the Antarctic band', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'spherical-great-circle');
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
  assert.equal(result.flightEmpiricalDistanceMeters,
    result.chordDistanceMeters * directLineCalibrationFactor(a, b));
});

test('crossing the 60°S reference line does not switch the direct-line metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'spherical-great-circle');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
});

test('opposite points on the 60°S parallel retain a straight, measurable connector', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'spherical-great-circle');
  assert.ok(result.distanceMeters > 0);
});

test('southern local segments and one restricted-line touch remain measurable', () => {
  const a = point(-70, 10), b = point(-70, 20);
  assert.equal(segmentCrossesRestrictedParallel(a, b), false);
  assert.equal(measureDirectDistance(a, b).metric, 'spherical-great-circle');
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric,
    'spherical-great-circle');
});

for (const route of heldOutFlightMileageRoutes) {
  test(`independent ADS-B holdout mileage: ${route.route}`, () => {
    const result = measureDirectDistance(route.first, route.second);
    const predictedKm = result.flightEmpiricalDistanceMeters / 1000;
    const errorPercent = (predictedKm / route.medianTrackKm - 1) * 100;
    assert.ok(Math.abs(errorPercent) <= 20,
      `${route.route}: ${predictedKm.toFixed(1)} km vs observed median ${route.medianTrackKm.toFixed(1)} km (${errorPercent.toFixed(1)}%)`);
    assert.equal(result.metric, 'spherical-great-circle');
    assert.ok(Number.isFinite(result.calibration.radialShareOfChord));
    assert.ok(Number.isFinite(result.calibration.tangentialShareOfChord));
    assert.ok(Math.abs(
      result.calibration.radialShareOfChord ** 2 +
      result.calibration.tangentialShareOfChord ** 2 - 1
    ) < 1e-9);
    assert.ok(Number.isFinite(route.telemetryCoverage));
    assert.ok(Math.abs(errorPercent - route.expectedErrorPercent) < 0.15,
      `${route.route}: expected ${route.expectedErrorPercent}% but got ${errorPercent.toFixed(2)}%`);
  });
}

test('radial correction preserves chord ordering for endpoints on the same circle', () => {
  const shorter = measureDirectDistance(
    point(40.17, 44.5), point(40.17, 45.5)
  );
  const longer = measureDirectDistance(
    point(40.17, 44.5), point(40.17, 50.5)
  );
  assert.ok(shorter.chordDistanceMeters < longer.chordDistanceMeters);
  assert.equal(shorter.radialCorrectionFactor, longer.radialCorrectionFactor);
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
  assert.equal(shorter.distanceMeters, shorter.greatCircleDistanceMeters);
  assert.equal(longer.distanceMeters, longer.greatCircleDistanceMeters);
  assert.equal(shorter.flightEmpiricalDistanceMeters,
    shorter.chordDistanceMeters * shorter.calibrationFactor);
  assert.equal(longer.flightEmpiricalDistanceMeters,
    longer.chordDistanceMeters * longer.calibrationFactor);
});

test('mixed-circle endpoints blend the two radial positions before applying the factor', () => {
  const first = point(75, 20), second = point(-75, 120);
  const diagnostics = radialDistanceCorrectionDiagnostics(first, second);
  const reversed = radialDistanceCorrectionDiagnostics(second, first);
  assert.ok(diagnostics);
  assert.equal(diagnostics.factor, reversed.factor);
  assert.equal(diagnostics.meanRadialFraction, reversed.meanRadialFraction);
  assert.ok(diagnostics.circlePosition > 1 && diagnostics.circlePosition < 12);
  assert.equal(diagnostics.factor,
    radialDistanceCorrectionFactor(diagnostics.meanRadialFraction));
  const result = measureDirectDistance(first, second);
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
});

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
  assert.equal(result.chordDistanceMeters, null);
  assert.equal(result.visualChordDistanceMeters, null);
  assert.equal(result.radialCorrectionFactor, null);
  assert.equal(result.radialCorrection, null);
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
  assert.notEqual(diagnostics.status, 'within-fit-range');
});

test('near-south-rim endpoints warn about longitude sensitivity without changing the chord', () => {
  const first = point(-89.99, 0), second = point(-89.99, 180);
  const result = measureDirectDistance(first, second);
  assert.ok(result.rawDistanceMeters > 17_000_000);
  assert.equal(result.rawDistanceMeters, baseFlatDiskDistanceMeters(first, second));
  assert.equal(result.calibration.nearSouthRim, true);
  assert.ok(result.warnings.includes('near-south-rim'));
  assert.equal(result.calibration.status, 'bounded-extrapolation');
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
  assert.ok(Number.isFinite(diagnostics.radialShareOfChord));
  assert.ok(Number.isFinite(diagnostics.tangentialShareOfChord));
  assert.ok(Math.abs(
    diagnostics.radialShareOfChord ** 2 +
    diagnostics.tangentialShareOfChord ** 2 - 1
  ) < 1e-9);
  assert.equal(diagnostics.status, 'within-fit-range');
});

test('opposite-side chord orientation is flagged outside the sampled radial-share range', () => {
  const diagnostics = directLineCalibrationDiagnostics(
    point(0, 0), point(0, 180)
  );
  assert.ok(diagnostics);
  assert.equal(diagnostics.outsideTrainingRange, true);
  assert.ok(diagnostics.warnings.includes('outside-training-range'));
});

test('the correction-bound diagnostic reports when the local factor falls below its lower bound', () => {
  const result = measureDirectDistance(
    point(-35.1962094825631, -88.46809241131592),
    point(-31.194773341912608, -115.28891102375371)
  );
  assert.equal(result.calibration.factorWasClamped, true);
  assert.ok(result.warnings.includes('factor-clamped'));
  assert.equal(result.calibration.status, 'bounded-extrapolation');
  assert.equal(result.calibrationFactor, 0.5);
});

test('polygon edges including closure are still checked for restricted-line crossings', () => {
  assert.equal(polylineCrossesRestrictedParallel([point(10, 0), point(20, 20)]), false);
  const ring = [point(-70, 0), point(-70, 120), point(-70, -120)];
  assert.equal(polylineCrossesRestrictedParallel(ring, true), true);
  assert.equal(polylineCrossesRestrictedParallel([point(-70, 0), point(-70, 10)]), false);
});


test('Santiago to Canberra uses coordinate-only great-circle distance', () => {
  const santiago = point(-33.4489, -70.6693);
  const canberra = point(-35.2809, 149.1300);
  const result = measureDirectDistance(santiago, canberra);
  assert.equal(result.metric, 'spherical-great-circle');
  assert.ok(Math.abs(result.distanceMeters / 1000 - 11322.57) < 0.02);
  assert.equal(result.distanceMeters, greatCircleDistanceMeters(santiago, canberra));
  assert.equal(result.distanceMeters, result.greatCircleDistanceMeters);
});
