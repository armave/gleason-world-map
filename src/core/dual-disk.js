export const KILOMETRES_PER_DEGREE = 111.12;
export const EQUATOR_RADIUS_KM = 10000.8;
export const DISK_RADIUS_KM = EQUATOR_RADIUS_KM;
export const DISK_RADIUS_METERS = DISK_RADIUS_KM * 1000;
export const DISK_CENTRES = Object.freeze({ N: Object.freeze({ x: -EQUATOR_RADIUS_KM, y: 0 }), S: Object.freeze({ x: EQUATOR_RADIUS_KM, y: 0 }) });
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EPSILON = 1e-10;
export const rad = degrees => degrees * DEG;
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const wrapLongitude = longitude => Number.isFinite(longitude) ? ((longitude + 180) % 360 + 360) % 360 - 180 : NaN;
const diskForLatitude = latitude => latitude >= 0 ? 'N' : 'S';

function validCoordinate(lat, lon) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon);
}

/**
 * Single source of truth for every geographic-to-planar map coordinate.
 * Coordinates are returned in kilometres, with the Equator hinge at (0, 0).
 * A disk override is only used to represent the matching seam point on both rims.
 */
export function project(lat, lon, diskOverride = null) {
  if (!validCoordinate(lat, lon)) return { x: NaN, y: NaN, disk: null };
  const disk = diskOverride || diskForLatitude(lat);
  if (disk !== 'N' && disk !== 'S') return { x: NaN, y: NaN, disk: null };
  if ((disk === 'N' && lat < -EPSILON) || (disk === 'S' && lat > EPSILON)) {
    return { x: NaN, y: NaN, disk: null };
  }
  const longitude = rad(wrapLongitude(lon));
  const radius = lat === 0 ? EQUATOR_RADIUS_KM :
    (disk === 'N' ? 90 - lat : 90 + lat) * KILOMETRES_PER_DEGREE;
  const centre = DISK_CENTRES[disk];
  return disk === 'N'
    ? { x: centre.x + radius * Math.cos(longitude), y: radius * Math.sin(longitude), disk }
    : { x: centre.x - radius * Math.cos(longitude), y: radius * Math.sin(longitude), disk };
}

/** Invert a point using whichever disk centre is nearest to it. */
export function unproject(x, y) {
  if (![x, y].every(Number.isFinite)) return { lat: NaN, lon: NaN, disk: null };
  const northDistance = Math.hypot(x + EQUATOR_RADIUS_KM, y);
  const southDistance = Math.hypot(x - EQUATOR_RADIUS_KM, y);
  const disk = northDistance <= southDistance ? 'N' : 'S';
  const centre = DISK_CENTRES[disk];
  const radius = Math.min(EQUATOR_RADIUS_KM, Math.hypot(x - centre.x, y));
  const lat = disk === 'N'
    ? 90 - radius / KILOMETRES_PER_DEGREE
    : -90 + radius / KILOMETRES_PER_DEGREE;
  const lon = radius <= EPSILON ? 0
    : disk === 'N'
      ? Math.atan2(y, x - centre.x) * RAD
      : Math.atan2(y, centre.x - x) * RAD;
  return { lat, lon: wrapLongitude(lon), disk };
}

export function projectedEuclideanDistance(a, b) {
  if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function crossingCost(northPoint, southPoint, longitude) {
  const northRim = project(0, longitude, 'N');
  const southRim = project(0, longitude, 'S');
  return {
    distanceKm: projectedEuclideanDistance(northPoint, northRim) +
      projectedEuclideanDistance(southRim, southPoint),
    northRim,
    southRim
  };
}

function goldenSectionMinimum(fn, lower, upper, iterations = 56) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = lower, right = upper;
  let c = right - ratio * (right - left);
  let d = left + ratio * (right - left);
  let fc = fn(c), fd = fn(d);
  for (let index = 0; index < iterations; index++) {
    if (fc <= fd) {
      right = d;
      d = c;
      fd = fc;
      c = right - ratio * (right - left);
      fc = fn(c);
    } else {
      left = c;
      c = d;
      fc = fd;
      d = left + ratio * (right - left);
      fd = fn(d);
    }
  }
  return (left + right) / 2;
}

