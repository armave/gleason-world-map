import { flatDiskDistanceMeters, radialDistanceFromNorthKm, rad, wrapLongitude } from './flat-disk.js';

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
 * Measure the Euclidean length of the straight A–B chord in the calibrated
 * flat-disk map plane. The result matches the visible direct connector and is
 * deliberately not a WGS84 surface-geodesic distance.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return { distanceMeters: null, metric: 'unavailable', restricted: false };
  }
  const distanceMeters = flatDiskDistanceMeters(first, second);
  return {
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    metric: 'flat-disk-direct',
    restricted: false
  };
}
