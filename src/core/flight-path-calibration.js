/**
 * Calibrate the visible flat-disk geometry against actual ADS-B trajectory paths.
 *
 * The measured target remains the independent ground-speed × elapsed-time
 * integral. Timestamped path coordinates are projected into the map plane and
 * their planar polyline length is compared with that observed target. No
 * coordinate-derived Earth distance, sphere, ellipsoid, or geodesic is used.
 */
import {
  DEFAULT_RADIAL_WARP,
  radialFractionFromUnitColatitude
} from './radial-warp.js';
import {
  ACTIVE_RADIAL_DISTANCE_PROFILE,
  integratedRadialDistanceMultiplier
} from './visual-radial-calibration.js';
import {
  ACTIVE_VISUAL_LONGITUDE_WARP,
  warpLongitudeRadians,
  minimumLongitudeWarpStretch
} from './visual-longitude-calibration.js';

export const FLIGHT_PATH_CALIBRATION_FILTERS = Object.freeze({
  minimumFlightsPerRoute: 3,
  minimumPathCoverage: 0.98,
  maximumPathGapSeconds: 900,
  minimumTrainingRoutes: 20,
  minimumHoldoutRoutes: 6,
  minimumSouthernTrainingRoutes: 4,
  minimumSouthernHoldoutRoutes: 2,
  // Deep-southern coverage is recorded as an extrapolation warning. The
  // fitted angular warp is fixed at the circular rim and cannot fold the disk.
  minimumTrainingRoutesSouthOf45S: 0,
  minimumHoldoutRoutesSouthOf45S: 0,
  minimumTrainingRoutesSouthOf60S: 0,
  minimumHoldoutRoutesSouthOf60S: 0,
  maxTrainingMapePercent: 10,
  maxHoldoutMapePercent: 12,
  maxHoldoutRouteErrorPercent: 20,
  maxLeaveOneOutMapePercent: 15,
  maxLeaveOneOutRouteErrorPercent: 45
});

export const FLIGHT_PATH_PROFILE = ACTIVE_RADIAL_DISTANCE_PROFILE;

const DEG = Math.PI / 180;
const median = values => {
  if (!values.length) return NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
};
const absolutePercentError = (predicted, observed) =>
  Math.abs(predicted / observed - 1) * 100;

function validCoordinate(coordinate) {
  return Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(Number(coordinate[0])) &&
    Number.isFinite(Number(coordinate[1])) &&
    Number(coordinate[0]) >= -180 &&
    Number(coordinate[0]) <= 180 &&
    Number(coordinate[1]) >= -90 &&
    Number(coordinate[1]) <= 90;
}

/**
 * Extract the API's GeoJSON MultiLineString coordinates and matching timestamp
 * sequences. Sequence boundaries are retained so separate trajectory legs
 * are never joined by an invented connector.
 */
export function normalizeFlightTrack(path, timestamps) {
  if (path?.type !== 'MultiLineString' ||
      !Array.isArray(path.coordinates) ||
      !Array.isArray(timestamps) ||
      path.coordinates.length !== timestamps.length) return null;

  const trackCoordinates = [];
  const trackTimestamps = [];
  let trackPointCount = 0;

  for (let index = 0; index < path.coordinates.length; index++) {
    const coordinates = path.coordinates[index];
    const times = timestamps[index];
    if (!Array.isArray(coordinates) || !Array.isArray(times) ||
        coordinates.length !== times.length) return null;

    const validCoordinates = [];
    const validTimes = [];
    for (let pointIndex = 0; pointIndex < coordinates.length; pointIndex++) {
      const coordinate = coordinates[pointIndex];
      const timestamp = Number(times[pointIndex]);
      if (!validCoordinate(coordinate) || !Number.isFinite(timestamp)) return null;
      if (validTimes.length && timestamp <= validTimes.at(-1)) return null;

      const altitude = coordinate.length >= 3 && Number.isFinite(Number(coordinate[2]))
        ? Number(coordinate[2]) : null;
      validCoordinates.push([
        Number(coordinate[0]),
        Number(coordinate[1]),
        altitude
      ]);
      validTimes.push(timestamp);
    }

    trackCoordinates.push(validCoordinates);
    trackTimestamps.push(validTimes);
    trackPointCount += validCoordinates.length;
  }

  if (trackPointCount < 2) return null;
  return { trackCoordinates, trackTimestamps, trackPointCount };
}

