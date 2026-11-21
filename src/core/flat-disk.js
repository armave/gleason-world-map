/**
 * Flat-disk geometry engine for the Gleason-style north-polar map.
 *
 * Coordinates are placed on one mathematical plane:
 *   theta = pi/2 - latitude
 *   r = R * theta
 *   x = r cos(longitude), y = -r sin(longitude)
 *
 * R = 6,371 km is the chosen radial scale constant for this map, not a
 * geodesic or ellipsoidal measurement parameter. Distances, areas and
 * perimeters are Euclidean measurements in the projected disk.
 */
export const DISK_RADIAL_SCALE_KM = 6371;
export const DISK_RADIUS_KM = Math.PI * DISK_RADIAL_SCALE_KM;
export const DISK_RADIUS_METERS = DISK_RADIUS_KM * 1000;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const rad = degrees => degrees * DEG;
export const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));
export const wrapLongitude = longitude =>
  ((longitude + 540) % 360) - 180;

export function colatitudeRadians(latitudeDegrees) {
  return clamp(Math.PI / 2 - rad(latitudeDegrees), 0, Math.PI);
}

export function radialDistanceFromNorthKm(latitudeDegrees) {
  return DISK_RADIAL_SCALE_KM * colatitudeRadians(latitudeDegrees);
}

export function radialFraction(latitudeDegrees) {
  return colatitudeRadians(latitudeDegrees) / Math.PI;
}

export function latitudeFromRadialDistanceKm(radiusKm) {
  const theta = clamp(radiusKm / DISK_RADIAL_SCALE_KM, 0, Math.PI);
  return (Math.PI / 2 - theta) * RAD;
}

/** Convert geographic coordinates to their position on the calibrated disk. */
export function project(longitudeDegrees, latitudeDegrees, baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0 ||
      !Number.isFinite(longitudeDegrees) || !Number.isFinite(latitudeDegrees)) {
    return [NaN, NaN];
  }
  const rho = baseRadius * radialFraction(latitudeDegrees);
  const longitude = rad(longitudeDegrees);
  return [rho * Math.cos(longitude), -rho * Math.sin(longitude)];
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
  if (!point ||
      !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  const radius = radialDistanceFromNorthKm(clamp(point.lat, -90, 90));
  const longitude = rad(point.lon);
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

/** Straight-line Euclidean distance between two projected map positions. */
export function flatDiskDistanceMeters(a, b) {
  const first = pointInDiskKm(a), second = pointInDiskKm(b);
  if (!first || !second) return null;
  return Math.hypot(second[0] - first[0], second[1] - first[1]) * 1000;
}

/** One direct projected segment: exactly the line shown by the distance tool. */
export function flatDiskLinePath(a, b, projectPoint) {
  if (!a || !b || typeof projectPoint !== 'function' ||
      ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return [];
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
  if (!Number.isFinite(latitude1) || !Number.isFinite(latitude2)) return null;
  return Math.abs(
    radialDistanceFromNorthKm(latitude2) -
    radialDistanceFromNorthKm(latitude1)
  );
}

/** Straight chord between two points on the same latitude circle. */
export function eastWestDistanceKm(latitudeDegrees, deltaLongitudeRadians) {
  if (!Number.isFinite(latitudeDegrees) ||
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
function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(a, b, p, epsilon = 1e-8) {
  return Math.abs(orientation(a, b, p)) <= epsilon &&
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon;
}
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  const epsilon = 1e-8;
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
      ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
  return onSegment(a, b, c, epsilon) || onSegment(a, b, d, epsilon) ||
    onSegment(c, d, a, epsilon) || onSegment(c, d, b, epsilon);
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
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return { areaM2: Math.abs(twiceArea) / 2, perimeterM: perimeter };
}

const clickPointCoordinate = point =>
  point && Number.isFinite(point.lon) && Number.isFinite(point.lat)
    ? [point.lon, point.lat] : null;
const geoJsonCoordinate = coordinate =>
  Array.isArray(coordinate) && coordinate.length >= 2 &&
  Number.isFinite(+coordinate[0]) && Number.isFinite(+coordinate[1])
    ? [+coordinate[0], +coordinate[1]] : null;

/** Planar shoelace area and straight-edge perimeter for a user polygon. */
export function flatDiskPolygonMetrics(vertices, projectPoint, baseRadius) {
  const scale = metersPerProjectedUnit(baseRadius);
  if (scale == null) return null;
  const points = projectRing(vertices, clickPointCoordinate, projectPoint, scale);
  const result = ringPlanarMetrics(points, true);
  return result;
}

/** Planar area of GeoJSON Polygon/MultiPolygon geometry, in square metres. */
export function flatDiskFeatureAreaM2(feature, projectPoint, baseRadius) {
  const scale = metersPerProjectedUnit(baseRadius);
  const geometry = feature?.geometry;
  if (scale == null || !geometry) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return null;

  let totalArea = 0, validPolygons = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const exteriorPoints = projectRing(polygon[0], geoJsonCoordinate, projectPoint, scale);
    const exterior = ringPlanarMetrics(exteriorPoints);
    if (!exterior) continue;

    let polygonArea = exterior.areaM2;
    for (let i = 1; i < polygon.length; i++) {
      const holePoints = projectRing(polygon[i], geoJsonCoordinate, projectPoint, scale);
      const hole = ringPlanarMetrics(holePoints);
      if (hole) polygonArea -= hole.areaM2;
    }
    totalArea += Math.max(0, polygonArea);
    validPolygons++;
  }
  return validPolygons ? totalArea : null;
}
