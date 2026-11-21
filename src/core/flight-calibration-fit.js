/**
 * Fit the flat-disk distance scale to observed ADS-B flight mileage.
 *
 * Each training airport pair contributes its median ground-speed × time
 * mileage and its flat-disk endpoint features. At runtime a small local
 * inverse-distance-weighted neighbour model predicts the mileage-per-unit-
 * chord ratio. This is deliberately empirical and contains no globe-distance
 * equations, coordinate-derived route lengths, or external math libraries.
 */
import { DEFAULT_RADIAL_WARP, radialFractionFromUnitColatitude } from './radial-warp.js';

const DEG = Math.PI / 180;
const FACTOR_BOUNDS = [0.5, 2.5];
const NEIGHBOR_COUNT = 2;
const INVERSE_DISTANCE_POWER = 1;
const MIN_TRAIN_ROUTES = 10;
const MIN_HOLDOUT_ROUTES = 4;

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validAirport(airport) {
  return !!airport &&
    Number.isFinite(airport.lat) && airport.lat >= -90 && airport.lat <= 90 &&
    Number.isFinite(airport.lon);
}

function wrappedLongitudeSpanRadians(first, second) {
  // Canonical ordering makes the calculation bit-for-bit symmetric when the
  // two endpoints are supplied in reverse order.
  const lower = Math.min(first.lon, second.lon);
  const upper = Math.max(first.lon, second.lon);
  const delta = (upper - lower) % 360;
  return Math.min(delta, 360 - delta) * DEG;
}

/**
 * Exact chord components in the warped radial disk when R=1. Multiplication
 * by pi keeps the unit-chord units aligned with the nominal scale R.
 */
function diskChordComponents(first, second, radialWarp = DEFAULT_RADIAL_WARP) {
  const tA = (90 - first.lat) / 180;
  const tB = (90 - second.lat) / 180;
  const qA = radialFractionFromUnitColatitude(tA, radialWarp);
  const qB = radialFractionFromUnitColatitude(tB, radialWarp);
  const radialComponent = Math.PI * Math.abs(qA - qB);
  const longitudeSpan = wrappedLongitudeSpanRadians(first, second);
  const tangentialComponent =
    Math.PI * 2 * Math.sqrt(qA * qB) * Math.sin(longitudeSpan / 2);
  return {
    meanRadialFraction: (qA + qB) / 2,
    radialComponent,
    tangentialComponent,
    chord: Math.hypot(radialComponent, tangentialComponent)
  };
}

export function unitDiskChord(first, second, radialWarp = DEFAULT_RADIAL_WARP) {
  if (!validAirport(first) || !validAirport(second)) return NaN;
  return diskChordComponents(first, second, radialWarp).chord;
}

export function flightCalibrationFeatures(
  first, second, radialWarp = DEFAULT_RADIAL_WARP
) {
  if (!validAirport(first) || !validAirport(second)) return null;
  const components = diskChordComponents(first, second, radialWarp);
  if (components.chord <= 1e-9) {
    return [components.meanRadialFraction, 0, 0];
  }
  return [
    components.meanRadialFraction,
    components.radialComponent / components.chord,
    components.tangentialComponent / components.chord
  ];
}

function routeObservations(dataset, split, radialWarp) {
  return (dataset?.routes || []).filter(route =>
    route.split === split &&
    route.sampleCount >= 3 &&
    Number.isFinite(route.medianTrackKm) &&
    route.medianTrackKm > 0 &&
    validAirport(route.airportA) &&
    validAirport(route.airportB) &&
    unitDiskChord(route.airportA, route.airportB, radialWarp) > 1e-9
  );
}

function featureStatistics(examples) {
  const columns = [0, 1, 2].map(index =>
    examples.map(example => example.features[index])
  );
  const means = columns.map(column =>
    column.reduce((sum, value) => sum + value, 0) / column.length
  );
  const scales = columns.map((column, index) => {
    const variance = column.reduce(
      (sum, value) => sum + (value - means[index]) ** 2, 0
    ) / column.length;
    return Math.sqrt(variance) || 1;
  });
  const ranges = columns.map(column => [Math.min(...column), Math.max(...column)]);
  return { means, scales, ranges };
}

function makeTrainingExamples(routes, radialWarp) {
  return routes.map(route => {
    const chord = unitDiskChord(route.airportA, route.airportB, radialWarp);
    return {
      routeId: route.routeId,
      features: flightCalibrationFeatures(route.airportA, route.airportB, radialWarp),
      mileagePerUnitChord: route.medianTrackKm / chord,
      medianTrackKm: route.medianTrackKm,
      sampleCount: route.sampleCount
    };
  });
}

function radialScale(examples) {
  return median(examples.map(example => example.mileagePerUnitChord));
}

function modelFromExamples(examples, sourceDatasetVersion, radialWarp) {
  const stats = featureStatistics(examples);
  return {
    schemaVersion: 4,
    sourceDatasetVersion,
    radialWarp: { ...radialWarp },
    target: 'median observed ADS-B flight-track mileage from ground-speed × time integration',
    radialScaleKm: radialScale(examples),
    featureNames: ['meanRadialFraction', 'radialShareOfChord', 'tangentialShareOfChord'],
    featureMeans: stats.means,
    featureScales: stats.scales,
    featureRanges: stats.ranges,
    factorBounds: FACTOR_BOUNDS,
    neighborCount: Math.min(NEIGHBOR_COUNT, examples.length),
    inverseDistancePower: INVERSE_DISTANCE_POWER,
    trainingRouteCount: examples.length,
    trainingExamples: examples
  };
}

