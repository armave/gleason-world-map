/**
 * Empirical multi-anchor calibration for the Gleason flat-disk reference.
 *
 * Fitting targets are independently measured endpoint-to-endpoint lengths.
 * Survey baselines must provide an adjusted horizontal length, its stated
 * uncertainty, and traceable coordinate references for both physical marks.
 * Flown mileage and distances calculated from geographic coordinates are not
 * eligible observations.
 *
 * Candidate transforms may translate, stretch, contract and locally relocate
 * the pole, rim and intermediate map features. The pure Gleason map remains
 * a separate reference baseline.
 */
import { DISK_RADIUS_KM, project } from './flat-disk.js';

export const MULTI_ANCHOR_FILTERS = Object.freeze({
  minimumTrainingObservations: 30,
  minimumHoldoutObservations: 12,
  minimumTrainingAnchors: 12,
  minimumLatitudeBands: 4,
  minimumLongitudeSectors: 4,
  minimumHoldoutAnchors: 8,
  minimumHoldoutLatitudeBands: 3,
  minimumHoldoutLongitudeSectors: 4,
  minimumUnseenHoldoutAnchors: 4,
  minimumTrainingAnchorsSouthOf45S: 2,
  minimumHoldoutAnchorsSouthOf45S: 2,
  minimumTrainingAnchorsSouthOf60S: 1,
  minimumHoldoutAnchorsSouthOf60S: 1,
  maximumTrainingMapePercent: 8,
  maximumHoldoutMapePercent: 10,
  maximumHoldoutPairErrorPercent: 20,
  minimumHoldoutImprovementPercentagePoints: 0.25,
  minimumJacobianDeterminant: 0.03,
  maximumAnchorDisplacementFraction: 6,
  maximumWarpDisplacementFraction: 6,
  maximumOutputRadiusFraction: 5,
  maximumRoundTripErrorKm: 0.01,
  maximumControlPoints: 256
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const pairKey = (a, b) => [a, b].sort().join('|');
const longitudeDifference = (first, second) =>
  Math.abs(((first - second + 540) % 360) - 180);
const validAnchor = point =>
  !!point && typeof point.id === 'string' && point.id.trim() &&
  Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
  Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;

function normalizeObservations(input) {
  const errors = [];
  const observations = [];
  const anchors = new Map();
  const pairSplits = new Map();
  const surveyGroupSplits = new Map();
  const observationIds = new Set();

  if (!Array.isArray(input)) {
    return { observations, errors: ['observations must be an array'] };
  }

  input.forEach((item, index) => {
    const label = 'observation[' + index + ']';
    if (!item || !['train', 'holdout'].includes(item.split)) {
      errors.push(label + ' must declare split=train or split=holdout');
      return;
    }
    if (!validAnchor(item.a) || !validAnchor(item.b) || item.a.id === item.b.id) {
      errors.push(label + ' has invalid or identical endpoint anchors');
      return;
    }
    if (!Number.isFinite(item.distanceKm) || item.distanceKm <= 0 ||
        item.distanceKm > 50000) {
      errors.push(label + ' distanceKm must be greater than 0 and at most 50000');
      return;
    }
    const eligibleMeasurementTypes = ['direct-straight-line', 'direct-survey-baseline'];
    if (!eligibleMeasurementTypes.includes(item.measurementType)) {
      errors.push(label + ' is not an eligible direct-straight-line or direct-survey-baseline measurement');
      return;
    }
    if (item.measurementType === 'direct-survey-baseline') {
      if (item.measurementBasis !== 'adjusted-horizontal') {
        errors.push(label + ' survey baseline must declare measurementBasis=adjusted-horizontal');
        return;
      }
      if (!Number.isFinite(item.uncertaintyKm) || item.uncertaintyKm <= 0 ||
          item.uncertaintyKm > item.distanceKm) {
        errors.push(label + ' survey baseline must include a positive uncertaintyKm no greater than distanceKm');
        return;
      }
      for (const point of [item.a, item.b]) {
        if (!point.coordinateSource ||
            typeof point.coordinateSource.provider !== 'string' ||
            !point.coordinateSource.provider.trim() ||
            typeof point.coordinateSource.reference !== 'string' ||
            !point.coordinateSource.reference.trim()) {
          errors.push(label + ' survey baseline anchors must include coordinateSource.provider and coordinateSource.reference');
          return;
        }
      }
      if (typeof item.source?.groupId !== 'string' || !item.source.groupId.trim()) {
        errors.push(label + ' survey baseline source must include a stable source.groupId for site-level splitting');
        return;
      }
    }
    if (item.uncertaintyKm !== undefined &&
        (!Number.isFinite(item.uncertaintyKm) || item.uncertaintyKm <= 0 ||
         item.uncertaintyKm > item.distanceKm)) {
      errors.push(label + ' uncertaintyKm must be positive and no greater than distanceKm');
      return;
    }
    if (!item.source || typeof item.source.provider !== 'string' ||
        !item.source.provider.trim() ||
        typeof item.source.reference !== 'string' ||
        !item.source.reference.trim()) {
      errors.push(label + ' must include source.provider and source.reference');
      return;
    }

    let conflict = false;
    for (const point of [item.a, item.b]) {
      const previous = anchors.get(point.id);
      if (previous && (Math.abs(previous.lat - point.lat) > 1e-7 ||
          longitudeDifference(previous.lon, point.lon) > 1e-7)) conflict = true;
    }
    if (conflict) {
      errors.push(label + ' reuses an anchor ID with conflicting coordinates');
      return;
    }
    for (const point of [item.a, item.b]) {
      anchors.set(point.id, { id: point.id, lat: point.lat, lon: point.lon });
    }

    const key = pairKey(item.a.id, item.b.id);
    if (pairSplits.has(key)) {
      errors.push(label + ' duplicates endpoint pair ' + key +
        ' (previous split: ' + pairSplits.get(key) + ')');
      return;
    }
    if (item.measurementType === 'direct-survey-baseline') {
      const previousSplit = surveyGroupSplits.get(item.source.groupId);
      if (previousSplit && previousSplit !== item.split) {
        errors.push(label + ' assigns survey baseline group ' + item.source.groupId +
          ' to both training and holdout; split the complete baseline as one group');
        return;
      }
    }
    const observationId = typeof item.id === 'string' && item.id
      ? item.id : 'pair-' + index;
    if (observationIds.has(observationId)) {
      errors.push(label + ' duplicates observation ID ' + observationId);
      return;
    }
    pairSplits.set(key, item.split);
    if (item.measurementType === 'direct-survey-baseline') {
      surveyGroupSplits.set(item.source.groupId, item.split);
    }
    observationIds.add(observationId);
    observations.push({
      id: observationId,
      split: item.split,
      a: {
        id: item.a.id, lat: item.a.lat, lon: item.a.lon,
        ...(item.a.coordinateSource ? { coordinateSource: item.a.coordinateSource } : {})
      },
      b: {
        id: item.b.id, lat: item.b.lat, lon: item.b.lon,
        ...(item.b.coordinateSource ? { coordinateSource: item.b.coordinateSource } : {})
      },
      distanceKm: item.distanceKm,
      measurementType: item.measurementType,
      measurementBasis: item.measurementBasis ?? null,
      uncertaintyKm: Number.isFinite(item.uncertaintyKm) ? item.uncertaintyKm : null,
      confidence: Number.isFinite(item.confidence)
        ? clamp(item.confidence, 0.1, 1) : 1,
      source: item.source
    });
  });

  return { observations, errors };
}

function pointOnDisk(point) {
  const projected = project(point.lon, point.lat, DISK_RADIUS_KM);
  if (!Array.isArray(projected) || !projected.every(Number.isFinite)) {
    throw new Error('Could not project reference anchor ' + point.id);
  }
  return projected;
}

function anchorCoverage(observations) {
  const anchors = new Map();
  const latitudeBands = new Set();
  const longitudeSectors = new Set();
  for (const item of observations) {
    for (const point of [item.a, item.b]) {
      anchors.set(point.id, point);
      latitudeBands.add(clamp(Math.floor((point.lat + 90) / 30), 0, 5));
      longitudeSectors.add(clamp(
        Math.floor((((point.lon + 180) % 360) + 360) % 360 / 45), 0, 7
      ));
    }
  }
  const southernAnchorCount = [...anchors.values()]
    .filter(point => point.lat <= -45).length;
  const deepSouthernAnchorCount = [...anchors.values()]
    .filter(point => point.lat <= -60).length;
  return {
    anchors,
    latitudeBands,
    longitudeSectors,
    southernAnchorCount,
    deepSouthernAnchorCount
  };
}

function coverageFor(training, holdout, errors = []) {
  const trainingCoverage = anchorCoverage(training);
  const holdoutCoverage = anchorCoverage(holdout);
  const overlap = [...holdoutCoverage.anchors.keys()]
    .filter(id => trainingCoverage.anchors.has(id));
  const unseen = [...holdoutCoverage.anchors.keys()]
    .filter(id => !trainingCoverage.anchors.has(id));
  const trainingGraph = graphRigidityDiagnostics(
    [...trainingCoverage.anchors.keys()], training
  );
  return {
    trainingObservationCount: training.length,
    holdoutObservationCount: holdout.length,
    trainingAnchorCount: trainingCoverage.anchors.size,
    latitudeBandCount: trainingCoverage.latitudeBands.size,
    longitudeSectorCount: trainingCoverage.longitudeSectors.size,
    holdoutAnchorCount: holdoutCoverage.anchors.size,
    holdoutLatitudeBandCount: holdoutCoverage.latitudeBands.size,
    holdoutLongitudeSectorCount: holdoutCoverage.longitudeSectors.size,
    trainingAnchorsSouthOf45S: trainingCoverage.southernAnchorCount,
    holdoutAnchorsSouthOf45S: holdoutCoverage.southernAnchorCount,
    trainingAnchorsSouthOf60S: trainingCoverage.deepSouthernAnchorCount,
    holdoutAnchorsSouthOf60S: holdoutCoverage.deepSouthernAnchorCount,
    holdoutAnchorOverlapCount: overlap.length,
    unseenHoldoutAnchorCount: unseen.length,
    trainingGraph,
    validationErrors: errors
  };
}

function graphRigidityDiagnostics(anchorIds, observations) {
  const adjacent = new Map(anchorIds.map(id => [id, new Set()]));
  for (const item of observations) {
    adjacent.get(item.a.id)?.add(item.b.id);
    adjacent.get(item.b.id)?.add(item.a.id);
  }
  const degrees = [...adjacent.values()].map(neighbours => neighbours.size);
  const minimumDegree = degrees.length ? Math.min(...degrees) : 0;
  const isConnectedAfterRemoving = excluded => {
    const remaining = anchorIds.filter(id => !excluded.has(id));
    if (remaining.length < 2) return remaining.length === 1;
    const visited = new Set([remaining[0]]);
    const pending = [remaining[0]];
    while (pending.length) {
      const id = pending.pop();
      for (const next of adjacent.get(id) || []) {
        if (!excluded.has(next) && !visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
      }
    }
    return visited.size === remaining.length;
  };

  let twoVertexConnected = anchorIds.length >= 3 && isConnectedAfterRemoving(new Set());
  if (twoVertexConnected) {
    for (const id of anchorIds) {
      if (!isConnectedAfterRemoving(new Set([id]))) {
        twoVertexConnected = false;
        break;
      }
    }
  }
  let threeVertexConnected = twoVertexConnected && minimumDegree >= 3 &&
    observations.length >= Math.max(0, 2 * anchorIds.length - 2);
  if (threeVertexConnected) {
    outer:
    for (let first = 0; first < anchorIds.length; first++) {
      for (let second = first + 1; second < anchorIds.length; second++) {
        if (!isConnectedAfterRemoving(new Set([anchorIds[first], anchorIds[second]]))) {
          threeVertexConnected = false;
          break outer;
        }
      }
    }
  }
  return {
    edgeCount: observations.length,
    minimumDegree,
    twoVertexConnected,
    threeVertexConnected
  };
}

function numericalMatrixRank(matrix, relativeTolerance = 1e-9) {
  if (!Array.isArray(matrix) || matrix.length === 0) return 0;
  const rows = matrix.map(row => [...row]);
  const rowCount = rows.length;
  const columnCount = rows[0]?.length ?? 0;
  if (!columnCount) return 0;
  let maximum = 0;
  for (const row of rows) {
    for (const value of row) maximum = Math.max(maximum, Math.abs(value));
  }
  const tolerance = Math.max(1, maximum) * relativeTolerance;
  let pivotRow = 0;
  for (let column = 0; column < columnCount && pivotRow < rowCount; column++) {
    let pivot = pivotRow;
    for (let row = pivotRow + 1; row < rowCount; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) <= tolerance) continue;
    [rows[pivotRow], rows[pivot]] = [rows[pivot], rows[pivotRow]];
    const divisor = rows[pivotRow][column];
    for (let row = pivotRow + 1; row < rowCount; row++) {
      const factor = rows[row][column] / divisor;
      if (Math.abs(factor) <= tolerance) continue;
      for (let nextColumn = column + 1; nextColumn < columnCount; nextColumn++) {
        rows[row][nextColumn] -= factor * rows[pivotRow][nextColumn];
      }
      rows[row][column] = 0;
    }
    pivotRow++;
  }
  return pivotRow;
}

/** Rank of the planar distance-constraint rigidity matrix at seed positions. */
function planarRigidityMatrixRank(anchorIds, observations, seedPositions) {
  const indexes = new Map(anchorIds.map((id, index) => [id, index]));
  const rows = observations.map(item => {
    const firstIndex = indexes.get(item.a.id);
    const secondIndex = indexes.get(item.b.id);
    const first = seedPositions[firstIndex];
    const second = seedPositions[secondIndex];
    const dx = first[0] - second[0];
    const dy = first[1] - second[1];
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return null;
    const row = new Array(anchorIds.length * 2).fill(0);
    row[firstIndex * 2] = dx / length;
    row[firstIndex * 2 + 1] = dy / length;
    row[secondIndex * 2] = -dx / length;
    row[secondIndex * 2 + 1] = -dy / length;
    return row;
  }).filter(Boolean);
  return numericalMatrixRank(rows);
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  if (n === 0) return [];
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) {
      throw new Error('Multi-anchor radial-basis system is singular');
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j <= n; j++) rows[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j <= n; j++) {
        rows[row][j] -= factor * rows[column][j];
      }
    }
  }
  return rows.map(row => row[n]);
}