/** Canonical planar route, including the optimized Equator-hinge crossing. */

/** Minimize the two Euclidean hinge legs over 72 coarse intervals and a golden-section bracket. */
export function optimizeEquatorCrossing(northPoint, southPoint) {
  if (!northPoint || !southPoint || northPoint.disk !== 'N' || southPoint.disk !== 'S') {
    return { longitudeDegrees: NaN, distanceKm: Infinity, northRim: null, southRim: null };
  }
  const objective = longitude => crossingCost(northPoint, southPoint, longitude).distanceKm;
  const coarse = [];
  for (let step = 0; step <= 72; step++) {
    const longitude = -180 + step * 5;
    coarse.push({ longitude, distanceKm: objective(longitude) });
  }
  let best = coarse.reduce((current, item) =>
    item.distanceKm < current.distanceKm ? item : current, coarse[0]);
  const lower = Math.max(-180, best.longitude - 5);
  const upper = Math.min(180, best.longitude + 5);
  if (upper > lower) {
    const longitude = goldenSectionMinimum(objective, lower, upper);
    const distanceKm = objective(longitude);
    if (distanceKm < best.distanceKm) best = { longitude, distanceKm };
  }
  const crossing = crossingCost(northPoint, southPoint, best.longitude);
  return { longitudeDegrees: best.longitude, distanceKm: crossing.distanceKm,
    northRim: crossing.northRim, southRim: crossing.southRim };
}

export function planarRoute(first, second) {
  if (!first || !second || !validCoordinate(first.lat, first.lon) ||
      !validCoordinate(second.lat, second.lon)) {
    return { distanceKm: null, distanceMeters: null, metric: 'unavailable', segments: [], crossings: [], crossingLongitudeDegrees: null };
  }
  const a = project(first.lat, first.lon);
  const b = project(second.lat, second.lon);
  if (a.disk === b.disk) {
    const distanceKm = projectedEuclideanDistance(a, b);
    return {
      distanceKm, distanceMeters: distanceKm * 1000,
      metric: 'dual-disk-euclidean-chord',
      segments: [{ start: a, end: b }],
      crossings: [], crossingLongitudeDegrees: null
    };
  }

  const north = a.disk === 'N' ? a : b;
  const south = a.disk === 'S' ? a : b;
  const best = optimizeEquatorCrossing(north, south);
  const crossing = { distanceKm: best.distanceKm, northRim: best.northRim, southRim: best.southRim };
  const distanceKm = crossing.distanceKm;
  const segments = a.disk === 'N'
    ? [
        { start: a, end: crossing.northRim },
        { start: crossing.southRim, end: b }
      ]
    : [
        { start: a, end: crossing.southRim },
        { start: crossing.northRim, end: b }
      ];
  return {
    distanceKm, distanceMeters: distanceKm * 1000,
    metric: 'dual-disk-equatorial-hinge',
    segments,
    crossings: [crossing.northRim, crossing.southRim],
    crossingLongitudeDegrees: best.longitudeDegrees
  };
}

export function flatDiskDistanceMeters(first, second) {
  return planarRoute(first, second).distanceMeters;
}

