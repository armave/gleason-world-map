/**
 * Coordinate-only spherical great-circle distance.
 * Uses the mean Earth radius (IUGG) and depends only on endpoint latitude/longitude.
 * This is an approximate direct geographic distance, not flown route mileage.
 */
export const MEAN_EARTH_RADIUS_METERS = 6371008.8;

const toRadians = degrees => degrees * Math.PI / 180;

export function greatCircleDistanceMeters(first, second) {
  if (!first || !second ||
      ![first.lat, first.lon, second.lat, second.lon].every(Number.isFinite) ||
      first.lat < -90 || first.lat > 90 ||
      second.lat < -90 || second.lat > 90) return null;

  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(((second.lon - first.lon + 540) % 360) - 180);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
}
