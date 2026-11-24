/**
 * Pure Gleason-style north-polar disk.
 *
 * The printed layout uses equally spaced latitude parallels and straight,
 * equally spaced radial meridians. Latitude therefore maps linearly to radius:
 *   r = (90° - latitude) × 60 nautical miles per degree.
 *
 * This is a fixed planar cartographic convention. No fitted warp, longitude
 * shear, flight-path coefficient, spherical distance or ellipsoidal formula
 * participates in the forward transform or direct map-plane measurements.
 */
export const NAUTICAL_MILES_PER_DEGREE = 60;
export const KILOMETRES_PER_NAUTICAL_MILE = 1.852;
export const KILOMETRES_PER_DEGREE =
  NAUTICAL_MILES_PER_DEGREE * KILOMETRES_PER_NAUTICAL_MILE;
export const DISK_RADIAL_SCALE_KM = KILOMETRES_PER_DEGREE * 180 / Math.PI;
export const DISK_BASE_RADIUS_KM = Math.PI * DISK_RADIAL_SCALE_KM;
export const DISK_RADIUS_KM = DISK_BASE_RADIUS_KM;
export const DISK_RADIUS_METERS = DISK_RADIUS_KM * 1000;
export const EQUATOR_RADIUS_KM = DISK_RADIUS_KM / 2;

/** Compatibility exports: the pure Gleason plane applies no metric correction. */
export const ACTIVE_PLANAR_METRIC_C1 = 0;
export const ACTIVE_PLANAR_METRIC_C2 = 0;

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
  return rad(90 - latitudeDegrees);
}

/** Normalized radial position: equal latitude changes produce equal ring gaps. */
export function radialFraction(latitudeDegrees) {
  if (!Number.isFinite(latitudeDegrees) ||
      latitudeDegrees < -90 || latitudeDegrees > 90) return NaN;
  return (90 - latitudeDegrees) / 180;
}

export const baseRadialFraction = radialFraction;

export function radialDistanceFromNorthKm(latitudeDegrees) {
  const fraction = radialFraction(latitudeDegrees);
  return Number.isFinite(fraction) ? DISK_RADIUS_KM * fraction : NaN;
}

export const baseRadialDistanceFromNorthKm = radialDistanceFromNorthKm;

export function latitudeFromRadialDistanceKm(radiusKm) {
  if (!Number.isFinite(radiusKm)) return NaN;
  return 90 - clamp(radiusKm / DISK_RADIUS_KM, 0, 1) * 180;
}

function geographicPointInDiskKm(longitudeDegrees, latitudeDegrees) {
  if (!Number.isFinite(longitudeDegrees) || !Number.isFinite(latitudeDegrees) ||
      latitudeDegrees < -90 || latitudeDegrees > 90) return null;
  const radius = radialDistanceFromNorthKm(latitudeDegrees);
  const longitude = rad(wrapLongitude(longitudeDegrees));
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

/** Geographic coordinate to pure Gleason disk position, scaled to baseRadius. */
export function project(longitudeDegrees, latitudeDegrees, baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) return [NaN, NaN];
  const point = geographicPointInDiskKm(longitudeDegrees, latitudeDegrees);
  if (!point) return [NaN, NaN];
  const pixelsPerKm = baseRadius / DISK_RADIUS_KM;
  return [point[0] * pixelsPerKm, point[1] * pixelsPerKm];
}

/** Exact inverse of the linear radial disk transform. */
export function unproject(x, y, baseRadius) {
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(baseRadius) || baseRadius <= 0) {
    return { lat: NaN, lon: NaN };
  }
  const rho = Math.hypot(x, y);
  const fraction = clamp(rho / baseRadius, 0, 1);
  const lat = 90 - fraction * 180;
  const longitude = rho < 1e-9 ? 0 : Math.atan2(-y, x) * RAD;
  return { lat, lon: wrapLongitude(longitude) };
}

/** Direct straight-line chord in the visible flat-disk plane, in metres. */
export function flatDiskDistanceMeters(a, b) {
  const first = a && geographicPointInDiskKm(a.lon, a.lat);
  const second = b && geographicPointInDiskKm(b.lon, b.lat);
  if (!first || !second) return null;
  return Math.hypot(second[0] - first[0], second[1] - first[1]) * 1000;
}

/** Historical compatibility name; it is identical to the active planar chord. */
export function baseFlatDiskDistanceMeters(a, b) {
  return flatDiskDistanceMeters(a, b);
}

/** One straight projected chord between endpoints. */
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

/** Radial north–south separation in the fixed planar scale, in kilometres. */
export function northSouthDistanceKm(latitude1, latitude2) {
  if (![latitude1, latitude2].every(Number.isFinite) ||
      [latitude1, latitude2].some(latitude => latitude < -90 || latitude > 90)) return null;
  return Math.abs(latitude2 - latitude1) * KILOMETRES_PER_DEGREE;
}

/** Straight chord between two points on one concentric latitude circle. */
export function eastWestDistanceKm(
  latitudeDegrees,
  deltaLongitudeRadians,
  startLongitudeDegrees = 0
) {
  if (!Number.isFinite(latitudeDegrees) || latitudeDegrees < -90 || latitudeDegrees > 90 ||
      !Number.isFinite(deltaLongitudeRadians) || !Number.isFinite(startLongitudeDegrees)) return null;
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

/** Planar shoelace area and Euclidean planar perimeter for a user polygon. */
export function flatDiskPolygonMetrics(
  vertices, projectPoint, baseRadius, measureDistanceMeters
) {
  const scale = metersPerProjectedUnit(baseRadius);
  if (scale == null || typeof measureDistanceMeters !== 'function') return null;
  const points = projectRing(vertices, clickPointCoordinate, projectPoint, scale);
  const result = ringPlanarMetrics(points, true);
  if (!result) return null;

  let perimeterM = 0;
  for (let index = 0; index < vertices.length; index++) {
    const distance = measureDistanceMeters(
      vertices[index],
      vertices[(index + 1) % vertices.length]
    );
    if (!Number.isFinite(distance) || distance < 0) return null;
    perimeterM += distance;
  }
  return { ...result, perimeterM };
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
