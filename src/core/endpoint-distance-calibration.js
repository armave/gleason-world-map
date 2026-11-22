/**
 * Empirical endpoint-distance estimator for the displayed flat-disk map.
 *
 * The model predicts a typical observed ADS-B ground-speed/time mileage from
 * nearby airport-pair examples. It uses only the active flat-disk projection
 * and observed route mileage; no globe, sphere, ellipsoid or geodesic formula.
 *
 * The exact displayed connector remains available separately as the planar
 * chord. A logarithmic chord-length feature prevents short-route examples from
 * being treated as support for distances far beyond the observed sample. This estimate is a typical route-mileage reference, not a specific
 * flight path or a guaranteed shortest distance.
 */
import { DISK_RADIUS_KM, project } from './flat-disk.js';
import { ENDPOINT_DISTANCE_CALIBRATION } from './endpoint-distance-calibration-parameters.js';

const TAU = Math.PI * 2;
const MIN_DISTANCE_KM = 1e-9;

function validPoint(point) {
  return !!point &&
    Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    Number.isFinite(point.lon);
}

function wrapRadians(value) {
  return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Derive normalized endpoint features and the exact chord from the same
 * active projection used by the visible map.
 */
export function endpointDistanceFeatures(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;

  const a = project(first.lon, first.lat, DISK_RADIUS_KM);
  const b = project(second.lon, second.lat, DISK_RADIUS_KM);
  if (![...a, ...b].every(Number.isFinite)) return null;

  const radiusA = Math.hypot(a[0], a[1]);
  const radiusB = Math.hypot(b[0], b[1]);
  const chordKm = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!Number.isFinite(chordKm) || chordKm <= MIN_DISTANCE_KM) {
    return {
      features: [radiusA / DISK_RADIUS_KM, 0, 0, Math.log(1e-6)],
      chordDistanceMeters: 0
    };
  }

  // The renderer stores y = -r sin(angle), so recover the displayed angle
  // with atan2(-y, x), then wrap the pair's angular difference.
  const angleA = Math.atan2(-a[1], a[0]);
  const angleB = Math.atan2(-b[1], b[0]);
  const deltaAngle = wrapRadians(angleB - angleA);
  const radialComponentKm = Math.abs(radiusB - radiusA);
  const tangentialComponentKm =
    2 * Math.sqrt(radiusA * radiusB) * Math.abs(Math.sin(deltaAngle / 2));

  return {
    features: [
      (radiusA + radiusB) / (2 * DISK_RADIUS_KM),
      radialComponentKm / chordKm,
      tangentialComponentKm / chordKm,
      Math.log(chordKm)
    ],
    chordDistanceMeters: chordKm * 1000
  };
}

function featureDistance(features, training, model) {
  return Math.sqrt(features.reduce((sum, value, index) => {
    const scale = model.featureScales[index] || 1;
    return sum + ((value - training.features[index]) / scale) ** 2;
  }, 0));
}

/**
 * Estimate typical observed route mileage from the nearest route-feature
 * examples. A result outside the validated feature-support radius is returned
 * with status "extrapolated", never silently presented as a validated value.
 */
export function predictEndpointDistance(first, second, model = ENDPOINT_DISTANCE_CALIBRATION) {
  const geometry = endpointDistanceFeatures(first, second);
  if (!geometry || !model || !Array.isArray(model.trainingExamples) ||
      !model.trainingExamples.length) return null;

  const neighbors = model.trainingExamples
    .filter(route => route && Array.isArray(route.features) &&
      route.features.length === 4 && Number.isFinite(route.mileagePerUnitChord) &&
      route.mileagePerUnitChord > 0)
    .map(route => ({
      routeId: route.routeId,
      mileagePerUnitChord: route.mileagePerUnitChord,
      distance: featureDistance(geometry.features, route, model)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, model.neighborCount || 4));

  if (!neighbors.length) return null;

  const power = Number.isFinite(model.inverseDistancePower)
    ? model.inverseDistancePower : 1;
  const weights = neighbors.map(neighbor =>
    1 / Math.pow(Math.max(0.025, neighbor.distance), power)
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const predictedRatio = Math.exp(neighbors.reduce(
    (sum, neighbor, index) =>
      sum + weights[index] * Math.log(neighbor.mileagePerUnitChord),
    0
  ) / totalWeight);
  const bounds = Array.isArray(model.factorBounds) && model.factorBounds.length === 2
    ? model.factorBounds : [0.75, 1.5];
  const calibrationFactor = clamp(predictedRatio, bounds[0], bounds[1]);
  const nearestFeatureDistance = neighbors[0].distance;
  const maxSupportedDistance = Number.isFinite(model.maxSupportedFeatureDistance)
    ? model.maxSupportedFeatureDistance : 0.65;
  const supported = nearestFeatureDistance <= maxSupportedDistance;
  const routeDistanceMeters = geometry.chordDistanceMeters * calibrationFactor;

  return {
    distanceMeters: Number.isFinite(routeDistanceMeters) ? routeDistanceMeters : null,
    chordDistanceMeters: geometry.chordDistanceMeters,
    calibrationFactor,
    correctionPercent: (calibrationFactor - 1) * 100,
    features: geometry.features,
    nearestFeatureDistance,
    maxSupportedFeatureDistance: maxSupportedDistance,
    neighborRouteIds: neighbors.map(neighbor => neighbor.routeId),
    neighborWeights: weights.map(weight => weight / totalWeight),
    validation: model.validation || null,
    supportStatus: supported ? 'supported' : 'extrapolated',
    warnings: supported ? [] : ['outside-validated-route-feature-support'],
    metric: 'adsb-empirical-endpoint-route-mileage'
  };
}
