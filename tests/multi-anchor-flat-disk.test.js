import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMultiAnchorWarpXY,
  fitMultiAnchorFlatDisk,
  invertMultiAnchorWarpXY,
  inspectMultiAnchorTopology,
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

test('topology diagnostics detect a deliberately folded and oversized disk warp', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.12,
    controls: [{
      id: 'aggressive-control',
      xKm: DISK_RADIUS_KM * 0.5,
      yKm: 0,
      envelope: 1,
      alphaX: -50000,
      alphaY: 30000
    }]
  };
  const diagnostics = inspectMultiAnchorTopology(model);
  assert.ok(diagnostics.minimumJacobianDeterminant < 0.2);
  assert.ok(diagnostics.maximumWarpDisplacementFraction > 0.12);
  assert.equal(diagnostics.maximumBoundaryDisplacementKm, 0);
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
  const holdoutAnchors = [
    { id: 'H0', lat: -66, lon: -135 },
    { id: 'H1', lat: -42, lon: -90 },
    { id: 'H2', lat: -18, lon: -45 },
    { id: 'H3', lat: 6, lon: 0 },
    { id: 'H4', lat: 30, lon: 45 },
    { id: 'H5', lat: 55, lon: 95 },
    { id: 'H6', lat: 78, lon: 135 },
    { id: 'H7', lat: -6, lon: 180 }
  ];
  const holdoutSeed = holdoutAnchors.map(point =>
    project(point.lon, point.lat, DISK_RADIUS_KM)
  );
  const holdoutTransformed = holdoutSeed.map(point =>
    applyMultiAnchorWarpXY(point[0], point[1], truth)
  );
  const observation = (from, to, split, projected, prefix) => ({
    id: split + '-' + prefix + '-' + from + '-' + to,
    split,
    a: (split === 'train' ? anchors : holdoutAnchors)[from],
    b: (split === 'train' ? anchors : holdoutAnchors)[to],
    distanceKm: Math.hypot(
      projected[to][0] - projected[from][0],
      projected[to][1] - projected[from][1]
    ),
    measurementType: 'direct-straight-line',
    source: sampleSource
  });
  const observations = [];
  for (let index = 0; index < anchors.length; index++) {
    for (const offset of [1, 3, 5]) {
      observations.push(observation(
        index, (index + offset) % anchors.length, 'train', transformed, 'T'
      ));
    }
  }
  for (let index = 0; index < holdoutAnchors.length; index++) {
    for (const offset of [1, 3]) {
      observations.push(observation(
        index, (index + offset) % holdoutAnchors.length,
        'holdout', holdoutTransformed, 'H'
      ));
    }
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
  assert.ok(result.metrics.maximumWarpDisplacementFraction < 0.12);
  assert.ok(result.metrics.maximumRadialOvershootFraction <= 1e-5);
  assert.equal(result.metrics.maximumBoundaryDisplacementKm, 0);
});


test('longitude aliases at the antimeridian remain the same anchor position', () => {
  const base = {
    a: { id: 'A', lat: 0, lon: 180 },
    b: { id: 'B', lat: 20, lon: 20 },
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, split: 'train' },
    {
      ...base,
      split: 'train',
      a: { id: 'A', lat: 0, lon: -180 },
      b: { id: 'C', lat: -20, lon: 40 }
    }
  ]);
  assert.deepEqual(coverage.validationErrors, []);
  assert.equal(coverage.trainingAnchorCount, 3);
});

test('duplicate observation IDs are rejected before fitting', () => {
  const base = {
    id: 'same-id',
    a: { id: 'A', lat: 0, lon: 0 },
    b: { id: 'B', lat: 20, lon: 20 },
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, split: 'train' },
    {
      ...base,
      split: 'train',
      a: { id: 'C', lat: -20, lon: 40 },
      b: { id: 'D', lat: 35, lon: 80 }
    }
  ]);
  assert.ok(coverage.validationErrors.some(item =>
    item.includes('duplicates observation ID same-id')
  ));
});

test('coverage reports unseen holdout anchors separately from pair counts', () => {
  const trainA = { id: 'TA', lat: -45, lon: -90 };
  const trainB = { id: 'TB', lat: 0, lon: 0 };
  const holdoutA = { id: 'HA', lat: 45, lon: 90 };
  const holdoutB = { id: 'HB', lat: 15, lon: 135 };
  const base = {
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, split: 'train', a: trainA, b: trainB },
    { ...base, split: 'holdout', a: holdoutA, b: holdoutB }
  ]);
  assert.equal(coverage.trainingObservationCount, 1);
  assert.equal(coverage.holdoutObservationCount, 1);
  assert.equal(coverage.holdoutAnchorCount, 2);
  assert.equal(coverage.unseenHoldoutAnchorCount, 2);
  assert.equal(coverage.holdoutAnchorOverlapCount, 0);
});
