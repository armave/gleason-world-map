import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unitDiskChord,
  flightCalibrationFeatures,
  fitFlightCalibration,
  predictFlightCalibratedKm
} from '../src/core/flight-calibration-fit.js';

const airports = [
  { lat: 51.47, lon: -0.45 }, { lat: 40.64, lon: -73.78 },
  { lat: 35.77, lon: 140.39 }, { lat: -33.39, lon: -70.78 },
  { lat: -33.95, lon: 151.17 }, { lat: 1.36, lon: 103.99 },
  { lat: 60.32, lon: 24.96 }, { lat: 25.25, lon: 55.36 },
  { lat: 48.85, lon: 2.35 }, { lat: -15.79, lon: -47.88 },
  { lat: 30.05, lon: 31.25 }, { lat: 55.75, lon: 37.6 },
  { lat: 22.31, lon: 113.92 }, { lat: 28.57, lon: 77.1 },
  { lat: -34.0, lon: 18.6 }, { lat: 64.15, lon: -21.94 }
];

function syntheticDataset() {
  const routes = [];
  for (let index = 0; index < 16; index++) {
    const airportA = airports[index];
    const airportB = airports[(index * 5 + 3) % airports.length];
    const chord = unitDiskChord(airportA, airportB);
    const features = flightCalibrationFeatures(airportA, airportB);
    const correction = Math.exp(
      0.08 * features[0] - 0.06 * features[1] + 0.04 * features[2]
    );
    routes.push({
      routeId: 'synthetic-' + index,
      split: index < 12 ? 'train' : 'holdout',
      airportA,
      airportB,
      sampleCount: 4,
      medianTrackKm: chord * 2450 * correction
    });
  }
  return { schemaVersion: 2, routes };
}

test('unit disk chord and endpoint features are symmetric', () => {
  const a = airports[0], b = airports[4];
  assert.equal(unitDiskChord(a, b), unitDiskChord(b, a));
  assert.deepEqual(flightCalibrationFeatures(a, b), flightCalibrationFeatures(b, a));
  assert.ok(unitDiskChord(a, b) > 0);
  assert.equal(unitDiskChord(a, a), 0);
});

test('flight telemetry calibration fits a radial scale and endpoint residual model', () => {
  const result = fitFlightCalibration(syntheticDataset());
  assert.ok(result.model.radialScaleKm > 0);
  assert.equal(result.model.trainingRouteCount, 12);
  assert.equal(result.model.holdoutRouteCount, 4);
  assert.equal(result.model.featureNames.length, 3);
  assert.equal(result.model.coefficients.length, 4);
  assert.equal(result.metrics.training.routeCount, 12);
  assert.equal(result.metrics.holdout.routeCount, 4);
  assert.equal(result.metrics.leaveOneOut.routeCount, 12);
  const prediction = predictFlightCalibratedKm(
    airports[1], airports[8], result.model
  );
  assert.ok(Number.isFinite(prediction) && prediction > 0);
});

test('calibration refuses to emit coefficients without enough independent route pairs', () => {
  const dataset = syntheticDataset();
  dataset.routes = dataset.routes.filter(route => route.split === 'train').slice(0, 5);
  assert.throws(() => fitFlightCalibration(dataset), /Insufficient empirical route coverage/);
});

test('invalid endpoint coordinates cannot produce a unit-disk chord or prediction', () => {
  assert.ok(Number.isNaN(unitDiskChord({ lat: 91, lon: 0 }, airports[0])));
  assert.equal(flightCalibrationFeatures({ lat: 0, lon: NaN }, airports[0]), null);
  const result = fitFlightCalibration(syntheticDataset());
  assert.equal(predictFlightCalibratedKm(
    { lat: 0, lon: Infinity }, airports[0], result.model
  ), null);
});
