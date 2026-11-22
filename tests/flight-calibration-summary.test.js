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
  assert.deepEqual(strictCoverage, {
    trainingRouteCount: 0,
    holdoutRouteCount: 0,
    trainingRoutesSouthOf30S: 0,
    trainingRoutesSouthOf45S: 0,
    trainingRoutesSouthOf60S: 0,
    holdoutRoutesSouthOf30S: 0,
    holdoutRoutesSouthOf45S: 0,
    holdoutRoutesSouthOf60S: 0
  });
  assert.equal(dataset.schemaVersion, 2);
  assert.equal(summary.accepted, false);
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
