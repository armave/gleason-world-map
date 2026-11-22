/**
 * Experimental multi-anchor calibration for a circular flat-disk map.
 *
 * Fitting targets must be independently measured straight-line endpoint
 * distances. Aircraft mileage, flight duration, track length, and endpoint
 * coordinates converted through any spherical/ellipsoidal formula are not
 * acceptable substitutes for those measurements.
 *
 * This module produces a candidate beside production geometry. It never
 * changes the active map projection or the production distance engine.
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
  maximumTrainingMapePercent: 8,
  maximumHoldoutMapePercent: 10,
  maximumHoldoutPairErrorPercent: 20,
  minimumHoldoutImprovementPercentagePoints: 0.25,
  minimumJacobianDeterminant: 0.2,
  maximumAnchorDisplacementFraction: 0.12,
  maximumWarpDisplacementFraction: 0.12,
  maximumRadialOvershootFraction: 1e-5,
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
    if (item.measurementType !== 'direct-straight-line') {
      errors.push(label + ' is not an eligible direct-straight-line measurement');
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
    const observationId = typeof item.id === 'string' && item.id
      ? item.id : 'pair-' + index;
    if (observationIds.has(observationId)) {
      errors.push(label + ' duplicates observation ID ' + observationId);
      return;
    }
    pairSplits.set(key, item.split);
    observationIds.add(observationId);
    observations.push({
      id: observationId,
      split: item.split,
      a: { id: item.a.id, lat: item.a.lat, lon: item.a.lon },
      b: { id: item.b.id, lat: item.b.lat, lon: item.b.lon },
      distanceKm: item.distanceKm,
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

function boundaryAnchor(x, y) {
  const radius = Math.hypot(x, y);
  return radius < DISK_RADIUS_KM * 1e-7 ||
    radius > DISK_RADIUS_KM * (1 - 1e-7);
}

function envelopeAt(x, y, radiusKm = DISK_RADIUS_KM) {
  const q = clamp(Math.hypot(x, y) / radiusKm, 0, 1);
  return 16 * q * q * (1 - q) * (1 - q);
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
  return { anchors, latitudeBands, longitudeSectors };
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
    envelope: envelopeAt(seed[index][0], seed[index][1]),
    dx: fitted[index][0] - seed[index][0],
    dy: fitted[index][1] - seed[index][1]
  })).filter(control => control.envelope > 1e-4);
  const matrix = controls.map((first, row) => controls.map((second, column) => {
    const dx = first.xKm - second.xKm;
    const dy = first.yKm - second.yKm;
    const kernel = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaKm * sigmaKm));
    return first.envelope * second.envelope * kernel +
      (row === column ? regularization : 0);
  }));
  const alphaX = solveLinearSystem(matrix, controls.map(item => item.dx));
  const alphaY = solveLinearSystem(matrix, controls.map(item => item.dy));
  return {
    kind: 'gaussian-rbf-flat-disk',
    diskRadiusKm: DISK_RADIUS_KM,
    sigmaKm,
    regularization,
    controls: controls.map((item, index) => ({
      id: item.id,
      xKm: item.xKm,
      yKm: item.yKm,
      envelope: item.envelope,
      alphaX: alphaX[index],
      alphaY: alphaY[index]
    }))
  };
}

/** Smoothly warp a point in disk-kilometre coordinates; centre and rim stay fixed. */
export function applyMultiAnchorWarpXY(xKm, yKm, model) {
  if (!Number.isFinite(xKm) || !Number.isFinite(yKm) ||
      !model || !Number.isFinite(model.diskRadiusKm) || model.diskRadiusKm <= 0 ||
      !Array.isArray(model.controls) || model.controls.length > MULTI_ANCHOR_FILTERS.maximumControlPoints ||
      !Number.isFinite(model.sigmaKm) || model.sigmaKm <= 0 ||
      model.controls.some(control => ![
        control.xKm, control.yKm, control.envelope, control.alphaX, control.alphaY
      ].every(Number.isFinite))) return null;
  const envelope = envelopeAt(xKm, yKm, model.diskRadiusKm);
  let dx = 0, dy = 0;
  const denominator = 2 * model.sigmaKm * model.sigmaKm;
  for (const control of model.controls) {
    const x = xKm - control.xKm;
    const y = yKm - control.yKm;
    const kernel = Math.exp(-(x * x + y * y) / denominator);
    const weight = envelope * control.envelope * kernel;
    dx += weight * control.alphaX;
    dy += weight * control.alphaY;
  }
  return [xKm + dx, yKm + dy];
}

function jacobianDeterminant(x, y, model) {
  const step = Math.max(0.01, model.diskRadiusKm * 1e-6);
  const left = applyMultiAnchorWarpXY(x - step, y, model);
  const right = applyMultiAnchorWarpXY(x + step, y, model);
  const up = applyMultiAnchorWarpXY(x, y - step, model);
  const down = applyMultiAnchorWarpXY(x, y + step, model);
  const dXdx = (right[0] - left[0]) / (2 * step);
  const dYdx = (right[1] - left[1]) / (2 * step);
  const dXdy = (down[0] - up[0]) / (2 * step);
  const dYdy = (down[1] - up[1]) / (2 * step);
  return dXdx * dYdy - dXdy * dYdx;
}

