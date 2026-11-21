/**
 * Flat-disk geometry engine for the Gleason-style north-polar map.
 *
 * Coordinates are placed on one mathematical plane:
 *   theta = pi/2 - latitude
 *   r = R * theta
 *   x = r cos(longitude), y = -r sin(longitude)
 *
 * R = 6,371 km is the chosen radial scale constant for this map, not a
 * geodesic or ellipsoidal measurement parameter. This module provides the
 * display projection, straight-line A–B measurements, and planar
 * area/perimeter helpers. A–B distance is the Euclidean length of its
 * straight projected chord, not a WGS84 surface geodesic.
 */
export const DISK_RADIAL_SCALE_KM = 6371;
export const DISK_RADIUS_KM = Math.PI * DISK_RADIAL_SCALE_KM;
export const DISK_RADIUS_METERS = DISK_RADIUS_KM * 1000;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const rad = degrees => degrees * DEG;
export const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));
export const wrapLongitude = longitude => {
  if (!Number.isFinite(longitude)) return NaN;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
};

export function colatitudeRadians(latitudeDegrees) {
  if (!Number.isFinite(latitudeDegrees) ||
      latitudeDegrees < -90 || latitudeDegrees > 90) return NaN;
  return Math.PI / 2 - rad(latitudeDegrees);
}

export function radialDistanceFromNorthKm(latitudeDegrees) {
  const theta = colatitudeRadians(latitudeDegrees);
  return Number.isFinite(theta) ? DISK_RADIAL_SCALE_KM * theta : NaN;
}

export function radialFraction(latitudeDegrees) {
  return colatitudeRadians(latitudeDegrees) / Math.PI;
}

export function latitudeFromRadialDistanceKm(radiusKm) {
  const theta = clamp(radiusKm / DISK_RADIAL_SCALE_KM, 0, Math.PI);
  return (Math.PI / 2 - theta) * RAD;
}

function geographicPointInDiskKm(longitudeDegrees, latitudeDegrees) {
  if (!Number.isFinite(longitudeDegrees) || !Number.isFinite(latitudeDegrees) ||
      latitudeDegrees < -90 || latitudeDegrees > 90) return null;
  const radius = radialDistanceFromNorthKm(latitudeDegrees);
  const longitude = rad(wrapLongitude(longitudeDegrees));
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

/** Convert geographic coordinates to their position on the calibrated disk. */
export function project(longitudeDegrees, latitudeDegrees, baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) return [NaN, NaN];
  const point = geographicPointInDiskKm(longitudeDegrees, latitudeDegrees);
  if (!point) return [NaN, NaN];
  const pixelsPerKm = baseRadius / DISK_RADIUS_KM;
  return [point[0] * pixelsPerKm, point[1] * pixelsPerKm];
}

/** Inverse of the flat-disk coordinate transform. */
export function unproject(x, y, baseRadius) {
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(baseRadius) || baseRadius <= 0) {
    return { lat: NaN, lon: NaN };
  }
  const rho = Math.hypot(x, y);
  const theta = clamp(rho / baseRadius, 0, 1) * Math.PI;
  const lat = (Math.PI / 2 - theta) * RAD;
  const lon = rho < 1e-9 ? 0 : wrapLongitude(Math.atan2(-y, x) * RAD);
  return { lat, lon };
}

function pointInDiskKm(point) {
  if (!point) return null;
  return geographicPointInDiskKm(point.lon, point.lat);
}

/** Euclidean chord length in the projected disk only; not geographic ground distance. */
export function flatDiskDistanceMeters(a, b) {
  const first = pointInDiskKm(a), second = pointInDiskKm(b);
  if (!first || !second) return null;
  return Math.hypot(second[0] - first[0], second[1] - first[1]) * 1000;
}

/** One straight projected chord between endpoints; used by the direct-line distance tool. */
export function flatDiskLinePath(a, b, projectPoint) {
  if (!a || !b || typeof projectPoint !== 'function' ||
      ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite) ||
      a.lat < -90 || a.lat > 90 || b.lat < -90 || b.lat > 90) return [];
  const start = projectPoint(a.lon, a.lat);
  const end = projectPoint(b.lon, b.lat);
  if (![start, end].every(point =>
    Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1])
  )) return [];
  return [start.slice(0, 2), end.slice(0, 2)];
}

