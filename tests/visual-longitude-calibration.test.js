import test from 'node:test';
import assert from 'node:assert/strict';
import {
  warpLongitudeRadians,
  unwarpLongitudeRadians,
  longitudeWarpDerivative,
  minimumLongitudeWarpStretch,
  maximumLongitudeWarpDisplacementRadians,
  longitudeWarpEnvelope
} from '../src/core/visual-longitude-calibration.js';

import { FLIGHT_PATH_CALIBRATION } from '../src/core/flight-path-calibration-parameters.js';

const candidate = FLIGHT_PATH_CALIBRATION.longitudeWarp;

test('longitude shear vanishes at both disk anchors and stays periodic', () => {
  for (const q of [0, 1]) {
    for (const longitude of [-Math.PI, -1.2, 0, 1.7, Math.PI]) {
      assert.ok(Math.abs(warpLongitudeRadians(longitude, q, candidate) - longitude) < 1e-12);
    }
  }
  assert.equal(longitudeWarpEnvelope(0), 0);
  assert.equal(longitudeWarpEnvelope(1), 0);
  assert.equal(longitudeWarpEnvelope(0.5), 1);

  for (const q of [0.1, 0.5, 0.9]) {
    const first = warpLongitudeRadians(0.75, q, candidate);
    const repeated = warpLongitudeRadians(0.75 + 2 * Math.PI, q, candidate);
    assert.ok(Math.abs(first + 2 * Math.PI - repeated) < 1e-12);
  }
});

test('the fitted angular transform is monotonic and has no foldover', () => {
  assert.ok(minimumLongitudeWarpStretch(candidate) > 0.35);
  for (let qi = 0; qi <= 100; qi++) {
    const q = qi / 100;
    for (let li = 0; li < 360; li++) {
      const longitude = -Math.PI + 2 * Math.PI * li / 360;
      assert.ok(longitudeWarpDerivative(longitude, q, candidate) > 0.35);
    }
  }
});

test('the inverse recovers source longitude throughout the disk', () => {
  for (const q of [0, 0.05, 0.2, 0.5, 0.8, 0.95, 1]) {
    for (let li = 0; li < 360; li += 7) {
      const source = -Math.PI + 2 * Math.PI * li / 360;
      const displayed = warpLongitudeRadians(source, q, candidate);
      const recovered = unwarpLongitudeRadians(displayed, q, candidate);
      const error = ((recovered - source + Math.PI) % (2 * Math.PI) + 2 * Math.PI) %
        (2 * Math.PI) - Math.PI;
      assert.ok(Math.abs(error) < 1e-10, `q=${q}, longitude=${source}, error=${error}`);
    }
  }
});

test('the fitted map shifts intermediate longitude lines by a finite amount', () => {
  const displacement = maximumLongitudeWarpDisplacementRadians(candidate);
  assert.ok(displacement > 0.4 && displacement < 0.6);
});
