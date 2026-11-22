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
import {
  RADIAL_DISTANCE_PROFILE_MEAN,
  visualRadialFractionFromBaseFraction
} from './visual-radial-calibration.js';
import { warpLongitudeRadians } from './visual-longitude-calibration.js';

const DEG = Math.PI / 180;
const FACTOR_BOUNDS = [0.5, 2.5];
const NEIGHBOR_COUNT = 2;
const INVERSE_DISTANCE_POWER = 1;
const MIN_TRAIN_ROUTES = 10;
const MIN_HOLDOUT_ROUTES = 4;
const MIN_ROUTE_TELEMETRY_COVERAGE = 0.98;
const MAX_ROUTE_TELEMETRY_GAP_MINUTES = 15;

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

function wrappedLongitudeSpanRadians(
  first,
  second,
  baseFractionA,
  baseFractionB,
  useVisualWarp = true
) {
  const longitudeA = useVisualWarp
    ? warpLongitudeRadians(first.lon * DEG, baseFractionA)
    : first.lon * DEG;
  const longitudeB = useVisualWarp
    ? warpLongitudeRadians(second.lon * DEG, baseFractionB)
    : second.lon * DEG;
  const fullTurn = Math.PI * 2;
  const delta = Math.abs((longitudeB - longitudeA) % fullTurn);
  return Math.min(delta, fullTurn - delta);
}

/**
 * Exact chord components in the warped radial disk when R=1. Multiplication
 * by pi keeps the unit-chord units aligned with the nominal scale R.
 */
function diskChordComponents(
  first,
  second,
  radialWarp = DEFAULT_RADIAL_WARP,
  chordGeometry = 'visual-12-circle'
) {
  const tA = (90 - first.lat) / 180;
  const tB = (90 - second.lat) / 180;
  const baseA = radialFractionFromUnitColatitude(tA, radialWarp);
  const baseB = radialFractionFromUnitColatitude(tB, radialWarp);
  const useVisualChord = chordGeometry === 'visual-12-circle';
  const qA = useVisualChord ? visualRadialFractionFromBaseFraction(baseA) : baseA;
  const qB = useVisualChord ? visualRadialFractionFromBaseFraction(baseB) : baseB;
  const profileScale = useVisualChord ? RADIAL_DISTANCE_PROFILE_MEAN : 1;
  const radialComponent = profileScale * Math.PI * Math.abs(qA - qB);
  const longitudeSpan = wrappedLongitudeSpanRadians(first, second, baseA, baseB, useVisualChord);
  const tangentialComponent =
    profileScale * Math.PI * 2 * Math.sqrt(qA * qB) * Math.sin(longitudeSpan / 2);
  return {
    meanRadialFraction: (qA + qB) / 2,
    radialComponent,
    tangentialComponent,
    chord: Math.hypot(radialComponent, tangentialComponent)
  };
}

export function unitDiskChord(
  first, second, radialWarp = DEFAULT_RADIAL_WARP, chordGeometry = 'visual-12-circle'
) {
  if (!validAirport(first) || !validAirport(second)) return NaN;
  return diskChordComponents(first, second, radialWarp, chordGeometry).chord;
}

