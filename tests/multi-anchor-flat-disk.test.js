import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMultiAnchorWarpXY,
  fitMultiAnchorFlatDisk,
  invertMultiAnchorWarpXY,
  inspectMultiAnchorTopology,
  inspectMultiAnchorRoundTrips,
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
  assert.ok(result.failures.some(item => item.includes('training anchors south of 45 degrees south')));
  assert.ok(result.failures.some(item => item.includes('independent holdout anchors south of 45 degrees south')));
  assert.ok(result.failures.some(item => item.includes('deep-southern training anchors south of 60 degrees south')));
  assert.ok(result.failures.some(item => item.includes('deep-southern holdout anchors south of 60 degrees south')));
});

test('ADS-B flown mileage is rejected as a direct-distance calibration target', () => {
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
    item.includes('not an eligible direct-straight-line or traceable horizontal survey measurement')
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

test('the global warp can move the pole and displace the full Antarctic rim', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [{
      id: 'control',
      xKm: DISK_RADIUS_KM * 0.4,
      yKm: DISK_RADIUS_KM * 0.1,
      alphaX: 500,
      alphaY: -250
    }]
  };
  const centre = applyMultiAnchorWarpXY(0, 0, model);
  const rim = applyMultiAnchorWarpXY(DISK_RADIUS_KM, 0, model);
  assert.ok(Math.hypot(centre[0], centre[1]) > 1);
  assert.ok(Math.hypot(rim[0], rim[1]) > DISK_RADIUS_KM);
  for (let index = 0; index < 72; index++) {
    const angle = 2 * Math.PI * index / 72;
    const point = [
      DISK_RADIUS_KM * Math.cos(angle),
      DISK_RADIUS_KM * Math.sin(angle)
    ];
    const mapped = applyMultiAnchorWarpXY(point[0], point[1], model);
    assert.ok(Math.hypot(mapped[0] - point[0], mapped[1] - point[1]) > 0);
  }
});

test('topology diagnostics detect a deliberately folded and oversized disk warp', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.12,
    controls: [{
      id: 'aggressive-control',
      xKm: DISK_RADIUS_KM * 0.5,
      yKm: 0,
      alphaX: -50000,
      alphaY: 30000
    }]
  };
  const diagnostics = inspectMultiAnchorTopology(model);
  assert.ok(diagnostics.minimumJacobianDeterminant < 0.2);
  assert.ok(diagnostics.maximumWarpDisplacementFraction > 0.12);
  assert.ok(diagnostics.maximumBoundaryDisplacementKm > 0);
});

test('adaptive topology sampling detects a narrow off-grid foldover', () => {
  // This control is halfway between the old 32-ring / 144-spoke samples.
  // Its small Gaussian support used to fit entirely between those samples.
  const radiusKm = DISK_RADIUS_KM;
  const controlRadius = radiusKm * (0.5 + 1 / 64);
  const angle = Math.PI / 144;
  const xKm = controlRadius * Math.cos(angle);
  const yKm = controlRadius * Math.sin(angle);
  const model = {
    diskRadiusKm: radiusKm,
    sigmaKm: radiusKm * 0.00025,
    controls: [{
      id: 'off-grid-control',
      xKm,
      yKm,
      alphaX: 30,
      alphaY: 0
    }]
  };
  const diagnostics = inspectMultiAnchorTopology(model);
  assert.ok(diagnostics.topologySampleCount > 18000);
  assert.ok(
    diagnostics.minimumJacobianDeterminant < 0.2,
    'narrow foldover escaped adaptive sampling: ' + diagnostics.minimumJacobianDeterminant
  );
});

test('malformed model controls fail closed rather than throwing', () => {
  const malformed = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [null]
  };
  assert.equal(applyMultiAnchorWarpXY(100, 200, malformed), null);
  assert.equal(invertMultiAnchorWarpXY(100, 200, malformed), null);
  const valid = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: []
  };
  assert.equal(invertMultiAnchorWarpXY(100, 200, valid, null), null);
  const diagnostics = inspectMultiAnchorTopology(malformed);
  assert.equal(diagnostics.minimumJacobianDeterminant, -Infinity);
  assert.equal(diagnostics.topologySampleCount, 0);
});

