import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_PARALLEL_LATITUDE,
  segmentCrossesRestrictedParallel,
  polylineCrossesRestrictedParallel,
  measureDirectDistance,
  measureDistanceMeters,
  directLineCalibrationFactor,
  directLineCalibrationDiagnostics
} from '../src/core/measurement-engine.js';
import {
  DISK_RADIAL_SCALE_KM,
  DISK_BASE_RADIUS_KM,
  DISK_RADIUS_KM,
  baseFlatDiskDistanceMeters,
  flatDiskLinePath,
  project
} from '../src/core/flat-disk.js';
import { FLIGHT_CALIBRATION } from '../src/core/flight-calibration-parameters.js';
import { FLIGHT_PATH_CALIBRATION } from '../src/core/flight-path-calibration-parameters.js';
import { RADIAL_DISTANCE_PROFILE_MEAN, radialDistanceCorrectionFactor } from '../src/core/visual-radial-calibration.js';

const point = (lat, lon) => ({ lat, lon });

test('Santiago–Canberra uses the one ADS-B-calibrated flat-disk distance', () => {
  const santiago = point(-33.45, -70.67);
  const canberra = point(-35.27, 149.13);
  const result = measureDirectDistance(santiago, canberra);
  const reverse = measureDirectDistance(canberra, santiago);

  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.ok(Math.abs(result.distanceMeters / 1000 - 11_389.1273) < 0.01);
  assert.equal(result.distanceMeters, measureDistanceMeters(santiago, canberra));
  assert.equal(result.distanceMeters, reverse.distanceMeters);
  assert.equal(result.calibrationFactor, 0.5);
  assert.equal(result.calibration.factorWasClamped, true);
  assert.ok(result.warnings.includes('factor-clamped'));
  assert.ok(result.calibration.neighbourRouteIds.includes('YPAD--YSSY'));
  assert.ok(result.calibration.neighbourRouteIds.includes('YPAD--YPPH'));
});

test('single formula applies one bounded ADS-B correction to the base flat-disk chord', () => {
  const first = point(-33.45, -70.67);
  const second = point(-35.27, 149.13);
  const result = measureDirectDistance(first, second);
  const factor = directLineCalibrationFactor(first, second);
  assert.ok(Number.isFinite(factor));
  assert.equal(result.calibrationFactor, factor);
  assert.ok(factor >= FLIGHT_CALIBRATION.factorBounds[0]);
  assert.ok(factor <= FLIGHT_CALIBRATION.factorBounds[1]);
  assert.ok(Number.isFinite(result.distanceMeters));
  assert.equal(result.distanceMeters, baseFlatDiskDistanceMeters(first, second) * factor);
});

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

test('the map geometry retains its fitted display scale (A–B distance uses the displayed flat-disk metric)', () => {
  assert.equal(DISK_RADIAL_SCALE_KM, FLIGHT_PATH_CALIBRATION.radialScaleKm);
  assert.ok(DISK_RADIAL_SCALE_KM > 0);
  assert.equal(DISK_BASE_RADIUS_KM, Math.PI * DISK_RADIAL_SCALE_KM);
  assert.equal(DISK_RADIUS_KM, DISK_BASE_RADIUS_KM * RADIAL_DISTANCE_PROFILE_MEAN);
  assert.ok(FLIGHT_CALIBRATION.trainingRouteCount > 0);
  assert.ok(FLIGHT_CALIBRATION.holdoutRouteCount > 0);
});

test('the restricted line remains the 60th parallel south', () => {
  assert.equal(RESTRICTED_PARALLEL_LATITUDE, -60);
});

test('12-circle radial factors use the fitted taper and keep both endpoint multipliers', () => {
  assert.equal(radialDistanceCorrectionFactor(0), 1);
  assert.equal(radialDistanceCorrectionFactor(1), 0.5);
  let previous = Infinity;
  for (let index = 0; index < 12; index++) {
    const factor = radialDistanceCorrectionFactor(index / 11);
    assert.ok(factor > 0);
    assert.ok(factor < previous);
    previous = factor;
  }
  assert.ok(FLIGHT_PATH_CALIBRATION.radialProfile.exponent > 0);
});