function buildWarp(seed, fitted, anchorIds, options = {}) {
  const sigmaKm = options.sigmaKm ?? DISK_RADIUS_KM * 0.2;
  const regularization = options.regularization ?? 1e-3;
  if (!Number.isFinite(sigmaKm) || sigmaKm <= 0) {
    throw new Error('RBF sigmaKm must be a positive finite number');
  }
  if (!Number.isFinite(regularization) || regularization < 0) {
    throw new Error('RBF regularization must be a non-negative finite number');
  }
  const controls = anchorIds.map((id, index) => ({
    id,
    xKm: seed[index][0],
    yKm: seed[index][1],
    dx: fitted[index][0] - seed[index][0],
    dy: fitted[index][1] - seed[index][1]
  }));
  const matrix = controls.map((first, row) => controls.map((second, column) => {
    const dx = first.xKm - second.xKm;
    const dy = first.yKm - second.yKm;
    const kernel = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaKm * sigmaKm));
    return kernel + (row === column ? regularization : 0);
  }));
  const alphaX = solveLinearSystem(matrix, controls.map(item => item.dx));
  const alphaY = solveLinearSystem(matrix, controls.map(item => item.dy));
  return {
    kind: 'gaussian-rbf-global-flat-disk',
    schemaVersion: 2,
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm,
    regularization,
    controls: controls.map((item, index) => ({
      id: item.id,
      xKm: item.xKm,
      yKm: item.yKm,
      alphaX: alphaX[index],
      alphaY: alphaY[index]
    }))
  };
}

