/**
 * Planar measurement engine for the projected Gleason disk.
 *
 * All geometry is evaluated in projected X/Y coordinates. The only conversion
 * to physical units is the disk-radius calibration below; no geodesic or
 * ellipsoidal polygon-area algorithm is involved.
 *
 * The default is the map's existing radial calibration. Change this constant
 * if the project adopts a different flat-disk scale.
 */
export const DEFAULT_DISK_RADIUS_KM = 20003.931458625447;

function metersPerProjectedUnit(baseRadius, diskRadiusKm) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0 ||
      !Number.isFinite(diskRadiusKm) || diskRadiusKm <= 0) return null;
  return diskRadiusKm * 1000 / baseRadius;
}

function projectedPoint(lon, lat, projectPoint, scale) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      typeof projectPoint !== 'function') return null;
  const xy = projectPoint(lon, lat);
  if (!Array.isArray(xy) || xy.length < 2 ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null;
  return [xy[0] * scale, xy[1] * scale];
}

function samePoint(a, b, epsilon = 1e-7) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, p, epsilon = 1e-7) {
  return Math.abs(orientation(a, b, p)) <= epsilon &&
    p[0] >= Math.min(a[0], b[0]) - epsilon &&
    p[0] <= Math.max(a[0], b[0]) + epsilon &&
    p[1] >= Math.min(a[1], b[1]) - epsilon &&
    p[1] <= Math.max(a[1], b[1]) + epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const epsilon = 1e-7;
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
      ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
  return onSegment(a, b, c, epsilon) || onSegment(a, b, d, epsilon) ||
    onSegment(c, d, a, epsilon) || onSegment(c, d, b, epsilon);
}

function hasSelfIntersection(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent sides are expected to share one endpoint.
      if (j === i || j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = points[j], d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function ringMetrics(vertices, getLonLat, projectPoint, scale) {
  if (!Array.isArray(vertices) || vertices.length < 3) return null;
  const points = [];
  for (const vertex of vertices) {
    const coordinate = getLonLat(vertex);
    if (!coordinate) return null;
    const point = projectedPoint(coordinate[0], coordinate[1], projectPoint, scale);
    if (!point) return null;
    if (!points.length || !samePoint(points[points.length - 1], point)) points.push(point);
  }
  // GeoJSON rings conventionally repeat the first point at the end.
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3 || hasSelfIntersection(points)) return null;

  let twiceArea = 0, perimeterM = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
    perimeterM += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return { areaM2: Math.abs(twiceArea) / 2, perimeterM };
}

const pointCoordinates = point =>
  point && Number.isFinite(point.lon) && Number.isFinite(point.lat)
    ? [point.lon, point.lat]
    : null;

const geoJsonCoordinates = coordinate =>
  Array.isArray(coordinate) && coordinate.length >= 2 &&
  Number.isFinite(+coordinate[0]) && Number.isFinite(+coordinate[1])
    ? [+coordinate[0], +coordinate[1]]
    : null;

/**
 * Straight-line distance in the projected disk, returned in metres.
 * The projector must return coordinates in the same units as baseRadius.
 */
export function flatDiskDistanceMeters(
  a, b, projectPoint, baseRadius,
  diskRadiusKm = DEFAULT_DISK_RADIUS_KM
) {
  const scale = metersPerProjectedUnit(baseRadius, diskRadiusKm);
  if (scale == null) return null;
  const first = a && projectedPoint(a.lon, a.lat, projectPoint, scale);
  const second = b && projectedPoint(b.lon, b.lat, projectPoint, scale);
  if (!first || !second) return null;
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

/**
 * Planar area and straight-edge perimeter for an ordered polygon.
 * Returns null for invalid or self-intersecting rings.
 */
export function flatDiskPolygonMetrics(
  vertices, projectPoint, baseRadius,
  diskRadiusKm = DEFAULT_DISK_RADIUS_KM
) {
  const scale = metersPerProjectedUnit(baseRadius, diskRadiusKm);
  if (scale == null) return null;
  return ringMetrics(vertices, pointCoordinates, projectPoint, scale);
}

/**
 * Planar area for GeoJSON Polygon/MultiPolygon geometry. Interior rings are
 * subtracted from each exterior ring; separate polygon parts are summed.
 */
export function flatDiskFeatureAreaM2(
  feature, projectPoint, baseRadius,
  diskRadiusKm = DEFAULT_DISK_RADIUS_KM
) {
  const scale = metersPerProjectedUnit(baseRadius, diskRadiusKm);
  const geometry = feature?.geometry;
  if (scale == null || !geometry) return null;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
  if (!polygons.length) return null;

  let totalAreaM2 = 0, validPolygons = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const exterior = ringMetrics(polygon[0], geoJsonCoordinates, projectPoint, scale);
    if (!exterior) continue;
    let polygonAreaM2 = exterior.areaM2;
    for (let i = 1; i < polygon.length; i++) {
      const hole = ringMetrics(polygon[i], geoJsonCoordinates, projectPoint, scale);
      if (hole) polygonAreaM2 -= hole.areaM2;
    }
    totalAreaM2 += Math.max(0, polygonAreaM2);
    validPolygons++;
  }
  return validPolygons ? totalAreaM2 : null;
}