test('round-trip diagnostics cover the disk and control points', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [{
      id: 'control',
      xKm: DISK_RADIUS_KM * 0.4,
      yKm: DISK_RADIUS_KM * 0.1,
      alphaX: 120,
      alphaY: -70
    }]
  };
  const diagnostics = inspectMultiAnchorRoundTrips(model);
  assert.ok(diagnostics.roundTripSampleCount > 500);
  assert.equal(diagnostics.roundTripFailureCount, 0);
  assert.ok(diagnostics.maximumRoundTripErrorKm <= 0.01);
});

test('the numerical inverse recovers an interior point after candidate warping', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.2,
    controls: [{
      id: 'control',
      xKm: DISK_RADIUS_KM * 0.4,
      yKm: DISK_RADIUS_KM * 0.1,
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

  for (let radial = 1; radial <= 5; radial++) {
    for (let angular = 0; angular < 24; angular++) {
      const angle = 2 * Math.PI * angular / 24;
      const point = [
        DISK_RADIUS_KM * radial / 7 * Math.cos(angle),
        DISK_RADIUS_KM * radial / 7 * Math.sin(angle)
      ];
      const forward = applyMultiAnchorWarpXY(point[0], point[1], model);
      const inverse = invertMultiAnchorWarpXY(forward[0], forward[1], model);
      assert.ok(inverse, 'inverse failed at radial=' + radial + ', angular=' + angular);
      assert.ok(Math.hypot(inverse[0] - point[0], inverse[1] - point[1]) < 0.01);
    }
  }
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
  const sigmaKm = DISK_RADIUS_KM * 0.35;
  const truth = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm,
    controls: [
      [0.32, 0.18, 560, -210],
      [-0.30, 0.12, -448, 252],
      [0.05, -0.45, 168, 504]
    ].map(([xFraction, yFraction, alphaX, alphaY], index) => {
      const point = [
        xFraction * DISK_RADIUS_KM,
        yFraction * DISK_RADIUS_KM
      ];
      return {
        id: 'smooth-truth-' + index,
        xKm: point[0],
        yKm: point[1],
        alphaX,
        alphaY
      };
    })
  };
  const transformed = seed.map(point =>
    applyMultiAnchorWarpXY(point[0], point[1], truth)
  );
  const holdoutAnchors = [
    { id: 'H0', lat: -66, lon: -135 },
    { id: 'H1', lat: -54, lon: -90 },
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
    iterations: 3000,
    learningRateKm: 4,
    anchorWeight: 0.03,
    sigmaKm,
    regularization: 1e-3
  });

  assert.notEqual(result.status, 'fit-failed');
  assert.ok(result.candidateModel);
  assert.ok(Number.isFinite(result.metrics.training.meanAbsolutePercent));
  assert.ok(Number.isFinite(result.metrics.holdout.meanAbsolutePercent));
  assert.ok(
    result.metrics.holdout.meanAbsolutePercent <
      result.metrics.baselineHoldout.meanAbsolutePercent,
    'synthetic holdout MAPE ' + result.metrics.holdout.meanAbsolutePercent +
      ' did not beat baseline ' + result.metrics.baselineHoldout.meanAbsolutePercent +
      '; training MAPE ' + result.metrics.training.meanAbsolutePercent +
      '; max holdout error ' + result.metrics.holdout.maxAbsolutePercent +
      '; anchor displacement ' + result.metrics.maximumDisplacementFraction +
      '; interpolated displacement ' + result.metrics.maximumWarpDisplacementFraction +
      '; mapped radius fraction ' + result.metrics.maximumMappedRadiusFraction +
      '; max RBF coefficient ' + Math.max(0, ...result.candidateModel.controls.map(
        control => Math.hypot(control.alphaX, control.alphaY)
      )) +
      '; failures ' + JSON.stringify(result.failures)
  );
  assert.ok(result.metrics.training.meanAbsolutePercent <= 8);
  assert.ok(result.metrics.holdout.meanAbsolutePercent <= 10);
  assert.ok(result.metrics.holdout.maxAbsolutePercent <= 20);
  assert.ok(result.metrics.minimumJacobianDeterminant >= 0.2);
  assert.equal(result.metrics.rigidityMatrixRank, 2 * anchors.length - 3);
  assert.equal(
    result.accepted,
    true,
    'synthetic fit did not pass all promotion gates: ' + JSON.stringify({
      failures: result.failures,
      trainingMape: result.metrics.training.meanAbsolutePercent,
      holdoutMape: result.metrics.holdout.meanAbsolutePercent,
      baselineMape: result.metrics.baselineHoldout.meanAbsolutePercent,
      holdoutImprovement: result.metrics.holdoutImprovementPercentagePoints,
      maxHoldoutPairError: result.metrics.holdout.maxAbsolutePercent
    })
  );
  assert.ok(result.metrics.maximumDisplacementFraction <= 5);
  assert.ok(result.metrics.maximumWarpDisplacementFraction <= 5);
  assert.ok(result.metrics.maximumMappedRadiusFraction <= 5);
  assert.ok(result.metrics.maximumBoundaryDisplacementKm > 0);
  assert.ok(result.metrics.roundTripSampleCount > 500);
  assert.equal(result.metrics.roundTripFailureCount, 0);
  assert.ok(result.metrics.maximumRoundTripErrorKm <= 0.01);
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

test('coverage counts deep-southern training and holdout anchors independently', () => {
  const base = {
    distanceKm: 1000,
    measurementType: 'direct-straight-line',
    source: sampleSource
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, split: 'train', a: { id: 'TA', lat: -50, lon: -90 }, b: { id: 'TB', lat: -65, lon: -45 } },
    { ...base, split: 'holdout', a: { id: 'HA', lat: -55, lon: 90 }, b: { id: 'HB', lat: -70, lon: 135 } }
  ]);
  assert.equal(coverage.trainingAnchorsSouthOf45S, 2);
  assert.equal(coverage.trainingAnchorsSouthOf60S, 1);
  assert.equal(coverage.holdoutAnchorsSouthOf45S, 2);
  assert.equal(coverage.holdoutAnchorsSouthOf60S, 1);
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


test('survey baseline observations require adjusted-horizontal distance, uncertainty and endpoint coordinate provenance', () => {
  const base = {
    split: 'train',
    id: 'survey-line-01',
    a: {
      id: 'MONUMENT-A', lat: 40, lon: -75,
      coordinateSource: { provider: 'Survey authority', reference: 'coordinate record A' }
    },
    b: {
      id: 'MONUMENT-B', lat: 40.001, lon: -74.999,
      coordinateSource: { provider: 'Survey authority', reference: 'coordinate record B' }
    },
    distanceKm: 0.8641229,
    measurementType: 'direct-survey-baseline',
    measurementBasis: 'adjusted-horizontal',
    uncertaintyKm: 0.0000001,
    source: { provider: 'Survey authority', reference: 'baseline certificate 01', groupId: 'SITE-NUMMELA-01' }
  };
  assert.deepEqual(summarizeMultiAnchorCoverage([base]).validationErrors, []);

  const wrongBasis = summarizeMultiAnchorCoverage([{
    ...base, measurementBasis: 'slope-distance'
  }]);
  assert.ok(wrongBasis.validationErrors.some(item =>
    item.includes('measurementBasis=adjusted-horizontal')
  ));

  const missingUncertainty = summarizeMultiAnchorCoverage([{
    ...base, uncertaintyKm: undefined
  }]);
  assert.ok(missingUncertainty.validationErrors.some(item =>
    item.includes('must include a positive uncertaintyKm')
  ));

  const missingCoordinateSource = summarizeMultiAnchorCoverage([{
    ...base, a: { ...base.a, coordinateSource: undefined }
  }]);
  assert.ok(missingCoordinateSource.validationErrors.some(item =>
    item.includes('coordinateSource.provider and coordinateSource.reference')
  ));
});

test('the calibration can expand the map beyond its original circular rim and invert expanded points', () => {
  const model = {
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm: DISK_RADIUS_KM * 0.5,
    controls: [{
      id: 'global-shift-control',
      xKm: DISK_RADIUS_KM * 0.5,
      yKm: 0,
      alphaX: 10000,
      alphaY: 0
    }]
  };
  const centre = applyMultiAnchorWarpXY(0, 0, model);
  const originalRim = [DISK_RADIUS_KM, 0];
  const mappedRim = applyMultiAnchorWarpXY(originalRim[0], originalRim[1], model);
  assert.ok(centre[0] > 5000, 'pole should be allowed to move');
  assert.ok(Math.hypot(...mappedRim) > DISK_RADIUS_KM,
    'the fitted outer rim should be allowed to expand beyond the baseline circle');

  const recovered = invertMultiAnchorWarpXY(mappedRim[0], mappedRim[1], model);
  assert.ok(recovered, 'inverse must accept target coordinates outside the original disk');
  assert.ok(Math.hypot(recovered[0] - originalRim[0], recovered[1] - originalRim[1]) < 0.01);

  const diagnostics = inspectMultiAnchorTopology(model);
  assert.ok(diagnostics.maximumMappedRadiusFraction > 1);
  assert.ok(diagnostics.minimumJacobianDeterminant > 0.03);
});


test('all observations from one surveyed baseline stay in a single train or holdout split', () => {
  const base = {
    a: {
      id: 'MARK-A', lat: 60, lon: 24,
      coordinateSource: { provider: 'Survey authority', reference: 'mark A coordinates' }
    },
    b: {
      id: 'MARK-B', lat: 60.001, lon: 24.001,
      coordinateSource: { provider: 'Survey authority', reference: 'mark B coordinates' }
    },
    distanceKm: 0.2,
    measurementType: 'direct-survey-baseline',
    measurementBasis: 'adjusted-horizontal',
    uncertaintyKm: 0.000001,
    source: { provider: 'Survey authority', reference: 'baseline 02', groupId: 'SITE-02' }
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, id: 'site02-ab', split: 'train' },
    {
      ...base,
      id: 'site02-ac',
      split: 'holdout',
      b: {
        id: 'MARK-C', lat: 60.002, lon: 24.002,
        coordinateSource: { provider: 'Survey authority', reference: 'mark C coordinates' }
      }
    }
  ]);
  assert.ok(coverage.validationErrors.some(item =>
    item.includes('assigns survey group SITE-02 to both training and holdout')
  ));
});