function pointInUnitDisk(
  coordinate,
  radialWarp,
  radialProfile = FLIGHT_PATH_PROFILE,
  longitudeWarp = ACTIVE_VISUAL_LONGITUDE_WARP
) {
  if (!validCoordinate(coordinate)) return null;
  const sourceLongitude = Number(coordinate[0]) * DEG;
  const latitude = Number(coordinate[1]);
  const normalizedColatitude = (90 - latitude) / 180;
  const q = radialFractionFromUnitColatitude(normalizedColatitude, radialWarp);
  if (!Number.isFinite(q)) return null;

  const integratedFraction = integratedRadialDistanceMultiplier(
    q, radialProfile || FLIGHT_PATH_PROFILE
  );
  const displayedLongitude = warpLongitudeRadians(sourceLongitude, q, longitudeWarp);
  const radius = Math.PI * integratedFraction;
  return [radius * Math.cos(displayedLongitude), -radius * Math.sin(displayedLongitude)];
}

/**
 * Length of the observed trajectory after projection into a unit-scale copy
 * of the current 12-circle flat disk. Multiply by R_base (km) for map-plane km.
 */
export function unitProjectedFlightPathLength(
  trackCoordinates,
  radialWarp = DEFAULT_RADIAL_WARP,
  radialProfile = FLIGHT_PATH_PROFILE,
  longitudeWarp = ACTIVE_VISUAL_LONGITUDE_WARP
) {
  if (!Array.isArray(trackCoordinates)) return NaN;
  let total = 0;
  let validSegments = 0;

  for (const sequence of trackCoordinates) {
    if (!Array.isArray(sequence) || sequence.length < 2) continue;
    let previous = null;
    for (const coordinate of sequence) {
      const current = pointInUnitDisk(coordinate, radialWarp, radialProfile, longitudeWarp);
      if (!current) {
        previous = null;
        continue;
      }
      if (previous) {
        total += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
        validSegments++;
      }
      previous = current;
    }
  }
  return validSegments && Number.isFinite(total) && total > 0 ? total : NaN;
}

function validObservedFlight(observation) {
  return observation?.accepted === true &&
    Number.isFinite(observation?.observedTrackKm ?? observation?.trackKm) &&
    (observation.observedTrackKm ?? observation.trackKm) > 0 &&
    Number.isFinite(observation.coverage) && observation.coverage >= 0.98 &&
    Number.isFinite(observation.maxGapMinutes) && observation.maxGapMinutes <= 15 &&
    Array.isArray(observation.trackCoordinates) &&
    Array.isArray(observation.trackTimestamps);
}

function pathTimestampQuality(trackTimestamps, startTs, endTs) {
  const flightStart = Date.parse(startTs) / 1000;
  const flightEnd = Date.parse(endTs) / 1000;
  const duration = flightEnd - flightStart;
  if (!Number.isFinite(flightStart) || !Number.isFinite(flightEnd) || duration <= 0) return null;

  const sequences = trackTimestamps
    .filter(sequence => Array.isArray(sequence) && sequence.length >= 2)
    .map(sequence => ({ start: sequence[0], end: sequence.at(-1), times: sequence }))
    .sort((first, second) => first.start - second.start);
  if (!sequences.length ||
      sequences.some(sequence =>
        sequence.start < flightStart || sequence.end > flightEnd
      )) return null;

  let previousEnd = flightStart;
  let coveredSeconds = 0;
  let maximumGapSeconds = 0;
  for (const sequence of sequences) {
    const boundaryGap = sequence.start - previousEnd;
    if (boundaryGap < 0) return null;
    maximumGapSeconds = Math.max(maximumGapSeconds, boundaryGap);
    coveredSeconds += sequence.end - sequence.start;
    for (let index = 1; index < sequence.times.length; index++) {
      maximumGapSeconds = Math.max(
        maximumGapSeconds,
        sequence.times[index] - sequence.times[index - 1]
      );
    }
    previousEnd = sequence.end;
  }
  maximumGapSeconds = Math.max(maximumGapSeconds, flightEnd - previousEnd);
  const coverage = coveredSeconds / duration;
  if (coverage < FLIGHT_PATH_CALIBRATION_FILTERS.minimumPathCoverage ||
      maximumGapSeconds > FLIGHT_PATH_CALIBRATION_FILTERS.maximumPathGapSeconds) return null;
  return { pathCoverage: coverage, pathMaxGapSeconds: maximumGapSeconds };
}