test('canonical A–B distance is the base flat-disk chord times one ADS-B correction', () => {
  const a = point(40.17, 44.5), b = point(51.5, -0.12);
  const result = measureDirectDistance(a, b);
  const line = flatDiskLinePath(a, b, (longitude, latitude) =>
    project(longitude, latitude, 480)
  );
  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, measureDistanceMeters(a, b));
  assert.equal(result.distanceMeters,
    baseFlatDiskDistanceMeters(a, b) * result.calibrationFactor);
  assert.ok(result.calibrationFactor >= FLIGHT_CALIBRATION.factorBounds[0]);
  assert.ok(result.calibrationFactor <= FLIGHT_CALIBRATION.factorBounds[1]);
  assert.ok(result.distanceMeters > 0);
  assert.equal(line.length, 2);
});

test('same-circle distances use the visible warped-disk chord for both short and long spans', () => {
  const shorter = measureDirectDistance(point(40.17, 44.5), point(40.17, 45.5));
  const longer = measureDirectDistance(point(40.17, 44.5), point(40.17, 50.5));
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
  assert.equal(shorter.distanceMeters,
    baseFlatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 45.5)) * shorter.calibrationFactor);
  assert.equal(longer.distanceMeters,
    baseFlatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 50.5)) * longer.calibrationFactor);
});

test('same-longitude intervals use the same calibrated distance formula at every latitude', () => {
  for (const [latitudeA, latitudeB] of [
    [90, 75], [75, 60], [60, 45], [45, 30],
    [30, 15], [15, 0], [0, -15], [-15, -30],
    [-30, -45], [-45, -60], [-60, -75], [-75, -90]
  ]) {
    const a = point(latitudeA, 23), b = point(latitudeB, 23);
    const result = measureDirectDistance(a, b);
    assert.equal(result.metric, 'adsb-calibrated-flat-disk');
    assert.equal(result.distanceMeters, measureDistanceMeters(a, b));
    assert.equal(result.distanceMeters,
      baseFlatDiskDistanceMeters(a, b) * result.calibrationFactor);
  }
});

test('the Antarctic rim preserves longitude-indexed positions under the canonical metric', () => {
  const first = point(-90, 0), second = point(-90, 180);
  const result = measureDirectDistance(first, second);
  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.ok(result.distanceMeters > 0);
  assert.equal(result.distanceMeters,
    baseFlatDiskDistanceMeters(first, second) * result.calibrationFactor);
  assert.equal(result.distanceMeters,
    measureDirectDistance(second, first).distanceMeters);
});

test('the flight-mileage factor is symmetric and longitude-wrap safe', () => {
  const a = point(12.5, 179.9), b = point(13.1, -179.8);
  assert.equal(directLineCalibrationFactor(a, b), directLineCalibrationFactor(b, a));
  assert.ok(Number.isFinite(directLineCalibrationFactor(a, point(12.5, 180.2))));
});

test('southern-band A–B distance uses the same calibrated formula', () => {
  const a = point(-70, 10), b = point(-70, 20);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.equal(result.distanceMeters,
    baseFlatDiskDistanceMeters(a, b) * directLineCalibrationFactor(a, b));
});

test('crossing the 60°S reference line does not switch the direct-line metric', () => {
  const a = point(-59.9, 20), b = point(-60.1, 110);
  const result = measureDirectDistance(a, b);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.equal(result.restricted, false);
  assert.equal(result.distanceMeters, flatDiskDistanceMeters(a, b));
});

test('opposite points on the 60°S parallel retain a straight, measurable connector', () => {
  const a = point(-60, 0), b = point(-60, 180);
  assert.equal(segmentCrossesRestrictedParallel(a, b), true);
  const result = measureDirectDistance(a, b);
  assert.equal(result.metric, 'adsb-calibrated-flat-disk');
  assert.ok(result.distanceMeters > 0);
});

test('restricted-parallel crossing checks use the fitted longitude-deformed endpoints', () => {
  const first = point(-65, -180);
  const second = point(-75, -145);
  // With the legacy unwarped longitude chord this segment stays outside the
  // 60°S circle; after the accepted visual shear it crosses that circle.
  assert.equal(segmentCrossesRestrictedParallel(first, second), true);
});