/** Dense numerical topology check for disk-preserving candidate maps. */
export function inspectMultiAnchorTopology(model) {
  if (!model || !Number.isFinite(model.diskRadiusKm) || model.diskRadiusKm <= 0 ||
      !Number.isFinite(model.sigmaKm) || model.sigmaKm <= 0 ||
      !Array.isArray(model.controls)) {
    return {
      minimumJacobianDeterminant: -Infinity,
      maximumWarpDisplacementFraction: Infinity,
      maximumRadialOvershootFraction: Infinity,
      maximumBoundaryDisplacementKm: Infinity
    };
  }
  return topologyMetrics(model);
}

function topologyMetrics(model) {
  let minimumJacobianDeterminant = Infinity;
  let maximumWarpDisplacementKm = 0;
  let maximumRadialOvershootKm = 0;
  let maximumBoundaryDisplacementKm = 0;
  const radialSamples = 32;
  const angularSamples = 144;

  for (let radial = 0; radial <= radialSamples; radial++) {
    const fraction = radial / radialSamples;
    for (let angular = 0; angular < angularSamples; angular++) {
      const angle = 2 * Math.PI * angular / angularSamples;
      const x = model.diskRadiusKm * fraction * Math.cos(angle);
      const y = model.diskRadiusKm * fraction * Math.sin(angle);
      const mapped = applyMultiAnchorWarpXY(x, y, model);
      if (!mapped) {
        return {
          minimumJacobianDeterminant: -Infinity,
          maximumWarpDisplacementFraction: Infinity,
          maximumRadialOvershootFraction: Infinity,
          maximumBoundaryDisplacementKm: Infinity
        };
      }
      const displacement = Math.hypot(mapped[0] - x, mapped[1] - y);
      maximumWarpDisplacementKm = Math.max(maximumWarpDisplacementKm, displacement);
      maximumRadialOvershootKm = Math.max(
        maximumRadialOvershootKm,
        Math.max(0, Math.hypot(mapped[0], mapped[1]) - model.diskRadiusKm)
      );
      if (radial === radialSamples) {
        maximumBoundaryDisplacementKm = Math.max(
          maximumBoundaryDisplacementKm, displacement
        );
      }
      if (radial > 0 && radial < radialSamples) {
        minimumJacobianDeterminant = Math.min(
          minimumJacobianDeterminant, jacobianDeterminant(x, y, model)
        );
      }
    }
  }

  return {
    minimumJacobianDeterminant,
    maximumWarpDisplacementFraction: maximumWarpDisplacementKm / model.diskRadiusKm,
    maximumRadialOvershootFraction: maximumRadialOvershootKm / model.diskRadiusKm,
    maximumBoundaryDisplacementKm
  };
}

/** Damped Newton inverse for previewing a candidate; never used by production. */
export function invertMultiAnchorWarpXY(targetX, targetY, model, options = {}) {
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || !model ||
      !Number.isFinite(model.diskRadiusKm) || model.diskRadiusKm <= 0 ||
      Math.hypot(targetX, targetY) > model.diskRadiusKm * (1 + 1e-8)) return null;
  let x = targetX, y = targetY;
  const toleranceKm = options.toleranceKm ?? 1e-5;
  const maximumIterations = options.maximumIterations ?? 40;
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
  if (rigidityMatrixRank < requiredRigidityRank) {
    throw new Error(
      'Training distance constraints are not infinitesimally rigid in the seed disk: ' +
      'rank ' + rigidityMatrixRank + '; required ' + requiredRigidityRank
    );
  }
  const edges = training.map(item => ({
    aIndex: nodeIndex.get(item.a.id),
    bIndex: nodeIndex.get(item.b.id),
    distanceKm: item.distanceKm,
    confidence: item.confidence
  }));
  const totalWeight = edges.reduce((sum, edge) => sum + edge.confidence, 0);
  const firstMoment = positions.map(() => [0, 0]);
  const secondMoment = positions.map(() => [0, 0]);
  const iterations = options.iterations ?? 2000;
  const learningRateKm = options.learningRateKm ?? 8;
  const anchorWeight = options.anchorWeight ?? 0.03;
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
  const fixed = seed.map(point => boundaryAnchor(point[0], point[1]));

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
      if (fixed[index]) {
        gradient[index][0] = 0;
        gradient[index][1] = 0;
        positions[index][0] = seed[index][0];
        positions[index][1] = seed[index][1];
        continue;
      }
      gradient[index][0] += 2 * anchorWeight *
        (positions[index][0] - seed[index][0]) / (radiusSquared * count);
      gradient[index][1] += 2 * anchorWeight *
        (positions[index][1] - seed[index][1]) / (radiusSquared * count);
    }

    const progress = iteration / iterations;
    const rate = learningRateKm * (0.15 + 0.85 * 0.5 * (1 + Math.cos(Math.PI * progress)));
    for (let index = 0; index < positions.length; index++) {
      if (fixed[index]) continue;
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
      const maximumRadius = DISK_RADIUS_KM * 0.995;
      if (radius > maximumRadius) {
        positions[index][0] *= maximumRadius / radius;
        positions[index][1] *= maximumRadius / radius;
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
 * Fit a candidate using direct-distance observations only.
 * Candidate models are returned separately and never auto-activated.
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
  if (topology.maximumRadialOvershootFraction > limits.maximumRadialOvershootFraction)
    failures.push('Interpolated warp extends beyond the circular disk boundary');
  if (topology.maximumBoundaryDisplacementKm > 1e-5)
    failures.push('Candidate deformation does not exactly preserve the pole and Antarctic rim');
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
      rigidityMatrixRank: optimized.rigidityMatrixRank,
      requiredRigidityRank: optimized.requiredRigidityRank,
      maximumDisplacementFraction
    }
  };
}