function isValidWarpModel(model) {
  return !!model &&
    Number.isFinite(model.diskRadiusKm) && model.diskRadiusKm > 0 &&
    Number.isFinite(model.sigmaKm) && model.sigmaKm > 0 &&
    Array.isArray(model.controls) &&
    model.controls.length <= MULTI_ANCHOR_FILTERS.maximumControlPoints &&
    model.controls.every(control => control && typeof control === 'object' &&
      [
        control.xKm, control.yKm, control.alphaX, control.alphaY
      ].every(Number.isFinite) &&
      Math.hypot(control.xKm, control.yKm) <= model.diskRadiusKm * (1 + 1e-8));
}

/** Smoothly warp any point in the reference disk plane; pole and rim may move. */
export function applyMultiAnchorWarpXY(xKm, yKm, model) {
  if (!Number.isFinite(xKm) || !Number.isFinite(yKm) ||
      !isValidWarpModel(model)) return null;
  let dx = 0, dy = 0;
  const denominator = 2 * model.sigmaKm * model.sigmaKm;
  for (const control of model.controls) {
    const x = xKm - control.xKm;
    const y = yKm - control.yKm;
    const kernel = Math.exp(-(x * x + y * y) / denominator);
    const weight = kernel;
    dx += weight * control.alphaX;
    dy += weight * control.alphaY;
  }
  const mapped = [xKm + dx, yKm + dy];
  return mapped.every(Number.isFinite) ? mapped : null;
}

