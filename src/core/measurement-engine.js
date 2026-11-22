import {
  clamp,
  baseFlatDiskDistanceMeters,
  radialDistanceFromNorthKm,
  DISK_RADIUS_KM,
  project
} from './flat-disk.js';
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
  const projected = project(point.lon, point.lat, DISK_RADIUS_KM);
  return projected.every(Number.isFinite) ? projected : null;
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
 * The single canonical distance calibration for the flat-disk map.
 *
 * The model is fitted to observed ADS-B ground-speed × timestamp mileage.
 * Every distance readout uses the same base-disk chord multiplied by this
 * one bounded, route-feature calibration factor.
 */
export function directLineCalibrationDiagnostics(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;

  const chordGeometry = FLIGHT_CALIBRATION.chordGeometry === 'visual-12-circle'
    ? 'visual-12-circle' : 'base';
  const features = flightCalibrationFeatures(
    first, second, FLIGHT_CALIBRATION.radialWarp, chordGeometry
  );
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

/** Canonical distance entry point shared by every UI measurement surface. */
export function measureDistanceMeters(first, second) {
  return measureDirectDistance(first, second).distanceMeters;
}

/** Return the bounded ADS-B flight-mileage factor for a straight disk chord. */
export function directLineCalibrationFactor(first, second) {
  return directLineCalibrationDiagnostics(first, second)?.calibrationFactor ?? null;
}

/**
 * Measure one canonical ADS-B-calibrated flat-disk distance.
 *
 * Formula: base flat-disk chord × the single bounded route-feature factor.
 * ADS-B ground-speed/time observations calibrate the factor; no second
 * endpoint estimator or uncorrected chord is returned as another distance.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return {
      distanceMeters: null,
      calibrationFactor: null,
      correctionPercent: null,
      calibration: null,
      warnings: [],
      metric: 'unavailable',
      restricted: false
    };
  }

  const baseChordDistance = baseFlatDiskDistanceMeters(first, second);
  const calibration = directLineCalibrationDiagnostics(first, second);
  const calibrationFactor = calibration?.calibrationFactor ?? null;
  const canonicalDistance = Number.isFinite(baseChordDistance) &&
    Number.isFinite(calibrationFactor)
    ? baseChordDistance * calibrationFactor
    : null;
  const safeDistance = Number.isFinite(canonicalDistance) ? canonicalDistance : null;
  const safeCalibration = calibration;

  return {
    distanceMeters: safeDistance,
    calibrationFactor,
    correctionPercent: calibration?.correctionPercent ?? null,
    calibration: safeCalibration,
    warnings: calibration?.warnings ?? [],
    metric: 'adsb-calibrated-flat-disk',
    restricted: false
  };
}