/** Return clipped geographic ring fragments for one or both disks. */
export function clipRingToHemisphere(vertices, disk) {
  if (!Array.isArray(vertices) || vertices.length < 3 || (disk !== 'N' && disk !== 'S')) return null;
  const coordinates = vertices.filter(point =>
    Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(+point[0]) && Number.isFinite(+point[1]) &&
    +point[0] >= -180 && +point[0] <= 180 && +point[1] >= -90 && +point[1] <= 90
  ).map(point => [+point[0], +point[1]]);
  if (coordinates.length > 1 &&
      Math.abs(coordinates[0][0] - coordinates.at(-1)[0]) < EPSILON &&
      Math.abs(coordinates[0][1] - coordinates.at(-1)[1]) < EPSILON) coordinates.pop();
  if (coordinates.length < 3) return null;

  // Unwrap longitudes only to interpolate short dateline-safe ring edges.
  const unwrapped = [coordinates[0].slice()];
  for (let index = 1; index < coordinates.length; index++) {
    const previous = unwrapped.at(-1);
    const raw = coordinates[index][0] - previous[0];
    const delta = ((raw + 540) % 360) - 180;
    unwrapped.push([previous[0] + delta, coordinates[index][1]]);
  }
  const inside = latitude => disk === 'N' ? latitude >= -EPSILON : latitude <= EPSILON;
  const output = [];
  for (let index = 0; index < unwrapped.length; index++) {
    const current = unwrapped[index];
    const previous = unwrapped[(index + unwrapped.length - 1) % unwrapped.length];
    const currentInside = inside(current[1]);
    const previousInside = inside(previous[1]);
    if (currentInside !== previousInside) {
      const denominator = current[1] - previous[1];
      const t = Math.abs(denominator) < EPSILON ? 0 : -previous[1] / denominator;
      output.push([previous[0] + (current[0] - previous[0]) * t, 0]);
    }
    if (currentInside) output.push(current.slice());
  }
  const compact = [];
  for (const point of output) {
    const last = compact.at(-1);
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > EPSILON) compact.push(point);
  }
  if (compact.length > 1 &&
      Math.hypot(compact[0][0] - compact.at(-1)[0], compact[0][1] - compact.at(-1)[1]) <= EPSILON) compact.pop();
  return compact.length >= 3 ? compact : null;
}

function projectRingFragment(vertices, projectPoint, disk, maxStepDegrees) {
  const clipped = clipRingToHemisphere(vertices, disk);
  if (!clipped) return null;
  const points = [];
  for (let index = 0; index < clipped.length; index++) {
    const start = clipped[index];
    const end = clipped[(index + 1) % clipped.length];
    const deltaLon = end[0] - start[0];
    const deltaLat = end[1] - start[1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaLon), Math.abs(deltaLat)) / maxStepDegrees));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const lon = start[0] + deltaLon * t;
      const lat = start[1] + deltaLat * t;
      const projected = projectPoint(lat, lon, disk);
      const x = Array.isArray(projected) ? projected[0] : projected?.x;
      const y = Array.isArray(projected) ? projected[1] : projected?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push([x, y]);
    }
  }
  return points.length >= 3 ? points : null;
}

/** Project a GeoJSON ring to independently clipped Northern and Southern fragments. */
export function projectGeoJSONRingParts(vertices, projectPoint = project, { maxStepDegrees = 2 } = {}) {
  if (typeof projectPoint !== 'function') return [];
  const step = Number.isFinite(maxStepDegrees) && maxStepDegrees > 0 ? maxStepDegrees : 2;
  return ['N', 'S'].map(disk => ({
    disk,
    points: projectRingFragment(vertices, projectPoint, disk, step)
  })).filter(part => part.points);
}

export function projectGeoJSONRing(vertices, projectPoint = project, options = {}) {
  const disk = options.disk || 'N';
  return projectGeoJSONRingParts(vertices, projectPoint, options).find(part => part.disk === disk)?.points || null;
}

function ringArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  const origin = points[0];
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    twiceArea += (a[0] - origin[0]) * (b[1] - origin[1]) -
      (b[0] - origin[0]) * (a[1] - origin[1]);
  }
  return Math.abs(twiceArea) / 2;
}

function clickVerticesToRing(vertices) {
  return vertices.map(point => [point.lon, point.lat]);
}