function routeFlightRecords(dataset) {
  return (dataset?.routes || []).map(route => {
    const flights = (route.observations || []).filter(validObservedFlight).flatMap(observation => {
      const normalized = normalizeFlightTrack(
        { type: 'MultiLineString', coordinates: observation.trackCoordinates },
        observation.trackTimestamps
      );
      if (!normalized) return [];
      const quality = pathTimestampQuality(
        normalized.trackTimestamps, observation.startTs, observation.endTs
      );
      return quality ? [{ ...observation, ...normalized, ...quality }] : [];
    });
    return { route, flights };
  });
}

export function summarizeFlightPathCoverage(dataset) {
  const routes = routeFlightRecords(dataset).filter(({ route, flights }) =>
    flights.length >= FLIGHT_PATH_CALIBRATION_FILTERS.minimumFlightsPerRoute &&
    Number.isFinite(route.airportA?.lat) && Number.isFinite(route.airportB?.lat)
  );
  const training = routes.filter(item => item.route.split === 'train');
  const holdout = routes.filter(item => item.route.split === 'holdout');
  const southernCount = (items, latitude) => items.filter(({ route }) =>
    Math.min(route.airportA.lat, route.airportB.lat) <= latitude
  ).length;
  return {
    trainingRouteCount: training.length,
    holdoutRouteCount: holdout.length,
    trainingRoutesSouthOf30S: southernCount(training, -30),
    holdoutRoutesSouthOf30S: southernCount(holdout, -30),
    trainingRoutesSouthOf45S: southernCount(training, -45),
    holdoutRoutesSouthOf45S: southernCount(holdout, -45),
    trainingRoutesSouthOf60S: southernCount(training, -60),
    holdoutRoutesSouthOf60S: southernCount(holdout, -60),
    trainingFlightsWithPaths: training.reduce((sum, item) => sum + item.flights.length, 0),
    holdoutFlightsWithPaths: holdout.reduce((sum, item) => sum + item.flights.length, 0),
    totalTrajectoryPoints: routes.reduce((sum, item) =>
      sum + item.flights.reduce((flightSum, flight) =>
        flightSum + (flight.trackPointCount || flight.trackCoordinates
          .reduce((n, sequence) => n + sequence.length, 0)), 0), 0)
  };
}

function summarizeProjectedRouteCoverage(training, holdout) {
  const southernCount = (examples, latitude) => examples.filter(example =>
    Math.min(example.airportA?.lat, example.airportB?.lat) <= latitude
  ).length;
  return {
    trainingRouteCount: training.length,
    holdoutRouteCount: holdout.length,
    trainingRoutesSouthOf30S: southernCount(training, -30),
    holdoutRoutesSouthOf30S: southernCount(holdout, -30),
    trainingRoutesSouthOf45S: southernCount(training, -45),
    holdoutRoutesSouthOf45S: southernCount(holdout, -45),
    trainingRoutesSouthOf60S: southernCount(training, -60),
    holdoutRoutesSouthOf60S: southernCount(holdout, -60)
  };
}

function hasMinimumProjectedCoverage(coverage, limits) {
  return coverage.trainingRouteCount >= limits.minimumTrainingRoutes &&
    coverage.holdoutRouteCount >= limits.minimumHoldoutRoutes &&
    coverage.trainingRoutesSouthOf30S >= limits.minimumSouthernTrainingRoutes &&
    coverage.holdoutRoutesSouthOf30S >= limits.minimumSouthernHoldoutRoutes;
}

