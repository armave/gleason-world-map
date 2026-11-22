import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMultiAnchorWarpXY,
  fitMultiAnchorFlatDisk,
  invertMultiAnchorWarpXY,
  summarizeMultiAnchorCoverage
} from '../src/core/multi-anchor-flat-disk.js';
import { DISK_RADIUS_KM, project } from '../src/core/flat-disk.js';

const sampleSource = {
  provider: 'test fixture only',
  reference: 'synthetic fixture; not a real-world calibration observation'
};

test('empty input is rejected without producing active parameters', () => {
  const result = fitMultiAnchorFlatDisk([]);
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'insufficient-or-invalid-data');
  assert.equal(result.model, null);
  assert.ok(result.failures.some(item => item.includes('training observations')));
  assert.ok(result.failures.some(item => item.includes('holdout observations')));
});

test('ADS-B flown mileage is rejected as a straight-line calibration target', () => {
  const observations = [{
    split: 'train',
    a: { id: 'A', lat: 10, lon: 10 },
    b: { id: 'B', lat: 20, lon: 20 },
    distanceKm: 1000,
    measurementType: 'flown-route-mileage',
    source: sampleSource
  }];
  const coverage = summarizeMultiAnchorCoverage(observations);
  assert.ok(coverage.validationErrors.some(item =>
    item.includes('not an eligible direct-straight-line measurement')
  ));
});

test('duplicate endpoint pairs cannot be placed in both training and holdout', () => {
  const base = {
    a: { id: 'A', lat: 10, lon: 10 },
    b: { id: 'B', lat: 20, lon: 20 },
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, split: 'train' },
    { ...base, split: 'holdout', a: { ...base.a }, b: { ...base.b } }
  ]);
  assert.ok(coverage.validationErrors.some(item => item.includes('duplicates endpoint pair')));
});

test('the boundary envelope leaves the pole and full Antarctic rim fixed', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [{
      id: 'control',
      xKm: DISK_RADIUS_KM * 0.4,
      yKm: DISK_RADIUS_KM * 0.1,
      envelope: 0.8,
      alphaX: 500,
      alphaY: -250
    }]
  };
  const centre = applyMultiAnchorWarpXY(0, 0, model);
  const rim = applyMultiAnchorWarpXY(DISK_RADIUS_KM, 0, model);
  assert.deepEqual(centre, [0, 0]);
  assert.deepEqual(rim, [DISK_RADIUS_KM, 0]);
});

test('the numerical inverse recovers an interior point after candidate warping', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [{
      id: 'control',
      xKm: DISK_RADIUS_KM * 0.4,
      yKm: DISK_RADIUS_KM * 0.1,
      envelope: 0.8,
      alphaX: 120,
      alphaY: -70
    }]
  };
  const original = [DISK_RADIUS_KM * 0.35, DISK_RADIUS_KM * 0.12];
  const mapped = applyMultiAnchorWarpXY(original[0], original[1], model);
  const recovered = invertMultiAnchorWarpXY(mapped[0], mapped[1], model);
  assert.ok(recovered);
  assert.ok(Math.hypot(
    recovered[0] - original[0],
    recovered[1] - original[1]
  ) < 0.01);
});

test('conflicting anchor coordinates are rejected', () => {
  const observations = [{
    split: 'train',
    a: { id: 'A', lat: 10, lon: 10 },
    b: { id: 'B', lat: 20, lon: 20 },
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  }, {
    split: 'train',
    a: { id: 'A', lat: 11, lon: 10 },
    b: { id: 'C', lat: 30, lon: 30 },
    distanceKm: 1200,
    measurementType: 'direct-straight-line',
    source: sampleSource
  }];
  const coverage = summarizeMultiAnchorCoverage(observations);
  assert.ok(coverage.validationErrors.some(item => item.includes('conflicting coordinates')));
});


test('synthetic held-out pairs verify recovery of a known smooth disk deformation', () => {
  const latitudes = [
    -72, -60, -48, -36, -24, -12, 0, 12,
    24, 36, 48, 60, 72, 54, -54, 18
  ];
  const longitudes = [
    -157, -112, -67, -22, 23, 68, 113, 158,
    -135, -90, -45, 0, 45, 90, 135, 180
  ];
  const anchors = latitudes.map((lat, index) => ({
    id: 'S' + index,
    lat,
    lon: longitudes[index]
  }));
  const seed = anchors.map(point => project(point.lon, point.lat, DISK_RADIUS_KM));
  const envelopeAt = ([x, y]) => {
    const q = Math.min(1, Math.hypot(x, y) / DISK_RADIUS_KM);
    return 16 * q * q * (1 - q) * (1 - q);
  };
  const sigmaKm = DISK_RADIUS_KM * 0.35;
  const truth = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm,
    controls: seed.map((point, index) => ({
      id: anchors[index].id,
      xKm: point[0],
      yKm: point[1],
      envelope: envelopeAt(point),
      alphaX: 85 * Math.sin(index * 0.73),
      alphaY: 85 * Math.cos(index * 0.61)
    }))
  };
  const transformed = seed.map(point =>
    applyMultiAnchorWarpXY(point[0], point[1], truth)
  );
  const observation = (i, j, split) => ({
    id: split + '-' + i + '-' + j,
    split,
    a: anchors[i],
    b: anchors[j],
    distanceKm: Math.hypot(
      transformed[j][0] - transformed[i][0],
      transformed[j][1] - transformed[i][1]
    ),
    measurementType: 'direct-straight-line',
    source: sampleSource
  });
  const observations = [];
  for (let index = 0; index < anchors.length; index++) {
    for (const offset of [1, 3, 5]) {
      observations.push(observation(
        index, (index + offset) % anchors.length, 'train'
      ));
    }
    observations.push(observation(
      index, (index + 7) % anchors.length, 'holdout'
    ));
  }

  const result = fitMultiAnchorFlatDisk(observations, {
    iterations: 2200,
    learningRateKm: 8,
    anchorWeight: 0.03,
    sigmaKm,
    regularization: 1e-7
  });

  assert.notEqual(result.status, 'fit-failed');
  assert.ok(result.candidateModel);
  assert.ok(Number.isFinite(result.metrics.training.meanAbsolutePercent));
  assert.ok(Number.isFinite(result.metrics.holdout.meanAbsolutePercent));
  assert.ok(result.metrics.holdout.meanAbsolutePercent <
    result.metrics.baselineHoldout.meanAbsolutePercent);
  assert.ok(result.metrics.minimumJacobianDeterminant > 0);
  assert.ok(result.metrics.maximumDisplacementFraction < 0.12);
});
