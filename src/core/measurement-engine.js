import { clamp, baseFlatDiskDistanceMeters, flatDiskDistanceMeters, radialDistanceFromNorthKm, baseRadialFraction, rad, wrapLongitude } from './flat-disk.js';
import { greatCircleDistanceMeters } from './great-circle.js';
import {
  RADIAL_DISTANCE_CIRCLE_COUNT as RADIAL_CIRCLE_COUNT,
  RADIAL_DISTANCE_INNER_FACTOR as RADIAL_INNER_FACTOR,
  RADIAL_DISTANCE_OUTER_FACTOR as RADIAL_OUTER_FACTOR,
  radialDistanceCorrectionFactor as radialCalibrationFactorAt
} from './visual-radial-calibration.js';
import { FLIGHT_CALIBRATION } from './flight-calibration-parameters.js';
import { flightCalibrationFeatures, predictFlightScaleRatio } from './flight-calibration-fit.js';

export const RESTRICTED_PARALLEL_LATITUDE = -60;
const RESTRICTED_RADIUS_KM = radialDistanceFromNorthKm(RESTRICTED_PARALLEL_LATITUDE);
const EPSILON_KM = 1e-7;

/**
 * User-defined radial adjustment for the primary A–B readout.
 * Circle 1 is the North Pole (1.00×); circle 12 is the Antarctic rim (0.50×).
 * Values between circles are linearly interpolated in normalized disk radius.
 */
export const RADIAL_DISTANCE_CIRCLE_COUNT = RADIAL_CIRCLE_COUNT;
export const RADIAL_DISTANCE_INNER_FACTOR = RADIAL_INNER_FACTOR;
export const RADIAL_DISTANCE_OUTER_FACTOR = RADIAL_OUTER_FACTOR;

export function radialDistanceCorrectionFactor(radialFractionValue) {
  return radialCalibrationFactorAt(radialFractionValue);
}

function validPoint(point) {
  return !!point && Number.isFinite(point.lat) && point.lat >= -90 &&
    point.lat <= 90 && Number.isFinite(point.lon);
}

/**
 * Resolve the correction at the average normalized radius of the endpoints.
 * Same-circle measurements use that circle's factor; different circles blend.
 */
export function radialDistanceCorrectionDiagnostics(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;
  const firstRadialFraction = baseRadialFraction(first.lat);
  const secondRadialFraction = baseRadialFraction(second.lat);
  if (![firstRadialFraction, secondRadialFraction].every(Number.isFinite)) return null;
  const meanRadialFraction = clamp((firstRadialFraction + secondRadialFraction) / 2, 0, 1);
  const factor = radialDistanceCorrectionFactor(meanRadialFraction);
  return {
    factor,
    meanRadialFraction,
    circlePosition: 1 + meanRadialFraction * (RADIAL_DISTANCE_CIRCLE_COUNT - 1),
    correctionPercent: (factor - 1) * 100
  };
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
 * Measure the straight projected disk chord, apply the 12-circle radial
 * readout adjustment, and provide a separate ADS-B flight-mileage estimate.
 *
 * chordDistanceMeters is the original fitted-projection calibration chord;
 * visualChordDistanceMeters is the actual chord after the smooth map warp.
 * The A–B readout and ADS-B estimate keep the original calibration basis;
 * the visible connector and scale bar use the visually calibrated projection.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return {
      distanceMeters: null,
      greatCircleDistanceMeters: null,
      radiallyCorrectedDistanceMeters: null,
      calibratedDistanceMeters: null,
      flightEmpiricalDistanceMeters: null,
      chordDistanceMeters: null,
      visualChordDistanceMeters: null,
      rawDistanceMeters: null,
      radialCorrectionFactor: null,
      radialCorrectionPercent: null,
      radialCirclePosition: null,
      radialCorrection: null,
      calibrationFactor: null,
      correctionPercent: null,
      calibration: null,
      warnings: [],
      metric: 'unavailable',
      restricted: false
    };
  }

  // Keep the numeric calibration chord on the pre-visual projection so the
  // 12-circle readout and ADS-B model remain stable while the map is redrawn.
  const chordDistanceMeters = baseFlatDiskDistanceMeters(first, second);
  const visualChordDistanceMeters = flatDiskDistanceMeters(first, second);
  const radialCorrection = radialDistanceCorrectionDiagnostics(first, second);
  const radialCorrectionFactor = radialCorrection?.factor ?? null;
  const radiallyCorrectedDistanceMeters = Number.isFinite(chordDistanceMeters) &&
    Number.isFinite(radialCorrectionFactor)
    ? chordDistanceMeters * radialCorrectionFactor
    : null;
  const calibration = directLineCalibrationDiagnostics(first, second);
  const calibrationFactor = calibration?.calibrationFactor ?? null;
  const flightEmpiricalDistanceMeters = Number.isFinite(chordDistanceMeters) &&
    Number.isFinite(calibrationFactor)
    ? chordDistanceMeters * calibrationFactor
    : null;
  const greatCircleDistance = greatCircleDistanceMeters(first, second);
  const safeGreatCircleDistance = Number.isFinite(greatCircleDistance) ? greatCircleDistance : null;
  const safeChordDistance = Number.isFinite(chordDistanceMeters) ? chordDistanceMeters : null;
  const safeVisualChordDistance = Number.isFinite(visualChordDistanceMeters) ? visualChordDistanceMeters : null;
  const safeRadiallyCorrectedDistance = Number.isFinite(radiallyCorrectedDistanceMeters)
    ? radiallyCorrectedDistanceMeters
    : null;
  const safeFlightEmpiricalDistance = Number.isFinite(flightEmpiricalDistanceMeters)
    ? flightEmpiricalDistanceMeters
    : null;

  return {
    // Keep the legacy radial correction as a diagnostic alongside the primary
    // coordinate-only distance, which is independent of telemetry and map warp.
    distanceMeters: safeGreatCircleDistance,
    greatCircleDistanceMeters: safeGreatCircleDistance,
    radiallyCorrectedDistanceMeters: safeRadiallyCorrectedDistance,
    calibratedDistanceMeters: safeFlightEmpiricalDistance,
    flightEmpiricalDistanceMeters: safeFlightEmpiricalDistance,
    // Preserve the actual geometric chord as an independent reference.
    chordDistanceMeters: safeChordDistance,
    visualChordDistanceMeters: safeVisualChordDistance,
    rawDistanceMeters: safeChordDistance,
    radialCorrectionFactor,
    radialCorrectionPercent: radialCorrection?.correctionPercent ?? null,
    radialCirclePosition: radialCorrection?.circlePosition ?? null,
    radialCorrection,
    calibrationFactor,
    correctionPercent: calibration?.correctionPercent ?? null,
    calibration,
    warnings: calibration?.warnings ?? [],
    metric: 'spherical-great-circle',
    restricted: false
  };
}