function jacobianDeterminant(x, y, model) {
  const step = Math.max(0.01, model.diskRadiusKm * 1e-6);
  const left = applyMultiAnchorWarpXY(x - step, y, model);
  const right = applyMultiAnchorWarpXY(x + step, y, model);
  const up = applyMultiAnchorWarpXY(x, y - step, model);
  const down = applyMultiAnchorWarpXY(x, y + step, model);
  if (![left, right, up, down].every(Boolean)) return -Infinity;
  const dXdx = (right[0] - left[0]) / (2 * step);
  const dYdx = (right[1] - left[1]) / (2 * step);
  const dXdy = (down[0] - up[0]) / (2 * step);
  const dYdy = (down[1] - up[1]) / (2 * step);
  const determinant = dXdx * dYdy - dXdy * dYdx;
  return Number.isFinite(determinant) ? determinant : -Infinity;
}

/** Dense numerical topology check for disk-preserving candidate maps. */
export function inspectMultiAnchorTopology(model) {
  if (!isValidWarpModel(model)) {
    return {
      minimumJacobianDeterminant: -Infinity,
      maximumWarpDisplacementFraction: Infinity,
      maximumMappedRadiusFraction: Infinity,
      maximumBoundaryDisplacementKm: Infinity,
      topologySampleCount: 0
    };
  }
  return topologyMetrics(model);
}

function topologyMetrics(model) {
  let minimumJacobianDeterminant = Infinity;
  let maximumWarpDisplacementKm = 0;
  let maximumMappedRadiusKm = 0;
  let maximumBoundaryDisplacementKm = 0;
  const radiusKm = model.diskRadiusKm;
  const radialSamples = 64;
  const angularSamples = 288;
  const samples = new Map();
  const addSample = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        Math.hypot(x, y) > radiusKm * (1 + 1e-10)) return;
    const key = x.toFixed(6) + ',' + y.toFixed(6);
    if (!samples.has(key)) samples.set(key, [x, y]);
  };

  // A denser full-disk grid checks broad deformations and the circular boundary.
  for (let radial = 0; radial < radialSamples; radial++) {
    const fraction = radial / radialSamples;
    for (let angular = 0; angular < angularSamples; angular++) {
      const angle = 2 * Math.PI * angular / angularSamples;
      addSample(
        radiusKm * fraction * Math.cos(angle),
        radiusKm * fraction * Math.sin(angle)
      );
    }
  }

  // A control-centred adaptive stencil checks narrow RBF features that can sit
  // entirely between uniform grid points. Gaussian gradients are strongest
  // around one sigma from a control centre, so sample several local radii.
  const localRadii = [0.5, 1, 2, 3];
  const localAngularSamples = 24;
  for (const control of model.controls) {
    addSample(control.xKm, control.yKm);
    for (const radialFactor of localRadii) {
      const localRadius = model.sigmaKm * radialFactor;
      for (let angular = 0; angular < localAngularSamples; angular++) {
        const angle = 2 * Math.PI * (angular + 0.5) / localAngularSamples;
        addSample(
          control.xKm + localRadius * Math.cos(angle),
          control.yKm + localRadius * Math.sin(angle)
        );
      }
    }
  }

  for (const [x, y] of samples.values()) {
    const mapped = applyMultiAnchorWarpXY(x, y, model);
    if (!mapped) {
      return {
        minimumJacobianDeterminant: -Infinity,
        maximumWarpDisplacementFraction: Infinity,
        maximumMappedRadiusFraction: Infinity,
        maximumBoundaryDisplacementKm: Infinity,
        topologySampleCount: samples.size
      };
    }
    const displacement = Math.hypot(mapped[0] - x, mapped[1] - y);
    maximumWarpDisplacementKm = Math.max(maximumWarpDisplacementKm, displacement);
    maximumMappedRadiusKm = Math.max(
      maximumMappedRadiusKm, Math.hypot(mapped[0], mapped[1])
    );
    minimumJacobianDeterminant = Math.min(
      minimumJacobianDeterminant, jacobianDeterminant(x, y, model)
    );
  }

  // Check the entire rim at a separately sampled angular resolution.
  for (let angular = 0; angular < angularSamples; angular++) {
    const angle = 2 * Math.PI * angular / angularSamples;
    const x = radiusKm * Math.cos(angle);
    const y = radiusKm * Math.sin(angle);
    const mapped = applyMultiAnchorWarpXY(x, y, model);
    if (!mapped) {
      maximumBoundaryDisplacementKm = Infinity;
      break;
    }
    maximumBoundaryDisplacementKm = Math.max(
      maximumBoundaryDisplacementKm,
      Math.hypot(mapped[0] - x, mapped[1] - y)
    );
    maximumMappedRadiusKm = Math.max(
      maximumMappedRadiusKm, Math.hypot(mapped[0], mapped[1])
    );
  }

  return {
    minimumJacobianDeterminant,
    maximumWarpDisplacementFraction: maximumWarpDisplacementKm / radiusKm,
    maximumMappedRadiusFraction: maximumMappedRadiusKm / radiusKm,
    maximumBoundaryDisplacementKm,
    topologySampleCount: samples.size
  };
}