function featureDistance(firstFeatures, secondFeatures, model) {
  let sum = 0;
  for (let index = 0; index < 3; index++) {
    const delta =
      (firstFeatures[index] - secondFeatures[index]) / model.featureScales[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/**
 * Predict the mileage-per-unit-chord ratio from the nearest training routes.
 * Ratios are averaged geometrically so positive scale factors remain positive.
 */
export function predictFlightScaleRatio(features, model, { excludeRouteId = null } = {}) {
  if (!Array.isArray(features) || features.length !== 3 || !model ||
      !Array.isArray(model.trainingExamples) || !model.trainingExamples.length) return null;

  const neighbors = model.trainingExamples
    .filter(example => example.routeId !== excludeRouteId)
    .map(example => ({
      routeId: example.routeId,
      mileagePerUnitChord: example.mileagePerUnitChord,
      distance: featureDistance(features, example.features, model)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(model.neighborCount, model.trainingExamples.length));

  if (!neighbors.length) return null;
  const exact = neighbors.find(neighbor => neighbor.distance < 1e-12);
  if (exact) {
    return {
      mileagePerUnitChord: exact.mileagePerUnitChord,
      neighborRouteIds: [exact.routeId],
      nearestFeatureDistance: exact.distance,
      weights: [1]
    };
  }

  const weights = neighbors.map(neighbor =>
    1 / Math.max(neighbor.distance, 1e-9) ** model.inverseDistancePower
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const weightedLogRatio = neighbors.reduce(
    (sum, neighbor, index) =>
      sum + weights[index] * Math.log(neighbor.mileagePerUnitChord),
    0
  ) / totalWeight;

  return {
    mileagePerUnitChord: Math.exp(weightedLogRatio),
    neighborRouteIds: neighbors.map(neighbor => neighbor.routeId),
    nearestFeatureDistance: neighbors[0].distance,
    weights: weights.map(weight => weight / totalWeight)
  };
}

export function predictFlightCalibratedKm(first, second, model) {
  if (!model || !validAirport(first) || !validAirport(second)) return null;
  const radialWarp = model.radialWarp || DEFAULT_RADIAL_WARP;
  const chord = unitDiskChord(first, second, radialWarp);
  if (!Number.isFinite(chord)) return null;
  const features = flightCalibrationFeatures(first, second, radialWarp);
  const prediction = predictFlightScaleRatio(features, model);
  if (!prediction) return null;

  const correctionFactor = clamp(
    prediction.mileagePerUnitChord / model.radialScaleKm,
    model.factorBounds[0],
    model.factorBounds[1]
  );
  return chord * model.radialScaleKm * correctionFactor;
}

function routeError(route, model, excludeRouteId = null) {
  const radialWarp = model.radialWarp || DEFAULT_RADIAL_WARP;
  const chord = unitDiskChord(route.airportA, route.airportB, radialWarp);
  const features = flightCalibrationFeatures(route.airportA, route.airportB, radialWarp);
  const scale = predictFlightScaleRatio(features, model, { excludeRouteId });
  if (!scale) return NaN;
  const predicted = chord * clamp(
    scale.mileagePerUnitChord,
    model.radialScaleKm * model.factorBounds[0],
    model.radialScaleKm * model.factorBounds[1]
  );
  return (predicted / route.medianTrackKm - 1) * 100;
}

function summarizeErrors(routes, errors) {
  const usable = errors.filter(Number.isFinite);
  return {
    routeCount: usable.length,
    meanAbsolutePercent: usable.length
      ? usable.reduce((sum, value) => sum + Math.abs(value), 0) / usable.length
      : null,
    rmsPercent: usable.length
      ? Math.sqrt(usable.reduce((sum, value) => sum + value * value, 0) / usable.length)
      : null,
    maxAbsolutePercent: usable.length
      ? Math.max(...usable.map(Math.abs))
      : null,
    routeErrors: routes.map((route, index) => ({
      routeId: route.routeId,
      referenceMedianTrackKm: route.medianTrackKm,
      errorPercent: errors[index]
    }))
  };
}

export function fitFlightCalibration(dataset) {
  const radialWarp = DEFAULT_RADIAL_WARP;
  const training = routeObservations(dataset, 'train', radialWarp);
  const holdout = routeObservations(dataset, 'holdout', radialWarp);
  if (training.length < MIN_TRAIN_ROUTES || holdout.length < MIN_HOLDOUT_ROUTES) {
    throw new Error(
      'Insufficient empirical route coverage: need at least ' + MIN_TRAIN_ROUTES +
      ' training and ' + MIN_HOLDOUT_ROUTES + ' holdout routes with 3 usable flights each; got ' +
      training.length + ' training and ' + holdout.length + '.'
    );
  }

  const examples = makeTrainingExamples(training, radialWarp);
  const model = modelFromExamples(examples, dataset.schemaVersion, radialWarp);
  model.holdoutRouteCount = holdout.length;
  const holdoutErrors = holdout.map(route => routeError(route, model));
  const leaveOneOutErrors = training.map(route => {
    const subset = examples.filter(example => example.routeId !== route.routeId);
    const looModel = modelFromExamples(subset, dataset.schemaVersion, radialWarp);
    return routeError(route, looModel);
  });

  // The independent training score is leave-one-route-out; an in-sample nearest
  // neighbour score would be trivially zero and would misrepresent generalization.
  const trainingMetrics = summarizeErrors(training, leaveOneOutErrors);
  const holdoutMetrics = summarizeErrors(holdout, holdoutErrors);

  return {
    model,
    metrics: {
      training: trainingMetrics,
      holdout: holdoutMetrics,
      leaveOneOut: trainingMetrics
    }
  };
}
