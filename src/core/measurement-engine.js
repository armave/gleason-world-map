import { clamp, flatDiskDistanceMeters, radialDistanceFromNorthKm, rad, wrapLongitude } from './flat-disk.js';
import { FLIGHT_CALIBRATION } from './flight-calibration-parameters.js';
import { flightCalibrationFeatures, predictFlightScaleRatio } from './flight-calibration-fit.js';

export const RESTRICTED_PARALLEL_LATITUDE = -60;
const RESTRICTED_RADIUS_KM = radialDistanceFromNorthKm(RESTRICTED_PARALLEL_LATITUDE);
const EPSILON_KM = 1e-7;

function validPoint(point) {
  return !!point && Number.isFinite(point.lat) && point.lat >= -90 &&
    point.lat <= 90 && Number.isFinite(point.lon);
}

function projectKm(point) {
  if (!validPoint(point)) return null;
  const radius = radialDistanceFromNorthKm(point.lat);
  const longitude = rad(wrapLongitude(point.lon));
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

/** True when the straight projected connector passes across the 60°S circle. */
export function segmentCrossesRestrictedParallel(first, second) {
  const a = projectKm(first), b = projectKm(second);
  if (!a || !b) return false;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-18
    ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared))
    : 0;
  const closestRadius = Math.hypot(a[0] + t * dx, a[1] + t * dy);
  const radiusA = Math.hypot(...a), radiusB = Math.hypot(...b);
  const furthestEndpointRadius = Math.max(radiusA, radiusB);
  const bothEndpointsOnBoundary =
    Math.abs(radiusA - RESTRICTED_RADIUS_KM) <= EPSILON_KM &&
    Math.abs(radiusB - RESTRICTED_RADIUS_KM) <= EPSILON_KM;
  return closestRadius < RESTRICTED_RADIUS_KM - EPSILON_KM &&
    (furthestEndpointRadius > RESTRICTED_RADIUS_KM + EPSILON_KM ||
      bothEndpointsOnBoundary);
}

/** Check every straight edge of an open chain or closed polygon. */
export function polylineCrossesRestrictedParallel(points, closed = false) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const count = closed && points.length >= 3 ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    if (segmentCrossesRestrictedParallel(points[i], points[(i + 1) % points.length])) return true;
  }
  return false;
}

/**
 * ADS-B flight-mileage correction for a straight segment in the flat disk.
 *
 * The radial scale is fitted from observed ground-speed × timestamp mileage.
 * A local inverse-distance-weighted neighbour model predicts mileage per
 * warped-disk chord from mean radial fraction and radial/tangential shares.
 * Runtime contains no globe-distance formula, ellipsoid, geodesic or path
 * coordinate distance calculation.
 */
export function directLineCalibrationDiagnostics(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;

  const features = flightCalibrationFeatures(first, second, FLIGHT_CALIBRATION.radialWarp);
  const prediction = predictFlightScaleRatio(features, FLIGHT_CALIBRATION);
  if (!prediction) return null;

  const meanRadialFraction = features[0];
  const radialShareOfChord = features[1];
  const tangentialShareOfChord = features[2];
  const radialScaleKm = FLIGHT_CALIBRATION.radialScaleKm;
  const unclampedFactor = prediction.mileagePerUnitChord / radialScaleKm;
  const calibrationFactor = clamp(
    unclampedFactor,
    FLIGHT_CALIBRATION.factorBounds[0],
    FLIGHT_CALIBRATION.factorBounds[1]
  );
  const featureRanges = FLIGHT_CALIBRATION.featureRanges;
  const outsideTrainingRange = features.some((value, index) =>
    value < featureRanges[index][0] || value > featureRanges[index][1]
  );
  const nearSouthRim = first.lat <= -85 || second.lat <= -85;
  const factorWasClamped = calibrationFactor !== unclampedFactor;
  const weakNeighbourSupport = prediction.nearestFeatureDistance > 2;
  const warnings = [];
  if (outsideTrainingRange) warnings.push('outside-training-range');
  if (nearSouthRim) warnings.push('near-south-rim');
  if (factorWasClamped) warnings.push('factor-clamped');
  if (weakNeighbourSupport) warnings.push('weak-neighbour-support');

  return {
    calibrationFactor,
    unclampedFactor,
    correctionPercent: (calibrationFactor - 1) * 100,
    meanRadialFraction,
    radialShareOfChord,
    tangentialShareOfChord,
    radialScaleKm,
    nearestFeatureDistance: prediction.nearestFeatureDistance,
    neighbourRouteIds: prediction.neighborRouteIds,
    neighbourWeights: prediction.weights,
    outsideTrainingRange,
    nearSouthRim,
    factorWasClamped,
    weakNeighbourSupport,
    warnings,
    status: factorWasClamped || nearSouthRim
      ? 'bounded-extrapolation'
      : outsideTrainingRange || weakNeighbourSupport
        ? 'extrapolated'
        : 'within-fit-range'
  };
}

/** Return the bounded ADS-B flight-mileage factor for a straight disk chord. */
export function directLineCalibrationFactor(first, second) {
  return directLineCalibrationDiagnostics(first, second)?.calibrationFactor ?? null;
}

/**
 * Estimate typical flown mileage from the same endpoints used by the straight
 * projected connector. The visible connector remains a single flat-disk chord;
 * the numeric estimate is calibrated from observed ADS-B speed/time mileage.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return {
      distanceMeters: null,
      calibratedDistanceMeters: null,
      flightEmpiricalDistanceMeters: null,
      chordDistanceMeters: null,
      rawDistanceMeters: null,
      calibrationFactor: null,
      correctionPercent: null,
      calibration: null,
      warnings: [],
      metric: 'unavailable',
      restricted: false
    };
  }

  const chordDistanceMeters = flatDiskDistanceMeters(first, second);
  const calibration = directLineCalibrationDiagnostics(first, second);
  const calibrationFactor = calibration?.calibrationFactor ?? null;
  const distanceMeters = Number.isFinite(chordDistanceMeters) &&
    Number.isFinite(calibrationFactor)
    ? chordDistanceMeters * calibrationFactor
    : null;
  const safeChordDistance = Number.isFinite(chordDistanceMeters) ? chordDistanceMeters : null;
  const safeDistance = Number.isFinite(distanceMeters) ? distanceMeters : null;

  return {
    // Backwards-compatible distanceMeters remains the ADS-B empirical estimate.
    distanceMeters: safeDistance,
    calibratedDistanceMeters: safeDistance,
    flightEmpiricalDistanceMeters: safeDistance,
    chordDistanceMeters: safeChordDistance,
    rawDistanceMeters: safeChordDistance,
    calibrationFactor,
    correctionPercent: calibration?.correctionPercent ?? null,
    calibration,
    warnings: calibration?.warnings ?? [],
    metric: 'flat-disk-flight-empirical',
    restricted: false
  };
}
