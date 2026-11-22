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

export const FLIGHT_PATH_CALIBRATION_FILTERS = Object.freeze({
  minimumFlightsPerRoute: 3,
  minimumPathCoverage: 0.98,
  maximumPathGapSeconds: 900,
  minimumTrainingRoutes: 20,
  minimumHoldoutRoutes: 6,
  minimumSouthernTrainingRoutes: 4,
  minimumSouthernHoldoutRoutes: 2,
  minimumTrainingRoutesSouthOf45S: 2,
  minimumHoldoutRoutesSouthOf45S: 1,
  minimumTrainingRoutesSouthOf60S: 1,
  minimumHoldoutRoutesSouthOf60S: 1,
  maxTrainingMapePercent: 10,
  maxHoldoutMapePercent: 12,
  maxHoldoutRouteErrorPercent: 20,
  maxLeaveOneOutMapePercent: 15,
  maxLeaveOneOutRouteErrorPercent: 45
});

export const FLIGHT_PATH_PROFILE = ACTIVE_RADIAL_DISTANCE_PROFILE;

const DEG = Math.PI / 180;
const MIN_EXPONENT = 0.65;
const MAX_EXPONENT = 1.35;
const EXPONENT_STEP = 0.025;
export const FLIGHT_PATH_PROFILE_EXPONENT_CANDIDATES = Object.freeze(
  [...new Set([0.7, 0.85, FLIGHT_PATH_PROFILE.exponent, 1.15, 1.3])]
    .sort((first, second) => first - second)
);
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

