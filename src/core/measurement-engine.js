import { planarRoute } from './dual-disk.js';

/** Canonical distance and drawable route geometry for every measurement surface. */
export function measureDirectDistance(first, second) {
  const route = planarRoute(first, second);
  return {
    distanceMeters: route.distanceMeters,
    metric: route.metric,
    segments: route.segments,
    crossings: route.crossings,
    crossingLongitudeDegrees: route.crossingLongitudeDegrees
  };
}
export function measureDistanceMeters(first, second) {
  return measureDirectDistance(first, second).distanceMeters;
}
export { planarRoute } from './dual-disk.js';
