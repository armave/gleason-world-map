/**
 * Fit the flat-disk distance scale to empirical ADS-B flight telemetry.
 *
 * Target distances are route-level medians of ground-speed × elapsed-time
 * integrations. Coordinate values are used only in the app's radial disk
 * geometry; no globe, sphere, ellipsoid, or geodesic calculation appears here.
 */
const DEG = Math.PI / 180;
const FACTOR_BOUNDS = [0.5, 2.5];
const RIDGE_LAMBDA = 1.0;
const MIN_TRAIN_ROUTES = 10;
const MIN_HOLDOUT_ROUTES = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validAirport(airport) {
  return !!airport &&
    Number.isFinite(airport.lat) && airport.lat >= -90 && airport.lat <= 90 &&
    Number.isFinite(airport.lon);
}

/** Flat radial disk chord for R=1; this is not a globe-distance formula. */
export function unitDiskChord(first, second) {
  if (!validAirport(first) || !validAirport(second)) return NaN;
  const thetaA = (90 - first.lat) * DEG;
  const thetaB = (90 - second.lat) * DEG;
  const lambdaA = first.lon * DEG;
  const lambdaB = second.lon * DEG;
  const ax = thetaA * Math.cos(lambdaA);
  const ay = -thetaA * Math.sin(lambdaA);
  const bx = thetaB * Math.cos(lambdaB);
  const by = -thetaB * Math.sin(lambdaB);
  return Math.hypot(bx - ax, by - ay);
}

/** Symmetric endpoint features expressed in the app's flat-disk coordinates. */
export function flightCalibrationFeatures(first, second) {
  if (!validAirport(first) || !validAirport(second)) return null;
  const thetaA = (90 - first.lat) * DEG;
  const thetaB = (90 - second.lat) * DEG;
  const longitudeSpan = Math.abs(
    ((((second.lon - first.lon) + 180) % 360 + 360) % 360 - 180) * DEG
  );
  return [
    (thetaA + thetaB) / 2,
    Math.abs(thetaA - thetaB),
    longitudeSpan
  ];
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const rows = matrix.map((row, i) => [...row, vector[i]]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) {
      throw new Error('Flight calibration regression is rank deficient.');
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];

    const divisor = rows[column][column];
    for (let j = column; j <= n; j++) rows[column][j] /= divisor;

    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const multiplier = rows[row][column];
      for (let j = column; j <= n; j++) {
        rows[row][j] -= multiplier * rows[column][j];
      }
    }
  }
  return rows.map(row => row[n]);
}

function routeObservations(dataset, split) {
  return (dataset?.routes || []).filter(route =>
    route.split === split &&
    route.sampleCount >= 3 &&
    Number.isFinite(route.medianTrackKm) &&
    route.medianTrackKm > 0 &&
    validAirport(route.airportA) &&
    validAirport(route.airportB) &&
    unitDiskChord(route.airportA, route.airportB) > 1e-9
  );
}

function computeRadialScale(routes) {
  return median(routes.map(route =>
    route.medianTrackKm / unitDiskChord(route.airportA, route.airportB)
  ));
}

function featureStats(routes) {
  const columns = [0, 1, 2].map(index =>
    routes.map(route => flightCalibrationFeatures(route.airportA, route.airportB)[index])
  );
  const means = columns.map(column =>
    column.reduce((sum, value) => sum + value, 0) / column.length
  );
  const scales = columns.map((column, index) => {
    const variance = column.reduce((sum, value) => sum + (value - means[index]) ** 2, 0) /
      column.length;
    return Math.sqrt(variance) || 1;
  });
  const ranges = columns.map(column => [
    Math.min(...column),
    Math.max(...column)
  ]);
  return { means, scales, ranges };
}

function fitRegression(routes, radialScaleKm) {
  const { means, scales } = featureStats(routes);
  const dimension = 4;
  const normal = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const rhs = Array(dimension).fill(0);

  for (const route of routes) {
    const features = flightCalibrationFeatures(route.airportA, route.airportB);
    const design = [
      1,
      (features[0] - means[0]) / scales[0],
      (features[1] - means[1]) / scales[1],
      (features[2] - means[2]) / scales[2]
    ];
    const chordKm = unitDiskChord(route.airportA, route.airportB) * radialScaleKm;
    const targetLogFactor = Math.log(route.medianTrackKm / chordKm);

    for (let row = 0; row < dimension; row++) {
      rhs[row] += design[row] * targetLogFactor;
      for (let column = 0; column < dimension; column++) {
        normal[row][column] += design[row] * design[column];
      }
    }
  }

  // Ridge penalty applies to endpoint-feature slopes, not the intercept.
  for (let index = 1; index < dimension; index++) {
    normal[index][index] += RIDGE_LAMBDA;
  }
  const coefficients = solveLinearSystem(normal, rhs);

  return { featureMeans: means, featureScales: scales, featureRanges: featureStats(routes).ranges, coefficients };
}

