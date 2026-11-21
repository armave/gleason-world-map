import { clamp, flatDiskDistanceMeters, radialDistanceFromNorthKm, rad, wrapLongitude } from './flat-disk.js';

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
 * Empirical flat-map correction fitted to 15 city-to-city distance references.
 *
 * It uses only flat-map endpoint coordinates (mean colatitude, colatitude
 * separation, and wrapped longitude separation). It does not compute a globe,
 * spherical arc, or geodesic. The visible A–B connector remains one straight
 * projected segment; this factor adjusts only the numeric calibration.
 *
 * Five independent airport-pair references were held out from fitting.
 */
const CALIBRATION_FEATURE_MEANS = [
  1.211485393686824, 0.48081493786774454, 1.2647353891651711,
  1.6806202539625672, 0.5279777387195358, 2.5425472893449252,
  0.6209351570979428, 1.8063142195331707, 0.6728322207183389
];
const CALIBRATION_FEATURE_SCALES = [
  0.46143623053033955, 0.5447887060528813, 0.9710775894531543,
  1.3234576976415762, 0.908673582085491, 2.6742718373525842,
  0.782050517114795, 1.8024416254621414, 1.1946839238877458
];
const CALIBRATION_COEFFICIENTS = [
  -0.008916724670290893, 0.06619917556528573, 0.008375163763085678,
  -0.12753843897844064, -0.056992860455687, 0.13746596492543817,
  0.07422938110820021, -0.2283527194504505, 0.0007986676416541728
];
const CALIBRATION_INTERCEPT = 0.6553547535763362;
const MIN_CALIBRATION_FACTOR = 0.9;
const MAX_CALIBRATION_FACTOR = 2.5;
const MIN_MEAN_COLATITUDE = 0.5615596868291755;
const MAX_MEAN_COLATITUDE = 2.180352568053916;
const MAX_COLATITUDE_SPAN = 1.7709855919986461;

/**
 * Return the bounded empirical factor for a straight projected A–B chord.
 * Endpoint reversal and longitude wrap produce the same factor.
 */
export function directLineCalibrationFactor(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;
  const thetaA = Math.PI / 2 - rad(first.lat);
  const thetaB = Math.PI / 2 - rad(second.lat);
  const meanTheta = clamp(
    (thetaA + thetaB) / 2,
    MIN_MEAN_COLATITUDE,
    MAX_MEAN_COLATITUDE
  );
  const thetaSpan = clamp(
    Math.abs(thetaA - thetaB),
    0,
    MAX_COLATITUDE_SPAN
  );
  const longitudeSpan = Math.abs(rad(wrapLongitude(second.lon - first.lon)));
  const features = [
    meanTheta,
    thetaSpan,
    longitudeSpan,
    meanTheta ** 2,
    thetaSpan ** 2,
    longitudeSpan ** 2,
    meanTheta * thetaSpan,
    meanTheta * longitudeSpan,
    thetaSpan * longitudeSpan
  ];

  let logFactor = CALIBRATION_INTERCEPT;
  for (let i = 0; i < features.length; i++) {
    const normalized =
      (features[i] - CALIBRATION_FEATURE_MEANS[i]) /
      CALIBRATION_FEATURE_SCALES[i];
    logFactor += CALIBRATION_COEFFICIENTS[i] * normalized;
  }
  return clamp(Math.exp(logFactor), MIN_CALIBRATION_FACTOR, MAX_CALIBRATION_FACTOR);
}

/**
 * Report the empirical length of the straight projected A–B line.
 * The connector geometry stays a straight chord; only its displayed numeric
 * length is corrected from the empirical flat-map reference fit.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return {
      distanceMeters: null,
      chordDistanceMeters: null,
      calibrationFactor: null,
      metric: 'unavailable',
      restricted: false
    };
  }
  const chordDistanceMeters = flatDiskDistanceMeters(first, second);
  const calibrationFactor = directLineCalibrationFactor(first, second);
  const distanceMeters = Number.isFinite(chordDistanceMeters) &&
    Number.isFinite(calibrationFactor)
    ? chordDistanceMeters * calibrationFactor
    : null;
  return {
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    chordDistanceMeters: Number.isFinite(chordDistanceMeters) ? chordDistanceMeters : null,
    calibrationFactor,
    metric: 'flat-disk-empirical-direct',
    restricted: false
  };
}