/** Damped Newton inverse for previewing a candidate; never used by production. */
export function invertMultiAnchorWarpXY(targetX, targetY, model, options = {}) {
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) ||
      !options || typeof options !== 'object' ||
      !isValidWarpModel(model) ||
      Math.hypot(targetX, targetY) >
        model.diskRadiusKm * MULTI_ANCHOR_FILTERS.maximumOutputRadiusFraction) return null;
  let x = targetX, y = targetY;
  const initialRadius = Math.hypot(x, y);
  if (initialRadius > model.diskRadiusKm) {
    x *= model.diskRadiusKm / initialRadius;
    y *= model.diskRadiusKm / initialRadius;
  }
  const toleranceKm = options.toleranceKm ?? 1e-5;
  const maximumIterations = options.maximumIterations ?? 40;
  if (!Number.isFinite(toleranceKm) || toleranceKm <= 0 ||
      !Number.isInteger(maximumIterations) ||
      maximumIterations < 1 || maximumIterations > 200) return null;
  for (let iteration = 0; iteration < maximumIterations; iteration++) {
    const mapped = applyMultiAnchorWarpXY(x, y, model);
    if (!mapped) return null;
    const ex = mapped[0] - targetX;
    const ey = mapped[1] - targetY;
    const residual = Math.hypot(ex, ey);
    if (residual <= toleranceKm) return [x, y];
    const step = Math.max(0.01, model.diskRadiusKm * 1e-6);
    const left = applyMultiAnchorWarpXY(x - step, y, model);
    const right = applyMultiAnchorWarpXY(x + step, y, model);
    const up = applyMultiAnchorWarpXY(x, y - step, model);
    const down = applyMultiAnchorWarpXY(x, y + step, model);
    if (![left, right, up, down].every(Boolean)) return null;
    const a = (right[0] - left[0]) / (2 * step);
    const c = (right[1] - left[1]) / (2 * step);
    const b = (down[0] - up[0]) / (2 * step);
    const d = (down[1] - up[1]) / (2 * step);
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;
    const dx = (d * ex - b * ey) / determinant;
    const dy = (-c * ex + a * ey) / determinant;

    let accepted = false;
    for (let damping = 1; damping >= 1 / 256; damping /= 2) {
      const candidateX = x - damping * dx;
      const candidateY = y - damping * dy;
      if (Math.hypot(candidateX, candidateY) > model.diskRadiusKm * (1 + 1e-8)) continue;
      const candidate = applyMultiAnchorWarpXY(candidateX, candidateY, model);
      if (!candidate) continue;
      if (Math.hypot(candidate[0] - targetX, candidate[1] - targetY) < residual) {
        x = candidateX;
        y = candidateY;
        accepted = true;
        break;
      }
    }
    if (!accepted) return null;
  }
  const finalPoint = applyMultiAnchorWarpXY(x, y, model);
  return finalPoint && Math.hypot(finalPoint[0] - targetX, finalPoint[1] - targetY) <=
    toleranceKm * 10 ? [x, y] : null;
}

/**
 * Sample forward/inverse round trips across the disk and at every RBF control.
 * The error is measured in drawing-plane kilometres, not via any Earth-distance
 * formula. This is a numerical invertibility check for the candidate transform.
 */
export function inspectMultiAnchorRoundTrips(model, options = {}) {
  if (!isValidWarpModel(model) || !options || typeof options !== 'object') {
    return {
      roundTripSampleCount: 0,
      roundTripFailureCount: Infinity,
      maximumRoundTripErrorKm: Infinity
    };
  }
  const toleranceKm = options.toleranceKm ?? 1e-3;
  const maximumIterations = options.maximumIterations ?? 40;
  if (!Number.isFinite(toleranceKm) || toleranceKm <= 0 ||
      !Number.isInteger(maximumIterations) ||
      maximumIterations < 1 || maximumIterations > 200) {
    return {
      roundTripSampleCount: 0,
      roundTripFailureCount: Infinity,
      maximumRoundTripErrorKm: Infinity
    };
  }

  const samples = new Map();
  const addSample = (x, y) => {
    const key = x.toFixed(6) + ',' + y.toFixed(6);
    if (!samples.has(key)) samples.set(key, [x, y]);
  };
  const radialSamples = 12;
  const angularSamples = 48;
  for (let radial = 0; radial <= radialSamples; radial++) {
    const fraction = radial / radialSamples;
    if (radial === 0) {
      addSample(0, 0);
      continue;
    }
    for (let angular = 0; angular < angularSamples; angular++) {
      const angle = 2 * Math.PI * angular / angularSamples;
      addSample(
        model.diskRadiusKm * fraction * Math.cos(angle),
        model.diskRadiusKm * fraction * Math.sin(angle)
      );
    }
  }
  for (const control of model.controls) {
    addSample(control.xKm, control.yKm);
  }

  let roundTripFailureCount = 0;
  let maximumRoundTripErrorKm = 0;
  for (const [x, y] of samples.values()) {
    const forward = applyMultiAnchorWarpXY(x, y, model);
    const inverse = forward
      ? invertMultiAnchorWarpXY(forward[0], forward[1], model, {
          toleranceKm,
          maximumIterations
        })
      : null;
    if (!inverse) {
      roundTripFailureCount++;
      continue;
    }
    maximumRoundTripErrorKm = Math.max(
      maximumRoundTripErrorKm,
      Math.hypot(inverse[0] - x, inverse[1] - y)
    );
  }
  return {
    roundTripSampleCount: samples.size,
    roundTripFailureCount,
    maximumRoundTripErrorKm
  };
}