export function predictFlightCalibratedKm(first, second, model) {
  if (!model || !validAirport(first) || !validAirport(second)) return null;
  const chord = unitDiskChord(first, second);
  if (!Number.isFinite(chord)) return null;
  const features = flightCalibrationFeatures(first, second);
  const design = [
    1,
    (features[0] - model.featureMeans[0]) / model.featureScales[0],
    (features[1] - model.featureMeans[1]) / model.featureScales[1],
    (features[2] - model.featureMeans[2]) / model.featureScales[2]
  ];
  const logFactor = design.reduce(
    (sum, value, index) => sum + value * model.coefficients[index], 0
  );
  const factor = clamp(
    Math.exp(logFactor),
    model.factorBounds[0],
    model.factorBounds[1]
  );
  return chord * model.radialScaleKm * factor;
}

function errorMetrics(routes, model) {
  if (!routes.length) return { routeCount: 0, meanAbsolutePercent: null, rmsPercent: null, maxAbsolutePercent: null };
  const errors = routes.map(route => {
    const predicted = predictFlightCalibratedKm(route.airportA, route.airportB, model);
    return (predicted / route.medianTrackKm - 1) * 100;
  });
  return {
    routeCount: routes.length,
    meanAbsolutePercent: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
    rmsPercent: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length),
    maxAbsolutePercent: Math.max(...errors.map(Math.abs)),
    routeErrors: routes.map((route, index) => ({
      routeId: route.routeId,
      referenceMedianTrackKm: route.medianTrackKm,
      predictedKm: predictFlightCalibratedKm(route.airportA, route.airportB, model),
      errorPercent: errors[index]
    }))
  };
}

export function fitFlightCalibration(dataset) {
  const training = routeObservations(dataset, 'train');
  const holdout = routeObservations(dataset, 'holdout');
  if (training.length < MIN_TRAIN_ROUTES || holdout.length < MIN_HOLDOUT_ROUTES) {
    throw new Error(
      'Insufficient empirical route coverage: need at least ' + MIN_TRAIN_ROUTES +
      ' training and ' + MIN_HOLDOUT_ROUTES + ' holdout routes with 3 usable flights each; got ' +
      training.length + ' training and ' + holdout.length + '.'
    );
  }

  const radialScaleKm = computeRadialScale(training);
  const fitted = fitRegression(training, radialScaleKm);
  const model = {
    schemaVersion: 1,
    sourceDatasetVersion: dataset.schemaVersion,
    target: 'median observed ADS-B flight-track mileage from ground-speed × time integration',
    radialScaleKm,
    featureNames: ['meanColatitude', 'colatitudeSpan', 'wrappedLongitudeSpan'],
    featureMeans: fitted.featureMeans,
    featureScales: fitted.featureScales,
    featureRanges: fitted.featureRanges,
    coefficients: fitted.coefficients,
    factorBounds: FACTOR_BOUNDS,
    ridgeLambda: RIDGE_LAMBDA,
    trainingRouteCount: training.length,
    holdoutRouteCount: holdout.length
  };

  const trainingMetrics = errorMetrics(training, model);
  const holdoutMetrics = errorMetrics(holdout, model);

  const looErrors = [];
  if (training.length > MIN_TRAIN_ROUTES) {
    for (let omitted = 0; omitted < training.length; omitted++) {
      const subset = training.filter((_, index) => index !== omitted);
      const leaveOneOutScale = computeRadialScale(subset);
      const leaveOneOutFit = fitRegression(subset, leaveOneOutScale);
      const leaveOneOutModel = {
        ...model,
        radialScaleKm: leaveOneOutScale,
        featureMeans: leaveOneOutFit.featureMeans,
        featureScales: leaveOneOutFit.featureScales,
        coefficients: leaveOneOutFit.coefficients
      };
      const route = training[omitted];
      const prediction = predictFlightCalibratedKm(
        route.airportA, route.airportB, leaveOneOutModel
      );
      looErrors.push((prediction / route.medianTrackKm - 1) * 100);
    }
  }

  const leaveOneOutMetrics = looErrors.length ? {
    routeCount: looErrors.length,
    meanAbsolutePercent: looErrors.reduce((sum, value) => sum + Math.abs(value), 0) / looErrors.length,
    rmsPercent: Math.sqrt(looErrors.reduce((sum, value) => sum + value ** 2, 0) / looErrors.length),
    maxAbsolutePercent: Math.max(...looErrors.map(Math.abs))
  } : null;

  return { model, metrics: { training: trainingMetrics, holdout: holdoutMetrics, leaveOneOut: leaveOneOutMetrics } };
}