test('southern local segments and one restricted-line touch remain measurable', () => {
  const a = point(-70, 10), b = point(-70, 20);
  assert.equal(segmentCrossesRestrictedParallel(a, b), false);
  assert.equal(measureDirectDistance(a, b).metric, 'adsb-calibrated-flat-disk');
  assert.equal(measureDirectDistance(point(-60, 0), point(-70, 0)).metric,
    'adsb-calibrated-flat-disk');
});

for (const route of heldOutFlightMileageRoutes) {
  test(`independent ADS-B holdout mileage: ${route.route}`, () => {
    const result = measureDirectDistance(route.first, route.second);
    const predictedKm = result.distanceMeters / 1000;
    const errorPercent = (predictedKm / route.medianTrackKm - 1) * 100;
    assert.ok(Math.abs(errorPercent) <= 20,
      `${route.route}: ${predictedKm.toFixed(1)} km vs observed median ${route.medianTrackKm.toFixed(1)} km (${errorPercent.toFixed(1)}%)`);
    assert.equal(result.metric, 'adsb-calibrated-flat-disk');
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

test('flat-disk distance preserves endpoint ordering and equals the projected segment length', () => {
  const shorter = measureDirectDistance(
    point(40.17, 44.5), point(40.17, 45.5)
  );
  const longer = measureDirectDistance(
    point(40.17, 44.5), point(40.17, 50.5)
  );
  assert.ok(shorter.distanceMeters < longer.distanceMeters);
  assert.equal(shorter.distanceMeters,
    baseFlatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 45.5)) * shorter.calibrationFactor);
  assert.equal(longer.distanceMeters,
    baseFlatDiskDistanceMeters(point(40.17, 44.5), point(40.17, 50.5)) * longer.calibrationFactor);
  assert.equal(shorter.flightEmpiricalDistanceMeters,
    shorter.baseChordDistanceMeters * shorter.calibrationFactor);
  assert.equal(longer.flightEmpiricalDistanceMeters,
    longer.baseChordDistanceMeters * longer.calibrationFactor);
});

test('mixed-radius endpoints use symmetric Euclidean distances in the warped disk', () => {
  const first = point(75, 20), second = point(-75, 120);
  const forward = measureDirectDistance(first, second);
  const reverse = measureDirectDistance(second, first);
  assert.ok(forward.distanceMeters > 0);
  assert.equal(forward.distanceMeters, reverse.distanceMeters);
  assert.equal(forward.baseChordDistanceMeters, reverse.baseChordDistanceMeters);
  assert.equal(forward.calibrationFactor, reverse.calibrationFactor);
});

test('invalid coordinates fail safely', () => {
  const result = measureDirectDistance(point(91, 0), point(0, 0));
  assert.equal(result.distanceMeters, null);
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
  assert.ok(baseFlatDiskDistanceMeters(first, second) > 17_000_000);
  assert.equal(result.distanceMeters,
    baseFlatDiskDistanceMeters(first, second) * result.calibrationFactor);
  assert.equal(result.calibration.nearSouthRim, true);
  assert.ok(result.warnings.includes('near-south-rim'));
  assert.equal(result.calibration.status, 'bounded-extrapolation');
  assert.ok(Number.isFinite(result.calibratedDistanceMeters));
  assert.ok(result.calibrationFactor >= 0.5 && result.calibrationFactor <= 2.5);
});

test('longitude-separated South Pole coordinates remain distinct in the disk and are flagged', () => {
  const result = measureDirectDistance(point(-90, 0), point(-90, 180));
  assert.ok(baseFlatDiskDistanceMeters(point(-90, 0), point(-90, 180)) > 17_000_000);
  assert.ok(result.distanceMeters > 0);
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



test('canonical distance is symmetric and longitude-wrap safe', () => {
  const first = point(-33.4489, -70.6693);
  const second = point(-35.2809, 149.13);
  const expected = measureDistanceMeters(first, second);
  assert.equal(expected, measureDistanceMeters(second, first));
  assert.equal(expected, measureDistanceMeters(first, point(second.lat, second.lon + 720)));
  assert.equal(expected, measureDistanceMeters(first, point(second.lat, second.lon - 1080)));
  assert.equal(measureDirectDistance(first, second).distanceMeters, expected);
});
