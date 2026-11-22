import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateGroundSpeedSeries } from '../src/core/flight-telemetry.js';

test('uses only the measured ground-speed integral when telemetry covers the entire flight', () => {
  const pathGs = [[
    [0, 360], [300, 360], [600, 360],
    [900, 420], [1200, 420], [1500, 420],
    [1800, 400], [2100, 400], [2400, 400], [2700, 500],
    [3000, 480], [3300, 480], [3600, 500]
  ]];
  const result = integrateGroundSpeedSeries(pathGs, 0, 3600);
  const expectedTrackKm = [360, 360, 360, 420, 420, 420, 400, 400, 400, 500, 480, 480]
    .reduce((sum, speed) => sum + speed * (300 / 3600) * 1.852, 0);
  assert.equal(result.accepted, true);
  assert.equal(result.coverage, 1);
  assert.ok(Math.abs(result.observedTrackKm - expectedTrackKm) < 1e-9);
  assert.equal(result.trackKm, result.observedTrackKm);
  assert.equal(result.coveredMinutes, 60);
  assert.equal(result.speedIntervals, 12);
  assert.equal(result.distanceMethod, 'observed-ground-speed-integral-only');
});

test('does not bridge large gaps and rejects records with insufficient telemetry coverage', () => {
  const pathGs = [
    [[0, 400], [300, 400], [600, 400], [900, 400], [1200, 400]],
    [[7200, 400], [7500, 400], [7800, 400], [8100, 400], [8400, 400]]
  ];
  const result = integrateGroundSpeedSeries(pathGs, 0, 8400);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'telemetry-gap-too-large');
  assert.equal(result.intervalCount, 8);
  assert.equal(result.maxGapMinutes, 100);
  assert.ok(Math.abs(result.coverage - 2400 / 8400) < 1e-12);
});

test('uses full flight duration as the coverage denominator, not just the first-to-last telemetry span', () => {
  const pathGs = [[
    [900, 400], [1200, 400], [1500, 400], [1800, 400], [2100, 400],
    [2400, 400], [2700, 400], [3000, 400], [3300, 400], [3600, 400]
  ]];
  const result = integrateGroundSpeedSeries(pathGs, 0, 4500);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'low-telemetry-coverage');
  assert.equal(result.flightDurationMinutes, 75);
  assert.equal(result.telemetrySpanMinutes, 45);
  assert.equal(result.coverage, 0.6);
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

test('does not forward-fill a ground-speed sample across a long interval in one sequence', () => {
  const pathGs = [[
    [0, 400], [600, 400], [1200, 400], [1800, 400], [2400, 400],
    [5400, 400], [6000, 400], [6600, 400], [7200, 400], [7800, 400]
  ]];
  const result = integrateGroundSpeedSeries(pathGs, 0, 7800);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'telemetry-gap-too-large');
  assert.equal(result.intervalCount, 8);
  assert.ok(Math.abs(result.coverage - 4800 / 7800) < 1e-12);
  assert.equal(result.maxGapMinutes, 50);
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

test('rejects short telemetry spans even when their speed samples are complete', () => {
  const result = integrateGroundSpeedSeries(
    [[[0, 400], [225, 400], [450, 400], [675, 400], [900, 400], [1125, 400], [1350, 400], [1575, 400], [1800, 400]]],
    0,
    1800
  );
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'flight-too-short');
});
