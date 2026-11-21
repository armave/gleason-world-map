/**
 * Spherical azimuthal-equidistant model for the Gleason flat disk.
 *
 * Projection:
 *   theta = pi/2 - latitude
 *   r = R * theta
 *   x = r cos(longitude), y = -r sin(longitude)
 *
 * The projected disk is measured in kilometres after normalizing the caller's
 * canvas-space projector by its disk radius. Surface area uses the Jacobian
 * sin(theta)/theta. No ellipsoidal/geodesic library is needed.
 */
export const EARTH_RADIUS_KM = 6371;
export const DISK_RADIUS_KM = Math.PI * EARTH_RADIUS_KM;
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
  return EARTH_RADIUS_KM * colatitudeRadians(latitudeDegrees);
}

export function radialFraction(latitudeDegrees) {
  return colatitudeRadians(latitudeDegrees) / Math.PI;
}

export function latitudeFromRadialDistanceKm(radiusKm) {
  const theta = clamp(radiusKm / EARTH_RADIUS_KM, 0, Math.PI);
  return (Math.PI / 2 - theta) * RAD;
}

/** North-polar azimuthal-equidistant projection on a sphere of radius 6371 km. */
export function project(longitudeDegrees, latitudeDegrees, baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0 ||
      !Number.isFinite(longitudeDegrees) || !Number.isFinite(latitudeDegrees)) return [NaN, NaN];
  const rho = baseRadius * radialFraction(latitudeDegrees);
  const longitude = rad(longitudeDegrees);
  return [rho * Math.cos(longitude), -rho * Math.sin(longitude)];
}

export function unproject(x, y, baseRadius) {
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(baseRadius) || baseRadius <= 0) return { lat: NaN, lon: NaN };
  const rho = Math.hypot(x, y);
  const theta = clamp(rho / baseRadius, 0, 1) * Math.PI;
  const lat = (Math.PI / 2 - theta) * RAD;
  const lon = rho < 1e-9 ? 0 : wrapLongitude(Math.atan2(-y, x) * RAD);
  return { lat, lon };
}

/**
 * Exact spherical great-circle distance (spherical law of cosines), using a
 * haversine evaluation for numerical stability on very short/near-antipodal
 * routes. This is algebraically equivalent to the colatitude formula.
 */