function measureDistance(a, b, model = null) {
  const first = pointOnDisk(a);
  const second = pointOnDisk(b);
  const movedFirst = model ? applyMultiAnchorWarpXY(first[0], first[1], model) : first;
  const movedSecond = model ? applyMultiAnchorWarpXY(second[0], second[1], model) : second;
  return Math.hypot(movedSecond[0] - movedFirst[0], movedSecond[1] - movedFirst[1]);
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] :
    sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeErrors(observations, model = null) {
  const errors = observations.map(item => {
    const predictedKm = measureDistance(item.a, item.b, model);
    return {
      id: item.id,
      observedKm: item.distanceKm,
      predictedKm,
      signedPercent: (predictedKm / item.distanceKm - 1) * 100,
      absolutePercent: Math.abs(predictedKm / item.distanceKm - 1) * 100
    };
  });
  const absoluteErrors = errors.map(item => item.absolutePercent);
  return {
    observationCount: errors.length,
    meanAbsolutePercent: errors.length
      ? absoluteErrors.reduce((sum, value) => sum + value, 0) / errors.length : null,
    meanSignedPercent: errors.length
      ? errors.reduce((sum, item) => sum + item.signedPercent, 0) / errors.length : null,
    p95AbsolutePercent: percentile(absoluteErrors, 0.95),
    maxAbsolutePercent: absoluteErrors.length ? Math.max(...absoluteErrors) : null,
    errors
  };
}