/** Radial north–south separation in the calibrated plane, in kilometres. */
export function northSouthDistanceKm(latitude1, latitude2) {
  if (![latitude1, latitude2].every(Number.isFinite) ||
      [latitude1, latitude2].some(latitude => latitude < -90 || latitude > 90)) return null;
  return Math.abs(
    radialDistanceFromNorthKm(latitude2) -
    radialDistanceFromNorthKm(latitude1)
  );
}

/** Straight chord between two points on the same latitude circle. */
export function eastWestDistanceKm(latitudeDegrees, deltaLongitudeRadians) {
  if (!Number.isFinite(latitudeDegrees) || latitudeDegrees < -90 || latitudeDegrees > 90 ||
      !Number.isFinite(deltaLongitudeRadians)) return null;
  const radius = radialDistanceFromNorthKm(latitudeDegrees);
  return 2 * radius * Math.abs(Math.sin(deltaLongitudeRadians / 2));
}

/** Ordinary Euclidean area of a radial disk sector, in square kilometres. */
export function flatDiskSectorAreaKm2(radius1Km, radius2Km, deltaLongitudeRadians) {
  if (![radius1Km, radius2Km, deltaLongitudeRadians].every(Number.isFinite)) return null;
  return 0.5 * Math.abs(radius2Km ** 2 - radius1Km ** 2) *
    Math.abs(deltaLongitudeRadians);
}

function samePoint(a, b, epsilon = 1e-8) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon;
}
function orientationSign(a, b, c) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const acx = c[0] - a[0], acy = c[1] - a[1];
  const cross = abx * acy - aby * acx;
  const scale = Math.max(1, Math.abs(abx), Math.abs(aby), Math.abs(acx), Math.abs(acy));
  const tolerance = Number.EPSILON * 64 * scale * scale;
  return Math.abs(cross) <= tolerance ? 0 : Math.sign(cross);
}
function onSegment(a, b, p) {
  const coordinateScale = Math.max(
    1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]),
    Math.abs(p[0]), Math.abs(p[1])
  );
  const tolerance = Number.EPSILON * 64 * coordinateScale;
  return orientationSign(a, b, p) === 0 &&
    p[0] >= Math.min(a[0], b[0]) - tolerance &&
    p[0] <= Math.max(a[0], b[0]) + tolerance &&
    p[1] >= Math.min(a[1], b[1]) - tolerance &&
    p[1] <= Math.max(a[1], b[1]) + tolerance;
}
function segmentsIntersect(a, b, c, d) {
  const o1 = orientationSign(a, b, c), o2 = orientationSign(a, b, d);
  const o3 = orientationSign(c, d, a), o4 = orientationSign(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b));
}
function hasSelfIntersection(points) {
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count];
    for (let j = i + 1; j < count; j++) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % count])) return true;
    }
  }
  return false;
}

function metersPerProjectedUnit(baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) return null;
  return DISK_RADIUS_METERS / baseRadius;
}
/**
 * Project a GeoJSON ring using the same two-degree geographic interpolation
 * used by the rendered country paths. The Antarctic polar edge can optionally
 * retain its full 360-degree sweep so its boundary follows the outer disk rim.
 */