function pointInUnitDisk(coordinate, radialWarp, radialProfile = FLIGHT_PATH_PROFILE) {
  if (!validCoordinate(coordinate)) return null;
  const longitude = Number(coordinate[0]) * DEG;
  const latitude = Number(coordinate[1]);
  const normalizedColatitude = (90 - latitude) / 180;
  const q = radialFractionFromUnitColatitude(normalizedColatitude, radialWarp);
  if (!Number.isFinite(q)) return null;

  const integratedFraction = integratedRadialDistanceMultiplier(
    q, radialProfile || FLIGHT_PATH_PROFILE
  );
  const radius = Math.PI * integratedFraction;
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

/**
 * Length of the observed trajectory after projection into a unit-scale copy
 * of the current 12-circle flat disk. Multiply by R_base (km) for map-plane km.
 */
export function unitProjectedFlightPathLength(
  trackCoordinates,
  radialWarp = DEFAULT_RADIAL_WARP,
  radialProfile = FLIGHT_PATH_PROFILE
) {
  if (!Array.isArray(trackCoordinates)) return NaN;
  let total = 0;
  let validSegments = 0;

  for (const sequence of trackCoordinates) {
    if (!Array.isArray(sequence) || sequence.length < 2) continue;
    let previous = null;
    for (const coordinate of sequence) {
      const current = pointInUnitDisk(coordinate, radialWarp, radialProfile);
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
  radialProfile = FLIGHT_PATH_PROFILE
) {
  const records = routeFlightRecords(dataset).filter(({ route, flights }) =>
    flights.length >= FLIGHT_PATH_CALIBRATION_FILTERS.minimumFlightsPerRoute &&
    Number.isFinite(route.airportA?.lat) &&
    Number.isFinite(route.airportB?.lat)
  );
  const training = records.filter(item => item.route.split === 'train');
  const holdout = records.filter(item => item.route.split === 'holdout');
  return summarizeProjectedRouteCoverage(
    makeRouteExamplesFromRecords(training, radialWarp, radialProfile),
    makeRouteExamplesFromRecords(holdout, radialWarp, radialProfile)
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

function exponentCandidates() {
  const values = [];
  for (let exponent = MIN_EXPONENT; exponent <= MAX_EXPONENT + 1e-9;
       exponent += EXPONENT_STEP) {
    values.push(Number(exponent.toFixed(3)));
  }
  return values;
}

function profileExponentCandidates() {
  return FLIGHT_PATH_PROFILE_EXPONENT_CANDIDATES;
}

/** Build airport-pair ratios for one candidate projection shape. */
function makeRouteExamplesFromRecords(
  records,
  radialWarp,
  radialProfile = FLIGHT_PATH_PROFILE
) {
  return records.flatMap(({ route, flights }) => {
    const measured = [];
    const projected = [];
    const pairedScaleRatios = [];
    for (const flight of flights) {
      const measuredKm = flight.observedTrackKm ?? flight.trackKm;
      const unitPathLength = unitProjectedFlightPathLength(
        flight.trackCoordinates, radialWarp, radialProfile
      );
      if (Number.isFinite(unitPathLength) && unitPathLength > 0) {
        measured.push(measuredKm);
        projected.push(unitPathLength);
        pairedScaleRatios.push(measuredKm / unitPathLength);
      }
    }
    if (pairedScaleRatios.length < FLIGHT_PATH_CALIBRATION_FILTERS.minimumFlightsPerRoute) return [];
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

/** Fit the scale of an already projected route set; no path is projected here. */
function fitTrainingExamples(examples) {
  if (!Array.isArray(examples) || examples.length < 2) return null;
  const radialScaleKm = median(examples.map(item => item.requiredRadialScaleKm));
  if (!(Number.isFinite(radialScaleKm) && radialScaleKm > 0)) return null;
  const training = summarizeErrors(examples, radialScaleKm);
  const innerErrors = examples.map(example => {
    const otherRatios = examples
      .filter(item => item.routeId !== example.routeId)
      .map(item => item.requiredRadialScaleKm);
    return otherRatios.length
      ? absolutePercentError(median(otherRatios), example.requiredRadialScaleKm)
      : NaN;
  }).filter(Number.isFinite);
  const innerLeaveOneOut = {
    routeCount: innerErrors.length,
    meanAbsolutePercent: innerErrors.length
      ? innerErrors.reduce((sum, value) => sum + value, 0) / innerErrors.length
      : null,
    maxAbsolutePercent: innerErrors.length ? Math.max(...innerErrors) : null
  };
  if (!Number.isFinite(innerLeaveOneOut.meanAbsolutePercent)) return null;
  return {
    radialScaleKm,
    training,
    innerLeaveOneOut,
    objective: training.meanAbsolutePercent + innerLeaveOneOut.meanAbsolutePercent
  };
}

/**
 * Project each route once for each candidate shape. The nested leave-one-route-
 * out selector then reuses those route ratios, rather than reprojecting every
 * track thousands of times inside every validation fold.
 */
function buildGeometryCandidates(training, holdout) {
  const candidates = [];
  for (const exponent of exponentCandidates()) {
    const radialWarp = { ...DEFAULT_RADIAL_WARP, exponent };
    for (const profileExponent of profileExponentCandidates()) {
      const radialProfile = {
        ...FLIGHT_PATH_PROFILE,
        exponent: profileExponent
      };
      const trainingExamples = makeRouteExamplesFromRecords(
        training, radialWarp, radialProfile
      );
      const holdoutExamples = makeRouteExamplesFromRecords(
        holdout, radialWarp, radialProfile
      );
      const fitted = fitTrainingExamples(trainingExamples);
      if (!fitted || !holdoutExamples.length) continue;
      candidates.push({
        radialWarp,
        radialProfile,
        trainingExamples,
        holdoutExamples,
        ...fitted
      });
    }
  }
  return candidates;
}

function nestedLeaveOneRouteOut(candidates, trainingRecords) {
  const errors = [];
  for (const heldOutRoute of trainingRecords) {
    const routeId = heldOutRoute.route.routeId;
    const nestedFits = candidates.flatMap(candidate => {
      const heldOutExample = candidate.trainingExamples.find(
        example => example.routeId === routeId
      );
      if (!heldOutExample) return [];
      const reduced = candidate.trainingExamples.filter(
        example => example.routeId !== routeId
      );
      const fitted = fitTrainingExamples(reduced);
      return fitted ? [{ candidate, heldOutExample, ...fitted }] : [];
    });
    nestedFits.sort((first, second) =>
      first.objective - second.objective ||
      Math.abs(first.candidate.radialProfile.exponent - 1) -
        Math.abs(second.candidate.radialProfile.exponent - 1)
    );
    const best = nestedFits[0];
    if (best) {
      errors.push(absolutePercentError(
        best.radialScaleKm,
        best.heldOutExample.requiredRadialScaleKm
      ));
    }
  }
  return {
    routeCount: errors.length,
    meanAbsolutePercent: errors.length
      ? errors.reduce((sum, value) => sum + value, 0) / errors.length
      : null,
    maxAbsolutePercent: errors.length ? Math.max(...errors) : null,
    errors
  };
}

function evaluateGeometryCandidates(candidates, trainingRecords) {
  const leaveOneOut = nestedLeaveOneRouteOut(candidates, trainingRecords);
  return candidates.map(candidate => {
    const holdout = summarizeErrors(
      candidate.holdoutExamples, candidate.radialScaleKm
    );
    return {
      ...candidate,
      holdout,
      leaveOneOut,
      objective: Number.isFinite(candidate.training.meanAbsolutePercent) &&
        Number.isFinite(leaveOneOut.meanAbsolutePercent)
        ? candidate.training.meanAbsolutePercent + leaveOneOut.meanAbsolutePercent
        : Infinity
    };
  }).filter(candidate => Number.isFinite(candidate.objective));
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
  const training = records.filter(item => item.route.split === 'train');
  const holdout = records.filter(item => item.route.split === 'holdout');
  const initialProjectedCoverage = summarizeProjectedRouteCoverage(
    makeRouteExamplesFromRecords(training, DEFAULT_RADIAL_WARP),
    makeRouteExamplesFromRecords(holdout, DEFAULT_RADIAL_WARP)
  );
  if (!hasMinimumProjectedCoverage(initialProjectedCoverage, limits)) {
    throw new Error(
      'Insufficient usable projected-path airport-pair coverage after projection; ' +
      'the minimum route counts and southern coverage gates must still be met.'
    );
  }
  const projectedCandidates = buildGeometryCandidates(training, holdout);
  const candidates = evaluateGeometryCandidates(projectedCandidates, training);
  candidates.sort((first, second) =>
    first.objective - second.objective ||
    Math.abs(first.radialProfile.exponent - FLIGHT_PATH_PROFILE.exponent) -
      Math.abs(second.radialProfile.exponent - FLIGHT_PATH_PROFILE.exponent)
  );
  const best = candidates[0];
  if (!best || !Number.isFinite(best.radialScaleKm) || best.radialScaleKm <= 0) {
    throw new Error('No finite flight-path radial calibration candidate could be fitted.');
  }
  const projectedPathCoverage = summarizeProjectedRouteCoverage(
    best.trainingExamples, best.holdoutExamples
  );
  if (!hasMinimumProjectedCoverage(projectedPathCoverage, limits)) {
    throw new Error(
      'Insufficient usable projected-path airport-pair coverage after projection; ' +
      'the minimum route counts and southern coverage gates must still be met.'
    );
  }

  return {
    model: {
      schemaVersion: 2,
      sourceDatasetVersion: dataset.schemaVersion,
      target: 'Observed ADS-B ground-speed/time mileage compared with the projected polyline of that flight\'s recorded path',
      radialScaleKm: best.radialScaleKm,
      radialWarp: best.radialWarp,
      radialProfile: best.radialProfile,
      geometry: 'sum-of-sequence-segment-lengths-in-the-displayed-flat-disk',
      trainingRouteCount: best.training.routeCount,
      holdoutRouteCount: best.holdout.routeCount
    },
    metrics: {
      spatialCoverage: coverage,
      usableProjectedPathCoverage: projectedPathCoverage,
      training: best.training,
      holdout: best.holdout,
      leaveOneOut: best.leaveOneOut,
      selectedExponentObjective: best.objective,
      selectedProfileExponent: best.radialProfile.exponent,
      exponentCandidatesTested: exponentCandidates().length,
      profileExponentCandidatesTested: profileExponentCandidates().length,
      geometryCandidatesTested: projectedCandidates.length
    }
  };
}
