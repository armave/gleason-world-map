/**
 * WGS84 inverse/direct geodesics used by the distance tool.
 *
 * The Gleason disk remains the display projection. Geographic distance is
 * measured along the shortest path on the WGS84 reference ellipsoid, then
 * that path is sampled and projected so the displayed connector represents
 * the same direct geographic path (not a flight/road track).
 *
 * Vincenty's iterative inverse/direct formulae are used for ordinary routes.
 * The inverse falls back to an authalic-sphere solution only if the inverse
 * iteration does not converge (principally near antipodal point pairs).
 */
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const AUTHALIC_RADIUS_M = 6371007.180918;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const MAX_ITERATIONS = 200;
const CONVERGENCE = 1e-12;

const toRadians = degrees => degrees * DEG;
const toDegrees = radians => radians * RAD;
const wrapRadians = radians =>
  ((radians + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const wrapDegrees = degrees =>
  ((degrees + 180) % 360 + 360) % 360 - 180;

function validPoint(point) {
  return !!point &&
    Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    Number.isFinite(point.lon);
}

function unitVector(point) {
  const latitude = toRadians(point.lat);
  const longitude = toRadians(point.lon);
  const cosLatitude = Math.cos(latitude);
  return [
    cosLatitude * Math.cos(longitude),
    cosLatitude * Math.sin(longitude),
    Math.sin(latitude)
  ];
}

function sphericalInverse(first, second) {
  const phi1 = toRadians(first.lat);
  const phi2 = toRadians(second.lat);
  const deltaLambda = wrapRadians(toRadians(second.lon - first.lon));
  const sinHalfPhi = Math.sin((phi2 - phi1) / 2);
  const sinHalfLambda = Math.sin(deltaLambda / 2);
  const haversine = Math.min(1, Math.max(0,
    sinHalfPhi ** 2 + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda ** 2
  ));
  const centralAngle = 2 * Math.atan2(
    Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine))
  );
  const bearingNumerator = Math.sin(deltaLambda) * Math.cos(phi2);
  const bearingDenominator =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const initialBearingRadians =
    Math.hypot(bearingNumerator, bearingDenominator) < 1e-15
      ? 0
      : Math.atan2(bearingNumerator, bearingDenominator);
  return {
    distanceMeters: AUTHALIC_RADIUS_M * centralAngle,
    initialBearingRadians,
    sphericalFallback: true
  };
}