export function summarizeUsableProjectedPathCoverage(
  dataset,
  radialWarp = DEFAULT_RADIAL_WARP,
  radialProfile = FLIGHT_PATH_PROFILE,
  longitudeWarp = ACTIVE_VISUAL_LONGITUDE_WARP
) {
  const records = routeFlightRecords(dataset).filter(({ route, flights }) =>
    flights.length >= FLIGHT_PATH_CALIBRATION_FILTERS.minimumFlightsPerRoute &&
    Number.isFinite(route.airportA?.lat) &&
    Number.isFinite(route.airportB?.lat)
  );
  const training = records.filter(item => item.route.split === 'train');
  const holdout = records.filter(item => item.route.split === 'holdout');
  return summarizeProjectedRouteCoverage(
    makeRouteExamplesFromRecords(training, radialWarp, radialProfile, longitudeWarp),
    makeRouteExamplesFromRecords(holdout, radialWarp, radialProfile, longitudeWarp)
  );
}

function summarizeErrors(examples, radialScaleKm) {
  const errors = examples.map(example => absolutePercentError(
    radialScaleKm,
    example.requiredRadialScaleKm
  ));
  return {
    routeCount: errors.length,
    meanAbsolutePercent: errors.length
      ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
    rmsPercent: errors.length
      ? Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length)
      : null,
    maxAbsolutePercent: errors.length ? Math.max(...errors) : null,
    errors: examples.map((example, index) => ({
      routeId: example.routeId,
      sampleCount: example.sampleCount,
      requiredRadialScaleKm: example.requiredRadialScaleKm,
      fittedRadialScaleKm: radialScaleKm,
      absolutePercent: errors[index]
    }))
  };
}

/** Build route-level observed-mileage/projected-path ratios for one candidate geometry. */
function makeRouteExamplesFromRecords(
  records,
  radialWarp,
  radialProfile = FLIGHT_PATH_PROFILE,
  longitudeWarp = ACTIVE_VISUAL_LONGITUDE_WARP
) {
  return records.flatMap(({ route, flights }) => {
    const measured = [];
    const projected = [];
    const pairedScaleRatios = [];
    for (const flight of flights) {
      const measuredKm = flight.observedTrackKm ?? flight.trackKm;
      const unitPathLength = unitProjectedFlightPathLength(
        flight.trackCoordinates,
        radialWarp,
        radialProfile,
        longitudeWarp
      );
      if (Number.isFinite(unitPathLength) && unitPathLength > 0) {
        measured.push(measuredKm);
        projected.push(unitPathLength);
        pairedScaleRatios.push(measuredKm / unitPathLength);
      }
    }
    if (pairedScaleRatios.length < FLIGHT_PATH_CALIBRATION_FILTERS.minimumFlightsPerRoute) {
      return [];
    }
    return [{
      routeId: route.routeId,
      split: route.split,
      airportA: route.airportA,
      airportB: route.airportB,
      sampleCount: pairedScaleRatios.length,
      medianObservedTrackKm: median(measured),
      medianUnitPathLength: median(projected),
      requiredRadialScaleKm: median(pairedScaleRatios)
    }];
  });
}

const GEOMETRY_START = Object.freeze([1, 1, 0, 0, 0, 0]);
const GEOMETRY_STEPS = Object.freeze([0.1, 0.1, 0.1, 0.1, 0.06, 0.06]);
const GEOMETRY_BOUNDS = Object.freeze([
  [0.65, 1.55], [0.7, 1.3],
  [-0.35, 0.35], [-0.35, 0.35],
  [-0.18, 0.18], [-0.18, 0.18]
]);
const LONGITUDE_WARP_REGULARIZATION = 3;
const MINIMUM_ANGULAR_STRETCH = 0.35;

function geometryFromVector(vector) {
  return {
    radialWarp: { ...DEFAULT_RADIAL_WARP, exponent: vector[0] },
    radialProfile: { ...FLIGHT_PATH_PROFILE, exponent: vector[1] },
    longitudeWarp: {
      kind: 'anchored-fourier',
      firstSine: vector[2],
      firstCosine: vector[3],
      secondSine: vector[4],
      secondCosine: vector[5]
    }
  };
}