export function projectGeoJSONRing(vertices, projectPoint, {
  preserveAntarcticRim = false,
  maxStepDegrees = 2
} = {}) {
  if (!Array.isArray(vertices) || typeof projectPoint !== 'function') return null;
  const step = Number.isFinite(maxStepDegrees) && maxStepDegrees > 0
    ? maxStepDegrees : 2;
  const coordinates = vertices.filter(coordinate =>
    Array.isArray(coordinate) && coordinate.length >= 2 &&
    Number.isFinite(+coordinate[0]) && Number.isFinite(+coordinate[1]) &&
    +coordinate[0] >= -180 && +coordinate[0] <= 180 &&
    +coordinate[1] >= -90 && +coordinate[1] <= 90
  ).map(coordinate => [+coordinate[0], +coordinate[1]]);
  if (coordinates.length < 3) return null;

  let [longitude0, latitude0] = coordinates[0];
  const first = projectPoint(longitude0, latitude0);
  if (!Array.isArray(first) || first.length < 2 ||
      !Number.isFinite(first[0]) || !Number.isFinite(first[1])) return null;
  const points = [first.slice(0, 2)];

  for (let i = 1; i < coordinates.length; i++) {
    const [longitude1, latitude1] = coordinates[i];
    const rawDelta = longitude1 - longitude0;
    const southPoleSweep = preserveAntarcticRim &&
      Math.abs(latitude0 + 90) < 1e-7 &&
      Math.abs(latitude1 + 90) < 1e-7 &&
      Math.abs(rawDelta) > 180;
    const deltaLongitude = southPoleSweep ? rawDelta : wrapLongitude(rawDelta);
    const deltaLatitude = latitude1 - latitude0;
    const steps = Math.max(1, Math.ceil(
      Math.max(Math.abs(deltaLongitude), Math.abs(deltaLatitude)) / step
    ));

    for (let j = 1; j <= steps; j++) {
      const point = projectPoint(
        longitude0 + deltaLongitude * j / steps,
        latitude0 + deltaLatitude * j / steps
      );
      if (!Array.isArray(point) || point.length < 2 ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
      points.push(point.slice(0, 2));
    }
    longitude0 = longitude1;
    latitude0 = latitude1;
  }
  return points.length >= 3 ? points : null;
}

function projectRing(vertices, getCoordinate, projectPoint, scale) {
  if (!Array.isArray(vertices) || vertices.length < 3) return null;
  const points = [];
  for (const vertex of vertices) {
    const coordinate = getCoordinate(vertex);
    if (!coordinate) return null;
    const projected = projectPoint(coordinate[0], coordinate[1]);
    if (!Array.isArray(projected) || projected.length < 2 ||
        !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return null;
    const point = [projected[0] * scale, projected[1] * scale];
    if (!points.length || !samePoint(points.at(-1), point)) points.push(point);
  }
  if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
  return points.length >= 3 ? points : null;
}

function ringPlanarMetrics(points, validateSimple = false) {
  if (!Array.isArray(points) || points.length < 3 ||
      (validateSimple && hasSelfIntersection(points))) return null;
  let twiceArea = 0, perimeter = 0;
  // Translate to a local origin before applying shoelace. This avoids losing
  // small polygon areas when their absolute map coordinates are very large.
  const originX = points[0][0], originY = points[0][1];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const ax = a[0] - originX, ay = a[1] - originY;
    const bx = b[0] - originX, by = b[1] - originY;
    twiceArea += ax * by - bx * ay;
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  let localScale = 1;
  for (const point of points) {
    localScale = Math.max(
      localScale,
      Math.abs(point[0] - originX),
      Math.abs(point[1] - originY)
    );
  }
  const areaTolerance = Number.EPSILON * 64 * localScale * localScale * points.length;
  if (Math.abs(twiceArea) <= areaTolerance) return null;
  return { areaM2: Math.abs(twiceArea) / 2, perimeterM: perimeter };
}

const clickPointCoordinate = point =>
  point && Number.isFinite(point.lon) && Number.isFinite(point.lat) &&
  point.lat >= -90 && point.lat <= 90
    ? [point.lon, point.lat] : null;

/** Planar shoelace area and straight-edge perimeter for a user polygon. */
export function flatDiskPolygonMetrics(vertices, projectPoint, baseRadius) {
  const scale = metersPerProjectedUnit(baseRadius);
  if (scale == null) return null;
  const points = projectRing(vertices, clickPointCoordinate, projectPoint, scale);
  const result = ringPlanarMetrics(points, true);
  return result;
}

/** Planar area of GeoJSON Polygon/MultiPolygon geometry, in square metres. */
export function flatDiskFeatureAreaM2(feature, projectPoint, baseRadius, options = {}) {
  const scale = metersPerProjectedUnit(baseRadius);
  const geometry = feature?.geometry;
  if (scale == null || !geometry || typeof projectPoint !== 'function') return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return null;
  const ringOptions = { preserveAntarcticRim: options.preserveAntarcticRim === true };

  let totalArea = 0, validPolygons = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const exteriorCoordinates = projectGeoJSONRing(polygon[0], projectPoint, ringOptions);
    if (!exteriorCoordinates) continue;
    const exterior = ringPlanarMetrics(
      exteriorCoordinates.map(([x, y]) => [x * scale, y * scale])
    );
    if (!exterior) continue;

    let polygonArea = exterior.areaM2;
    for (let i = 1; i < polygon.length; i++) {
      const holeCoordinates = projectGeoJSONRing(polygon[i], projectPoint, ringOptions);
      if (!holeCoordinates) continue;
      const hole = ringPlanarMetrics(
        holeCoordinates.map(([x, y]) => [x * scale, y * scale])
      );
      if (hole) polygonArea -= hole.areaM2;
    }
    totalArea += Math.max(0, polygonArea);
    validPolygons++;
  }
  return validPolygons ? totalArea : null;
}
