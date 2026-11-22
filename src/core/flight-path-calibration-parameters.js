/**
 * Active visible-map geometry fitted from observed ADS-B trajectory paths.
 * The periodic longitude warp is smooth, invertible and anchored at the pole
 * and Antarctic Ice Wall; no folds or breaks are introduced.
 */
export const FLIGHT_PATH_CALIBRATION = Object.freeze({
  schemaVersion: 3,
  sourceDatasetVersion: 4,
  source: 'adsb.lol observed-only ground-speed/time mileage and timestamped flight paths',
  trainingRouteCount: 26,
  holdoutRouteCount: 6,
  radialScaleKm: 7793.233780605895,
  radialWarp: {
    kind: 'regularized-power',
    exponent: 1.3,
    epsilon: 0.005
  },
  radialProfile: {
    innerFactor: 1,
    outerFactor: 0.5,
    exponent: 1.0328125
  },
  longitudeWarp: {
    kind: 'anchored-fourier',
    firstSine: 0.30000000000000004,
    firstCosine: -0.21640625000000002,
    secondSine: 0.019218750000000003,
    secondCosine: 0.12
  }
});