export function flightCalibrationFeatures(
  first, second, radialWarp = DEFAULT_RADIAL_WARP, chordGeometry = 'visual-12-circle'
) {
  if (!validAirport(first) || !validAirport(second)) return null;
  const components = diskChordComponents(first, second, radialWarp, chordGeometry);
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
  const hasStrictObservedOnlyPolicy =
    dataset?.schemaVersion >= 3 &&
    dataset?.measurement?.coverageDenominator === 'full-flight-duration' &&
    dataset?.measurement?.distancePolicy === 'observed-only';
  if (!hasStrictObservedOnlyPolicy) return [];
  return (dataset?.routes || []).flatMap(route => {
    if (route.split !== split || !validAirport(route.airportA) ||
        !validAirport(route.airportB) ||
        unitDiskChord(route.airportA, route.airportB, radialWarp) <= 1e-9) return [];

    // Rebuild each route target from individual observations, rather than
    // trusting a precomputed median that may include low-coverage flights.
    const hasObservationRecords = Array.isArray(route.observations);
    const observations = hasObservationRecords
      ? route.observations.filter(observation =>
          observation?.accepted !== false &&
          Number.isFinite(observation?.observedTrackKm ?? observation?.trackKm) &&
          (observation.observedTrackKm ?? observation.trackKm) > 0 &&
          Number.isFinite(observation.coverage) &&
          observation.coverage >= MIN_ROUTE_TELEMETRY_COVERAGE &&
          Number.isFinite(observation.maxGapMinutes) &&
          observation.maxGapMinutes <= MAX_ROUTE_TELEMETRY_GAP_MINUTES
        )
      : [];

    if (hasObservationRecords && observations.length < 3) return [];
    if (!hasObservationRecords && (
      route.sampleCount < 3 || !Number.isFinite(route.medianTrackKm) ||
      route.medianTrackKm <= 0
    )) return [];

    const trackValues = observations.map(observation =>
      observation.observedTrackKm ?? observation.trackKm
    );
    return [{
      ...route,
      sampleCount: hasObservationRecords ? observations.length : route.sampleCount,
      medianTrackKm: hasObservationRecords ? median(trackValues) : route.medianTrackKm,
      medianTelemetryCoverage: hasObservationRecords
        ? median(observations.map(observation => observation.coverage))
        : route.medianTelemetryCoverage,
      medianMaxGapMinutes: hasObservationRecords
        ? median(observations.map(observation => observation.maxGapMinutes))
        : route.medianMaxGapMinutes
    }];
  });
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

/**
 * Count only route pairs whose individual flight observations meet the
 * telemetry-quality rules used by the fitter. This is also used when a
 * candidate fails before model fitting, so the latest summary never inherits
 * an older run's accepted status.
 */
export function summarizeFlightCalibrationCoverage(dataset) {
  const training = routeObservations(dataset, 'train', DEFAULT_RADIAL_WARP);
  const holdout = routeObservations(dataset, 'holdout', DEFAULT_RADIAL_WARP);
  const southernCount = (routes, latitude) => routes.filter(route =>
    Math.min(route.airportA.lat, route.airportB.lat) <= latitude
  ).length;
  return {
    trainingRouteCount: training.length,
    holdoutRouteCount: holdout.length,
    trainingRoutesSouthOf30S: southernCount(training, -30),
    trainingRoutesSouthOf45S: southernCount(training, -45),
    trainingRoutesSouthOf60S: southernCount(training, -60),
    holdoutRoutesSouthOf30S: southernCount(holdout, -30),
    holdoutRoutesSouthOf45S: southernCount(holdout, -45),
    holdoutRoutesSouthOf60S: southernCount(holdout, -60)
  };
}

function makeTrainingExamples(routes, radialWarp) {
  return routes.map(route => {
    const chord = unitDiskChord(route.airportA, route.airportB, radialWarp);
    const coverage = Number.isFinite(route.medianTelemetryCoverage)
      ? clamp((route.medianTelemetryCoverage - MIN_ROUTE_TELEMETRY_COVERAGE) /
          (1 - MIN_ROUTE_TELEMETRY_COVERAGE), 0.15, 1)
      : 1;
    const gap = Number.isFinite(route.medianMaxGapMinutes)
      ? clamp(1 / (1 + Math.max(0, route.medianMaxGapMinutes - 15) / 180), 0.2, 1)
      : 1;
    const sampleSupport = Number.isFinite(route.sampleCount)
      ? clamp(Math.sqrt(route.sampleCount / 8), 0.5, 1)
      : 1;
    return {
      routeId: route.routeId,
      features: flightCalibrationFeatures(route.airportA, route.airportB, radialWarp),
      mileagePerUnitChord: route.medianTrackKm / chord,
      medianTrackKm: route.medianTrackKm,
      sampleCount: route.sampleCount,
      medianTelemetryCoverage: route.medianTelemetryCoverage ?? null,
      medianMaxGapMinutes: route.medianMaxGapMinutes ?? null,
      qualityWeight: coverage * gap * sampleSupport
    };
  });
}

function radialScale(examples) {
  const ordered = examples.map(example => ({
    ratio: example.mileagePerUnitChord,
    weight: Number.isFinite(example.qualityWeight)
      ? Math.max(0.1, example.qualityWeight)
      : 1
  })).sort((a, b) => a.ratio - b.ratio);
  const totalWeight = ordered.reduce((sum, item) => sum + item.weight, 0);
  let cumulativeWeight = 0;
  for (const item of ordered) {
    cumulativeWeight += item.weight;
    if (cumulativeWeight >= totalWeight / 2) return item.ratio;
  }
  return median(ordered.map(item => item.ratio));
}

function modelFromExamples(examples, sourceDatasetVersion, radialWarp) {
  const stats = featureStatistics(examples);
  return {
    schemaVersion: 6,
    sourceDatasetVersion,
    chordGeometry: 'visual-12-circle',
    radialWarp: { ...radialWarp },
    target: 'median directly observed ADS-B flown mileage calibrated against the displayed 12-circle flat-disk chord',
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
      qualityWeight: example.qualityWeight,
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

  const weights = neighbors.map(neighbor => {
    const spatialWeight = 1 / Math.max(neighbor.distance, 1e-9) ** model.inverseDistancePower;
    const qualityWeight = Number.isFinite(neighbor.qualityWeight)
      ? clamp(neighbor.qualityWeight, 0.1, 1)
      : 1;
    return spatialWeight * qualityWeight;
  });
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
  const chordGeometry = model.chordGeometry === 'visual-12-circle'
    ? 'visual-12-circle' : 'base';
  const chord = unitDiskChord(first, second, radialWarp, chordGeometry);
  if (!Number.isFinite(chord)) return null;
  const features = flightCalibrationFeatures(first, second, radialWarp, chordGeometry);
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
  const chordGeometry = model.chordGeometry === 'visual-12-circle'
    ? 'visual-12-circle' : 'base';
  const chord = unitDiskChord(route.airportA, route.airportB, radialWarp, chordGeometry);
  const features = flightCalibrationFeatures(
    route.airportA, route.airportB, radialWarp, chordGeometry
  );
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

/**
 * Error of the actual primary map measurement: its displayed 12-circle chord
 * multiplied only by the map's one radial scale. This excludes the local
 * route-neighbour correction used for the secondary flight-mileage estimate.
 */
function visualProjectionError(route, radialScaleKm, radialWarp) {
  const chord = unitDiskChord(
    route.airportA, route.airportB, radialWarp, 'visual-12-circle'
  );
  if (!Number.isFinite(chord) || !Number.isFinite(radialScaleKm) ||
      !(radialScaleKm > 0) || !(route.medianTrackKm > 0)) return NaN;
  return (chord * radialScaleKm / route.medianTrackKm - 1) * 100;
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
  const spatialCoverage = summarizeFlightCalibrationCoverage(dataset);
  const leaveOneOutErrors = training.map(route => {
    const subset = examples.filter(example => example.routeId !== route.routeId);
    const looModel = modelFromExamples(subset, dataset.schemaVersion, radialWarp);
    return routeError(route, looModel);
  });

  // The independent training score is leave-one-route-out; an in-sample nearest
  // neighbour score would be trivially zero and would misrepresent generalization.
  const trainingMetrics = summarizeErrors(training, leaveOneOutErrors);
  const holdoutMetrics = summarizeErrors(holdout, holdoutErrors);

  // Independent route-level validation for the primary displayed map chord.
  // LOO folds refit only the one global radial scale on the remaining routes.
  const visualProjectionTrainingErrors = training.map(route => {
    const subset = examples.filter(example => example.routeId !== route.routeId);
    const looModel = modelFromExamples(subset, dataset.schemaVersion, radialWarp);
    return visualProjectionError(route, looModel.radialScaleKm, radialWarp);
  });
  const visualProjectionHoldoutErrors = holdout.map(route =>
    visualProjectionError(route, model.radialScaleKm, radialWarp)
  );
  const visualProjection = {
    training: summarizeErrors(training, visualProjectionTrainingErrors),
    holdout: summarizeErrors(holdout, visualProjectionHoldoutErrors)
  };

  return {
    model,
    metrics: {
      training: trainingMetrics,
      holdout: holdoutMetrics,
      leaveOneOut: trainingMetrics,
      visualProjection,
      spatialCoverage
    }
  };
}