/** Sum clipped planar areas and the canonical route length around each polygon edge. */
export function flatDiskPolygonMetrics(vertices, projectPoint = project, measureDistance = flatDiskDistanceMeters) {
  if (!Array.isArray(vertices) || vertices.length < 3 || typeof measureDistance !== 'function') return null;
  const parts = projectGeoJSONRingParts(clickVerticesToRing(vertices), projectPoint);
  if (!parts.length) return null;
  const areaKm2 = parts.reduce((sum, part) => sum + ringArea(part.points), 0);
  let perimeterMeters = 0;
  for (let index = 0; index < vertices.length; index++) {
    const meters = measureDistance(vertices[index], vertices[(index + 1) % vertices.length]);
    if (!Number.isFinite(meters) || meters < 0) return null;
    perimeterMeters += meters;
  }
  return { areaM2: areaKm2 * 1e6, perimeterM: perimeterMeters };
}

/** Planar area of a GeoJSON Polygon/MultiPolygon; each ring is cut at the hinge. */
export function flatDiskFeatureAreaM2(feature, projectPoint = project) {
  const geometry = feature?.geometry;
  if (!geometry || typeof projectPoint !== 'function') return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return null;
  let totalAreaKm2 = 0, valid = false;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const shell = projectGeoJSONRingParts(polygon[0], projectPoint);
    if (!shell.length) continue;
    let shellArea = shell.reduce((sum, part) => sum + ringArea(part.points), 0);
    for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
      const holes = projectGeoJSONRingParts(polygon[ringIndex], projectPoint);
      shellArea -= holes.reduce((sum, part) => sum + ringArea(part.points), 0);
    }
    totalAreaKm2 += Math.max(0, shellArea);
    valid = true;
  }
  return valid ? totalAreaKm2 * 1e6 : null;
}

export function radialDistanceFromNorthKm(latitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return NaN;
  return Math.abs(latitude) === 0 ? EQUATOR_RADIUS_KM :
    (90 - Math.abs(latitude)) * KILOMETRES_PER_DEGREE;
}
export const radialFraction = latitude =>
  Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    ? radialDistanceFromNorthKm(latitude) / EQUATOR_RADIUS_KM : NaN;
export const baseRadialFraction = radialFraction;
export const baseRadialDistanceFromNorthKm = radialDistanceFromNorthKm;
export function latitudeFromRadialDistanceKm(radiusKm, disk = 'N') {
  if (!Number.isFinite(radiusKm) || (disk !== 'N' && disk !== 'S')) return NaN;
  return (disk === 'N' ? 1 : -1) * (90 - clamp(radiusKm, 0, EQUATOR_RADIUS_KM) / KILOMETRES_PER_DEGREE);
}
export function colatitudeRadians(latitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    ? rad(90 - Math.abs(latitude)) : NaN;
}
export function northSouthDistanceKm(latitude1, latitude2) {
  if (![latitude1, latitude2].every(value => Number.isFinite(value) && value >= -90 && value <= 90)) return null;
  return Math.abs(latitude2 - latitude1) * KILOMETRES_PER_DEGREE;
}
export function eastWestDistanceKm(latitude, deltaLongitudeRadians) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(deltaLongitudeRadians)) return null;
  const radius = radialDistanceFromNorthKm(latitude);
  return 2 * radius * Math.abs(Math.sin(deltaLongitudeRadians / 2));
}
export function flatDiskSectorAreaKm2(radius1Km, radius2Km, deltaLongitudeRadians) {
  if (![radius1Km, radius2Km, deltaLongitudeRadians].every(Number.isFinite)) return null;
  return 0.5 * Math.abs(radius2Km ** 2 - radius1Km ** 2) * Math.abs(deltaLongitudeRadians);
}
export function flatDiskLinePath(first, second) {
  return planarRoute(first, second).segments.map(segment => [
    [segment.start.x, segment.start.y],
    [segment.end.x, segment.end.y]
  ]);
}