test('measured reduced horizontal survey observations require sea-level basis, uncertainty and endpoint provenance', () => {
  const base = {
    split: 'train',
    id: 'linz-observation-9001',
    a: {
      id: 'ROSS-MARK-A', lat: -77, lon: 166,
      coordinateSource: { provider: 'LINZ Landonline', reference: 'coordinate row 101' }
    },
    b: {
      id: 'ROSS-MARK-B', lat: -77.001, lon: 166.002,
      coordinateSource: { provider: 'LINZ Landonline', reference: 'coordinate row 102' }
    },
    distanceKm: 1.234567,
    measurementType: 'direct-survey-reduced-horizontal',
    measurementBasis: 'sea-level-horizontal',
    uncertaintyKm: 0.00002,
    source: {
      provider: 'LINZ Landonline reduced observations',
      reference: 'Observation row 9001 / Accuracy row 9001',
      groupId: 'ANTARCTIC-NETWORK-ROSS-01'
    }
  };
  assert.deepEqual(summarizeMultiAnchorCoverage([base]).validationErrors, []);

  const wrongBasis = summarizeMultiAnchorCoverage([{
    ...base, measurementBasis: 'slope-distance'
  }]);
  assert.ok(wrongBasis.validationErrors.some(item =>
    item.includes('measurementBasis=sea-level-horizontal')
  ));

  const missingUncertainty = summarizeMultiAnchorCoverage([{
    ...base, uncertaintyKm: undefined
  }]);
  assert.ok(missingUncertainty.validationErrors.some(item =>
    item.includes('survey observation must include a positive uncertaintyKm')
  ));

  const missingCoordinateSource = summarizeMultiAnchorCoverage([{
    ...base, b: { ...base.b, coordinateSource: undefined }
  }]);
  assert.ok(missingCoordinateSource.validationErrors.some(item =>
    item.includes('survey observation anchors must include coordinateSource.provider')
  ));
});

test('all LINZ observations from one Antarctic survey network remain in one split', () => {
  const base = {
    a: {
      id: 'MARK-A', lat: -77, lon: 166,
      coordinateSource: { provider: 'LINZ', reference: 'coord A' }
    },
    b: {
      id: 'MARK-B', lat: -77.001, lon: 166.002,
      coordinateSource: { provider: 'LINZ', reference: 'coord B' }
    },
    distanceKm: 1.2,
    measurementType: 'direct-survey-reduced-horizontal',
    measurementBasis: 'sea-level-horizontal',
    uncertaintyKm: 0.00002,
    source: { provider: 'LINZ', reference: 'obs 1', groupId: 'SYOWA-NETWORK-01' }
  };
  const coverage = summarizeMultiAnchorCoverage([
    { ...base, id: 'obs-a', split: 'train' },
    {
      ...base,
      id: 'obs-b',
      split: 'holdout',
      b: {
        id: 'MARK-C', lat: -77.002, lon: 166.003,
        coordinateSource: { provider: 'LINZ', reference: 'coord C' }
      }
    }
  ]);
  assert.ok(coverage.validationErrors.some(item =>
    item.includes('assigns survey group SYOWA-NETWORK-01 to both training and holdout')
  ));
});