function geometryVectorObjective(vector, records) {
  const geometry = geometryFromVector(vector);
  const angularStretch = minimumLongitudeWarpStretch(geometry.longitudeWarp);
  if (!(angularStretch >= MINIMUM_ANGULAR_STRETCH)) return null;

  const examples = makeRouteExamplesFromRecords(
    records,
    geometry.radialWarp,
    geometry.radialProfile,
    geometry.longitudeWarp
  );
  if (examples.length < 2) return null;

  const errors = examples.map((example, index) => {
    const comparisonRatios = examples
      .filter((_, otherIndex) => otherIndex !== index)
      .map(item => item.requiredRadialScaleKm);
    return absolutePercentError(
      median(comparisonRatios),
      example.requiredRadialScaleKm
    );
  }).filter(Number.isFinite);
  if (errors.length !== examples.length) return null;

  const leaveOneOutMape = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const longitudePenalty = LONGITUDE_WARP_REGULARIZATION * (
    vector[2] ** 2 + vector[3] ** 2 +
    3 * vector[4] ** 2 + 3 * vector[5] ** 2
  );
  return {
    objective: leaveOneOutMape + longitudePenalty,
    leaveOneOutMape,
    leaveOneOutMax: Math.max(...errors),
    examples,
    geometry,
    angularStretch,
    longitudePenalty
  };
}

/** Deterministic coordinate descent; only the supplied training routes are fitted. */
function optimizeGeometry(records, maximumRounds = 22) {
  let vector = [...GEOMETRY_START];
  let best = geometryVectorObjective(vector, records);
  if (!best) return null;
  let steps = [...GEOMETRY_STEPS];
  let evaluations = 1;

  for (let round = 0; round < maximumRounds; round++) {
    let changed = false;
    for (let dimension = 0; dimension < vector.length; dimension++) {
      let selectedVector = vector;
      let selected = best;
      for (const direction of [-1, 1]) {
        const candidate = [...vector];
        const [minimum, maximum] = GEOMETRY_BOUNDS[dimension];
        candidate[dimension] = Math.max(
          minimum,
          Math.min(maximum, candidate[dimension] + direction * steps[dimension])
        );
        const evaluated = geometryVectorObjective(candidate, records);
        evaluations++;
        if (evaluated && evaluated.objective < selected.objective - 1e-9) {
          selectedVector = candidate;
          selected = evaluated;
        }
      }
      if (selectedVector !== vector) {
        vector = selectedVector;
        best = selected;
        changed = true;
      }
    }
    if (!changed) steps = steps.map(step => step * 0.5);
  }

  const radialScaleKm = median(best.examples.map(item => item.requiredRadialScaleKm));
  if (!(Number.isFinite(radialScaleKm) && radialScaleKm > 0)) return null;
  return { ...best, vector, radialScaleKm, evaluations };
}

function summarizeNestedLeaveOneRouteOut(trainingRecords) {
  const errors = [];
  for (const heldOut of trainingRecords) {
    const foldTraining = trainingRecords.filter(item =>
      item.route.routeId !== heldOut.route.routeId
    );
    // Refit the complete geometry for every fold; the evaluated airport pair
    // is excluded from all radial, angular and scale parameter selection.
    const fitted = optimizeGeometry(foldTraining, 10);
    if (!fitted) continue;
    const heldOutExample = makeRouteExamplesFromRecords(
      [heldOut],
      fitted.geometry.radialWarp,
      fitted.geometry.radialProfile,
      fitted.geometry.longitudeWarp
    )[0];
    if (!heldOutExample) continue;
    errors.push({
      routeId: heldOut.route.routeId,
      absolutePercent: absolutePercentError(
        fitted.radialScaleKm,
        heldOutExample.requiredRadialScaleKm
      )
    });
  }
  const values = errors.map(item => item.absolutePercent);
  return {
    routeCount: values.length,
    meanAbsolutePercent: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    maxAbsolutePercent: values.length ? Math.max(...values) : null,
    errors
  };
}