export function greatCircleDistanceMeters(a, b) {
  if (!a || !b ||
      !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
      !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return null;
  const phi1 = rad(clamp(a.lat, -90, 90));
  const phi2 = rad(clamp(b.lat, -90, 90));
  const deltaPhi = phi2 - phi1;
  const deltaLambda = rad(wrapLongitude(b.lon - a.lon));
  const h = Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const boundedH = clamp(h, 0, 1);
  const centralAngle = 2 * Math.atan2(
    Math.sqrt(boundedH),
    Math.sqrt(Math.max(0, 1 - boundedH))
  );
  return EARTH_RADIUS_KM * centralAngle * 1000;
}

/**
 * Samples the shortest spherical great-circle arc into projected disk points.
 * Exact antipodes have infinitely many shortest routes; a stable deterministic
 * meridian plane is selected for the displayed connector in that one case.
 */
export function greatCircleLinePath(a, b, projectPoint, maxStepDegrees = 1) {
  if (!a || !b || typeof projectPoint !== 'function' ||
      ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return [];
  const toVector = point => {
    const phi = rad(clamp(point.lat, -90, 90)), lambda = rad(point.lon);
    return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
  };
  const fromVector = vector => ({
    lat: Math.asin(clamp(vector[2], -1, 1)) * RAD,
    lon: Math.atan2(vector[1], vector[0]) * RAD
  });
  const start = toVector(a), end = toVector(b);
  const dot = clamp(start[0]*end[0] + start[1]*end[1] + start[2]*end[2], -1, 1);
  const omega = Math.acos(dot);
  const count = Math.max(1, Math.min(720, Math.ceil(omega * RAD / Math.max(0.1, maxStepDegrees))));
  let antipodalTangent = null;
  if (Math.PI - omega < 1e-8) {
    const reference = Math.abs(start[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cross = [
      start[1]*reference[2] - start[2]*reference[1],
      start[2]*reference[0] - start[0]*reference[2],
      start[0]*reference[1] - start[1]*reference[0]
    ];
    const norm = Math.hypot(...cross);
    antipodalTangent = cross.map(value => value / norm);
  }
  const path = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    let vector;
    if (omega < 1e-10) {
      vector = start;
    } else if (antipodalTangent) {
      vector = start.map((value, index) =>
        value * Math.cos(Math.PI*t) + antipodalTangent[index] * Math.sin(Math.PI*t)
      );
    } else {
      const denominator = Math.sin(omega);
      const left = Math.sin((1-t)*omega) / denominator;
      const right = Math.sin(t*omega) / denominator;
      vector = start.map((value, index) => left*value + right*end[index]);
    }
    const geographic = fromVector(vector);
    const projected = projectPoint(geographic.lon, geographic.lat);
    if (!Array.isArray(projected) || projected.length < 2 ||
        !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return [];
    path.push(projected.slice(0, 2));
  }
  return path;
}

export function northSouthDistanceKm(latitude1, latitude2) {
  if (!Number.isFinite(latitude1) || !Number.isFinite(latitude2)) return null;
  return EARTH_RADIUS_KM * Math.abs(rad(latitude2) - rad(latitude1));
}

export function eastWestDistanceKm(latitudeDegrees, deltaLongitudeRadians) {
  if (!Number.isFinite(latitudeDegrees) || !Number.isFinite(deltaLongitudeRadians)) return null;
  return EARTH_RADIUS_KM * Math.cos(rad(latitudeDegrees)) * Math.abs(deltaLongitudeRadians);
}

/** Spherical area of a latitude/longitude sector expressed by disk radii. */
export function sphericalSectorAreaKm2(radius1Km, radius2Km, deltaLongitudeRadians) {
  if (![radius1Km, radius2Km, deltaLongitudeRadians].every(Number.isFinite)) return null;
  const theta1 = clamp(radius1Km / EARTH_RADIUS_KM, 0, Math.PI);
  const theta2 = clamp(radius2Km / EARTH_RADIUS_KM, 0, Math.PI);
  return EARTH_RADIUS_KM ** 2 * Math.abs(deltaLongitudeRadians) *
    Math.abs(Math.cos(theta1) - Math.cos(theta2));
}

/** Local map-to-surface area correction, m(theta) = sin(theta)/theta. */
export function areaDecodeFactorFromRadiusKm(radiusKm) {
  if (!Number.isFinite(radiusKm)) return null;
  const theta = clamp(radiusKm / EARTH_RADIUS_KM, 0, Math.PI);
  if (Math.PI - theta < 1e-12) return 0;
  if (theta < 1e-6) {
    const theta2 = theta * theta;
    return 1 - theta2 / 6 + theta2 * theta2 / 120;
  }
  return Math.sin(theta) / theta;
}

export function getLocalScaleFactors(latitudeDegrees) {
  const theta = colatitudeRadians(latitudeDegrees);
  const decoder = areaDecodeFactorFromRadiusKm(EARTH_RADIUS_KM * theta);
  const stretch = decoder === 0 ? Infinity : 1 / decoder;
  return {
    northSouthScale: 1,
    eastWestStretch: stretch,
    eastWestDecoder: decoder,
    areaStretch: stretch
  };
}

// 8-point Gauss-Legendre quadrature on the unit interval. The integrands below
// are smooth, bounded radial functions, including at the North Pole and rim.
const GAUSS_NODES = [
  0.0198550717512319, 0.1016667612931866,
  0.2372337950418355, 0.4082826787521751,
  0.5917173212478248, 0.7627662049581645,
  0.8983332387068134, 0.9801449282487681
];
const GAUSS_WEIGHTS = [
  0.0506142681451881, 0.1111905172266872,
  0.1568533229389436, 0.1813418916891810,
  0.1813418916891810, 0.1568533229389436,
  0.1111905172266872, 0.0506142681451881
];
function integrateUnitInterval(fn) {
  let sum = 0;
  for (let i = 0; i < GAUSS_NODES.length; i++) {
    sum += GAUSS_WEIGHTS[i] * fn(GAUSS_NODES[i]);
  }
  return sum;
}

/**
 * Radial vector field F(x,y)=g(r)(x,y) with div(F)=sin(r/R)/(r/R).
 * Green's theorem therefore evaluates the exact surface-area integral from
 * the polygon boundary in O(number of vertices), without triangulating large
 * Natural Earth country rings.
 */
function radialAreaPrimitiveFactor(radiusKm) {
  const theta = radiusKm / EARTH_RADIUS_KM;
  if (Math.abs(theta) < 1e-4) {
    const theta2 = theta * theta;
    return 0.5 - theta2 / 24 + theta2 * theta2 / 720;
  }
  return (1 - Math.cos(theta)) / (theta * theta);
}

function edgeSurfaceAreaKm2(a, b) {
  const cross = a[0] * b[1] - a[1] * b[0];
  if (Math.abs(cross) < 1e-18) return 0;
  return cross * integrateUnitInterval(t => {
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    return radialAreaPrimitiveFactor(Math.hypot(x, y));
  });
}

function edgeSurfaceLengthKm(a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  if (vx === 0 && vy === 0) return 0;
  const mapSpeedSquared = vx * vx + vy * vy;
  return integrateUnitInterval(t => {
    const x = a[0] + vx * t;
    const y = a[1] + vy * t;
    const radius = Math.hypot(x, y);
    if (radius < 1e-9) return Math.sqrt(mapSpeedSquared);
    const radialSpeed = (x * vx + y * vy) / radius;
    const tangentialSpeedSquared = Math.max(0, mapSpeedSquared - radialSpeed ** 2);
    const theta = radius / EARTH_RADIUS_KM;
    const tangentialDecoder = areaDecodeFactorFromRadiusKm(radius);
    return Math.sqrt(radialSpeed ** 2 + tangentialDecoder ** 2 * tangentialSpeedSquared);
  });
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
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}
function metersPerProjectedUnit(baseRadius) {
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) return null;
  return DISK_RADIUS_KM * 1000 / baseRadius;
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
    const point = [projected[0] * scale / 1000, projected[1] * scale / 1000];
    if (!points.length || !samePoint(points.at(-1), point)) points.push(point);
  }
  if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
  return points.length >= 3 ? points : null;
}
function ringSurfaceMetrics(points, validateSimple = false) {
  if (!Array.isArray(points) || points.length < 3 ||
      (validateSimple && hasSelfIntersection(points))) return null;
  let signedAreaKm2 = 0, perimeterKm = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    signedAreaKm2 += edgeSurfaceAreaKm2(a, b);
    perimeterKm += edgeSurfaceLengthKm(a, b);
  }
  return { areaKm2: Math.abs(signedAreaKm2), perimeterKm };
}
const clickPointCoordinate = point =>
  point && Number.isFinite(point.lon) && Number.isFinite(point.lat)
    ? [point.lon, point.lat] : null;
const geoJsonCoordinate = coordinate =>
  Array.isArray(coordinate) && coordinate.length >= 2 &&
  Number.isFinite(+coordinate[0]) && Number.isFinite(+coordinate[1])
    ? [+coordinate[0], +coordinate[1]] : null;

/** Exact spherical distance between two geographic positions, in metres. */
export function sphericalDistanceMeters(a, b) {
  return greatCircleDistanceMeters(a, b);
}

/**
 * Surface area and perimeter of a polygon whose edges are straight in the
 * projected disk. The area integrates the user's Jacobian sin(theta)/theta;
 * perimeter integrates the corresponding anisotropic local distance metric.
 */
export function sphericalPolygonMetrics(
  vertices, projectPoint, baseRadius
) {
  const scale = metersPerProjectedUnit(baseRadius);
  if (scale == null) return null;
  const points = projectRing(vertices, clickPointCoordinate, projectPoint, scale);
  const result = ringSurfaceMetrics(points, true);
  return result ? {
    areaM2: result.areaKm2 * 1e6,
    perimeterM: result.perimeterKm * 1000
  } : null;
}

/** Spherical surface area of projected GeoJSON Polygon/MultiPolygon geometry. */
export function sphericalFeatureAreaM2(feature, projectPoint, baseRadius) {
  const scale = metersPerProjectedUnit(baseRadius);
  const geometry = feature?.geometry;
  if (scale == null || !geometry) return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return null;
  let totalAreaKm2 = 0, validPolygons = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    const exteriorPoints = projectRing(polygon[0], geoJsonCoordinate, projectPoint, scale);
    const exterior = ringSurfaceMetrics(exteriorPoints);
    if (!exterior) continue;
    let areaKm2 = exterior.areaKm2;
    for (let i = 1; i < polygon.length; i++) {
      const holePoints = projectRing(polygon[i], geoJsonCoordinate, projectPoint, scale);
      const hole = ringSurfaceMetrics(holePoints);
      if (hole) areaKm2 -= hole.areaKm2;
    }
    totalAreaKm2 += Math.max(0, areaKm2);
    validPolygons++;
  }
  return validPolygons ? totalAreaKm2 * 1e6 : null;
}