function optimizePositions(training, anchors, options = {}) {
  const anchorIds = [...anchors.keys()];
  if (anchorIds.length > MULTI_ANCHOR_FILTERS.maximumControlPoints) {
    throw new Error('Training anchor count exceeds the configured solver limit');
  }
  const rigidity = graphRigidityDiagnostics(anchorIds, training);
  if (!rigidity.threeVertexConnected) {
    throw new Error(
      'Training anchor network is not sufficiently redundant: require a ' +
      '3-vertex-connected graph, minimum degree 3, and at least 2N-2 pairs ' +
      '(observed ' + rigidity.edgeCount + ' pairs, minimum degree ' +
      rigidity.minimumDegree + ')'
    );
  }

  const nodeIndex = new Map(anchorIds.map((id, index) => [id, index]));
  const seed = anchorIds.map(id => pointOnDisk(anchors.get(id)));
  for (let first = 0; first < seed.length; first++) {
    for (let second = first + 1; second < seed.length; second++) {
      if (Math.hypot(
        seed[first][0] - seed[second][0],
        seed[first][1] - seed[second][1]
      ) < 1e-3) {
        throw new Error('Distinct anchor IDs map to the same disk position: ' +
          anchorIds[first] + ' and ' + anchorIds[second]);
      }
    }
  }
  const positions = seed.map(point => [...point]);
  const rigidityMatrixRank = planarRigidityMatrixRank(anchorIds, training, seed);
  const requiredRigidityRank = Math.max(0, 2 * anchorIds.length - 3);
  if (rigidityMatrixRank !== requiredRigidityRank) {
    throw new Error(
      'Training distance constraints do not have the required planar rigidity rank ' +
      'at the seed disk: rank ' + rigidityMatrixRank + '; required exactly ' +
      requiredRigidityRank
    );
  }
  const relativeUncertainties = training
    .filter(item => Number.isFinite(item.uncertaintyKm))
    .map(item => item.uncertaintyKm / item.distanceKm)
    .sort((a, b) => a - b);
  const medianRelativeUncertainty = relativeUncertainties.length
    ? relativeUncertainties[Math.floor(relativeUncertainties.length / 2)]
    : null;
  const edges = training.map(item => {
    const relativeUncertainty = Number.isFinite(item.uncertaintyKm)
      ? item.uncertaintyKm / item.distanceKm : null;
    const precisionRatio = relativeUncertainty && medianRelativeUncertainty
      ? medianRelativeUncertainty / relativeUncertainty : 1;
    const uncertaintyWeight = clamp(precisionRatio ** 2, 0.1, 10);
    return {
      aIndex: nodeIndex.get(item.a.id),
      bIndex: nodeIndex.get(item.b.id),
      distanceKm: item.distanceKm,
      confidence: item.confidence * uncertaintyWeight,
      uncertaintyKm: item.uncertaintyKm
    };
  });
  const totalWeight = edges.reduce((sum, edge) => sum + edge.confidence, 0);
  const firstMoment = positions.map(() => [0, 0]);
  const secondMoment = positions.map(() => [0, 0]);
  const iterations = options.iterations ?? 2000;
  const learningRateKm = options.learningRateKm ?? 8;
  const anchorWeight = options.anchorWeight ?? 0.003;
  const huberDelta = options.huberDelta ?? 0.08;
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 20000) {
    throw new Error('Optimizer iterations must be an integer from 100 to 20000');
  }
  if (!Number.isFinite(learningRateKm) || learningRateKm <= 0 ||
      !Number.isFinite(anchorWeight) || anchorWeight < 0 ||
      !Number.isFinite(huberDelta) || huberDelta <= 0) {
    throw new Error('Optimizer learning rate, anchor weight, or Huber delta is invalid');
  }
  const beta1 = 0.9, beta2 = 0.999, epsilon = 1e-8;
  const radiusSquared = DISK_RADIUS_KM * DISK_RADIUS_KM;
  const count = Math.max(1, positions.length);
  const maximumAnchorRadius = DISK_RADIUS_KM * MULTI_ANCHOR_FILTERS.maximumOutputRadiusFraction;

  for (let iteration = 1; iteration <= iterations; iteration++) {
    const gradient = positions.map(() => [0, 0]);
    for (const edge of edges) {
      const first = positions[edge.aIndex];
      const second = positions[edge.bIndex];
      const dx = second[0] - first[0];
      const dy = second[1] - first[1];
      const distance = Math.max(1e-8, Math.hypot(dx, dy));
      const error = distance / edge.distanceKm - 1;
      const robustDerivative = Math.abs(error) <= huberDelta
        ? 2 * error
        : 2 * huberDelta * Math.sign(error);
      const scale = edge.confidence * robustDerivative /
        (totalWeight * edge.distanceKm * distance);
      const gx = scale * dx;
      const gy = scale * dy;
      gradient[edge.aIndex][0] -= gx;
      gradient[edge.aIndex][1] -= gy;
      gradient[edge.bIndex][0] += gx;
      gradient[edge.bIndex][1] += gy;
    }

    for (let index = 0; index < positions.length; index++) {
      gradient[index][0] += 2 * anchorWeight *
        (positions[index][0] - seed[index][0]) / (radiusSquared * count);
      gradient[index][1] += 2 * anchorWeight *
        (positions[index][1] - seed[index][1]) / (radiusSquared * count);
    }

    const progress = iteration / iterations;
    const rate = learningRateKm * (0.15 + 0.85 * 0.5 * (1 + Math.cos(Math.PI * progress)));
    for (let index = 0; index < positions.length; index++) {
      for (let axis = 0; axis < 2; axis++) {
        const value = gradient[index][axis];
        firstMoment[index][axis] = beta1 * firstMoment[index][axis] +
          (1 - beta1) * value;
        secondMoment[index][axis] = beta2 * secondMoment[index][axis] +
          (1 - beta2) * value * value;
        const correctedFirst = firstMoment[index][axis] / (1 - beta1 ** iteration);
        const correctedSecond = secondMoment[index][axis] / (1 - beta2 ** iteration);
        positions[index][axis] -= rate * correctedFirst /
          (Math.sqrt(correctedSecond) + epsilon);
      }
      const radius = Math.hypot(positions[index][0], positions[index][1]);
      if (radius > maximumAnchorRadius) {
        positions[index][0] *= maximumAnchorRadius / radius;
        positions[index][1] *= maximumAnchorRadius / radius;
      }
    }
  }

  let maximumDisplacementKm = 0;
  positions.forEach((point, index) => {
    maximumDisplacementKm = Math.max(maximumDisplacementKm,
      Math.hypot(point[0] - seed[index][0], point[1] - seed[index][1]));
  });
  return {
    anchorIds, seed, positions, maximumDisplacementKm,
    rigidityMatrixRank, requiredRigidityRank
  };
}

export function summarizeMultiAnchorCoverage(input) {
  const normalized = normalizeObservations(input);
  const training = normalized.observations.filter(item => item.split === 'train');
  const holdout = normalized.observations.filter(item => item.split === 'holdout');
  return coverageFor(training, holdout, normalized.errors);
}

/**
 * Fit a candidate using direct measured-distance observations only.
 * Candidate models may displace the pole and rim but are never auto-activated.
 */
