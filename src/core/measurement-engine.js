import { flatDiskDistanceMeters } from './flat-disk.js';

function validPoint(point) {
  return !!point &&
    Number.isFinite(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    Number.isFinite(point.lon);
}

/** One direct planar distance function shared by all measurement surfaces. */
export function measureDistanceMeters(first, second) {
  return measureDirectDistance(first, second).distanceMeters;
}

/**
 * Measure the Euclidean chord between two geographic points after placing
 * them on the pure Gleason disk. The result is a drawing-plane length, not
 * an independently validated ground route distance.
 */
export function measureDirectDistance(first, second) {
  if (!validPoint(first) || !validPoint(second)) {
    return {
      distanceMeters: null,
      metric: 'unavailable'
    };
  }

  const distanceMeters = flatDiskDistanceMeters(first, second);
  return {
    distanceMeters: Number.isFinite(distanceMeters) && distanceMeters >= 0
      ? distanceMeters : null,
    metric: 'euclidean-flat-disk-chord'
  };
}
