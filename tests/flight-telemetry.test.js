import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateGroundSpeedSeries } from '../src/core/flight-telemetry.js';

test('integrates ground speed over time and converts nautical miles to kilometres', () => {
  const pathGs = [
    [[0, 360], [900, 420], [1800, 400], [2700, 500]],
    [[3000, 480], [3600, 500]]
  ];
  const result = integrateGroundSpeedSeries(pathGs, 0, 3600);
  assert.equal(result.accepted, true);
  assert.ok(Math.abs(result.trackKm - 694.5) < 1e-9);
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.coveredMinutes, 55);
  assert.ok(Math.abs(result.coverage - 55 / 60) < 1e-12);
  assert.equal(result.speedIntervals, 4);
});

test('does not bridge gaps between separate telemetry subsequences', () => {
  const pathGs = [
    [[0, 400], [600, 400]],
    [[1800, 400], [2400, 400]]
  ];
  const result = integrateGroundSpeedSeries(pathGs, 0, 3600);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'low-telemetry-coverage');
  assert.equal(result.coveredMinutes, undefined);
  assert.equal(result.intervalCount, 2);
  assert.ok(Math.abs(result.coverage - 1 / 3) < 1e-12);
});

test('clips speed intervals to the flight observation window', () => {
  const result = integrateGroundSpeedSeries(
    [[[0, 400], [1800, 400], [3600, 400], [5400, 400]]],
    900,
    2700
  );
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'too-few-speed-intervals');
  assert.equal(result.coverage, 1);
  assert.equal(result.intervalCount, 2);
});

test('ignores non-airborne or invalid speed samples', () => {
  const result = integrateGroundSpeedSeries(
    [[[0, 10], [600, 300], [1200, 900], [1800, 350], [2400, 360]]],
    0,
    2400
  );
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'too-few-speed-intervals');
  assert.equal(result.intervalCount, 2);
});

test('rejects missing series and invalid observation windows', () => {
  assert.deepEqual(
    integrateGroundSpeedSeries(null, 0, 3600),
    { accepted: false, reason: 'missing-ground-speed-or-duration' }
  );
  assert.equal(
    integrateGroundSpeedSeries([[[0, 400], [3600, 400]]], 3600, 0).accepted,
    false
  );
});

test('rejects short flights even when the telemetry series is complete', () => {
  const result = integrateGroundSpeedSeries(
    [[[0, 400], [900, 400], [1800, 400], [2700, 400]]],
    0,
    2700
  );
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'flight-too-short');
});
