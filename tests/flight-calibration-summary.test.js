import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeFlightCalibrationCoverage } from '../src/core/flight-calibration-fit.js';

test('latest calibration summary belongs to the current ADS-B dataset snapshot', async () => {
  const [dataset, summary] = await Promise.all([
    readFile(new URL('../data/flight-calibration.json', import.meta.url), 'utf8')
      .then(JSON.parse),
    readFile(new URL('../data/flight-calibration-summary.json', import.meta.url), 'utf8')
      .then(JSON.parse)
  ]);

  assert.equal(summary.sourceRetrievedAt, dataset.source.retrievedAt);
  assert.ok(summary.generatedAt);
  const strictCoverage = summarizeFlightCalibrationCoverage(dataset);
  const summaryCoverage = Object.fromEntries(
    Object.keys(strictCoverage).map(key => [key, summary.routeCoverage[key]])
  );
  assert.deepEqual(strictCoverage, summaryCoverage);
  assert.ok(dataset.schemaVersion === 3 || dataset.schemaVersion === 4);
  if (dataset.schemaVersion === 4) {
    assert.ok(dataset.routes.some(route => route.observations.some(observation =>
      Array.isArray(observation.trackCoordinates) &&
      Array.isArray(observation.trackTimestamps)
    )));
  }
  assert.equal(typeof summary.accepted, 'boolean');
  assert.equal(summary.routeCoverage.candidateRoutes, dataset.routes.length);
  assert.equal(
    summary.routeCoverage.totalObservedFlights,
    dataset.routes.reduce((sum, route) => sum + (route.sampleCount || 0), 0)
  );

  if (summary.status === 'insufficient-route-coverage') {
    assert.equal(summary.accepted, false);
    assert.equal(summary.model, null);
    assert.equal(summary.metrics, null);
    assert.match(summary.rejectionReason, /Insufficient empirical route coverage/);
    assert.ok(Array.isArray(summary.routeCoverage.southernRouteCandidates));
  } else {
    assert.ok(summary.accepted === true || summary.accepted === false);
    assert.ok(summary.model);
    assert.ok(summary.metrics);
  }
});