function inverseWgs84(first, second) {
  if (!validPoint(first) || !validPoint(second)) return null;

  const phi1 = toRadians(first.lat);
  const phi2 = toRadians(second.lat);
  const longitudeDifference = wrapRadians(toRadians(second.lon - first.lon));
  if (Math.abs(phi1 - phi2) < 1e-15 && Math.abs(longitudeDifference) < 1e-15) {
    return { distanceMeters: 0, initialBearingRadians: 0, sphericalFallback: false };
  }

  const reducedPhi1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const reducedPhi2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(reducedPhi1), cosU1 = Math.cos(reducedPhi1);
  const sinU2 = Math.sin(reducedPhi2), cosU2 = Math.cos(reducedPhi2);
  let lambda = longitudeDifference;
  let converged = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    const sinSigma = Math.hypot(
      cosU2 * sinLambda,
      cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
    );
    if (sinSigma < 1e-16) {
      const fallback = sphericalInverse(first, second);
      if (fallback.distanceMeters < 1e-7) {
        return { distanceMeters: 0, initialBearingRadians: 0, sphericalFallback: false };
      }
      return fallback;
    }

    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    const cosSqAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
    const cosTwoSigmaM = cosSqAlpha > 1e-15
      ? cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha : 0;
    const C = WGS84_F / 16 * cosSqAlpha *
      (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const nextLambda = longitudeDifference + (1 - C) * WGS84_F * sinAlpha *
      (sigma + C * sinSigma *
        (cosTwoSigmaM + C * cosSigma *
          (-1 + 2 * cosTwoSigmaM ** 2)));

    if (Math.abs(nextLambda - lambda) <= CONVERGENCE) {
      lambda = nextLambda;
      converged = true;
      break;
    }
    lambda = nextLambda;
  }

  // Vincenty's inverse is known to be poorly conditioned for nearly antipodal pairs.
  if (!converged) return sphericalInverse(first, second);

  // Re-evaluate the converged state so all distance terms use the final lambda.
  const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
  const sinSigma = Math.hypot(
    cosU2 * sinLambda,
    cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
  );
  const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
  const sigma = Math.atan2(sinSigma, cosSigma);
  const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
  const cosSqAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
  const cosTwoSigmaM = cosSqAlpha > 1e-15
    ? cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha : 0;

  const uSq = cosSqAlpha *
    (WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2;
  const A = 1 + uSq / 16384 *
    (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 *
    (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma *
    (cosTwoSigmaM + B / 4 *
      (cosSigma * (-1 + 2 * cosTwoSigmaM ** 2) -
        B / 6 * cosTwoSigmaM *
          (-3 + 4 * sinSigma ** 2) *
          (-3 + 4 * cosTwoSigmaM ** 2)));
  const distanceMeters = WGS84_B * A * (sigma - deltaSigma);
  const initialBearingRadians = Math.atan2(
    cosU2 * sinLambda,
    cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
  );

  return { distanceMeters, initialBearingRadians, sphericalFallback: false };
}

function directWgs84(start, initialBearingRadians, distanceMeters) {
  if (distanceMeters <= 0) return { lat: start.lat, lon: wrapDegrees(start.lon) };

  const phi1 = toRadians(start.lat);
  const alpha1 = initialBearingRadians;
  const tanU1 = (1 - WGS84_F) * Math.tan(phi1);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 ** 2);
  const sinU1 = tanU1 * cosU1;
  const sinAlpha1 = Math.sin(alpha1), cosAlpha1 = Math.cos(alpha1);
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = Math.max(0, 1 - sinAlpha ** 2);
  const uSq = cosSqAlpha *
    (WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2;
  const A = 1 + uSq / 16384 *
    (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 *
    (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = distanceMeters / (WGS84_B * A);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const twoSigmaM = 2 * sigma1 + sigma;
    const sinSigma = Math.sin(sigma), cosSigma = Math.cos(sigma);
    const cosTwoSigmaM = Math.cos(twoSigmaM);
    const deltaSigma = B * sinSigma *
      (cosTwoSigmaM + B / 4 *
        (cosSigma * (-1 + 2 * cosTwoSigmaM ** 2) -
          B / 6 * cosTwoSigmaM *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cosTwoSigmaM ** 2)));
    const nextSigma = distanceMeters / (WGS84_B * A) + deltaSigma;
    if (Math.abs(nextSigma - sigma) <= CONVERGENCE) {
      sigma = nextSigma;
      break;
    }
    sigma = nextSigma;
  }

  const sinSigma = Math.sin(sigma), cosSigma = Math.cos(sigma);
  const cosTwoSigmaM = Math.cos(2 * sigma1 + sigma);
  const temporary = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const phi2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - WGS84_F) * Math.hypot(sinAlpha, temporary)
  );
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
  );
  const C = WGS84_F / 16 * cosSqAlpha *
    (4 + WGS84_F * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * WGS84_F * sinAlpha *
    (sigma + C * sinSigma *
      (cosTwoSigmaM + C * cosSigma *
        (-1 + 2 * cosTwoSigmaM ** 2)));
  return {
    lat: toDegrees(phi2),
    lon: wrapDegrees(start.lon + toDegrees(L))
  };
}

function sphericalInterpolate(first, second, fraction) {
  const a = unitVector(first), b = unitVector(second);
  const dot = Math.max(-1, Math.min(1,
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  ));
  const omega = Math.acos(dot);
  let vector;

  if (omega < 1e-12) {
    vector = a;
  } else if (Math.PI - omega < 1e-8) {
    const axis = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    let perpendicular = [
      axis[1] * a[2] - axis[2] * a[1],
      axis[2] * a[0] - axis[0] * a[2],
      axis[0] * a[1] - axis[1] * a[0]
    ];
    const length = Math.hypot(...perpendicular);
    perpendicular = perpendicular.map(value => value / length);
    vector = a.map((value, i) =>
      value * Math.cos(Math.PI * fraction) +
      perpendicular[i] * Math.sin(Math.PI * fraction)
    );
  } else {
    const denominator = Math.sin(omega);
    const firstWeight = Math.sin((1 - fraction) * omega) / denominator;
    const secondWeight = Math.sin(fraction * omega) / denominator;
    vector = a.map((value, i) => value * firstWeight + b[i] * secondWeight);
  }

  return {
    lat: toDegrees(Math.atan2(vector[2], Math.hypot(vector[0], vector[1]))),
    lon: wrapDegrees(toDegrees(Math.atan2(vector[1], vector[0])))
  };
}

/** Return the shortest WGS84 ellipsoidal surface distance in metres. */
export function geodesicDistanceMeters(first, second) {
  const inverse = inverseWgs84(first, second);
  return inverse ? inverse.distanceMeters : null;
}

/**
 * Sample the shortest geodesic and project it into map coordinates.
 * maxStepKm controls visual smoothness only; it does not change the distance.
 */
export function geodesicLinePath(first, second, projectPoint, maxStepKm = 100) {
  if (!validPoint(first) || !validPoint(second) ||
      typeof projectPoint !== 'function') return [];
  const inverse = inverseWgs84(first, second);
  if (!inverse) return [];

  const stepMeters = Number.isFinite(maxStepKm) && maxStepKm > 0
    ? maxStepKm * 1000 : 100000;
  const sampleCount = Math.max(1, Math.ceil(inverse.distanceMeters / stepMeters));
  const geographicPoints = [];

  for (let index = 0; index <= sampleCount; index++) {
    const fraction = index / sampleCount;
    let geographicPoint;
    if (index === 0) {
      geographicPoint = { lat: first.lat, lon: wrapDegrees(first.lon) };
    } else if (index === sampleCount) {
      geographicPoint = { lat: second.lat, lon: wrapDegrees(second.lon) };
    } else if (inverse.sphericalFallback) {
      geographicPoint = sphericalInterpolate(first, second, fraction);
    } else {
      geographicPoint = directWgs84(
        first, inverse.initialBearingRadians, inverse.distanceMeters * fraction
      );
    }

    const projected = projectPoint(geographicPoint.lon, geographicPoint.lat);
    if (!Array.isArray(projected) || projected.length < 2 ||
        !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return [];
    geographicPoints.push(projected.slice(0, 2));
  }
  return geographicPoints;
}