export function fitMultiAnchorFlatDisk(input, options = {}) {
  const normalized = normalizeObservations(input);
  const training = normalized.observations.filter(item => item.split === 'train');
  const holdout = normalized.observations.filter(item => item.split === 'holdout');
  const coverage = coverageFor(training, holdout, normalized.errors);
  const limits = MULTI_ANCHOR_FILTERS;
  const failures = [...normalized.errors];

  if (training.length < limits.minimumTrainingObservations)
    failures.push('Insufficient direct-distance training observations');
  if (holdout.length < limits.minimumHoldoutObservations)
    failures.push('Insufficient independent direct-distance holdout observations');
  if (coverage.trainingAnchorCount < limits.minimumTrainingAnchors)
    failures.push('Insufficient distinct training anchors');
  if (coverage.latitudeBandCount < limits.minimumLatitudeBands)
    failures.push('Insufficient latitude-band coverage');
  if (coverage.longitudeSectorCount < limits.minimumLongitudeSectors)
    failures.push('Insufficient longitude-sector coverage');
  if (coverage.holdoutAnchorCount < limits.minimumHoldoutAnchors)
    failures.push('Insufficient distinct holdout anchors');
  if (coverage.holdoutLatitudeBandCount < limits.minimumHoldoutLatitudeBands)
    failures.push('Insufficient holdout latitude-band coverage');
  if (coverage.holdoutLongitudeSectorCount < limits.minimumHoldoutLongitudeSectors)
    failures.push('Insufficient holdout longitude-sector coverage');
  if (coverage.unseenHoldoutAnchorCount < limits.minimumUnseenHoldoutAnchors)
    failures.push('Insufficient geographically unseen holdout anchors');
  if (coverage.trainingAnchorsSouthOf45S < limits.minimumTrainingAnchorsSouthOf45S)
    failures.push('Insufficient training anchors south of 45 degrees south');
  if (coverage.holdoutAnchorsSouthOf45S < limits.minimumHoldoutAnchorsSouthOf45S)
    failures.push('Insufficient independent holdout anchors south of 45 degrees south');
  if (coverage.trainingAnchorsSouthOf60S < limits.minimumTrainingAnchorsSouthOf60S)
    failures.push('Insufficient deep-southern training anchors south of 60 degrees south');
  if (coverage.holdoutAnchorsSouthOf60S < limits.minimumHoldoutAnchorsSouthOf60S)
    failures.push('Insufficient deep-southern holdout anchors south of 60 degrees south');
  if (coverage.trainingAnchorCount >= limits.minimumTrainingAnchors &&
      !coverage.trainingGraph.threeVertexConnected) {
    failures.push(
      'Training anchor network must be 3-vertex-connected with minimum degree 3 ' +
      'and at least 2N-2 distinct pairs'
    );
  }
  if (failures.length) {
    return {
      accepted: false,
      status: 'insufficient-or-invalid-data',
      failures,
      coverage,
      model: null,
      metrics: null
    };
  }

  let optimized, model;
  try {
    const anchors = new Map();
    training.forEach(item => {
      anchors.set(item.a.id, item.a);
      anchors.set(item.b.id, item.b);
    });
    optimized = optimizePositions(training, anchors, options);
    model = buildWarp(optimized.seed, optimized.positions, optimized.anchorIds, options);
    if (!isValidWarpModel(model)) {
      throw new Error('Candidate radial-basis fit produced invalid model parameters');
    }
  } catch (error) {
    return {
      accepted: false,
      status: 'fit-failed',
      failures: [error.message],
      coverage,
      model: null,
      metrics: null
    };
  }

  const trainingMetrics = summarizeErrors(training, model);
  const holdoutMetrics = summarizeErrors(holdout, model);
  const baselineHoldout = summarizeErrors(holdout);
  const topology = topologyMetrics(model);
  const roundTrips = inspectMultiAnchorRoundTrips(model);
  const maximumDisplacementFraction = optimized.maximumDisplacementKm / DISK_RADIUS_KM;

  if (trainingMetrics.meanAbsolutePercent > limits.maximumTrainingMapePercent)
    failures.push('Training MAPE exceeds the acceptance limit');
  if (holdoutMetrics.meanAbsolutePercent > limits.maximumHoldoutMapePercent)
    failures.push('Independent holdout MAPE exceeds the acceptance limit');
  if (holdoutMetrics.maxAbsolutePercent > limits.maximumHoldoutPairErrorPercent)
    failures.push('Maximum independent holdout-pair error exceeds the acceptance limit');
  if (topology.minimumJacobianDeterminant < limits.minimumJacobianDeterminant)
    failures.push('Candidate deformation fails the no-foldover Jacobian gate');
  if (maximumDisplacementFraction > limits.maximumAnchorDisplacementFraction)
    failures.push('Training-anchor displacement exceeds the stability limit');
  if (topology.maximumWarpDisplacementFraction > limits.maximumWarpDisplacementFraction)
    failures.push('Interpolated warp displacement exceeds the stability limit');
  if (topology.maximumMappedRadiusFraction > limits.maximumOutputRadiusFraction)
    failures.push('Warped map extent exceeds the configured output safety bound');
  if (roundTrips.roundTripFailureCount > 0 ||
      roundTrips.maximumRoundTripErrorKm > limits.maximumRoundTripErrorKm) {
    failures.push('Candidate fails the forward/inverse round-trip gate');
  }
  if (holdoutMetrics.meanAbsolutePercent >= baselineHoldout.meanAbsolutePercent -
      limits.minimumHoldoutImprovementPercentagePoints) {
    failures.push('Candidate does not improve independent holdout MAPE by at least ' +
      limits.minimumHoldoutImprovementPercentagePoints + ' percentage points');
  }

  model.trainingAnchorCount = coverage.trainingAnchorCount;
  model.trainingObservationCount = training.length;
  model.holdoutObservationCount = holdout.length;
  model.maximumDisplacementKm = optimized.maximumDisplacementKm;
  model.rigidityMatrixRank = optimized.rigidityMatrixRank;
  model.requiredRigidityRank = optimized.requiredRigidityRank;

  return {
    accepted: failures.length === 0,
    status: failures.length ? 'rejected' : 'accepted',
    failures,
    coverage,
    candidateModel: model,
    model: failures.length ? null : model,
    metrics: {
      training: trainingMetrics,
      holdout: holdoutMetrics,
      baselineHoldout,
      holdoutImprovementPercentagePoints:
        baselineHoldout.meanAbsolutePercent - holdoutMetrics.meanAbsolutePercent,
      ...topology,
      ...roundTrips,
      rigidityMatrixRank: optimized.rigidityMatrixRank,
      requiredRigidityRank: optimized.requiredRigidityRank,
      maximumDisplacementFraction
    }
  };
}