export function fitFlightPathCalibration(dataset) {
  if (dataset?.schemaVersion < 4 ||
      dataset?.measurement?.coverageDenominator !== 'full-flight-duration' ||
      dataset?.measurement?.distancePolicy !== 'observed-only') {
    throw new Error('Flight-path calibration requires schema-4 observed-only telemetry with stored trajectories.');
  }

  const coverage = summarizeFlightPathCoverage(dataset);
  const limits = FLIGHT_PATH_CALIBRATION_FILTERS;
  if (coverage.trainingRouteCount < limits.minimumTrainingRoutes ||
      coverage.holdoutRouteCount < limits.minimumHoldoutRoutes ||
      coverage.trainingRoutesSouthOf30S < limits.minimumSouthernTrainingRoutes ||
      coverage.holdoutRoutesSouthOf30S < limits.minimumSouthernHoldoutRoutes) {
    throw new Error('Insufficient independent ADS-B flight-path coverage for production calibration.');
  }

  const records = routeFlightRecords(dataset).filter(({ route, flights }) =>
    flights.length >= limits.minimumFlightsPerRoute &&
    Number.isFinite(route.airportA?.lat) && Number.isFinite(route.airportB?.lat)
  );
  const trainingRecords = records.filter(item => item.route.split === 'train');
  const holdoutRecords = records.filter(item => item.route.split === 'holdout');
  if (trainingRecords.length < limits.minimumTrainingRoutes ||
      holdoutRecords.length < limits.minimumHoldoutRoutes) {
    throw new Error('Insufficient fully qualified airport-pair trajectory coverage.');
  }

  const fitted = optimizeGeometry(trainingRecords, 22);
  if (!fitted) throw new Error('No valid non-folding flat-disk geometry could be fitted.');

  const trainingExamples = fitted.examples;
  const radialScaleKm = fitted.radialScaleKm;
  const trainingMetrics = summarizeErrors(trainingExamples, radialScaleKm);
  const holdoutExamples = makeRouteExamplesFromRecords(
    holdoutRecords,
    fitted.geometry.radialWarp,
    fitted.geometry.radialProfile,
    fitted.geometry.longitudeWarp
  );
  const holdoutMetrics = summarizeErrors(holdoutExamples, radialScaleKm);
  const leaveOneOut = summarizeNestedLeaveOneRouteOut(trainingRecords);
  const usableProjectedPathCoverage = summarizeProjectedRouteCoverage(
    trainingExamples,
    holdoutExamples
  );

  if (!hasMinimumProjectedCoverage(usableProjectedPathCoverage, limits)) {
    throw new Error('Insufficient usable projected-path airport-pair coverage after fitting.');
  }

  const model = {
    schemaVersion: 3,
    sourceDatasetVersion: dataset.schemaVersion,
    target: 'Observed ADS-B ground-speed/time mileage compared with projected timestamped paths of the same flights',
    radialScaleKm,
    radialWarp: fitted.geometry.radialWarp,
    radialProfile: fitted.geometry.radialProfile,
    longitudeWarp: fitted.geometry.longitudeWarp,
    geometry: 'shared radial profile plus latitude-dependent periodic longitude shear; shear is identity at the North Pole and Ice Wall',
    trainingRouteCount: trainingExamples.length,
    holdoutRouteCount: holdoutExamples.length
  };

  return {
    model,
    metrics: {
      training: trainingMetrics,
      holdout: holdoutMetrics,
      leaveOneOut,
      spatialCoverage: coverage,
      usableProjectedPathCoverage,
      selectedGeometryObjective: fitted.objective,
      selectedProfileExponent: fitted.geometry.radialProfile.exponent,
      jointGeometryParameterCount: fitted.vector.length,
      geometryCandidatesEvaluated: fitted.evaluations,
      nestedGeometryFolds: leaveOneOut.routeCount,
      minimumAngularStretch: fitted.angularStretch,
      longitudeWarpPenalty: fitted.longitudePenalty
    }
  };
}
