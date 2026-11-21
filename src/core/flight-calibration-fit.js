/**
 * Fit the flat-disk distance scale to observed ADS-B flight mileage.
 *
 * Each training airport pair contributes its median ground-speed × time
 * mileage and its flat-disk endpoint features. At runtime a small local
 * inverse-distance-weighted neighbour model predicts the mileage-per-unit-
 * chord ratio. This is deliberately empirical and contains no globe-distance
 * equations, coordinate-derived route lengths, or external math libraries.
 */
const DEG = Math.PI / 180;
const FACTOR_BOUNDS = [0.5, 2.5];
const NEIGHBOR_COUNT = 3;
const INVERSE_DISTANCE_POWER = 2;
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

/** Euclidean chord in the flat radial disk when R=1. */
export function unitDiskChord(first, second) {
  if (!validAirport(first) || !validAirport(second)) return NaN;
  const thetaA = (90 - first.lat) * DEG;
  const thetaB = (90 - second.lat) * DEG;
  const lambdaA = first.lon * DEG;
  const lambdaB = second.lon * DEG;
  const ax = thetaA * Math.cos(lambdaA);
  const ay = -thetaA * Math.sin(lambdaA);
  const bx = thetaB * Math.cos(lambdaB);
  const by = -thetaB * Math.sin(lambdaB);
  return Math.hypot(bx - ax, by - ay);
}

/** Symmetric endpoint features expressed only in flat-disk angular coordinates. */
export function flightCalibrationFeatures(first, second) {
  if (!validAirport(first) || !validAirport(second)) return null;
  const thetaA = (90 - first.lat) * DEG;
  const thetaB = (90 - second.lat) * DEG;
  const longitudeSpan = Math.abs(
    ((((second.lon - first.lon) + 180) % 360 + 360) % 360 - 180) * DEG
  );
  return [
    (thetaA + thetaB) / 2,
    Math.abs(thetaA - thetaB),
    longitudeSpan
  ];
}

function routeObservations(dataset, split) {
  return (dataset?.routes || []).filter(route =>
    route.split === split &&
    route.sampleCount >= 3 &&
    Number.isFinite(route.medianTrackKm) &&
    route.medianTrackKm > 0 &&
    validAirport(route.airportA) &&
    validAirport(route.airportB) &&
    unitDiskChord(route.airportA, route.airportB) > 1e-9
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

function makeTrainingExamples(routes) {
  return routes.map(route => {
    const chord = unitDiskChord(route.airportA, route.airportB);
    return {
      routeId: route.routeId,
      features: flightCalibrationFeatures(route.airportA, route.airportB),
      mileagePerUnitChord: route.medianTrackKm / chord,
      medianTrackKm: route.medianTrackKm,
      sampleCount: route.sampleCount
    };
  });
}

function radialScale(examples) {
  return median(examples.map(example => example.mileagePerUnitChord));
}

function modelFromExamples(examples, sourceDatasetVersion) {
  const stats = featureStatistics(examples);
  return {
    schemaVersion: 2,
    sourceDatasetVersion,
    target: 'median observed ADS-B flight-track mileage from ground-speed × time integration',
    radialScaleKm: radialScale(examples),
    featureNames: ['meanColatitude', 'colatitudeSpan', 'wrappedLongitudeSpan'],
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
  const chord = unitDiskChord(first, second);
  if (!Number.isFinite(chord)) return null;
  const features = flightCalibrationFeatures(first, second);
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
  const chord = unitDiskChord(route.airportA, route.airportB);
  const features = flightCalibrationFeatures(route.airportA, route.airportB);
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
  const training = routeObservations(dataset, 'train');
  const holdout = routeObservations(dataset, 'holdout');
  if (training.length < MIN_TRAIN_ROUTES || holdout.length < MIN_HOLDOUT_ROUTES) {
    throw new Error(
      'Insufficient empirical route coverage: need at least ' + MIN_TRAIN_ROUTES +
      ' training and ' + MIN_HOLDOUT_ROUTES + ' holdout routes with 3 usable flights each; got ' +
      training.length + ' training and ' + holdout.length + '.'
    );
  }

  const examples = makeTrainingExamples(training);
  const model = modelFromExamples(examples, dataset.schemaVersion);
  const holdoutErrors = holdout.map(route => routeError(route, model));
  const leaveOneOutErrors = training.map(route => {
    const subset = examples.filter(example => example.routeId !== route.routeId);
    const looModel = modelFromExamples(subset, dataset.schemaVersion);
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
